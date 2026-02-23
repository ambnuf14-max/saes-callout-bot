import { MessageEventContext } from 'vk-io';
import logger from '../../utils/logger';
import SyncService from '../../services/sync.service';
import { CalloutResponsePayload, buildSpecifyReasonKeyboard } from '../utils/keyboard-builder';
import { handleVkError } from '../../utils/error-handler';
import { EMOJI, DECLINE_TIMERS } from '../../config/constants';
import vkBot from '../bot';
import { CalloutModel, SubdivisionModel } from '../../database/models';
import { pendingDeclineReasonState } from '../../services/decline-reason.state';
import CalloutService from '../../services/callout.service';

/**
 * Обработчик callback событий от кнопок VK
 */
export async function handleCallbackEvent(
  context: MessageEventContext
): Promise<void> {
  try {
    logger.info('Received VK callback event', {
      userId: context.userId,
      peerId: context.peerId,
      eventId: context.eventId,
    });

    // Парсинг payload (vk-io возвращает строку, парсим вручную)
    const rawPayload = context.eventPayload;
    const payload: CalloutResponsePayload = typeof rawPayload === 'string'
      ? JSON.parse(rawPayload)
      : rawPayload as CalloutResponsePayload;

    if (!payload || !['respond', 'decline', 'revive', 'specify_decline_reason'].includes(payload.action)) {
      logger.warn('Invalid callback payload', { payload });
      await context.answer({
        type: 'show_snackbar',
        text: `${EMOJI.ERROR} Неверный формат данных`,
      });
      return;
    }

    // Валидация числовых полей payload
    if (
      !Number.isFinite(payload.callout_id) || payload.callout_id <= 0 ||
      !Number.isFinite(payload.subdivision_id) || payload.subdivision_id <= 0
    ) {
      logger.warn('Invalid numeric fields in callback payload', { payload });
      await context.answer({
        type: 'show_snackbar',
        text: `${EMOJI.ERROR} Неверный формат данных`,
      });
      return;
    }

    // Проверить, что callback пришёл из чата, привязанного к подразделению
    const subdivision = await SubdivisionModel.findById(payload.subdivision_id);
    if (!subdivision || !subdivision.vk_chat_id || subdivision.vk_chat_id !== context.peerId.toString()) {
      logger.warn('VK callback from unauthorized chat', {
        peerId: context.peerId,
        subdivisionId: payload.subdivision_id,
        expectedChatId: subdivision?.vk_chat_id,
      });
      await context.answer({
        type: 'show_snackbar',
        text: `${EMOJI.ERROR} Эта беседа не привязана к подразделению`,
      });
      return;
    }

    // Получить информацию о пользователе
    const [user] = await vkBot.getApi().api.users.get({
      user_ids: [context.userId],
    });

    const userName = `${user.first_name} ${user.last_name}`;

    logger.info('Processing VK callback', {
      calloutId: payload.callout_id,
      subdivisionId: payload.subdivision_id,
      userId: context.userId,
      userName,
    });

    // Сохранить conversation_message_id если ещё не сохранён
    const cmid = (context as any).conversationMessageId;
    if (cmid && payload.callout_id) {
      const existing = await CalloutModel.findById(payload.callout_id);
      if (existing && (!existing.vk_message_id || existing.vk_message_id === '0')) {
        await CalloutModel.update(payload.callout_id, { vk_message_id: cmid.toString() });
        logger.info('Saved VK conversation_message_id for callout', {
          calloutId: payload.callout_id,
          cmid,
        });
      }
    }

    if (payload.action === 'respond') {
      // Обработать ответ через SyncService
      const response = await SyncService.handleVkResponse(
        payload,
        context.userId.toString(),
        userName
      );

      logger.info('VK response processed successfully', {
        responseId: response.id,
        calloutId: payload.callout_id,
      });

      await context.answer({ type: 'show_snackbar', text: `${EMOJI.SUCCESS} Ваш ответ отправлен в Discord!` });
      return;
    }

    if (payload.action === 'decline') {
      // Проверить, не ждём ли уже причину от этого пользователя
      const stateKey = `vk:${context.userId}`;
      if (pendingDeclineReasonState.has(stateKey)) {
        await context.answer({ type: 'show_snackbar', text: `${EMOJI.WARNING} Введите причину в чат (осталось время)` });
        return;
      }

      // Зарегистрировать состояние ожидания причины
      const timeout = setTimeout(() => {
        pendingDeclineReasonState.delete(stateKey);
        logger.info('VK decline reason timeout expired', { userId: context.userId, calloutId: payload.callout_id });
      }, DECLINE_TIMERS.REASON_TIMEOUT);

      pendingDeclineReasonState.set(stateKey, {
        calloutId: payload.callout_id,
        subdivisionId: payload.subdivision_id,
        platform: 'vk',
        chatId: context.peerId.toString(),
        timeout,
      });

      // Отправить follow-up сообщение
      try {
        const reasonKeyboard = buildSpecifyReasonKeyboard(payload.callout_id, payload.subdivision_id);
        await (vkBot.getApi().api.messages.send as any)({
          peer_ids: [context.peerId],
          message: `📝 ${userName} отклоняет запрос поддержки.\n\nНапишите причину отклонения в этот чат. У вас 3 минуты.\nСледующее текстовое сообщение от вас будет принято как причина.`,
          keyboard: reasonKeyboard,
          random_id: Date.now() + Math.floor(Math.random() * 100000),
        });
      } catch (sendError) {
        logger.error('Failed to send VK decline reason request', { error: sendError });
      }

      await context.answer({ type: 'show_snackbar', text: `📝 Введите причину отклонения в чат (3 мин.)` });
      return;
    }

    if (payload.action === 'specify_decline_reason') {
      await context.answer({ type: 'show_snackbar', text: `📝 Напишите причину текстом в чат` });
      return;
    }

    if (payload.action === 'revive') {
      await CalloutService.cancelDecline(null, payload.callout_id);

      logger.info('VK revive callout processed', { calloutId: payload.callout_id, userId: context.userId });
      await context.answer({ type: 'show_snackbar', text: `${EMOJI.SUCCESS} Реагирование возобновлено!` });
      return;
    }

  } catch (error) {
    logger.error('Error handling VK callback', {
      error: error instanceof Error ? error.message : error,
      userId: context.userId,
      peerId: context.peerId,
    });

    handleVkError(error as Error, {
      userId: context.userId,
      peerId: context.peerId,
    });

    // Отправить ошибку пользователю
    try {
      await context.answer({
        type: 'show_snackbar',
        text:
          error instanceof Error
            ? error.message
            : `${EMOJI.ERROR} Произошла ошибка при обработке ответа`,
      });
    } catch (answerError) {
      logger.error('Failed to send error answer', { error: answerError });
    }
  }
}

export default handleCallbackEvent;
