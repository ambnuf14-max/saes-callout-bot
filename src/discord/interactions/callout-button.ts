import {
  ButtonInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import SubdivisionService from '../../services/subdivision.service';
import { EMOJI } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { buildSubdivisionEmbeds } from '../utils/subdivision-embed-builder';
import { parseDiscordEmoji } from '../utils/subdivision-settings-helper';

/**
 * Обработчик нажатия кнопки "Создать каллаут"
 */
export async function handleCreateCalloutButton(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Получить сервер из БД
    const server = await ServerModel.findByGuildId(interaction.guild.id);
    if (!server) {
      throw new CalloutError(
        `${EMOJI.ERROR} Сервер не настроен. Обратитесь к администратору.`,
        'SERVER_NOT_CONFIGURED',
        400
      );
    }

    // Получить активные подразделения, принимающие каллауты
    const allSubdivisions = await SubdivisionService.getSubdivisionsByServerId(server.id, true);
    const acceptingSubdivisions = allSubdivisions.filter(sub => sub.is_accepting_callouts && sub.discord_role_id);

    // Если у фракции есть не-дефолтные подразделения — дефолтное не показываем
    const factionsWithRealSubdivisions = new Set(
      acceptingSubdivisions.filter(sub => !sub.is_default).map(sub => sub.faction_id)
    );
    const subdivisions = acceptingSubdivisions.filter(
      sub => !sub.is_default || !factionsWithRealSubdivisions.has(sub.faction_id)
    );

    if (subdivisions.length === 0) {
      throw new CalloutError(
        `${EMOJI.ERROR} Нет доступных подразделений. Обратитесь к администратору.`,
        'NO_SUBDIVISIONS',
        400
      );
    }

    // Показать меню выбора подразделения
    logger.info('Creating subdivision select menu', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      subdivisionsCount: subdivisions.length,
    });

    // Создать массив embeds для каждого подразделения (максимум 10)
    const embeds = buildSubdivisionEmbeds(subdivisions);

    // Создать Select Menu с подразделениями
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('subdivision_select')
      .setPlaceholder('Выберите подразделение...')
      .addOptions(
        subdivisions.map((subdivision: any) => {
          const parsed = subdivision.logo_url ? parseDiscordEmoji(subdivision.logo_url) : null;
          const emoji = subdivision.is_accepting_callouts
            ? (parsed
                ? (parsed.id ? { id: parsed.id, name: parsed.name, animated: parsed.animated ?? false } : parsed.name)
                : '🏢')
            : undefined;
          return {
            label: (subdivision.is_accepting_callouts ? '' : '⏸️ ') + subdivision.name,
            description: subdivision.short_description || subdivision.description || 'Нет описания',
            value: subdivision.id.toString(),
            emoji,
          };
        })
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu
    );

    // Отправить ephemeral сообщение с несколькими embeds
    await interaction.reply({
      embeds: embeds,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    logger.info('Subdivision select menu shown', {
      userId: interaction.user.id,
      subdivisionsCount: subdivisions.length,
    });
  } catch (error) {
    logger.error('Error showing subdivision select menu', {
      error: error instanceof Error ? error.message : error,
      userId: interaction.user.id,
    });

    await interaction.reply({
      content:
        error instanceof CalloutError
          ? error.message
          : `${EMOJI.ERROR} Не удалось открыть меню выбора подразделения`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

export default handleCreateCalloutButton;
