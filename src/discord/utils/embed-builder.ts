import { EmbedBuilder } from 'discord.js';
import { Callout, Subdivision, CalloutResponse } from '../../types/database.types';
import { COLORS, EMOJI, CALLOUT_STATUS } from '../../config/constants';

/**
 * Утилиты для создания Embed сообщений
 */

/**
 * Создать Embed для каллаута
 */
export function buildCalloutEmbed(callout: Callout, subdivision: Subdivision): EmbedBuilder {
  const isActive = callout.status === CALLOUT_STATUS.ACTIVE;
  const color = isActive ? COLORS.ACTIVE : COLORS.CLOSED;
  const statusEmoji = isActive ? EMOJI.ACTIVE : EMOJI.CLOSED;
  const statusText = isActive ? 'Active' : 'Closed';

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.ALERT} Incident #${callout.id} - ${subdivision.name}`)
    .setColor(color)
    .addFields([
      {
        name: `${EMOJI.INFO} Автор`,
        value: `<@${callout.author_id}>`,
        inline: true,
      },
      {
        name: `${EMOJI.INFO} Подразделение`,
        value: `<@&${subdivision.discord_role_id}>`,
        inline: true,
      },
      {
        name: `${statusEmoji} Статус`,
        value: statusText,
        inline: true,
      },
      {
        name: '📍 Место',
        value: callout.location || 'Не указано',
        inline: false,
      },
      {
        name: `${EMOJI.INFO} Описание инцидента`,
        value: callout.description,
        inline: false,
      },
    ])
    .setFooter({ text: 'SAES Callout System' })
    .setTimestamp(new Date(callout.created_at));

  // Добавить информацию о закрытии, если каллаут закрыт
  if (!isActive && callout.closed_by) {
    embed.addFields([
      {
        name: `${EMOJI.INFO} Закрыл`,
        value: `<@${callout.closed_by}>`,
        inline: true,
      },
    ]);

    if (callout.closed_reason) {
      embed.addFields([
        {
          name: `${EMOJI.INFO} Причина закрытия`,
          value: callout.closed_reason,
          inline: false,
        },
      ]);
    }
  }

  return embed;
}

/**
 * Создать Embed для ответа подразделения
 */
export function buildResponseEmbed(
  response: CalloutResponse,
  subdivision: Subdivision
): EmbedBuilder {
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
        name: 'Ответил (VK)',
        value: response.vk_user_name,
        inline: true,
      },
      {
        name: 'Тип ответа',
        value: getResponseTypeLabel(response.response_type),
        inline: true,
      },
    ])
    .setFooter({ text: 'Ответ из VK' })
    .setTimestamp(new Date(response.created_at));
}

/**
 * Обновить Embed каллаута для закрытого статуса
 */
export function buildClosedCalloutEmbed(
  callout: Callout,
  subdivision: Subdivision
): EmbedBuilder {
  const embed = buildCalloutEmbed(callout, subdivision);

  // Изменить цвет на красный
  embed.setColor(COLORS.CLOSED);

  // Обновить статус
  const statusFieldIndex = embed.data.fields?.findIndex((f) =>
    f.name.includes('Статус')
  );
  if (statusFieldIndex !== undefined && statusFieldIndex >= 0 && embed.data.fields) {
    embed.data.fields[statusFieldIndex].value = 'Closed';
  }

  return embed;
}

/**
 * Добавить поле с ответами в Embed
 */
export function addResponsesToEmbed(
  embed: EmbedBuilder,
  responses: CalloutResponse[],
  subdivisions: Map<number, Subdivision>
): EmbedBuilder {
  if (responses.length === 0) {
    return embed;
  }

  const responseText = responses
    .map((r) => {
      const subdiv = subdivisions.get(r.subdivision_id);
      const subdivName = subdiv?.name || 'Unknown';
      return `• **${subdivName}** - ${r.vk_user_name} (${getResponseTypeLabel(r.response_type)})`;
    })
    .join('\n');

  embed.addFields([
    {
      name: `${EMOJI.SUCCESS} Ответы подразделений (${responses.length})`,
      value: responseText,
      inline: false,
    },
  ]);

  return embed;
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

/**
 * Получить метку для типа ответа
 */
function getResponseTypeLabel(responseType: string): string {
  switch (responseType) {
    case 'acknowledged':
      return 'Принято к сведению';
    case 'on_way':
      return 'В пути';
    case 'arrived':
      return 'Прибыли на место';
    default:
      return responseType;
  }
}

export default {
  buildCalloutEmbed,
  buildResponseEmbed,
  buildClosedCalloutEmbed,
  addResponsesToEmbed,
  buildStatsEmbed,
};
