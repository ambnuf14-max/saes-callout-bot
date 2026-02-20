import TelegramBot from 'node-telegram-bot-api';
import { Callout, Subdivision, CalloutResponse } from '../../types/database.types';
import { EMOJI } from '../../config/constants';
import { buildDetailedCalloutKeyboard } from './keyboard-builder';
import logger from '../../utils/logger';
import { parseDiscordEmoji } from '../../discord/utils/subdivision-settings-helper';
import { TelegramMemberModel, TelegramMember } from '../../database/models/TelegramMember';

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
  subdivision: Subdivision,
  authorFactionName?: string
): Promise<number> {
  try {
    const members = await TelegramMemberModel.findByChatId(chatId);
    const message = formatCalloutMessage(callout, subdivision, authorFactionName, members);
    const keyboard = buildDetailedCalloutKeyboard(callout.id, subdivision.id);

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
function buildMentionLine(members: TelegramMember[]): string {
  if (members.length === 0) return '';
  return members.map(m => {
    if (m.username) return `@${m.username}`;
    const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || 'участник';
    return `<a href="tg://user?id=${m.user_id}">${name}</a>`;
  }).join(' ');
}

function formatCalloutMessage(callout: Callout, subdivision: Subdivision, authorFactionName?: string, members: TelegramMember[] = []): string {
  const time = new Date(callout.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const authorLine = authorFactionName
    ? `<b>Отправил запрос:</b> ${callout.author_name} (${authorFactionName})`
    : `<b>Отправил запрос:</b> ${callout.author_name}`;

  const mentionLine = buildMentionLine(members);
  const parts: string[] = [];
  if (mentionLine) {
    parts.push(mentionLine, '');
  }
  parts.push(
    `🚨 <b>INCOMING CALLOUT #${callout.id}</b>`,
    '',
    `<b>Кратко об инциденте</b>`,
    callout.brief_description || 'Не указано',
    '',
    `<b>Локация инцидента</b>`,
    callout.location || 'Не указано',
    '',
    `<b>Полное описание инцидента</b>`,
    callout.description,
  );

  if (callout.tac_channel) {
    parts.push('', '<b>TAC-канал</b>', callout.tac_channel);
  }

  parts.push(
    '',
    `<b>Запрошенные подразделения</b>`,
    subdivision.name,
    '',
    authorLine,
    `🕐 ${time}`,
  );

  return parts.join('\n');
}

/**
 * Форматировать полное сообщение о закрытии каллаута для Telegram
 */
export function formatCalloutClosedMessage(
  callout: Callout,
  subdivision: Subdivision,
  responses: CalloutResponse[] = [],
  subdivisionsMap: Map<number, Subdivision> = new Map(),
  closedByName?: string
): string {
  const time = new Date(callout.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const parts = [
    `🚨 <b>INCOMING CALLOUT #${callout.id}</b>`,
    '',
    `<b>Кратко об инциденте</b>`,
    callout.brief_description || 'Не указано',
    '',
    `<b>Локация инцидента</b>`,
    callout.location || 'Не указано',
    '',
    `<b>Полное описание инцидента</b>`,
    callout.description,
  ];

  if (callout.tac_channel) {
    parts.push('', '<b>TAC-канал</b>', callout.tac_channel);
  }

  const authorLineClosed = callout.author_faction_name
    ? `<b>Отправил запрос:</b> ${callout.author_name} (${callout.author_faction_name})`
    : `<b>Отправил запрос:</b> ${callout.author_name}`;

  parts.push(
    '',
    `<b>Запрошенные подразделения</b>`,
    subdivision.name,
    '',
    authorLineClosed,
    time,
    '',
    `<b>Статус:</b> 🔒 Закрыт`,
  );

  if (closedByName) {
    parts.push(`<b>Закрыл:</b> ${closedByName}`);
  }

  // Лог инцидента
  const logEntries = buildLogEntries(callout, responses, subdivisionsMap, true);
  parts.push('', '<b>Лог инцидента</b>', logEntries.join('\n'));

  return parts.join('\n');
}

function buildLogEntries(
  callout: Callout,
  responses: CalloutResponse[],
  subdivisionsMap: Map<number, Subdivision>,
  includeClosed = false
): string[] {
  const entries: string[] = [];
  entries.push(`${formatMoscowTime(new Date(callout.created_at))} - @${callout.author_name} Создал запрос поддержки.`);

  for (const r of responses) {
    const subdiv = subdivisionsMap.get(r.subdivision_id);
    const logTime = formatMoscowTime(new Date(r.created_at));
    const emoji = subdiv ? formatSubdivisionEmojiTg(subdiv) : '';
    const name = subdiv?.name || 'Unknown';
    entries.push(`${logTime} - ${emoji}${name} отреагировало на запрос поддержки.`);
  }

  if (includeClosed && callout.closed_at) {
    const logTime = formatMoscowTime(new Date(callout.closed_at));
    const reason = callout.closed_reason ? ` (${callout.closed_reason})` : '';
    entries.push(`${logTime} - 🔒 Инцидент закрыт${reason}.`);
  }

  return entries;
}

export function formatActiveCalloutWithLog(
  callout: Callout,
  subdivision: Subdivision,
  responses: CalloutResponse[],
  subdivisionsMap: Map<number, Subdivision>
): string {
  const time = new Date(callout.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const parts = [
    `🚨 <b>INCOMING CALLOUT #${callout.id}</b>`,
    '',
    `<b>Кратко об инциденте</b>`,
    callout.brief_description || 'Не указано',
    '',
    `<b>Локация инцидента</b>`,
    callout.location || 'Не указано',
    '',
    `<b>Полное описание инцидента</b>`,
    callout.description,
  ];

  if (callout.tac_channel) {
    parts.push('', '<b>TAC-канал</b>', callout.tac_channel);
  }

  const authorLineActive = callout.author_faction_name
    ? `<b>Отправил запрос:</b> ${callout.author_name} (${callout.author_faction_name})`
    : `<b>Отправил запрос:</b> ${callout.author_name}`;

  parts.push(
    '',
    `<b>Запрошенные подразделения</b>`,
    subdivision.name,
    '',
    authorLineActive,
    `🕐 ${time}`,
  );

  const logEntries = buildLogEntries(callout, responses, subdivisionsMap, false);
  if (logEntries.length > 0) {
    parts.push('', '<b>Лог инцидента</b>', logEntries.join('\n'));
  }

  return parts.join('\n');
}

function formatMoscowTime(date: Date): string {
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatSubdivisionEmojiTg(subdivision: Subdivision): string {
  const parsed = subdivision.logo_url ? parseDiscordEmoji(subdivision.logo_url) : null;
  // Кастомные Discord-эмодзи не рендерятся в Telegram — показываем только unicode
  if (!parsed || parsed.id) return '';
  return `${parsed.name} `;
}

/**
 * Обновить сообщение в Telegram
 */
export async function editMessage(
  bot: TelegramBot,
  chatId: string,
  messageId: number,
  newText: string,
  removeKeyboard: boolean = false
): Promise<void> {
  try {
    const options: TelegramBot.EditMessageTextOptions = {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    if (removeKeyboard) {
      options.reply_markup = { inline_keyboard: [] };
    }

    await bot.editMessageText(newText, options);

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
