import TelegramBot from 'node-telegram-bot-api';
import { Callout, Subdivision } from '../../types/database.types';
import { EMOJI } from '../../config/constants';
import { buildCalloutKeyboard } from './keyboard-builder';
import logger from '../../utils/logger';

/**
 * Утилиты для форматирования и отправки сообщений в Telegram
 */

/**
 * Отправить уведомление о каллауте в Telegram группу
 */
export async function sendCalloutNotification(
  bot: TelegramBot,
  chatId: string,
  callout: Callout,
  subdivision: Subdivision
): Promise<number> {
  try {
    const message = formatCalloutMessage(callout, subdivision);
    const keyboard = buildCalloutKeyboard(callout.id, subdivision.id);

    const sentMessage = await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });

    logger.info('Telegram callout notification sent', {
      calloutId: callout.id,
      chatId,
      messageId: sentMessage.message_id,
    });

    return sentMessage.message_id;
  } catch (error) {
    logger.error('Failed to send Telegram callout notification', {
      error: error instanceof Error ? error.message : error,
      calloutId: callout.id,
      chatId,
    });
    throw error;
  }
}

/**
 * Форматировать сообщение о каллауте для Telegram
 */
function formatCalloutMessage(callout: Callout, subdivision: Subdivision): string {
  const header = `${EMOJI.CALLOUT} <b>КАЛЛАУТ #${callout.id}</b>`;
  const subdivisionInfo = `📋 Подразделение: <b>${subdivision.name}</b>`;
  const authorInfo = `👤 Автор: ${callout.author_name}`;
  const descriptionInfo = `📝 Описание: ${callout.description}`;
  const locationInfo = callout.location ? `📍 Локация: ${callout.location}` : '';

  const parts = [header, subdivisionInfo, authorInfo, descriptionInfo];
  if (locationInfo) {
    parts.push(locationInfo);
  }

  return parts.join('\n');
}

/**
 * Форматировать сообщение о закрытии каллаута
 */
export function formatCalloutClosedMessage(callout: Callout): string {
  const header = `${EMOJI.SUCCESS} <b>Каллаут #${callout.id} закрыт</b>`;
  const closedBy = callout.closed_by ? `👤 Закрыл: ${callout.closed_by}` : '';
  const reason = callout.closed_reason ? `📝 Причина: ${callout.closed_reason}` : '';

  const parts = [header];
  if (closedBy) parts.push(closedBy);
  if (reason) parts.push(reason);

  return parts.join('\n');
}

/**
 * Обновить сообщение в Telegram
 */
export async function editMessage(
  bot: TelegramBot,
  chatId: string,
  messageId: number,
  newText: string
): Promise<void> {
  try {
    await bot.editMessageText(newText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    logger.info('Telegram message edited', {
      chatId,
      messageId,
    });
  } catch (error) {
    logger.error('Failed to edit Telegram message', {
      error: error instanceof Error ? error.message : error,
      chatId,
      messageId,
    });
    throw error;
  }
}

export default {
  sendCalloutNotification,
  formatCalloutClosedMessage,
  editMessage,
};
