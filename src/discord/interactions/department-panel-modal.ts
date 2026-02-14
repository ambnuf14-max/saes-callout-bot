import { ModalSubmitInteraction } from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { getLeaderDepartment } from '../utils/department-permission-checker';
import { buildSubdivisionsList, buildSubdivisionDetailPanel } from '../utils/department-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик модальных окон лидерской панели
 */
export async function handleDepartmentPanelModal(interaction: ModalSubmitInteraction) {
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
    // Добавление подразделения
    if (customId === 'department_modal_add_subdivision') {
      await handleAddSubdivision(interaction, department.id, department.server_id);
    }
    // Редактирование подразделения
    else if (customId.startsWith('department_modal_edit_subdivision_')) {
      const subdivisionId = parseInt(customId.split('_')[4]);
      await handleEditSubdivision(interaction, subdivisionId, department.id);
    }
  } catch (error) {
    logger.error('Error handling department panel modal', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content =
      error instanceof CalloutError
        ? error.message
        : `${EMOJI.ERROR} Произошла ошибка при обработке формы`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}

/**
 * Обработка добавления подразделения
 */
async function handleAddSubdivision(
  interaction: ModalSubmitInteraction,
  departmentId: number,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('subdivision_name').trim();
  const description = interaction.fields.getTextInputValue('subdivision_description').trim();

  // Создать подразделение
  const subdivision = await SubdivisionService.createSubdivision({
    department_id: departmentId,
    server_id: serverId,
    name: name,
    description: description || undefined,
  });

  logger.info('Subdivision created via panel', {
    subdivisionId: subdivision.id,
    name: subdivision.name,
    departmentId,
    userId: interaction.user.id,
  });

  // Показать детальную панель нового подразделения
  const panel = buildSubdivisionDetailPanel(subdivision);

  await interaction.editReply(panel);
}

/**
 * Обработка редактирования подразделения
 */
async function handleEditSubdivision(
  interaction: ModalSubmitInteraction,
  subdivisionId: number,
  departmentId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('subdivision_name').trim();
  const description = interaction.fields.getTextInputValue('subdivision_description').trim();

  // Обновить подразделение
  const subdivision = await SubdivisionService.updateSubdivision(subdivisionId, {
    name: name,
    description: description || undefined,
  });

  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  logger.info('Subdivision updated via panel', {
    subdivisionId,
    name: subdivision.name,
    userId: interaction.user.id,
  });

  // Показать обновленную панель подразделения
  const panel = buildSubdivisionDetailPanel(subdivision);

  await interaction.editReply(panel);
}

export default handleDepartmentPanelModal;
