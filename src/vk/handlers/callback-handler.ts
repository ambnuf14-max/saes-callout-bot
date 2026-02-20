import { MessageEventContext } from 'vk-io';
import logger from '../../utils/logger';
import SyncService from '../../services/sync.service';
import { CalloutResponsePayload } from '../utils/keyboard-builder';
import { handleVkError } from '../../utils/error-handler';
import { EMOJI } from '../../config/constants';
import vkBot from '../bot';
import { CalloutModel, SubdivisionModel } from '../../database/models';

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

    if (!payload || payload.action !== 'respond') {
      logger.warn('Invalid callback payload', { payload });
      await context.answer({
        type: 'show_snackbar',
        text: `${EMOJI.ERROR} Неверный формат данных`,
      });
      return;
    }

    // Валидация числовых полей payload
    if (!Number.isFinite(payload.callout_id) || !Number.isFinite(payload.subdivision_id)) {
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

    // Обработать ответ через SyncService
    const responseType = payload.type || 'acknowledged';
    const response = await SyncService.handleVkResponse(
      payload,
      context.userId.toString(),
      userName,
      responseType
    );

    logger.info('VK response processed successfully', {
      responseId: response.id,
      calloutId: payload.callout_id,
      responseType,
    });

    // Отправить подтверждение пользователю
    const snackbarText = responseType === 'on_way'
      ? `${EMOJI.SUCCESS} Статус "В пути" отправлен в Discord!`
      : `${EMOJI.SUCCESS} Ваш ответ отправлен в Discord!`;
    await context.answer({
      type: 'show_snackbar',
      text: snackbarText,
    });
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
