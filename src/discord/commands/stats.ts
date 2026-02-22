import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { ServerModel, CalloutModel, SubdivisionModel } from '../../database/models';
import { EMOJI, COLORS } from '../../config/constants';
import { parseDiscordEmoji, getEmojiCdnUrl } from '../utils/subdivision-settings-helper';
import { logAuditEvent, AuditEventType, UnauthorizedAccessData } from '../utils/audit-logger';

const PERIODS: Record<string, { label: string; ms: number | null }> = {
  day:   { label: 'За день',      ms: 24 * 60 * 60 * 1000 },
  days3: { label: 'За 3 дня',    ms: 3 * 24 * 60 * 60 * 1000 },
  week:  { label: 'За неделю',   ms: 7 * 24 * 60 * 60 * 1000 },
  all:   { label: 'За всё время', ms: null },
};

const DOW_NAMES = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function fmtDuration(min: number | null): string {
  if (min == null) return '—';
  const m = Math.round(min);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

const statsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Статистика каллаут системы')
    .addStringOption(option =>
      option
        .setName('period')
        .setDescription('Период статистики')
        .setRequired(false)
        .addChoices(
          { name: 'За день',       value: 'day' },
          { name: 'За 3 дня',     value: 'days3' },
          { name: 'За неделю',    value: 'week' },
          { name: 'За всё время',  value: 'all' },
        )
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

      // Проверка доступа — такая же как в /history
      const member = interaction.guild.members.cache.get(interaction.user.id)
        ?? await interaction.guild.members.fetch(interaction.user.id);
      const isAdmin = member.permissions.has('Administrator');
      if (!isAdmin) {
        const memberRoleIds = member.roles.cache.map(r => r.id);
        const allowedRoles = ServerModel.getCalloutAllowedRoleIds(server);
        const leaderRoles = ServerModel.getLeaderRoleIds(server);
        const allAllowed = [...allowedRoles, ...leaderRoles];
        const hasAccess = allAllowed.length === 0 || memberRoleIds.some(id => allAllowed.includes(id));
        if (!hasAccess) {
          await interaction.editReply({
            content: `${EMOJI.ERROR} У вас нет доступа к статистике каллаутов.`,
          });
          logAuditEvent(interaction.guild, AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, {
            userId: interaction.user.id,
            userName: interaction.user.username,
            action: 'open_stats',
            thumbnailUrl: interaction.user.displayAvatarURL(),
          } as UnauthorizedAccessData).catch(() => {});
          return;
        }
      }

      const periodKey = (interaction as ChatInputCommandInteraction).options.getString('period') || 'all';
      const period = PERIODS[periodKey] ?? PERIODS.all;
      const sinceIso = period.ms != null
        ? new Date(Date.now() - period.ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
        : undefined;

      const [periodStats, subdivisionStats, topAuthors, peakTime] = await Promise.all([
        CalloutModel.getPeriodStats(server.id, sinceIso),
        CalloutModel.getSubdivisionStats(server.id, 10, sinceIso),
        CalloutModel.getTopAuthors(server.id, 5, sinceIso),
        CalloutModel.getPeakTime(server.id, sinceIso),
      ]);

      // --- Embed 1: Общая статистика ---
      const peakHourStr = peakTime.peak_hour != null
        ? `${String(peakTime.peak_hour).padStart(2, '0')}:00 – ${String(peakTime.peak_hour + 1).padStart(2, '0')}:00`
        : '—';
      const peakDowStr = peakTime.peak_dow != null ? DOW_NAMES[peakTime.peak_dow] : '—';

      const overviewLines = [
        `📋 **Всего каллаутов:** ${periodStats.total}`,
        `⏱️ **Средняя длительность инцидента:** ${fmtDuration(periodStats.avg_duration_min)}`,
        ``,
        `🕐 **Самый загруженный час:** ${peakHourStr}`,
        `📅 **Самый загруженный день:** ${peakDowStr}`,
      ];

      const overviewEmbed = new EmbedBuilder()
        .setTitle(`📊 Статистика каллаут системы — ${period.label}`)
        .setColor(COLORS.INFO)
        .setDescription(overviewLines.join('\n'))
        .setTimestamp();

      const embeds: EmbedBuilder[] = [overviewEmbed];

      // --- Embed 2: Топ подразделений ---
      if (subdivisionStats.length > 0) {
        const subdivisionIds = subdivisionStats.map(s => s.subdivision_id);
        const subdivisionsMap = await SubdivisionModel.findByIds(subdivisionIds);

        const subLines = subdivisionStats.map((s, i) => {
          const sub = subdivisionsMap.get(s.subdivision_id);
          const name = sub?.discord_role_id
            ? `<@&${sub.discord_role_id}>`
            : (sub?.name || `ID ${s.subdivision_id}`);
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
          return `${medal} ${name}\n> ${s.total} каллаутов · ⏱️ Среднее время инцидента: ${fmtDuration(s.avg_duration_min)}`;
        });

        const thumbnailUrl = (() => {
          const top = subdivisionsMap.get(subdivisionStats[0]?.subdivision_id);
          return getEmojiCdnUrl(parseDiscordEmoji(top?.logo_url ?? null));
        })();

        embeds.push(
          new EmbedBuilder()
            .setTitle('🏆 Топ подразделений по запросам')
            .setColor(COLORS.INFO)
            .setDescription(subLines.join('\n\n'))
            .setThumbnail(thumbnailUrl)
        );
      }

      // --- Embed 3: Топ авторов ---
      if (topAuthors.length > 0) {
        const authorLines = topAuthors.map((a, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
          return `${medal} <@${a.author_id}> — **${a.count}** каллаутов`;
        });

        embeds.push(
          new EmbedBuilder()
            .setTitle('👤 Топ авторов каллаутов')
            .setColor(COLORS.INFO)
            .setDescription(authorLines.join('\n'))
        );
      }

      await interaction.editReply({ embeds });

      logger.info('Stats viewed', { userId: interaction.user.id, guildId: interaction.guild.id, period: periodKey });
    } catch (error) {
      logger.error('Error in /stats command', {
        error: error instanceof Error ? error.message : error,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
      });

      await interaction.editReply({
        content: `${EMOJI.ERROR} Произошла ошибка при получении статистики`,
      });
    }
  },
};

export default statsCommand;
