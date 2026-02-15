import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  RoleSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { COLORS } from '../../config/constants';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { DepartmentService } from '../../services/department.service';
import { isAdministrator } from '../utils/permission-checker';
import {
  buildAdminMainPanel,
  buildSetupSection,
  buildLeaderRolesSection,
  buildCalloutRolesSection,
  buildAuditLogSection,
  buildDepartmentsSection,
  buildDepartmentDetailPanel,
  buildDepartmentDeleteConfirmation,
  buildInfoSection,
} from '../utils/admin-panel-builder';
import { EMOJI } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import {
  logAuditEvent,
  AuditEventType,
  LeaderRoleAddedData,
  LeaderRoleRemovedData,
  AuditLogChannelSetData,
} from '../utils/audit-logger';

// Состояние для добавления департамента (3-4 шага)
interface AddDepartmentState {
  generalLeaderRoleId?: string;
  departmentRoleId?: string;
  useSubdivisions?: boolean;
  userId: string;
  createdAt: number;
}

const addDepartmentStates = new Map<string, AddDepartmentState>();
const STATE_TTL = 5 * 60 * 1000; // 5 минут

// Периодическая очистка
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of addDepartmentStates.entries()) {
    if (now - state.createdAt > STATE_TTL) {
      addDepartmentStates.delete(key);
    }
  }
}, 60_000);

/**
 * Проверить админ-права и получить сервер
 */
async function getAdminContext(interaction: ButtonInteraction | StringSelectMenuInteraction | RoleSelectMenuInteraction | ChannelSelectMenuInteraction) {
  if (!interaction.guild) return null;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isAdministrator(member)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Только администраторы имеют доступ к этой панели`,
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }

  const server = await ServerModel.findByGuildId(interaction.guild.id);
  if (!server) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Сервер не настроен`,
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }

  return { member, server };
}

/**
 * Обработчик кнопок админ-панели
 */
export async function handleAdminPanelButton(interaction: ButtonInteraction) {
  const ctx = await getAdminContext(interaction);
  if (!ctx) return;

  const { server } = ctx;
  const customId = interaction.customId;

  try {
    if (customId === 'admin_back') {
      await interaction.deferUpdate();
      const panel = await buildAdminMainPanel(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_setup') {
      await interaction.deferUpdate();
      const panel = buildSetupSection(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_leader_roles') {
      await interaction.deferUpdate();
      const freshServer = await ServerModel.findById(server.id);
      const panel = buildLeaderRolesSection(freshServer || server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_callout_roles') {
      await interaction.deferUpdate();
      const freshServer = await ServerModel.findById(server.id);
      const panel = buildCalloutRolesSection(freshServer || server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_audit_log') {
      await interaction.deferUpdate();
      const freshServer = await ServerModel.findById(server.id);
      const panel = buildAuditLogSection(freshServer || server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_departments') {
      await interaction.deferUpdate();
      const panel = await buildDepartmentsSection(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_info') {
      await interaction.deferUpdate();
      const panel = await buildInfoSection(server);
      await interaction.editReply(panel);
    }

    // Добавление департамента — шаг 1: выбор общей лидерской роли
    else if (customId === 'admin_add_department') {
      // Инициировать состояние
      addDepartmentStates.set(interaction.user.id, {
        userId: interaction.user.id,
        createdAt: Date.now(),
      });
      await interaction.deferUpdate();

      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle('➕ Добавление департамента — Шаг 1/3')
        .setDescription('Выберите **общую лидерскую роль** (например: State Department Leader)')
        .setTimestamp();

      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('admin_dept_step1_role')
        .setPlaceholder('Выберите общую лидерскую роль');

      const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('admin_departments')
          .setLabel('Отмена')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row, backRow] });
    }

    // Редактирование департамента (показать modal)
    else if (customId.startsWith('admin_edit_department_')) {
      const departmentId = parseInt(customId.replace('admin_edit_department_', ''));
      const department = await DepartmentService.getDepartmentById(departmentId);

      if (!department) {
        await interaction.reply({
          content: `${EMOJI.ERROR} Департамент не найден`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`admin_modal_edit_dept_${departmentId}`)
        .setTitle(`Изменить: ${department.name}`);

      const nameInput = new TextInputBuilder()
        .setCustomId('dept_name')
        .setLabel('Название департамента')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50)
        .setValue(department.name);

      const descInput = new TextInputBuilder()
        .setCustomId('dept_description')
        .setLabel('Описание (опционально)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200)
        .setValue(department.description || '');

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      );

      await interaction.showModal(modal);
    }

    // Переключение разрешения на создание подразделений
    else if (customId.startsWith('admin_toggle_allow_create_')) {
      await interaction.deferUpdate();
      const departmentId = parseInt(customId.replace('admin_toggle_allow_create_', ''));
      const department = await DepartmentService.getDepartmentById(departmentId);

      if (!department) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Департамент не найден`,
          embeds: [],
          components: [],
        });
        return;
      }

      // Переключить allow_create_subdivisions
      await DepartmentService.updateDepartment(departmentId, {
        allow_create_subdivisions: !department.allow_create_subdivisions,
      });

      const updated = await DepartmentService.getDepartmentById(departmentId);
      if (!updated) {
        throw new Error('Failed to retrieve updated department');
      }

      const panel = buildDepartmentDetailPanel(updated);
      await interaction.editReply(panel);
    }

    // Удаление департамента — показать подтверждение
    else if (customId.startsWith('admin_delete_department_')) {
      await interaction.deferUpdate();
      const departmentId = parseInt(customId.replace('admin_delete_department_', ''));
      const department = await DepartmentService.getDepartmentById(departmentId);

      if (!department) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Департамент не найден`,
          embeds: [],
          components: [],
        });
        return;
      }

      const panel = buildDepartmentDeleteConfirmation(department);
      await interaction.editReply(panel);
    }

    // Подтверждение удаления департамента
    else if (customId.startsWith('admin_confirm_delete_dept_')) {
      await interaction.deferUpdate();
      const departmentId = parseInt(customId.replace('admin_confirm_delete_dept_', ''));
      const department = await DepartmentService.getDepartmentById(departmentId);

      if (!department) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Департамент не найден`,
          embeds: [],
          components: [],
        });
        return;
      }

      await DepartmentService.deleteDepartment(departmentId);

      logger.info('Department deleted via admin panel', {
        departmentId,
        name: department.name,
        userId: interaction.user.id,
      });

      // Вернуться к списку
      const panel = await buildDepartmentsSection(server);
      await interaction.editReply(panel);
    }

  } catch (error) {
    logger.error('Error handling admin panel button', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Произошла ошибка`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Обработчик RoleSelectMenu для админ-панели
 */
export async function handleAdminRoleSelect(interaction: RoleSelectMenuInteraction) {
  const ctx = await getAdminContext(interaction);
  if (!ctx) return;

  const { server } = ctx;
  const customId = interaction.customId;

  try {
    // Добавление лидерской роли
    if (customId === 'admin_add_leader_role') {
      await interaction.deferUpdate();
      const roleId = interaction.values[0];

      const freshServer = await ServerModel.findById(server.id);
      if (!freshServer) return;

      const leaderRoleIds = ServerModel.getLeaderRoleIds(freshServer);

      if (leaderRoleIds.includes(roleId)) {
        const panel = buildLeaderRolesSection(freshServer);
        await interaction.editReply(panel);
        return;
      }

      leaderRoleIds.push(roleId);
      await ServerModel.update(server.id, { leader_role_ids: leaderRoleIds });

      if (interaction.guild) {
        const auditData: LeaderRoleAddedData = {
          userId: interaction.user.id,
          userName: interaction.user.tag,
          roleId,
        };
        await logAuditEvent(interaction.guild, AuditEventType.LEADER_ROLE_ADDED, auditData);
      }

      logger.info('Leader role added via admin panel', {
        serverId: server.id,
        roleId,
        userId: interaction.user.id,
      });

      const updatedServer = await ServerModel.findById(server.id);
      const panel = buildLeaderRolesSection(updatedServer || freshServer);
      await interaction.editReply(panel);
    }

    // Добавление роли каллаутов
    else if (customId === 'admin_add_callout_role') {
      await interaction.deferUpdate();
      const roleId = interaction.values[0];

      const freshServer = await ServerModel.findById(server.id);
      if (!freshServer) return;

      const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(freshServer);

      if (calloutRoleIds.includes(roleId)) {
        const panel = buildCalloutRolesSection(freshServer);
        await interaction.editReply(panel);
        return;
      }

      calloutRoleIds.push(roleId);
      await ServerModel.update(server.id, { callout_allowed_role_ids: calloutRoleIds });

      logger.info('Callout role added via admin panel', {
        serverId: server.id,
        roleId,
        userId: interaction.user.id,
      });

      const updatedServer = await ServerModel.findById(server.id);
      const panel = buildCalloutRolesSection(updatedServer || freshServer);
      await interaction.editReply(panel);
    }

    // Шаг 1 добавления департамента — выбрана общая лидерская роль
    else if (customId === 'admin_dept_step1_role') {
      await interaction.deferUpdate();
      const roleId = interaction.values[0];

      const state = addDepartmentStates.get(interaction.user.id);
      if (!state) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Сессия добавления истекла. Попробуйте снова.`,
          embeds: [],
          components: [],
        });
        return;
      }

      state.generalLeaderRoleId = roleId;

      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle('➕ Добавление департамента — Шаг 2/3')
        .setDescription(`Общая лидерская роль: <@&${roleId}>\n\nТеперь выберите **роль фракции** (например: LSPD)`)
        .setTimestamp();

      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('admin_dept_step2_role')
        .setPlaceholder('Выберите роль фракции');

      const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('admin_departments')
          .setLabel('Отмена')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row, backRow] });
    }

    // Шаг 2 добавления департамента — выбрана роль фракции → показать modal
    else if (customId === 'admin_dept_step2_role') {
      const roleId = interaction.values[0];

      const state = addDepartmentStates.get(interaction.user.id);
      if (!state || !state.generalLeaderRoleId) {
        await interaction.reply({
          content: `${EMOJI.ERROR} Сессия добавления истекла. Попробуйте снова.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      state.departmentRoleId = roleId;

      // Показать modal с полем выбора режима
      const modal = new ModalBuilder()
        .setCustomId('admin_modal_add_dept')
        .setTitle('Добавление департамента — Шаг 3/3');

      const nameInput = new TextInputBuilder()
        .setCustomId('dept_name')
        .setLabel('Название департамента')
        .setPlaceholder('Например: LSPD')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50);

      const descInput = new TextInputBuilder()
        .setCustomId('dept_description')
        .setLabel('Описание (опционально)')
        .setPlaceholder('Краткое описание департамента')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);

      const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
      const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descInput);

      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

  } catch (error) {
    logger.error('Error handling admin role select', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Произошла ошибка`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Обработчик ChannelSelectMenu для админ-панели (audit log)
 */
export async function handleAdminChannelSelect(interaction: ChannelSelectMenuInteraction) {
  const ctx = await getAdminContext(interaction);
  if (!ctx) return;

  const { server } = ctx;
  const customId = interaction.customId;

  try {
    if (customId === 'admin_set_audit_channel') {
      await interaction.deferUpdate();
      const channelId = interaction.values[0];

      await ServerModel.update(server.id, { audit_log_channel_id: channelId });

      if (interaction.guild) {
        const auditData: AuditLogChannelSetData = {
          userId: interaction.user.id,
          userName: interaction.user.tag,
          channelId,
        };
        await logAuditEvent(interaction.guild, AuditEventType.AUDIT_LOG_CHANNEL_SET, auditData);
      }

      logger.info('Audit log channel set via admin panel', {
        serverId: server.id,
        channelId,
        userId: interaction.user.id,
      });

      const updatedServer = await ServerModel.findById(server.id);
      const panel = buildAuditLogSection(updatedServer || server);
      await interaction.editReply(panel);
    }
  } catch (error) {
    logger.error('Error handling admin channel select', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Произошла ошибка`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Обработчик StringSelectMenu для админ-панели
 */
export async function handleAdminStringSelect(interaction: StringSelectMenuInteraction) {
  const ctx = await getAdminContext(interaction);
  if (!ctx) return;

  const { server } = ctx;
  const customId = interaction.customId;

  try {
    // Выбор департамента для просмотра
    if (customId === 'admin_select_department') {
      await interaction.deferUpdate();
      const departmentId = parseInt(interaction.values[0]);
      const department = await DepartmentService.getDepartmentById(departmentId);

      if (!department) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Департамент не найден`,
          embeds: [],
          components: [],
        });
        return;
      }

      const panel = buildDepartmentDetailPanel(department);
      await interaction.editReply(panel);
    }

    // Удаление лидерской роли
    else if (customId === 'admin_remove_leader_role') {
      await interaction.deferUpdate();
      const roleId = interaction.values[0];

      const freshServer = await ServerModel.findById(server.id);
      if (!freshServer) return;

      const leaderRoleIds = ServerModel.getLeaderRoleIds(freshServer);
      const updatedRoleIds = leaderRoleIds.filter((id) => id !== roleId);

      await ServerModel.update(server.id, { leader_role_ids: updatedRoleIds });

      if (interaction.guild) {
        const auditData: LeaderRoleRemovedData = {
          userId: interaction.user.id,
          userName: interaction.user.tag,
          roleId,
        };
        await logAuditEvent(interaction.guild, AuditEventType.LEADER_ROLE_REMOVED, auditData);
      }

      logger.info('Leader role removed via admin panel', {
        serverId: server.id,
        roleId,
        userId: interaction.user.id,
      });

      const updatedServer = await ServerModel.findById(server.id);
      const panel = buildLeaderRolesSection(updatedServer || freshServer);
      await interaction.editReply(panel);
    }

    // Удаление роли каллаутов
    else if (customId === 'admin_remove_callout_role') {
      await interaction.deferUpdate();
      const roleId = interaction.values[0];

      const freshServer = await ServerModel.findById(server.id);
      if (!freshServer) return;

      const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(freshServer);
      const updatedRoleIds = calloutRoleIds.filter((id) => id !== roleId);

      await ServerModel.update(server.id, { callout_allowed_role_ids: updatedRoleIds });

      logger.info('Callout role removed via admin panel', {
        serverId: server.id,
        roleId,
        userId: interaction.user.id,
      });

      const updatedServer = await ServerModel.findById(server.id);
      const panel = buildCalloutRolesSection(updatedServer || freshServer);
      await interaction.editReply(panel);
    }

  } catch (error) {
    logger.error('Error handling admin string select', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Произошла ошибка`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Получить состояние добавления департамента (для modal)
 */
export function getAddDepartmentState(userId: string): AddDepartmentState | undefined {
  const state = addDepartmentStates.get(userId);
  if (state && Date.now() - state.createdAt > STATE_TTL) {
    addDepartmentStates.delete(userId);
    return undefined;
  }
  return state;
}

/**
 * Удалить состояние добавления департамента
 */
export function clearAddDepartmentState(userId: string): void {
  addDepartmentStates.delete(userId);
}
