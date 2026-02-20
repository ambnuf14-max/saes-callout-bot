import { VK } from 'vk-io';
import logger from '../../utils/logger';
import { Callout, Subdivision, CalloutResponse } from '../../types/database.types';
import { buildDetailedCalloutKeyboard } from './keyboard-builder';
import { EMOJI } from '../../config/constants';
import { parseDiscordEmoji } from '../../discord/utils/subdivision-settings-helper';

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
  subdivision: Subdivision,
  authorFactionName?: string
): Promise<number> {
  try {
    // Форматировать сообщение
    const message = formatCalloutMessage(callout, subdivision, authorFactionName);

    // Создать клавиатуру с кнопками
    const keyboard = buildDetailedCalloutKeyboard(callout.id, subdivision.id);

    // Отправить сообщение.
    // Используем peer_ids (множественное) — VK возвращает объект с conversation_message_id.
    const peerIdInt = parseInt(chatId);
    const sendResponse = await (vk.api.messages.send as any)({
      peer_ids: [peerIdInt],
      message: message,
      keyboard: keyboard,
      random_id: Date.now() + Math.floor(Math.random() * 100000),
    });

    // peer_ids response: [{peer_id, message_id, conversation_message_id, error?}]
    let messageId = 0;
    if (Array.isArray(sendResponse) && sendResponse.length > 0) {
      messageId = sendResponse[0].conversation_message_id || 0;
    } else if (sendResponse && typeof sendResponse === 'object') {
      messageId = (sendResponse as any).conversation_message_id || 0;
    }

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
function formatCalloutMessage(callout: Callout, subdivision: Subdivision, authorFactionName?: string): string {
  const time = new Date(callout.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const authorLine = authorFactionName
    ? `Отправил запрос: ${callout.author_name} (${authorFactionName})`
    : `Отправил запрос: ${callout.author_name}`;

  const lines = [
    '@all',
    '',
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
    authorLine,
    time,
  );

  return lines.join('\n');
}

/**
 * Форматировать активное сообщение каллаута с логом инцидента (для обновления при ответе)
 */
export function formatActiveCalloutWithLog(
  callout: Callout,
  subdivision: Subdivision,
  responses: CalloutResponse[],
  subdivisionsMap: Map<number, Subdivision>
): string {
  const time = new Date(callout.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const lines = [
    '@all',
    '',
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

  const authorLineActive = callout.author_faction_name
    ? `Отправил запрос: ${callout.author_name} (${callout.author_faction_name})`
    : `Отправил запрос: ${callout.author_name}`;

  lines.push(
    '',
    `Запрошенные подразделения`,
    subdivision.name,
    '',
    authorLineActive,
    time,
  );

  const logEntries: string[] = [];
  logEntries.push(`${formatMoscowTime(new Date(callout.created_at))} - @${callout.author_name} Создал запрос поддержки.`);
  for (const r of responses) {
    const subdiv = subdivisionsMap.get(r.subdivision_id);
    const logTime = formatMoscowTime(new Date(r.created_at));
    const emoji = subdiv ? formatSubdivisionEmojiVk(subdiv) : '';
    const name = subdiv?.name || 'Unknown';
    logEntries.push(`${logTime} - ${emoji}${name} отреагировало на запрос поддержки.`);
  }

  if (logEntries.length > 0) {
    lines.push('', 'Лог инцидента', logEntries.join('\n'));
  }

  return lines.join('\n');
}

/**
 * Форматировать сообщение о закрытии каллаута для VK (полный формат)
 */
export function formatCalloutClosedMessage(
  callout: Callout,
  subdivision: Subdivision,
  responses: CalloutResponse[] = [],
  subdivisionsMap: Map<number, Subdivision> = new Map()
): string {
  const time = new Date(callout.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const lines = [
    '@all',
    '',
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

  const authorLineClosed = callout.author_faction_name
    ? `Отправил запрос: ${callout.author_name} (${callout.author_faction_name})`
    : `Отправил запрос: ${callout.author_name}`;

  lines.push(
    '',
    `Запрошенные подразделения`,
    subdivision.name,
    '',
    authorLineClosed,
    time,
    '',
    `Статус: 🔒 Закрыт`,
  );

  if (callout.closed_reason) {
    lines.push(`Причина: ${callout.closed_reason}`);
  }

  // Лог инцидента
  const logEntries: string[] = [];
  logEntries.push(`${formatMoscowTime(new Date(callout.created_at))} - @${callout.author_name} Создал запрос поддержки.`);

  for (const r of responses) {
    const subdiv = subdivisionsMap.get(r.subdivision_id);
    const logTime = formatMoscowTime(new Date(r.created_at));
    const emoji = subdiv ? formatSubdivisionEmojiVk(subdiv) : '';
    const name = subdiv?.name || 'Unknown';
    logEntries.push(`${logTime} - ${emoji}${name} отреагировало на запрос поддержки.`);
  }

  if (callout.closed_at) {
    const logTime = formatMoscowTime(new Date(callout.closed_at));
    const reason = callout.closed_reason ? ` (${callout.closed_reason})` : '';
    logEntries.push(`${logTime} - 🔒 Инцидент закрыт${reason}.`);
  }

  lines.push('', 'Лог инцидента', logEntries.join('\n'));

  return lines.join('\n');
}

function formatMoscowTime(date: Date): string {
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatSubdivisionEmojiVk(subdivision: Subdivision): string {
  const parsed = subdivision.logo_url ? parseDiscordEmoji(subdivision.logo_url) : null;
  // Кастомные Discord-эмодзи не рендерятся в VK — показываем только unicode
  if (!parsed || parsed.id) return '';
  return `${parsed.name} `;
}

export default {
  sendCalloutNotification,
  updateCalloutMessage,
  sendConfirmation,
  formatCalloutClosedMessage,
};
