import TelegramBot from 'node-telegram-bot-api';
import logger from '../../utils/logger';
import SyncService from '../../services/sync.service';
import { CalloutResponsePayload, parseCompactCallbackData, buildCancelDeclineKeyboard } from '../utils/keyboard-builder';
import { handleTelegramError } from '../../utils/error-handler';
import { EMOJI, DECLINE_TIMERS } from '../../config/constants';
import { trackTelegramMember } from '../utils/member-tracker';
import { SubdivisionModel } from '../../database/models';
import { pendingDeclineReasonState } from '../../services/decline-reason.state';
import CalloutService from '../../services/callout.service';

/**
 * Обработчик callback событий от inline кнопок Telegram
 */
export async function handleCallbackQuery(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
): Promise<void> {
  try {
    const userId = query.from.id;
    const userName = query.from.username
      ? `@${query.from.username}`
      : `${query.from.first_name}${query.from.last_name ? ' ' + query.from.last_name : ''}`;

    logger.info('Received Telegram callback query', {
      userId,
      userName,
      chatId: query.message?.chat.id,
      callbackData: query.data,
    });

    // Трекинг участника
    if (query.message?.chat.id) {
      await trackTelegramMember(query.message.chat.id, query.from);
    }

    if (!query.data) {
      await bot.answerCallbackQuery(query.id, {
        text: `${EMOJI.ERROR} Неверный формат данных`,
        show_alert: true,
      });
      return;
    }

    // Парсинг payload (компактный формат r:, dl:, rv:, sr: и JSON fallback)
    const payload = parseCompactCallbackData(query.data);

    if (!payload || !['respond', 'decline', 'revive', 'cancel_decline', 'cancel_response'].includes(payload.action)) {
      logger.warn('Invalid callback payload', { payload });
      await bot.answerCallbackQuery(query.id, {
        text: `${EMOJI.ERROR} Неверный формат данных`,
        show_alert: true,
      });
      return;
    }

    // Валидация числовых полей payload
    if (
      !Number.isFinite(payload.callout_id) || payload.callout_id <= 0 ||
      !Number.isFinite(payload.subdivision_id) || payload.subdivision_id <= 0
    ) {
      logger.warn('Invalid numeric fields in Telegram callback payload', { payload });
      await bot.answerCallbackQuery(query.id, {
        text: `${EMOJI.ERROR} Неверный формат данных`,
        show_alert: true,
      });
      return;
    }

    // Проверить, что callback пришёл из чата, привязанного к подразделению
    const chatId = query.message?.chat.id;
    const subdivision = await SubdivisionModel.findById(payload.subdivision_id);
    if (!subdivision || !subdivision.telegram_chat_id || !chatId || subdivision.telegram_chat_id !== chatId.toString()) {
      logger.warn('Telegram callback from unauthorized chat', {
        chatId,
        subdivisionId: payload.subdivision_id,
        expectedChatId: subdivision?.telegram_chat_id,
      });
      await bot.answerCallbackQuery(query.id, {
        text: `${EMOJI.ERROR} Эта группа не привязана к подразделению`,
        show_alert: true,
      });
      return;
    }

    logger.info('Processing Telegram callback', {
      calloutId: payload.callout_id,
      subdivisionId: payload.subdivision_id,
      userId,
      userName,
      action: payload.action,
    });

    if (payload.action === 'respond') {
      const response = await SyncService.handleTelegramResponse(payload, `telegram_${userId}`, userName);
      logger.info('Telegram response processed', { responseId: response.id, calloutId: payload.callout_id });
      await bot.answerCallbackQuery(query.id, { text: `${EMOJI.SUCCESS} Ваш ответ отправлен в Discord!`, show_alert: false });
      if (query.message?.chat.id) {
        bot.sendMessage(
          query.message.chat.id,
          `✅ <b>${userName}</b> принимает запрос поддержки.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
      return;
    }

    if (payload.action === 'decline') {
      const chatId = query.message?.chat.id;
      if (!chatId) {
        await bot.answerCallbackQuery(query.id, { text: `${EMOJI.ERROR} Ошибка: нет chat ID`, show_alert: true });
        return;
      }

      const stateKey = `telegram:${userId}:${chatId}`;
      if (pendingDeclineReasonState.has(stateKey)) {
        await bot.answerCallbackQuery(query.id, { text: `${EMOJI.WARNING} Введите причину в чат (осталось время)`, show_alert: false });
        return;
      }

      const timeout = setTimeout(() => {
        pendingDeclineReasonState.delete(stateKey);
        logger.info('TG decline reason timeout expired', { userId, calloutId: payload.callout_id });
        bot.sendMessage(
          chatId,
          `⏰ Время на ввод причины отклонения истекло. Нажмите кнопку снова, если хотите отклонить запрос.`,
        ).catch(() => {});
      }, DECLINE_TIMERS.REASON_TIMEOUT);

      const entry = pendingDeclineReasonState.set(stateKey, {
        calloutId: payload.callout_id,
        subdivisionId: payload.subdivision_id,
        platform: 'telegram',
        chatId: chatId.toString(),
        timeout,
      }).get(stateKey)!;

      // Отправить follow-up сообщение и сохранить его ID
      try {
        const sentMsg = await bot.sendMessage(
          chatId,
          `❌ <b>${userName}</b> отклоняет запрос поддержки.\n\nНапишите причину отклонения в этот чат — она будет принята автоматически. У вас 3 минуты.`,
          { parse_mode: 'HTML', reply_markup: buildCancelDeclineKeyboard(payload.callout_id, payload.subdivision_id) }
        );
        entry.promptMessageId = sentMsg.message_id;
      } catch (sendError) {
        clearTimeout(timeout);
        pendingDeclineReasonState.delete(stateKey);
        logger.error('Failed to send TG decline reason request', { error: sendError });
        await bot.answerCallbackQuery(query.id, {
          text: `${EMOJI.ERROR} Не удалось отправить запрос причины. Попробуйте снова.`,
          show_alert: true,
        });
        return;
      }

      await bot.answerCallbackQuery(query.id, { text: `📝 Введите причину отклонения в чат (3 мин.)`, show_alert: false });
      return;
    }

    if (payload.action === 'cancel_decline') {
      const stateKey = `telegram:${userId}:${chatId}`;
      const pending = pendingDeclineReasonState.get(stateKey);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingDeclineReasonState.delete(stateKey);
      }
      // Удалить сообщение с кнопкой "Назад" из чата
      if (query.message) {
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
      }
      await bot.answerCallbackQuery(query.id, { text: `Отклонение отменено.`, show_alert: false });
      return;
    }

    if (payload.action === 'revive') {
      await CalloutService.cancelDecline(null, payload.callout_id, userName);
      logger.info('TG revive callout processed', { calloutId: payload.callout_id, userId });
      await bot.answerCallbackQuery(query.id, { text: `${EMOJI.SUCCESS} Реагирование возобновлено!`, show_alert: false });
      return;
    }

    if (payload.action === 'cancel_response') {
      await SyncService.handleCancelResponse(
        payload.callout_id,
        payload.subdivision_id,
        'telegram',
        `telegram_${userId}`,
        userName
      );
      logger.info('TG cancel response processed', { calloutId: payload.callout_id, userId });
      await bot.answerCallbackQuery(query.id, { text: `✅ Реагирование отменено`, show_alert: false });
      if (query.message?.chat.id) {
        bot.sendMessage(
          query.message.chat.id,
          `❌ <b>${userName}</b> отменяет реагирование.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
      return;
    }

  } catch (error) {
    logger.error('Error handling Telegram callback', {
      error: error instanceof Error ? error.message : error,
      userId: query.from.id,
      chatId: query.message?.chat.id,
    });

    handleTelegramError(error as Error, {
      userId: query.from.id,
      chatId: query.message?.chat.id,
    });

    // Отправить ошибку пользователю
    try {
      await bot.answerCallbackQuery(query.id, {
        text:
          error instanceof Error
            ? error.message
            : `${EMOJI.ERROR} Произошла ошибка при обработке ответа`,
        show_alert: true,
      });
    } catch (answerError) {
      logger.error('Failed to send error answer', { error: answerError });
    }
  }
}

export default handleCallbackQuery;
