import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { VerificationService } from '../../services/verification.service';
import { getLeaderDepartment } from '../utils/department-permission-checker';
import {
  buildMainPanel,
  buildSubdivisionsList,
  buildSubdivisionDetailPanel,
  buildVerificationInstructions,
  buildDeleteConfirmation,
} from '../utils/department-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик кнопок лидерской панели
 */
export async function handleDepartmentPanelButton(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);

  // Получить департамент лидера
  const department = await getLeaderDepartment(member);
  if (!department) {
    await interaction.reply({
      content: MESSAGES.DEPARTMENT.NO_DEPARTMENT,
      ephemeral: true,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Просмотр списка подразделений
    if (customId === 'department_view_subdivisions') {
      await handleViewSubdivisions(interaction, department.id);
    }
    // Добавление подразделения (показать modal)
    else if (customId === 'department_add_subdivision') {
      await showAddSubdivisionModal(interaction);
    }
    // Возврат к главной панели
    else if (customId === 'department_back_main') {
      await handleBackToMain(interaction, department.id);
    }
    // Возврат к списку подразделений
    else if (customId === 'department_back_list') {
      await handleViewSubdivisions(interaction, department.id);
    }
    // Изменение подразделения
    else if (customId.startsWith('department_edit_sub_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await showEditSubdivisionModal(interaction, subdivisionId);
    }
    // Привязка VK беседы
    else if (customId.startsWith('department_link_vk_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleLinkVk(interaction, subdivisionId);
    }
    // Переключение приема каллаутов
    else if (customId.startsWith('department_toggle_callouts_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleToggleCallouts(interaction, subdivisionId);
    }
    // Удаление подразделения (показать подтверждение)
    else if (customId.startsWith('department_delete_sub_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await showDeleteConfirmation(interaction, subdivisionId);
    }
    // Подтверждение удаления
    else if (customId.startsWith('department_confirm_delete_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleDeleteSubdivision(interaction, subdivisionId, department.id);
    }
    // Отмена удаления
    else if (customId === 'department_cancel_delete') {
      await handleViewSubdivisions(interaction, department.id);
    }
    // Возврат к подразделению из верификации
    else if (customId === 'department_back_subdivision') {
      // Получить subdivision_id из сообщения (предполагаем что оно сохранено)
      await handleViewSubdivisions(interaction, department.id);
    }
  } catch (error) {
    logger.error('Error handling department panel button', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content =
      error instanceof CalloutError
        ? error.message
        : `${EMOJI.ERROR} Произошла ошибка при выполнении действия`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}

/**
 * Показать список подразделений
 */
async function handleViewSubdivisions(interaction: ButtonInteraction, departmentId: number) {
  await interaction.deferUpdate();

  const subdivisions = await SubdivisionService.getSubdivisionsByDepartmentId(departmentId);

  // Получить департамент
  const { DepartmentModel } = await import('../../database/models');
  const department = await DepartmentModel.findById(departmentId);
  if (!department) {
    throw new CalloutError('Департамент не найден', 'DEPARTMENT_NOT_FOUND', 404);
  }

  const panel = buildSubdivisionsList(department, subdivisions);

  await interaction.editReply(panel);
}

/**
 * Возврат к главной панели
 */
async function handleBackToMain(interaction: ButtonInteraction, departmentId: number) {
  await interaction.deferUpdate();

  const { DepartmentModel } = await import('../../database/models');
  const department = await DepartmentModel.findById(departmentId);
  if (!department) {
    throw new CalloutError('Департамент не найден', 'DEPARTMENT_NOT_FOUND', 404);
  }

  const subdivisions = await SubdivisionService.getSubdivisionsByDepartmentId(departmentId);
  const activeCount = subdivisions.filter((sub) => sub.is_active).length;

  const panel = buildMainPanel(department, subdivisions.length, activeCount);

  await interaction.editReply(panel);
}

/**
 * Показать modal для добавления подразделения
 */
async function showAddSubdivisionModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId('department_modal_add_subdivision')
    .setTitle('Добавить подразделение');

  const nameInput = new TextInputBuilder()
    .setCustomId('subdivision_name')
    .setLabel('Название подразделения')
    .setPlaceholder('Например: Patrol Division')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(50);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('subdivision_description')
    .setLabel('Описание (опционально)')
    .setPlaceholder('Краткое описание подразделения')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(200);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

/**
 * Показать modal для редактирования подразделения
 */
async function showEditSubdivisionModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  const modal = new ModalBuilder()
    .setCustomId(`department_modal_edit_subdivision_${subdivisionId}`)
    .setTitle(`Изменить: ${subdivision.name}`);

  const nameInput = new TextInputBuilder()
    .setCustomId('subdivision_name')
    .setLabel('Название подразделения')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(50)
    .setValue(subdivision.name);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('subdivision_description')
    .setLabel('Описание')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(200)
    .setValue(subdivision.description || '');

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

/**
 * Обработка привязки VK беседы
 */
async function handleLinkVk(interaction: ButtonInteraction, subdivisionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  // Генерировать токен верификации
  const token = await VerificationService.generateVerificationToken({
    server_id: subdivision.server_id,
    subdivision_id: subdivisionId,
    created_by: interaction.user.id,
  });

  // Получить инструкции
  const instructions = await VerificationService.generateInstructions(token.id);

  // Показать инструкции
  const panel = buildVerificationInstructions(instructions);

  await interaction.editReply(panel);

  logger.info('VK verification token generated via panel', {
    tokenId: token.id,
    subdivisionId,
    userId: interaction.user.id,
  });
}

/**
 * Переключение приема каллаутов
 */
async function handleToggleCallouts(interaction: ButtonInteraction, subdivisionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  // Переключить флаг
  const newStatus = !subdivision.is_accepting_callouts;
  await SubdivisionService.toggleCallouts(subdivisionId, newStatus);

  // Обновить панель подразделения
  const updatedSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!updatedSubdivision) {
    throw new Error('Failed to retrieve updated subdivision');
  }

  const panel = buildSubdivisionDetailPanel(updatedSubdivision);

  await interaction.editReply(panel);

  logger.info('Subdivision callouts toggled via panel', {
    subdivisionId,
    newStatus,
    userId: interaction.user.id,
  });
}

/**
 * Показать подтверждение удаления
 */
async function showDeleteConfirmation(interaction: ButtonInteraction, subdivisionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  const panel = buildDeleteConfirmation(subdivision);

  await interaction.editReply(panel);
}

/**
 * Удаление подразделения
 */
async function handleDeleteSubdivision(
  interaction: ButtonInteraction,
  subdivisionId: number,
  departmentId: number
) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  await SubdivisionService.deleteSubdivision(subdivisionId);

  // Вернуться к списку подразделений
  await handleViewSubdivisions(interaction, departmentId);

  logger.info('Subdivision deleted via panel', {
    subdivisionId,
    name: subdivision.name,
    userId: interaction.user.id,
  });
}

export default handleDepartmentPanelButton;
