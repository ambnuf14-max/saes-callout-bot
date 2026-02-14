import {
  ButtonInteraction,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import DepartmentService from '../../services/department.service';
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

    // Получить активные департаменты
    const departments = await DepartmentService.getDepartments(server.id, true);

    if (departments.length === 0) {
      throw new CalloutError(
        `${EMOJI.ERROR} Нет доступных департаментов. Обратитесь к администратору.`,
        'NO_DEPARTMENTS',
        400
      );
    }

    logger.info('Creating department select menu', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      departmentsCount: departments.length,
    });

    // Создать Embed со списком департаментов
    const departmentList = departments
      .map((d) => `**${d.name}**${d.description ? ` - ${d.description}` : ''}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('📞 Создание нового каллаута')
      .setDescription(
        'Выберите департамент из списка ниже:\n\n' + departmentList
      )
      .setColor(COLORS.INFO)
      .setFooter({ text: 'Выберите департамент из меню' })
      .setTimestamp();

    // Создать Select Menu с департаментами
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('department_select')
      .setPlaceholder('Выберите департамент...')
      .addOptions(
        departments.map((dept) => ({
          label: dept.name,
          description: dept.description || 'Нет описания',
          value: dept.id.toString(),
          emoji: '🏢',
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

    logger.info('Department select menu shown', {
      userId: interaction.user.id,
      departmentsCount: departments.length,
    });
  } catch (error) {
    logger.error('Error showing department select menu', {
      error: error instanceof Error ? error.message : error,
      userId: interaction.user.id,
    });

    await interaction.reply({
      content:
        error instanceof CalloutError
          ? error.message
          : `${EMOJI.ERROR} Не удалось открыть меню выбора департамента`,
      ephemeral: true,
    });
  }
}

export default handleCreateCalloutButton;
