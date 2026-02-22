import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { ServerModel, CalloutModel, SubdivisionModel, CalloutResponseModel, CalloutMessageModel } from '../../database/models';
import { EMOJI, COLORS, CALLOUT_STATUS } from '../../config/constants';
import { Callout } from '../../types/database.types';
import { buildCalloutEmbed, addResponsesToEmbed } from '../utils/embed-builder';
import { parseDiscordEmoji, getEmojiCdnUrl } from '../utils/subdivision-settings-helper';
import { stripUrls } from '../../utils/validators';
import { logAuditEvent, AuditEventType, HistoryViewedData } from '../utils/audit-logger';

const PAGE_SIZE = 5;
const MSG_EMBEDS_PER_PAGE = 5;
const MSGS_PER_EMBED = 10;
const MSGS_PER_PAGE = MSG_EMBEDS_PER_PAGE * MSGS_PER_EMBED; // 50

const historyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Просмотр истории каллаутов')
    .addIntegerOption((option) =>
      option
        .setName('subdivision_id')
        .setDescription('ID подразделения для фильтрации')
        .setRequired(false)
    )
    .addUserOption((option) =>
      option
        .setName('author')
        .setDescription('Автор каллаутов')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('status')
        .setDescription('Статус каллаутов')
        .setRequired(false)
        .addChoices(
          { name: 'Активные', value: 'active' },
          { name: 'Закрытые', value: 'closed' },
          { name: 'Все', value: 'all' }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('page')
        .setDescription('Номер страницы')
        .setRequired(false)
        .setMinValue(1)
    ) as SlashCommandBuilder,

  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const server = await ServerModel.findByGuildId(interaction.guildId!);
      if (!server) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Сервер не настроен. Используйте /settings для настройки.`,
        });
        return;
      }

      // Проверка доступа: callout_allowed_role_ids, leader_role_ids или администратор
      const member = interaction.guild!.members.cache.get(interaction.user.id)
        ?? await interaction.guild!.members.fetch(interaction.user.id);
      const isAdmin = member.permissions.has('Administrator');
      if (!isAdmin) {
        const memberRoleIds = member.roles.cache.map(r => r.id);
        const allowedRoles = ServerModel.getCalloutAllowedRoleIds(server);
        const leaderRoles = ServerModel.getLeaderRoleIds(server);
        const allAllowed = [...allowedRoles, ...leaderRoles];
        const hasAccess = allAllowed.length === 0 || memberRoleIds.some(id => allAllowed.includes(id));
        if (!hasAccess) {
          await interaction.editReply({
            content: `${EMOJI.ERROR} У вас нет доступа к истории каллаутов.`,
          });
          logAuditEvent(interaction.guild!, AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, {
            userId: interaction.user.id,
            userName: interaction.user.username,
            action: 'open_history',
            thumbnailUrl: interaction.user.displayAvatarURL(),
          }).catch(() => {});
          return;
        }
      }

      const chatInteraction = interaction as ChatInputCommandInteraction;
      const subdivisionId = chatInteraction.options.getInteger('subdivision_id') ?? undefined;
      const authorUser = chatInteraction.options.getUser('author') ?? undefined;
      const status = chatInteraction.options.getString('status') || 'all';
      const page = chatInteraction.options.getInteger('page') || 1;

      const filters = {
        subdivisionId,
        authorId: authorUser?.id,
        status,
      };

      const { embeds, components } = await buildHistoryResponse(server.id, filters, page);

      await interaction.editReply({
        embeds,
        components,
      });

      // Логируем просмотр истории в audit log
      const filterParts: string[] = [];
      if (filters.subdivisionId) filterParts.push(`подразделение: ${filters.subdivisionId}`);
      if (filters.authorId) filterParts.push(`автор: <@${filters.authorId}>`);
      if (filters.status !== 'all') filterParts.push(`статус: ${filters.status}`);
      const auditData: HistoryViewedData = {
        userId: interaction.user.id,
        userName: interaction.user.username,
        filters: filterParts.length > 0 ? filterParts.join(', ') : 'Без фильтров',
      };
      logAuditEvent(interaction.guild!, AuditEventType.HISTORY_VIEWED, auditData).catch(() => {});
    } catch (error) {
      logger.error('Error executing /history command', {
        error: error instanceof Error ? error.message : error,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      await interaction.editReply({
        content: `${EMOJI.ERROR} Произошла ошибка при получении истории каллаутов`,
      });
    }
  },
};

/**
 * Создать filterKey для кнопок пагинации
 */
function encodeFilterKey(filters: { subdivisionId?: number; authorId?: string; status?: string }): string {
  const parts: string[] = [];
  if (filters.subdivisionId != null) parts.push(`s${filters.subdivisionId}`);
  if (filters.authorId != null) parts.push(`a${filters.authorId}`);
  if (filters.status && filters.status !== 'all') parts.push(`st${filters.status}`);
  return parts.join('_') || 'none';
}

/**
 * Распарсить filterKey из кнопки пагинации
 */
export function decodeFilterKey(filterKey: string): { subdivisionId?: number; authorId?: string; status?: string } {
  if (filterKey === 'none') return {};

  const filters: { subdivisionId?: number; authorId?: string; status?: string } = {};
  const parts = filterKey.split('_');

  for (const part of parts) {
    if (part.startsWith('s') && !part.startsWith('st')) {
      filters.subdivisionId = parseInt(part.slice(1), 10);
    } else if (part.startsWith('a')) {
      filters.authorId = part.slice(1);
    } else if (part.startsWith('st')) {
      filters.status = part.slice(2);
    }
  }

  return filters;
}

/**
 * Построить embed и кнопки для страницы истории
 */
export async function buildHistoryResponse(
  serverId: number,
  filters: { subdivisionId?: number; authorId?: string; status?: string },
  page: number
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const { callouts, total } = await CalloutModel.findFiltered(serverId, filters, page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterKey = encodeFilterKey(filters);

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (callouts.length === 0) {
    const empty = new EmbedBuilder()
      .setTitle(`${EMOJI.INFO} История каллаутов`)
      .setColor(COLORS.INFO)
      .setDescription('Каллауты не найдены')
      .setFooter({ text: `Страница ${page}/${totalPages} | Всего: ${total}` });

    const paginationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`history_prev_${page}_${filterKey}`)
        .setLabel('< Назад')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`history_next_${page}_${filterKey}`)
        .setLabel('Вперёд >')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    components.push(paginationRow);

    return { embeds: [empty], components };
  }

  // Batch-загрузка подразделений
  const subdivisionIds = [...new Set(callouts.map((c: Callout) => c.subdivision_id))];
  const subdivisionsMap = await SubdivisionModel.findByIds(subdivisionIds);

  const embeds: EmbedBuilder[] = callouts.map((callout: Callout, index: number) => {
    const isActive = callout.status === CALLOUT_STATUS.ACTIVE;
    const subdivision = subdivisionsMap.get(callout.subdivision_id);
    const thumbnailUrl = getEmojiCdnUrl(parseDiscordEmoji(subdivision?.logo_url ?? null));
    const subdivValue = subdivision?.discord_role_id
      ? `<@&${subdivision.discord_role_id}>`
      : (subdivision?.name || 'Unknown');

    const embed = new EmbedBuilder()
      .setTitle(`Incident Report Message #${callout.id}`)
      .setColor(isActive ? COLORS.ACTIVE : COLORS.CLOSED)
      .setThumbnail(thumbnailUrl)
      .addFields(
        { name: 'Кратко об инциденте', value: callout.brief_description ? stripUrls(callout.brief_description) : 'Не указано', inline: true },
        { name: 'Локация инцидента', value: callout.location ? stripUrls(callout.location) : 'Не указано', inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: 'Отправил запрос', value: `<@${callout.author_id}>`, inline: true },
        { name: 'Запрашиваемые подразделения', value: subdivValue, inline: true },
        { name: 'Статус', value: isActive ? `${EMOJI.ACTIVE} Активен` : `${EMOJI.CLOSED} Закрыт`, inline: true },
      );

    embed.addFields(
      { name: 'Время открытия', value: formatDateTime(callout.created_at), inline: true },
      { name: 'Время закрытия', value: callout.closed_at ? formatDateTime(callout.closed_at) : '—', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    );

    if (callout.closed_at) {
      const durationMs = new Date(callout.closed_at).getTime() - new Date(callout.created_at).getTime();
      const durationMin = Math.floor(durationMs / 60000);
      const durationStr = durationMin < 60
        ? `${durationMin} мин`
        : `${Math.floor(durationMin / 60)} ч ${durationMin % 60} мин`;

      const closedBy = callout.closed_by === 'system' ? 'System' : (callout.closed_by ? `<@${callout.closed_by}>` : 'Unknown');

      embed.addFields(
        { name: 'Длительность', value: durationStr, inline: true },
        { name: 'Закрыл', value: closedBy, inline: true },
        { name: 'Причина закрытия', value: callout.closed_reason ? stripUrls(callout.closed_reason) : 'Не указана', inline: true },
      );
    }

    if (index === callouts.length - 1) {
      embed.setFooter({ text: `Страница ${page}/${totalPages} | Всего: ${total}` });
    }

    return embed;
  });

  // Кнопки "Просмотреть" для каждого каллаута
  const viewRow = new ActionRowBuilder<ButtonBuilder>();
  callouts.forEach((callout: Callout) => {
    viewRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`history_view_${callout.id}_1_${page}_${filterKey}`)
        .setLabel(`#${callout.id}`)
        .setStyle(callout.status === CALLOUT_STATUS.ACTIVE ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  });
  components.push(viewRow);

  // Кнопки пагинации
  const paginationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`history_prev_${page}_${filterKey}`)
      .setLabel('< Назад')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`history_next_${page}_${filterKey}`)
      .setLabel('Вперёд >')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages)
  );
  components.push(paginationRow);

  return { embeds, components };
}

/**
 * Построить полный просмотр каллаута: embed + лог ответов + переписка канала
 */
export async function buildCalloutDetailResponse(
  calloutId: number,
  msgPage: number,
  listPage: number,
  filterKey: string
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const callout = await CalloutModel.findById(calloutId);
  if (!callout) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setDescription(`${EMOJI.ERROR} Каллаут #${calloutId} не найден`);
    return { embeds: [embed], components: [] };
  }

  const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
  if (!subdivision) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setDescription(`${EMOJI.ERROR} Подразделение не найдено`);
    return { embeds: [embed], components: [] };
  }

  // Основной embed каллаута
  const calloutEmbed = buildCalloutEmbed(callout, subdivision);

  // Добавить лог ответов
  const responses = await CalloutResponseModel.findByCalloutId(calloutId);
  if (responses.length > 0) {
    const subdivisionIds = [...new Set([callout.subdivision_id, ...responses.map(r => r.subdivision_id)])];
    const subdivisionsMap = await SubdivisionModel.findByIds(subdivisionIds);
    addResponsesToEmbed(calloutEmbed, responses, subdivisionsMap, callout);
  } else {
    addResponsesToEmbed(calloutEmbed, [], new Map([[callout.subdivision_id, subdivision]]), callout);
  }

  const embeds: EmbedBuilder[] = [calloutEmbed];

  // Загрузить переписку канала (до MSGS_PER_PAGE сообщений за страницу)
  const { messages, total } = await CalloutMessageModel.findByCalloutId(calloutId, msgPage, MSGS_PER_PAGE);
  const totalMsgPages = total > 0 ? Math.max(1, Math.ceil(total / MSGS_PER_PAGE)) : 0;

  if (messages.length > 0) {
    // Разбиваем на группы по MSGS_PER_EMBED, каждая — отдельный embed
    for (let i = 0; i < messages.length; i += MSGS_PER_EMBED) {
      const group = messages.slice(i, i + MSGS_PER_EMBED);
      const lines = group.map(m => {
        const time = formatDateTime(m.created_at);
        const author = m.is_bot ? `🤖 ${m.author_name}` : `**@${m.author_name}**`;
        const content = m.content.length > 200 ? m.content.substring(0, 197) + '...' : m.content;
        return `\`${time}\` ${author}\n${content}`;
      });

      const msgEmbed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setDescription(lines.join('\n\n'));

      if (i === 0) {
        msgEmbed.setTitle(`💬 Переписка инцидента #${calloutId}`);
        msgEmbed.setFooter({ text: `Страница ${msgPage}/${totalMsgPages} · Всего сообщений: ${total}` });
      }

      embeds.push(msgEmbed);
    }
  }

  // Кнопки навигации
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`history_back_${listPage}_${filterKey}`)
      .setLabel('← К списку')
      .setStyle(ButtonStyle.Secondary)
  );

  if (totalMsgPages > 1) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`history_view_${calloutId}_${msgPage - 1}_${listPage}_${filterKey}`)
        .setLabel('< Назад')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(msgPage <= 1),
      new ButtonBuilder()
        .setCustomId(`history_view_${calloutId}_${msgPage + 1}_${listPage}_${filterKey}`)
        .setLabel('Вперёд >')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(msgPage >= totalMsgPages)
    );
  }

  return { embeds, components: [navRow] };
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default historyCommand;
