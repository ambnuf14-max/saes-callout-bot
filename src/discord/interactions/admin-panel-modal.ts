import { ModalSubmitInteraction, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { DepartmentService } from '../../services/department.service';
import { isAdministrator } from '../utils/permission-checker';
import {
  buildDepartmentsSection,
  buildDepartmentDetailPanel,
} from '../utils/admin-panel-builder';
import { EMOJI } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { getAddDepartmentState, clearAddDepartmentState } from './admin-panel-button';

/**
 * Обработчик модальных окон админ-панели
 */
export async function handleAdminPanelModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isAdministrator(member)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Только администраторы имеют доступ к этой панели`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const server = await ServerModel.findByGuildId(interaction.guild.id);
  if (!server) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Сервер не настроен`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Добавление департамента (шаг 3 — modal с названием и описанием)
    if (customId === 'admin_modal_add_dept') {
      await handleAddDepartment(interaction, server.id);
    }
    // Редактирование департамента
    else if (customId.startsWith('admin_modal_edit_dept_')) {
      const departmentId = parseInt(customId.replace('admin_modal_edit_dept_', ''));
      await handleEditDepartment(interaction, departmentId, server.id);
    }
  } catch (error) {
    logger.error('Error handling admin panel modal', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Произошла ошибка при обработке формы`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Создание департамента из modal
 */
async function handleAddDepartment(
  interaction: ModalSubmitInteraction,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('dept_name').trim();
  const description = interaction.fields.getTextInputValue('dept_description').trim();

  // Получить состояние с ролями
  const state = getAddDepartmentState(interaction.user.id);
  if (!state || !state.generalLeaderRoleId || !state.departmentRoleId) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Сессия добавления департамента истекла. Попробуйте снова.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Создать департамент
  const department = await DepartmentService.createDepartment({
    server_id: serverId,
    name,
    description: description || undefined,
    general_leader_role_id: state.generalLeaderRoleId,
    department_role_id: state.departmentRoleId,
  });

  // Очистить состояние
  clearAddDepartmentState(interaction.user.id);

  logger.info('Department created via admin panel', {
    departmentId: department.id,
    name: department.name,
    serverId,
    userId: interaction.user.id,
  });

  // Показать детальную панель нового департамента
  const panel = buildDepartmentDetailPanel(department);
  await interaction.editReply(panel);
}

/**
 * Редактирование департамента из modal
 */
async function handleEditDepartment(
  interaction: ModalSubmitInteraction,
  departmentId: number,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('dept_name').trim();
  const description = interaction.fields.getTextInputValue('dept_description').trim();

  const department = await DepartmentService.updateDepartment(departmentId, {
    name,
    description: description || undefined,
  });

  if (!department) {
    throw new CalloutError('Департамент не найден', 'DEPARTMENT_NOT_FOUND', 404);
  }

  logger.info('Department updated via admin panel', {
    departmentId,
    name: department.name,
    userId: interaction.user.id,
  });

  const panel = buildDepartmentDetailPanel(department);
  await interaction.editReply(panel);
}
