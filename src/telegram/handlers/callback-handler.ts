import TelegramBot from 'node-telegram-bot-api';
import logger from '../../utils/logger';
import SyncService from '../../services/sync.service';
import { CalloutResponsePayload, parseCompactCallbackData } from '../utils/keyboard-builder';
import { handleTelegramError } from '../../utils/error-handler';
import { EMOJI } from '../../config/constants';
import { trackTelegramMember } from '../utils/member-tracker';

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

    // Парсинг payload (поддерживает компактный формат r:id:id:type и JSON fallback)
    const payload = parseCompactCallbackData(query.data);

    if (!payload || payload.action !== 'respond') {
      logger.warn('Invalid callback payload', { payload });
      await bot.answerCallbackQuery(query.id, {
        text: `${EMOJI.ERROR} Неверный формат данных`,
        show_alert: true,
      });
      return;
    }

    logger.info('Processing Telegram callback', {
      calloutId: payload.callout_id,
      subdivisionId: payload.subdivision_id,
      userId,
      userName,
    });

    // Обработать ответ через SyncService
    const responseType = payload.type || 'acknowledged';
    const response = await SyncService.handleTelegramResponse(
      payload,
      `telegram_${userId}`,
      userName,
      responseType
    );

    logger.info('Telegram response processed successfully', {
      responseId: response.id,
      calloutId: payload.callout_id,
      responseType,
    });

    // Отправить подтверждение пользователю
    const answerText = responseType === 'on_way'
      ? `${EMOJI.SUCCESS} Статус "В пути" отправлен в Discord!`
      : `${EMOJI.SUCCESS} Ваш ответ отправлен в Discord!`;
    await bot.answerCallbackQuery(query.id, {
      text: answerText,
      show_alert: false,
    });
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
