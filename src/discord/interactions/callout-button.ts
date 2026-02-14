import {
  ButtonInteraction,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import SubdivisionService from '../../services/subdivision.service';
import { EMOJI, COLORS } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик нажатия кнопки "Создать каллаут"
 */
export async function handleCreateCalloutButton(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      ephemeral: true,
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

    // Получить активные подразделения
    const subdivisions = await SubdivisionService.getSubdivisionsByServerId(server.id, true);

    if (subdivisions.length === 0) {
      throw new CalloutError(
        `${EMOJI.ERROR} Нет доступных подразделений. Обратитесь к администратору.`,
        'NO_SUBDIVISIONS',
        400
      );
    }

    logger.info('Creating subdivision select menu', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      subdivisionsCount: subdivisions.length,
    });

    // Создать Embed со списком подразделений
    const subdivisionList = subdivisions
      .map((s) => {
        const prefix = s.is_accepting_callouts ? '🟢' : '⏸️';
        const suffix = s.is_accepting_callouts ? '' : ' (не принимает каллауты)';
        return `${prefix} **${s.name}**${s.description ? ` - ${s.description}` : ''}${suffix}`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('📞 Создание нового каллаута')
      .setDescription(
        'Выберите подразделение из списка ниже:\n\n' + subdivisionList
      )
      .setColor(COLORS.INFO)
      .setFooter({ text: 'Выберите подразделение из меню' })
      .setTimestamp();

    // Создать Select Menu с подразделениями
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('subdivision_select')
      .setPlaceholder('Выберите подразделение...')
      .addOptions(
        subdivisions.map((subdivision) => ({
          label: (subdivision.is_accepting_callouts ? '' : '⏸️ ') + subdivision.name,
          description: subdivision.description || 'Нет описания',
          value: subdivision.id.toString(),
          emoji: subdivision.is_accepting_callouts ? '🏢' : undefined,
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu
    );

    // Отправить ephemeral сообщение
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
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
      ephemeral: true,
    });
  }
}

export default handleCreateCalloutButton;
