import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel, CalloutModel } from '../../database/models';
import SubdivisionService from '../../services/subdivision.service';
import { buildSubdivisionEmbed } from '../utils/subdivision-embed-builder';
import { parseDiscordEmoji } from '../utils/subdivision-settings-helper';
import { subdivisionSelections, SELECTION_TTL_MS, createCalloutModal } from './subdivision-select';
import { EMOJI } from '../../config/constants';
import { Subdivision } from '../../types/database.types';
import { safeParseInt } from '../../utils/validators';

/**
 * Получить список подразделений, принимающих каллауты, отсортированных по активности (all-time)
 */
export async function getSortedSubdivisions(serverId: number): Promise<Subdivision[]> {
  const allSubdivisions = await SubdivisionService.getSubdivisionsByServerId(serverId, true);
  const accepting = allSubdivisions.filter((s: Subdivision) => s.is_accepting_callouts && s.discord_role_id);

  const factionsWithRealSubs = new Set(
    accepting.filter((s: Subdivision) => !s.is_default).map((s: Subdivision) => s.faction_id)
  );
  const subdivisions = accepting.filter(
    (s: Subdivision) => !s.is_default || !factionsWithRealSubs.has(s.faction_id)
  );

  if (subdivisions.length === 0) return [];

  const stats = await CalloutModel.getSubdivisionStats(serverId, 1000);
  const statsMap = new Map(stats.map((s: any) => [s.subdivision_id, s.total as number]));

  return [...subdivisions].sort((a: Subdivision, b: Subdivision) => {
    const aCount = (statsMap.get(a.id) as number) ?? 0;
    const bCount = (statsMap.get(b.id) as number) ?? 0;
    return bCount - aCount;
  });
}

/**
 * Построить сообщение browse для подразделений
 */
export function buildBrowseMessage(
  subdivisions: Subdivision[],
  currentId: number
): { embeds: ReturnType<typeof buildSubdivisionEmbed>[]; components: ActionRowBuilder<any>[] } {
  const index = subdivisions.findIndex(s => s.id === currentId);
  const safeIndex = index === -1 ? 0 : index;
  const current = subdivisions[safeIndex];
  const total = subdivisions.length;

  const embed = buildSubdivisionEmbed(current);
  embed.setFooter({
    text: `${safeIndex + 1}/${total} · Используйте выпадающий список для выбора подразделения или просматривайте с помощью кнопок.`,
  });

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`subdivision_browse_req_${current.id}`)
      .setLabel('Запросить')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`subdivision_browse_prev_${current.id}`)
      .setLabel('← Назад')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safeIndex === 0),
    new ButtonBuilder()
      .setCustomId(`subdivision_browse_next_${current.id}`)
      .setLabel('Вперёд →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safeIndex === total - 1),
  );

  // Select menu (лимит Discord — 25 опций)
  const menuSubdivisions = subdivisions.slice(0, 25);
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('subdivision_browse_select')
    .setPlaceholder('Выберите подразделение...')
    .addOptions(
      menuSubdivisions.map(sub => {
        const parsed = sub.logo_url ? parseDiscordEmoji(sub.logo_url) : null;
        const emoji = parsed
          ? (parsed.id
              ? { id: parsed.id, name: parsed.name ?? 'emoji', animated: parsed.animated ?? false }
              : { name: parsed.name ?? '🏢' })
          : { name: '🏢' };
        return {
          label: sub.name.slice(0, 100),
          description: (sub.short_description || sub.description || 'Нет описания').slice(0, 100),
          value: sub.id.toString(),
          emoji,
          default: sub.id === current.id,
        };
      })
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  return { embeds: [embed], components: [navRow, selectRow] };
}

/**
 * Обработчик кнопок ← Назад / Вперёд →
 */
export async function handleBrowsePrevNext(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return;

  await interaction.deferUpdate();

  try {
    const server = await ServerModel.findByGuildId(interaction.guild.id);
    if (!server) return;

    // customId: subdivision_browse_prev_{id} или subdivision_browse_next_{id}
    const parts = interaction.customId.split('_');
    const direction = parts[2]; // prev | next
    const currentId = safeParseInt(parts[3], 10);

    const subdivisions = await getSortedSubdivisions(server.id);
    if (subdivisions.length === 0) return;

    const currentIndex = subdivisions.findIndex(s => s.id === currentId);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;

    const newIndex = direction === 'prev'
      ? Math.max(0, safeIndex - 1)
      : Math.min(subdivisions.length - 1, safeIndex + 1);

    await interaction.editReply(buildBrowseMessage(subdivisions, subdivisions[newIndex].id));
  } catch (error) {
    logger.error('Error in subdivision browse prev/next', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Обработчик кнопки 📋 Запросить — открывает modal для текущего подразделения
 */
export async function handleBrowseRequest(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;

  try {
    // customId: subdivision_browse_req_{id}
    const parts = interaction.customId.split('_');
    const subdivisionId = safeParseInt(parts[3], 10);

    const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
    if (!subdivision) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Подразделение не найдено`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!subdivision.is_accepting_callouts) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Это подразделение сейчас не принимает каллауты`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const stateKey = `${interaction.guildId}:${interaction.user.id}`;
    subdivisionSelections.set(stateKey, {
      subdivisionId,
      expiresAt: Date.now() + SELECTION_TTL_MS,
    });

    await interaction.showModal(createCalloutModal(subdivision));
  } catch (error) {
    logger.error('Error in subdivision browse request', {
      error: error instanceof Error ? error.message : error,
    });
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Не удалось открыть форму`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}

/**
 * Обработчик Select Menu в режиме browse — переключает embed на выбранное подразделение
 */
export async function handleBrowseSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return;

  await interaction.deferUpdate();

  try {
    const server = await ServerModel.findByGuildId(interaction.guild.id);
    if (!server) return;

    const selectedId = safeParseInt(interaction.values[0], 10);
    const subdivisions = await getSortedSubdivisions(server.id);
    if (subdivisions.length === 0) return;

    await interaction.editReply(buildBrowseMessage(subdivisions, selectedId));
  } catch (error) {
    logger.error('Error in subdivision browse select', {
      error: error instanceof Error ? error.message : error,
    });
  }
}
