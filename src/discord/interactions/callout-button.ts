import {
  ButtonInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import SubdivisionService from '../../services/subdivision.service';
import { EMOJI, LIMITS, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { buildSubdivisionEmbeds } from '../utils/subdivision-embed-builder';

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
    const subdivisions = allSubdivisions.filter(sub => sub.is_accepting_callouts);

    if (subdivisions.length === 0) {
      throw new CalloutError(
        `${EMOJI.ERROR} Нет доступных подразделений. Обратитесь к администратору.`,
        'NO_SUBDIVISIONS',
        400
      );
    }

    // Если активное подразделение только одно - сразу показать модалку
    if (subdivisions.length === 1) {
      const subdivision = subdivisions[0];

      logger.info('Only one active subdivision, showing modal directly', {
        userId: interaction.user.id,
        subdivisionId: subdivision.id,
        subdivisionName: subdivision.name,
      });

      // Сохранить выбор в модуле subdivision-select
      const { subdivisionSelections, SELECTION_TTL_MS } = await import('./subdivision-select');
      subdivisionSelections.set(interaction.user.id, {
        subdivisionId: subdivision.id,
        expiresAt: Date.now() + SELECTION_TTL_MS,
      });

      // Создать модальное окно
      const modal = new ModalBuilder()
        .setCustomId('callout_modal')
        .setTitle('Создание каллаута');

      const locationInput = new TextInputBuilder()
        .setCustomId('location_input')
        .setLabel('Место инцидента')
        .setPlaceholder('Например: Grove Street, перекресток Main St.')
        .setStyle(TextInputStyle.Short)
        .setMinLength(LIMITS.LOCATION_MIN)
        .setMaxLength(LIMITS.LOCATION_MAX)
        .setRequired(true);

      const descriptionInput = new TextInputBuilder()
        .setCustomId('description_input')
        .setLabel('Подробности инцидента')
        .setPlaceholder('Опишите ситуацию подробно...')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(LIMITS.DESCRIPTION_MIN)
        .setMaxLength(LIMITS.DESCRIPTION_MAX)
        .setRequired(true);

      const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput);
      const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);

      modal.addComponents(row1, row2);

      await interaction.showModal(modal);

      logger.info('Callout modal shown directly (single subdivision)', {
        userId: interaction.user.id,
        subdivisionId: subdivision.id,
      });

      return;
    }

    // Несколько подразделений - показать меню выбора
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
        subdivisions.map((subdivision: any) => ({
          label: (subdivision.is_accepting_callouts ? '' : '⏸️ ') + subdivision.name,
          description: subdivision.description || 'Нет описания',
          value: subdivision.id.toString(),
          emoji: subdivision.is_accepting_callouts ? '🏢' : undefined,
        }))
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
