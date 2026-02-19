import { VK } from 'vk-io';
import logger from '../../utils/logger';
import { Callout, Subdivision } from '../../types/database.types';
import { buildDetailedCalloutKeyboard } from './keyboard-builder';
import { EMOJI } from '../../config/constants';

/**
 * Утилиты для отправки сообщений в VK
 */

/**
 * Отправить уведомление о каллауте в VK беседу
 */
export async function sendCalloutNotification(
  vk: VK,
  chatId: string,
  callout: Callout,
  subdivision: Subdivision
): Promise<number> {
  try {
    // Форматировать сообщение
    const message = formatCalloutMessage(callout, subdivision);

    // Создать клавиатуру с кнопками
    const keyboard = buildDetailedCalloutKeyboard(callout.id, subdivision.id);

    // Отправить сообщение
    const response = await vk.api.messages.send({
      peer_id: parseInt(chatId),
      message: message,
      keyboard: keyboard,
      random_id: Date.now() + Math.floor(Math.random() * 100000),
    });

    // VK API возвращает число или объект в зависимости от параметров
    const messageId = typeof response === 'number' ? response : (response as any).message_id || 0;

    logger.info('VK notification sent', {
      calloutId: callout.id,
      chatId,
      messageId,
    });

    return messageId;
  } catch (error) {
    logger.error('Failed to send VK notification', {
      error: error instanceof Error ? error.message : error,
      calloutId: callout.id,
      chatId,
    });
    throw error;
  }
}

/**
 * Обновить сообщение о каллауте в VK
 */
export async function updateCalloutMessage(
  vk: VK,
  chatId: string,
  messageId: string,
  newText: string
): Promise<void> {
  try {
    await vk.api.messages.edit({
      peer_id: parseInt(chatId),
      message_id: parseInt(messageId),
      message: newText,
    });

    logger.info('VK message updated', {
      chatId,
      messageId,
    });
  } catch (error) {
    logger.error('Failed to update VK message', {
      error: error instanceof Error ? error.message : error,
      chatId,
      messageId,
    });
    // Не бросаем ошибку, так как это не критично
  }
}

/**
 * Отправить подтверждение пользователю VK
 */
export async function sendConfirmation(
  vk: VK,
  userId: number,
  text: string
): Promise<void> {
  try {
    await vk.api.messages.send({
      user_id: userId,
      message: text,
      random_id: Date.now() + Math.floor(Math.random() * 100000),
    });

    logger.info('VK confirmation sent', { userId });
  } catch (error) {
    logger.error('Failed to send VK confirmation', {
      error: error instanceof Error ? error.message : error,
      userId,
    });
    // Не критично, не бросаем ошибку
  }
}

/**
 * Форматировать сообщение о каллауте для VK
 */
function formatCalloutMessage(callout: Callout, subdivision: Subdivision): string {
  const time = new Date(callout.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const lines = [
    `🚨 INCOMING CALLOUT #${callout.id}`,
    '',
    `Кратко об инциденте`,
    callout.brief_description || 'Не указано',
    '',
    `Локация инцидента`,
    callout.location || 'Не указано',
    '',
    `Полное описание инцидента`,
    callout.description,
  ];

  if (callout.tac_channel) {
    lines.push('', 'TAC-канал', callout.tac_channel);
  }

  lines.push(
    '',
    `Запрошенные подразделения`,
    subdivision.name,
    '',
    `Отправил запрос: ${callout.author_name}`,
    `🕐 ${time}`,
    '',
    '@all',
  );

  return lines.join('\n');
}

/**
 * Форматировать сообщение о закрытии каллаута
 */
export function formatCalloutClosedMessage(callout: Callout): string {
  const lines = [
    `${EMOJI.CLOSED} КАЛЛАУТ #${callout.id} ЗАКРЫТ`,
    '',
    `🕐 Время закрытия: ${
      callout.closed_at
        ? new Date(callout.closed_at).toLocaleString('ru-RU', {
            timeZone: 'Europe/Moscow',
          })
        : 'Неизвестно'
    }`,
  ];

  if (callout.closed_reason) {
    lines.push(`📝 Причина: ${callout.closed_reason}`);
  }

  return lines.join('\n');
}

export default {
  sendCalloutNotification,
  updateCalloutMessage,
  sendConfirmation,
  formatCalloutClosedMessage,
};
