import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import DepartmentService from '../../services/department.service';
import { EMOJI, MESSAGES, LIMITS } from '../../config/constants';
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

    logger.info('Creating callout modal', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      departmentsCount: departments.length,
    });

    // Создать модальное окно
    const modal = new ModalBuilder()
      .setCustomId('callout_modal')
      .setTitle(MESSAGES.CALLOUT.MODAL_TITLE);

    // Text Input для описания
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description_input')
      .setLabel(MESSAGES.CALLOUT.MODAL_DESC_LABEL)
      .setPlaceholder(MESSAGES.CALLOUT.MODAL_DESC_PLACEHOLDER)
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(LIMITS.DESCRIPTION_MIN)
      .setMaxLength(LIMITS.DESCRIPTION_MAX)
      .setRequired(true);

    const departmentInput = new TextInputBuilder()
      .setCustomId('department_input')
      .setLabel('Департамент (введите название)')
      .setPlaceholder(departments.map((d) => d.name).join(', '))
      .setStyle(TextInputStyle.Short)
      .setMinLength(2)
      .setMaxLength(10)
      .setRequired(true);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(
      departmentInput
    );
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(
      descriptionInput
    );

    modal.addComponents(row1, row2);

    // Показать модальное окно
    await interaction.showModal(modal);

    logger.info('Callout modal shown', {
      userId: interaction.user.id,
    });
  } catch (error) {
    logger.error('Error showing callout modal', {
      error: error instanceof Error ? error.message : error,
      userId: interaction.user.id,
    });

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content:
          error instanceof CalloutError
            ? error.message
            : `${EMOJI.ERROR} Не удалось открыть форму создания каллаута`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content:
          error instanceof CalloutError
            ? error.message
            : `${EMOJI.ERROR} Не удалось открыть форму создания каллаута`,
        ephemeral: true,
      });
    }
  }
}

export default handleCreateCalloutButton;
