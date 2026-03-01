import { MessageEventContext } from 'vk-io';
import logger from '../../utils/logger';
import SyncService from '../../services/sync.service';
import { CalloutResponsePayload, VkAdminCheckPayload, buildCancelDeclineKeyboard } from '../utils/keyboard-builder';
import { handleVkError } from '../../utils/error-handler';
import { EMOJI, DECLINE_TIMERS } from '../../config/constants';
import vkBot from '../bot';
import { CalloutModel, SubdivisionModel } from '../../database/models';
import { pendingDeclineReasonState } from '../../services/decline-reason.state';
import { pendingVkVerifyState } from '../../services/vk-verify.state';
import { VerificationService } from '../../services/verification.service';
import { MESSAGES } from '../../config/constants';
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
    const payload: CalloutResponsePayload | VkAdminCheckPayload = typeof rawPayload === 'string'
      ? JSON.parse(rawPayload)
      : rawPayload as CalloutResponsePayload | VkAdminCheckPayload;

    if (!payload || !['respond', 'decline', 'revive', 'cancel_decline', 'cancel_response', 'check_vk_admin'].includes(payload.action)) {
      logger.warn('Invalid callback payload', { payload });
      await context.answer({
        type: 'show_snackbar',
        text: `${EMOJI.ERROR} Неверный формат данных`,
      });
      return;
    }

    // Обработка проверки прав администратора (отдельный флоу — без callout_id/subdivision_id)
    if (payload.action === 'check_vk_admin') {
      const peerId = context.peerId.toString();
      const pending = pendingVkVerifyState.get(peerId);

      if (!pending) {
        await context.answer({ type: 'show_snackbar', text: `${EMOJI.ERROR} Сессия верификации истекла. Отправьте /verify TOKEN заново.` });
        return;
      }

      // Проверить права
      let canRead = false;
      try {
        await vkBot.getApi().api.messages.getHistory({ peer_id: context.peerId, count: 1 });
        canRead = true;
      } catch {
        canRead = false;
      }

      if (!canRead) {
        await context.answer({ type: 'show_snackbar', text: `${EMOJI.ERROR} Права не обнаружены.` });
        return;
      }

      // Права есть — верифицируем
      pendingVkVerifyState.delete(peerId);

      const result = await VerificationService.verifyToken(pending.token, peerId, 'vk', pending.chatTitle);

      logger.info('VK chat linked after admin check', {
        subdivisionId: result.subdivision.id,
        subdivisionName: result.subdivision.name,
        peerId,
      });

      // Отредактировать сообщение с запросом прав
      if (pending.promptMessageId) {
        (vkBot.getApi().api.messages.edit as any)({
          peer_id: context.peerId,
          conversation_message_id: pending.promptMessageId,
          message: MESSAGES.VERIFICATION.SUCCESS_VK(result.subdivision.name),
          keyboard: JSON.stringify({ buttons: [], inline: true }),
        }).catch((e: any) => logger.warn('Failed to edit admin check prompt', { error: e?.message }));
      }

      await context.answer({ type: 'show_snackbar', text: `${EMOJI.SUCCESS} Беседа успешно привязана!` });

      // Уведомить Discord
      const { default: handleVerifyCommand } = await import('./verify-command-handler');
      // Используем VerificationService напрямую — Discord-уведомление отдельно
      try {
        const { default: discordBot } = await import('../../discord/bot');
        const { FactionModel, ServerModel } = await import('../../database/models');
        const { logAuditEvent, AuditEventType, resolveLogoThumbnailUrl } = await import('../../discord/utils/audit-logger');
        const faction = await FactionModel.findById(result.subdivision.faction_id);
        const server = faction ? await ServerModel.findById(result.subdivision.server_id) : null;
        const guild = server ? discordBot.client.guilds.cache.get(server.guild_id) : undefined;
        if (guild) {
          await logAuditEvent(guild, AuditEventType.VK_CHAT_LINKED, {
            userId: result.token.created_by,
            userName: 'Лидер фракции',
            subdivisionName: result.subdivision.name,
            factionName: faction?.name ?? '',
            vkChatId: peerId,
            chatTitle: pending.chatTitle,
            thumbnailUrl: resolveLogoThumbnailUrl(result.subdivision.logo_url),
          });
        }
      } catch (auditErr) {
        logger.warn('Failed to log audit after admin check verify', { error: auditErr });
      }

      return;
    }

    // Валидация числовых полей payload (только для callout-действий)
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
      (vkBot.getApi().api.messages.send as any)({
        peer_ids: [context.peerId],
        message: `✅ ${userName} принимает запрос поддержки.`,
        random_id: Date.now() + Math.floor(Math.random() * 100000),
      }).catch(() => {});
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

      const entry = pendingDeclineReasonState.set(stateKey, {
        calloutId: payload.callout_id,
        subdivisionId: payload.subdivision_id,
        platform: 'vk',
        chatId: context.peerId.toString(),
        timeout,
      }).get(stateKey)!;

      // Отправить follow-up сообщение и сохранить conversation_message_id
      try {
        const sendResp = await (vkBot.getApi().api.messages.send as any)({
          peer_ids: [context.peerId],
          message: `❌ ${userName} отклоняет запрос поддержки.\n\nСледующее ваше сообщение в этом чате будет принято как причина. У вас 3 минуты, после состояние сбросится.`,
          keyboard: buildCancelDeclineKeyboard(payload.callout_id, payload.subdivision_id),
          random_id: Date.now() + Math.floor(Math.random() * 100000),
        });
        // Та же логика извлечения cmid, что и при отправке сообщения каллаута
        let promptCmid = 0;
        if (Array.isArray(sendResp) && sendResp.length > 0) {
          const item = sendResp[0];
          if (item.error) {
            logger.error('VK delivery error for decline prompt', { error: item.error });
          } else {
            promptCmid = item.conversation_message_id || 0;
          }
        } else if (sendResp && typeof sendResp === 'object') {
          promptCmid = (sendResp as any).conversation_message_id || 0;
        }
        if (promptCmid) {
          entry.promptMessageId = promptCmid;
        }
        logger.info('VK decline prompt sent', { calloutId: payload.callout_id, promptCmid });
      } catch (sendError) {
        logger.error('Failed to send VK decline reason request', { error: sendError });
      }

      await context.answer({ type: 'show_snackbar', text: `📝 Введите причину отклонения в чат (3 мин.)` });
      return;
    }

    if (payload.action === 'cancel_decline') {
      const stateKey = `vk:${context.userId}`;
      const pending = pendingDeclineReasonState.get(stateKey);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingDeclineReasonState.delete(stateKey);
      }
      // Удалить сообщение с кнопкой "Назад" из чата
      const promptCmid = (context as any).conversationMessageId;
      if (promptCmid) {
        (vkBot.getApi().api.messages.delete as any)({
          peer_id: context.peerId,
          cmids: [promptCmid],
          delete_for_all: 1,
        }).catch(() => {});
      }
      await context.answer({ type: 'show_snackbar', text: `Отклонение отменено.` });
      return;
    }

    if (payload.action === 'revive') {
      await CalloutService.cancelDecline(null, payload.callout_id, userName);

      logger.info('VK revive callout processed', { calloutId: payload.callout_id, userId: context.userId });
      await context.answer({ type: 'show_snackbar', text: `${EMOJI.SUCCESS} Реагирование возобновлено!` });
      return;
    }

    if (payload.action === 'cancel_response') {
      await SyncService.handleCancelResponse(
        payload.callout_id,
        payload.subdivision_id,
        'vk',
        context.userId.toString(),
        userName
      );

      logger.info('VK cancel response processed', { calloutId: payload.callout_id, userId: context.userId });
      await context.answer({ type: 'show_snackbar', text: `✅ Реагирование отменено` });
      (vkBot.getApi().api.messages.send as any)({
        peer_ids: [context.peerId],
        message: `❌ ${userName} отменяет реагирование.`,
        random_id: Date.now() + Math.floor(Math.random() * 100000),
      }).catch(() => {});
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
