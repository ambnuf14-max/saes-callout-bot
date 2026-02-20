import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { EMOJI, COLORS } from '../../config/constants';
import { safeParseInt } from '../../utils/validators';
import { ServerModel } from '../../database/models';
import { SubdivisionService } from '../../services/subdivision.service';
import { FactionTypeService } from '../../services/faction-type.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { isAdministrator } from '../utils/permission-checker';
import { getLeaderFaction } from '../utils/faction-permission-checker';
import { logAuditEvent, AuditEventType, LeaderRoleAddedData, CalloutRoleData } from '../utils/audit-logger';
import {
  buildLeaderRolesSection,
  buildCalloutRolesSection,
  buildTemplateRolePanel,
  buildAdminSubEditorRolePanel,
  buildAdminSubdivisionSettingsPanel,
} from '../utils/admin-panel-builder';
import { buildSubdivisionRolePanel, buildSettingsPanel } from '../utils/faction-panel-builder';
import { getAddFactionState } from './admin-panel-button';

const ROLE_ID_INPUT = 'manual_role_id';

/**
 * Показать modal для ручного ввода ID роли
 */
export async function handleRoleManualButton(interaction: ButtonInteraction) {
  const context = interaction.customId.replace('role_manual_input_', '');

  const modal = new ModalBuilder()
    .setCustomId(`role_modal_${context}`)
    .setTitle('Ввести ID роли');

  const input = new TextInputBuilder()
    .setCustomId(ROLE_ID_INPUT)
    .setLabel('ID роли Discord')
    .setPlaceholder('Например: 123456789012345678')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(17)
    .setMaxLength(20);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

/**
 * Обработать ввод ID роли из modal
 */
export async function handleRoleManualModal(interaction: ModalSubmitInteraction) {
  const context = interaction.customId.replace('role_modal_', '');
  const rawInput = interaction.fields.getTextInputValue(ROLE_ID_INPUT).trim();

  if (!/^\d{17,20}$/.test(rawInput)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Неверный формат ID. ID роли — числовой идентификатор (17–20 цифр).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: `${EMOJI.ERROR} Guild не найден`, flags: MessageFlags.Ephemeral });
    return;
  }

  const role = interaction.guild.roles.cache.get(rawInput)
    ?? await interaction.guild.roles.fetch(rawInput).catch(() => null);

  if (!role) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Роль с ID \`${rawInput}\` не найдена на этом сервере.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const roleId = rawInput;

  try {
    if (context.startsWith('subdivision_role_')) {
      await handleManualSubdivisionRole(interaction, context, roleId);
    } else if (context.startsWith('faction_settings_role_')) {
      await handleManualFactionSettingsRole(interaction, context, roleId);
    } else if (context.startsWith('admin_')) {
      await handleManualAdminRole(interaction, context, roleId);
    }
  } catch (error) {
    logger.error('Error handling manual role modal', {
      error: error instanceof Error ? error.message : error,
      context,
      roleId,
      userId: interaction.user.id,
    });
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Произошла ошибка` });
    } else {
      await interaction.reply({ content: `${EMOJI.ERROR} Произошла ошибка`, flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleManualSubdivisionRole(
  interaction: ModalSubmitInteraction,
  context: string,
  roleId: string,
) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const faction = await getLeaderFaction(member);
  if (!faction) {
    await interaction.reply({ content: `${EMOJI.ERROR} У вас нет прав лидера фракции`, flags: MessageFlags.Ephemeral });
    return;
  }

  const subdivisionId = safeParseInt(context.replace('subdivision_role_', ''));
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision || subdivision.faction_id !== faction.id) {
    await interaction.reply({ content: `${EMOJI.ERROR} Подразделение не найдено`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const { setSubdivisionDraftRole } = await import('./faction-panel-modal');
  setSubdivisionDraftRole(subdivisionId, roleId);

  const panel = await buildSubdivisionRolePanel(subdivisionId, roleId);
  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.SUCCESS} Роль <@&${roleId}> добавлена в предпросмотр. Нажмите "Отправить на одобрение" в редакторе embed.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleManualFactionSettingsRole(
  interaction: ModalSubmitInteraction,
  context: string,
  roleId: string,
) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const faction = await getLeaderFaction(member);
  if (!faction) {
    await interaction.reply({ content: `${EMOJI.ERROR} У вас нет прав лидера фракции`, flags: MessageFlags.Ephemeral });
    return;
  }

  const subdivisionId = safeParseInt(context.replace('faction_settings_role_', ''));
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision || subdivision.faction_id !== faction.id) {
    await interaction.reply({ content: `${EMOJI.ERROR} Подразделение не найдено`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  await PendingChangeService.requestUpdateSubdivision(
    subdivisionId,
    faction.id,
    subdivision.server_id,
    interaction.user.id,
    { discord_role_id: roleId },
    interaction.guild,
  );

  const panel = await buildSettingsPanel(subdivision);
  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на установку роли <@&${roleId}> отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleManualAdminRole(
  interaction: ModalSubmitInteraction,
  context: string,
  roleId: string,
) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isAdministrator(member)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Только администраторы имеют доступ`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const server = await ServerModel.findByGuildId(interaction.guild.id);
  if (!server) {
    await interaction.reply({ content: `${EMOJI.ERROR} Сервер не настроен`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  if (context === 'admin_add_leader_role') {
    const freshServer = await ServerModel.findById(server.id);
    if (!freshServer) return;
    const ids = ServerModel.getLeaderRoleIds(freshServer);
    if (!ids.includes(roleId)) {
      ids.push(roleId);
      await ServerModel.update(server.id, { leader_role_ids: ids });
      const auditData: LeaderRoleAddedData = { userId: interaction.user.id, userName: interaction.user.tag, roleId };
      await logAuditEvent(interaction.guild, AuditEventType.LEADER_ROLE_ADDED, auditData);
    }
    const updated = await ServerModel.findById(server.id);
    await interaction.editReply(buildLeaderRolesSection(updated || freshServer));
  }

  else if (context === 'admin_add_callout_role') {
    const freshServer = await ServerModel.findById(server.id);
    if (!freshServer) return;
    const ids = ServerModel.getCalloutAllowedRoleIds(freshServer);
    if (!ids.includes(roleId)) {
      ids.push(roleId);
      await ServerModel.update(server.id, { callout_allowed_role_ids: ids });
      const auditData: CalloutRoleData = { userId: interaction.user.id, userName: interaction.user.tag, roleId };
      await logAuditEvent(interaction.guild, AuditEventType.CALLOUT_ROLE_ADDED, auditData);
    }
    const updated = await ServerModel.findById(server.id);
    await interaction.editReply(buildCalloutRolesSection(updated || freshServer));
  }

  else if (context === 'admin_fact_step1_role') {
    const state = getAddFactionState(interaction.guildId!, interaction.user.id);
    if (!state) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Сессия добавления истекла. Попробуйте снова.`, embeds: [], components: [] });
      return;
    }
    state.generalLeaderRoleId = roleId;

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle('➕ Добавление фракции — Шаг 2/3')
      .setDescription(`Общая лидерская роль: <@&${roleId}>\n\nТеперь выберите **роль фракции** (например: LSPD)`)
      .setTimestamp();

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('admin_fact_step2_role')
      .setPlaceholder('Выберите роль фракции');

    await interaction.editReply({
      embeds: [embed],
      components: [
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('role_manual_input_admin_fact_step2_role')
            .setLabel('Ввести ID')
            .setEmoji('⌨️')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('admin_factions')
            .setLabel('Отмена')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  else if (context === 'admin_fact_step2_role') {
    const state = getAddFactionState(interaction.guildId!, interaction.user.id);
    if (!state || !state.generalLeaderRoleId) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Сессия добавления истекла. Попробуйте снова.`, embeds: [], components: [] });
      return;
    }
    state.departmentRoleId = roleId;

    const types = await FactionTypeService.getFactionTypes(server.id, true);
    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle('➕ Добавление фракции — Шаг 3/4')
      .setDescription(
        `Общая лидерская роль: <@&${state.generalLeaderRoleId}>\n` +
        `Роль фракции: <@&${roleId}>\n\n` +
        `Выберите тип фракции (с предустановленными подразделениями) или продолжите без типа:`
      )
      .setTimestamp();

    const typeButtons: ButtonBuilder[] = [];
    const displayTypes = types.slice(0, 4);
    for (const type of displayTypes) {
      typeButtons.push(
        new ButtonBuilder()
          .setCustomId(`admin_fact_step3_type_${type.id}`)
          .setLabel(type.name)
          .setStyle(ButtonStyle.Primary)
      );
    }
    typeButtons.push(
      new ButtonBuilder().setCustomId('admin_fact_step3_no_type').setLabel('Без типа').setStyle(ButtonStyle.Secondary)
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    if (displayTypes.length > 0) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...typeButtons.slice(0, displayTypes.length)));
    }
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      typeButtons[typeButtons.length - 1],
      new ButtonBuilder().setCustomId('admin_factions').setLabel('Отмена').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
    await interaction.editReply({ embeds: [embed], components: rows });
  }

  else if (context.startsWith('admin_template_role_')) {
    const parts = context.replace('admin_template_role_', '').split('_');
    const typeId = safeParseInt(parts[0]);
    const templateId = safeParseInt(parts[1]);

    const { setTemplateDraft } = await import('./admin-panel-modal');
    setTemplateDraft(typeId, templateId, { discord_role_id: roleId });

    const panel = await buildTemplateRolePanel(typeId, templateId, roleId);
    await interaction.editReply(panel);

    await interaction.followUp({
      content: `${EMOJI.SUCCESS} Роль <@&${roleId}> установлена. Нажмите "Сохранить" в редакторе шаблона.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  else if (context.startsWith('admin_sub_editor_role_')) {
    const parts = context.replace('admin_sub_editor_role_', '').split('_');
    const factionId = safeParseInt(parts[0]);
    const subId = safeParseInt(parts[1]);

    const { setAdminSubDraft } = await import('./admin-panel-modal');
    setAdminSubDraft(subId, { discord_role_id: roleId });

    const panel = await buildAdminSubEditorRolePanel(factionId, subId, roleId);
    await interaction.editReply(panel);

    await interaction.followUp({
      content: `${EMOJI.SUCCESS} Роль <@&${roleId}> установлена. Нажмите "Назад к редактору" и "Сохранить" для применения.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  else if (context.startsWith('admin_sub_role_')) {
    const subdivisionId = safeParseInt(context.replace('admin_sub_role_', ''));
    const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
    if (!subdivision) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Подразделение не найдено` });
      return;
    }
    await SubdivisionService.updateSubdivision(subdivisionId, { discord_role_id: roleId });
    const updated = await SubdivisionService.getSubdivisionById(subdivisionId);
    if (updated) {
      const panel = buildAdminSubdivisionSettingsPanel(updated, updated.faction_id);
      await interaction.editReply(panel);
    }
  }
}
