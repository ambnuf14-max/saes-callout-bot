import { EmbedBuilder } from 'discord.js';
import { Callout, Subdivision, CalloutResponse } from '../../types/database.types';
import { COLORS, EMOJI, CALLOUT_STATUS } from '../../config/constants';
import { parseDiscordEmoji, getEmojiCdnUrl } from './subdivision-settings-helper';
import { stripUrls } from '../../utils/validators';

/**
 * Утилиты для создания Embed сообщений
 */

/**
 * Создать Embed для каллаута
 */
export function buildCalloutEmbed(callout: Callout, subdivision: Subdivision): EmbedBuilder {
  const isActive = callout.status === CALLOUT_STATUS.ACTIVE;
  const color = isActive ? COLORS.ACTIVE : COLORS.CLOSED;
  const statusText = isActive ? `${EMOJI.ACTIVE} Активен` : `${EMOJI.CLOSED} Закрыт`;

  const createdAtUnix = Math.floor(new Date(callout.created_at).getTime() / 1000);
  const thumbnailUrl = getEmojiCdnUrl(parseDiscordEmoji(subdivision.logo_url));
  const subdivisionValue = subdivision.discord_role_id
    ? `<@&${subdivision.discord_role_id}>`
    : subdivision.name;

  const embed = new EmbedBuilder()
    .setTitle('Incident Callout Report Message')
    .setDescription('🚨 **INCOMING CALLOUT**')
    .setColor(color)
    .setThumbnail(thumbnailUrl)
    .addFields([
      {
        name: 'Кратко об инциденте',
        value: callout.brief_description ? stripUrls(callout.brief_description) : 'Не указано',
        inline: false,
      },
      {
        name: 'Локация инцидента',
        value: callout.location ? stripUrls(callout.location) : 'Не указано',
        inline: false,
      },
      {
        name: 'Полное описание инцидента',
        value: stripUrls(callout.description),
        inline: false,
      },
      ...(callout.tac_channel ? [{
        name: 'TAC-канал',
        value: callout.tac_channel,
        inline: false,
      }] : []),
      {
        name: 'Статус',
        value: statusText,
        inline: true,
      },
      {
        name: 'Запрошенные подразделения',
        value: subdivisionValue,
        inline: false,
      },
      {
        name: 'Каллаут создан',
        value: `<t:${createdAtUnix}:R>`,
        inline: true,
      },
      {
        name: 'Отправил запрос',
        value: `<@${callout.author_id}>`,
        inline: true,
      },
    ])
    .setFooter({ text: `SAES Callout System • Incident #${callout.id}` })
    .setTimestamp(new Date(callout.created_at));

  // Информация о закрытии
  if (!isActive && callout.closed_by) {
    const closedByValue = callout.closed_by === 'system'
      ? 'System (авто-закрытие)'
      : `<@${callout.closed_by}>`;

    embed.addFields([{
      name: '🔒 Закрыл',
      value: closedByValue,
      inline: true,
    }]);

    if (callout.closed_at) {
      const closedAtUnix = Math.floor(new Date(callout.closed_at).getTime() / 1000);
      embed.addFields([{
        name: '🕐 Время закрытия',
        value: `<t:${closedAtUnix}:R>`,
        inline: true,
      }]);
    }

    if (callout.closed_reason) {
      embed.addFields([{
        name: '📝 Причина закрытия',
        value: stripUrls(callout.closed_reason),
        inline: false,
      }]);
    }
  }

  return embed;
}

/**
 * Создать Embed для ответа подразделения
 */
export function buildResponseEmbed(
  response: CalloutResponse,
  subdivision: Subdivision,
  platform: 'vk' | 'telegram' = 'vk'
): EmbedBuilder {
  const platformName = platform === 'vk' ? 'VK' : 'Telegram';

  return new EmbedBuilder()
    .setTitle(`${EMOJI.SUCCESS} Подразделение отреагировало`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      {
        name: 'Подразделение',
        value: subdivision.name,
        inline: true,
      },
      {
        name: `Ответил (${platformName})`,
        value: response.vk_user_name,
        inline: true,
      },
    ])
    .setFooter({ text: `Ответ из ${platformName}` })
    .setTimestamp(new Date(response.created_at));
}

/**
 * Обновить Embed каллаута для закрытого статуса
 */
export function buildClosedCalloutEmbed(
  callout: Callout,
  subdivision: Subdivision
): EmbedBuilder {
  // buildCalloutEmbed уже корректно обрабатывает закрытый статус:
  // устанавливает цвет COLORS.CLOSED, статус "Closed", поля "Закрыл" и "Причина"
  return buildCalloutEmbed(callout, subdivision);
}

/**
 * Добавить поле "Лог инцидента" в Embed
 */
export function addResponsesToEmbed(
  embed: EmbedBuilder,
  responses: CalloutResponse[],
  subdivisions: Map<number, Subdivision>,
  callout?: Callout
): EmbedBuilder {
  const logEntries: string[] = [];

  if (callout) {
    const time = formatMoscowTime(new Date(callout.created_at));
    logEntries.push(`\`${time}\` - @${callout.author_name} Создал запрос поддержки.`);
  }

  for (const r of responses) {
    const subdiv = subdivisions.get(r.subdivision_id);
    const time = formatMoscowTime(new Date(r.created_at));
    const emoji = subdiv ? formatSubdivisionEmoji(subdiv) : '';
    const name = subdiv?.name || 'Unknown';
    logEntries.push(`\`${time}\` - ${emoji}${name} отреагировало на запрос поддержки.`);
  }

  if (callout && callout.status !== CALLOUT_STATUS.ACTIVE && callout.closed_at) {
    const time = formatMoscowTime(new Date(callout.closed_at));
    const reason = callout.closed_reason ? ` (${callout.closed_reason})` : '';
    logEntries.push(`\`${time}\` - 🔒 Инцидент закрыт${reason}.`);
  }

  if (logEntries.length === 0) {
    return embed;
  }

  let logText = logEntries.join('\n');
  if (logText.length > 1024) {
    logText = logText.substring(0, 1021) + '...';
  }

  embed.addFields([{
    name: 'Лог инцидента',
    value: logText,
    inline: false,
  }]);

  return embed;
}

function formatMoscowTime(date: Date): string {
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatSubdivisionEmoji(subdivision: Subdivision): string {
  const parsed = subdivision.logo_url ? parseDiscordEmoji(subdivision.logo_url) : null;
  if (!parsed) return '';
  if (parsed.id) {
    return parsed.animated
      ? `<a:${parsed.name}:${parsed.id}> `
      : `<:${parsed.name}:${parsed.id}> `;
  }
  return `${parsed.name} `;
}

/**
 * Создать Embed для статистики
 */
export function buildStatsEmbed(stats: {
  total: number;
  active: number;
  closed: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${EMOJI.INFO} Статистика каллаутов`)
    .setColor(COLORS.INFO)
    .addFields([
      {
        name: 'Всего каллаутов',
        value: stats.total.toString(),
        inline: true,
      },
      {
        name: `${EMOJI.ACTIVE} Активных`,
        value: stats.active.toString(),
        inline: true,
      },
      {
        name: `${EMOJI.CLOSED} Закрытых`,
        value: stats.closed.toString(),
        inline: true,
      },
    ])
    .setTimestamp();
}

export default {
  buildCalloutEmbed,
  buildResponseEmbed,
  buildClosedCalloutEmbed,
  addResponsesToEmbed,
  buildStatsEmbed,
};
