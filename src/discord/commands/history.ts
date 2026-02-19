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
import { ServerModel, CalloutModel, SubdivisionModel } from '../../database/models';
import { EMOJI, COLORS, CALLOUT_STATUS } from '../../config/constants';
import { Callout } from '../../types/database.types';

const PAGE_SIZE = 5;

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

      const { embed, components } = await buildHistoryResponse(server.id, filters, page);

      await interaction.editReply({
        embeds: [embed],
        components,
      });
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
): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const { callouts, total } = await CalloutModel.findFiltered(serverId, filters, page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterKey = encodeFilterKey(filters);

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.INFO} История каллаутов`)
    .setColor(COLORS.INFO)
    .setFooter({ text: `Страница ${page}/${totalPages} | Всего: ${total}` })
    .setTimestamp();

  if (callouts.length === 0) {
    embed.setDescription('Каллауты не найдены');
  } else {
    const blocks = await Promise.all(
      callouts.map(async (callout: Callout) => {
        const statusEmoji = callout.status === CALLOUT_STATUS.ACTIVE ? EMOJI.ACTIVE : EMOJI.CLOSED;
        const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
        const subdivName = subdivision?.name || 'Unknown';

        let block = `${statusEmoji} **#${callout.id}** — ${subdivName}\n`;
        block += `👤 <@${callout.author_id}>`;
        if (callout.location) {
          block += ` | 📍 ${callout.location}`;
        }
        block += '\n';

        const desc =
          callout.description.length > 100
            ? callout.description.substring(0, 97) + '...'
            : callout.description;
        block += `💬 ${desc}\n`;

        block += `⏰ Открыт: ${formatDateTime(callout.created_at)}`;

        if (callout.closed_at) {
          block += `\n🔒 Закрыт: ${formatDateTime(callout.closed_at)}`;
          if (callout.closed_by) {
            const closedByValue =
              callout.closed_by === 'system' ? 'System' : `<@${callout.closed_by}>`;
            block += ` · Закрыл: ${closedByValue}`;
          }
          if (callout.closed_reason) {
            block += `\n💭 ${callout.closed_reason}`;
          }
        }

        return block;
      })
    );

    embed.setDescription(blocks.join('\n\n──────────────────\n\n'));
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (totalPages > 1) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
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

    components.push(row);
  }

  return { embed, components };
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
