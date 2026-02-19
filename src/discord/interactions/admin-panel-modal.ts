import { ModalSubmitInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { FactionService } from '../../services/faction.service';
import { FactionTypeService } from '../../services/faction-type.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { SubdivisionService } from '../../services/subdivision.service';
import { isAdministrator } from '../utils/permission-checker';
import {
  buildFactionsSection,
  buildFactionDetailPanel,
  buildFactionTypesSection,
  buildFactionTypeDetailPanel,
  buildPendingChangesPanel,
  buildTemplateEditorPanel,
  buildFactionSubdivisionsPanel,
  buildAdminSubdivisionSettingsPanel,
  buildAdminSubdivisionEditorPanel,
} from '../utils/admin-panel-builder';
import {
  parseSubdivisionSettingsData,
  isValidDiscordEmoji,
  parseEmbedFieldFromModal,
  getVerifiedSubdivision,
  createDraftState,
  handleInteractionError,
} from '../utils/subdivision-settings-helper';
import { EMOJI, COLORS } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { getAddFactionState, clearAddFactionState } from './admin-panel-button';
import { SubdivisionTemplate, Subdivision } from '../../types/database.types';

// Временное хранилище для draft изменений шаблонов
const templateDraftState = createDraftState<SubdivisionTemplate>();

export function getTemplateDraft(typeId: number, templateId: number): Partial<SubdivisionTemplate> | undefined {
  return templateDraftState.get(`${typeId}_${templateId}`);
}

export function setTemplateDraft(typeId: number, templateId: number, data: Partial<SubdivisionTemplate>) {
  templateDraftState.set(`${typeId}_${templateId}`, data);
}

export function clearTemplateDraft(typeId: number, templateId: number) {
  templateDraftState.clear(`${typeId}_${templateId}`);
}

// Временное хранилище для draft изменений подразделений (администратор, прямое редактирование)
const adminSubDraftState = createDraftState<Subdivision>();

export function getAdminSubDraft(subdivisionId: number): Partial<Subdivision> | undefined {
  return adminSubDraftState.get(subdivisionId.toString());
}

export function setAdminSubDraft(subdivisionId: number, data: Partial<Subdivision>) {
  adminSubDraftState.set(subdivisionId.toString(), data);
}

export function clearAdminSubDraft(subdivisionId: number) {
  adminSubDraftState.clear(subdivisionId.toString());
}

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
    // Добавление фракции (шаг 4 — modal с названием и описанием)
    if (customId === 'admin_modal_add_fact') {
      await handleAddFaction(interaction, server.id);
    }
    // Редактирование фракции
    else if (customId.startsWith('admin_modal_edit_fact_')) {
      const factionId = parseInt(customId.replace('admin_modal_edit_fact_', ''));
      await handleEditFaction(interaction, factionId, server.id);
    }
    // Создание типа фракции
    else if (customId === 'admin_modal_create_fact_type') {
      await handleCreateFactionType(interaction, server.id);
    }
    // Редактирование типа фракции
    else if (customId.startsWith('admin_modal_edit_fact_type_')) {
      const typeId = parseInt(customId.replace('admin_modal_edit_fact_type_', ''));
      await handleEditFactionType(interaction, typeId);
    }
    // Добавление шаблона подразделения
    else if (customId.startsWith('admin_modal_add_template_')) {
      const typeId = parseInt(customId.replace('admin_modal_add_template_', ''));
      await handleAddTemplate(interaction, typeId);
    }
    // Редактирование названия шаблона
    else if (customId.startsWith('template_modal_name_')) {
      const parts = customId.replace('template_modal_name_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'name');
    }
    // Редактирование заголовка embed (объединённый модал: заголовок + URL)
    else if (customId.startsWith('template_modal_title_')) {
      const parts = customId.replace('template_modal_title_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'title');
    }
    // Редактирование описания
    else if (customId.startsWith('template_modal_description_')) {
      const parts = customId.replace('template_modal_description_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'description');
    }
    // Редактирование цвета
    else if (customId.startsWith('template_modal_color_')) {
      const parts = customId.replace('template_modal_color_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'color');
    }
    // Редактирование автора
    else if (customId.startsWith('template_modal_author_')) {
      const parts = customId.replace('template_modal_author_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'author');
    }
    // Редактирование футера
    else if (customId.startsWith('template_modal_footer_')) {
      const parts = customId.replace('template_modal_footer_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'footer');
    }
    // Редактирование изображения
    else if (customId.startsWith('template_modal_image_')) {
      const parts = customId.replace('template_modal_image_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'image');
    }
    // Редактирование миниатюры
    else if (customId.startsWith('template_modal_thumbnail_')) {
      const parts = customId.replace('template_modal_thumbnail_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'thumbnail');
    }
    // Редактирование краткого описания шаблона
    else if (customId.startsWith('template_modal_short_desc_')) {
      const parts = customId.replace('template_modal_short_desc_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'short_desc');
    }
    // Редактирование логотипа шаблона
    else if (customId.startsWith('template_modal_logo_')) {
      const parts = customId.replace('template_modal_logo_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);
      await handleTemplateFieldEdit(interaction, typeId, templateId, 'logo');
    }
    // Отклонение изменения с причиной
    else if (customId.startsWith('admin_modal_reject_change_')) {
      const changeId = parseInt(customId.replace('admin_modal_reject_change_', ''));
      await handleRejectChange(interaction, changeId, server.id);
    }
    // Прямое редактирование настроек подразделения администратором (без pending)
    else if (customId.startsWith('admin_modal_sub_settings_')) {
      const subdivisionId = parseInt(customId.replace('admin_modal_sub_settings_', ''));
      await handleAdminEditSubdivisionSettings(interaction, subdivisionId);
    }
    // Редактор подразделения (admin): редактирование полей (draft-based)
    else if (customId.startsWith('admin_modal_sub_edit_name_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_name_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'name');
    }
    else if (customId.startsWith('admin_modal_sub_edit_logo_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_logo_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'logo');
    }
    else if (customId.startsWith('admin_modal_sub_edit_short_desc_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_short_desc_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'short_desc');
    }
    else if (customId.startsWith('admin_modal_sub_edit_author_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_author_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'author');
    }
    else if (customId.startsWith('admin_modal_sub_edit_title_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_title_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'title');
    }
    else if (customId.startsWith('admin_modal_sub_edit_thumbnail_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_thumbnail_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'thumbnail');
    }
    else if (customId.startsWith('admin_modal_sub_edit_description_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_description_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'description');
    }
    else if (customId.startsWith('admin_modal_sub_edit_image_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_image_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'image');
    }
    else if (customId.startsWith('admin_modal_sub_edit_color_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_color_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'color');
    }
    else if (customId.startsWith('admin_modal_sub_edit_footer_')) {
      const subId = parseInt(customId.replace('admin_modal_sub_edit_footer_', ''));
      await handleSubEditorFieldEdit(interaction, subId, 'footer');
    }
  } catch (error) {
    await handleInteractionError(error, interaction, 'Error handling admin panel modal', `${EMOJI.ERROR} Произошла ошибка при обработке формы`);
  }
}

/**
 * Создание фракции из modal
 */
async function handleAddFaction(
  interaction: ModalSubmitInteraction,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('dept_name').trim();
  const description = interaction.fields.getTextInputValue('dept_description').trim();
  const emoji = interaction.fields.getTextInputValue('dept_emoji').trim();

  // Валидация эмодзи
  if (emoji && !isValidDiscordEmoji(emoji)) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Некорректное эмодзи. Укажите кастомное Discord-эмодзи (<:name:id>) или unicode-эмодзи (🚔).`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Получить состояние с ролями и типом
  const state = getAddFactionState(interaction.user.id);
  if (!state || !state.generalLeaderRoleId || !state.departmentRoleId) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Сессия добавления фракции истекла. Попробуйте снова.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Создать фракцию с типом (если выбран)
  const faction = await FactionService.createFaction({
    server_id: serverId,
    name,
    description: description || undefined,
    logo_url: emoji || undefined,
    general_leader_role_id: state.generalLeaderRoleId,
    faction_role_id: state.departmentRoleId,
  }, state.selectedTypeId);

  // Очистить состояние
  clearAddFactionState(interaction.user.id);

  logger.info('Faction created via admin panel', {
    factionId: faction.id,
    name: faction.name,
    typeId: state.selectedTypeId,
    serverId,
    userId: interaction.user.id,
  });

  // Показать детальную панель новой фракции
  const panel = buildFactionDetailPanel(faction);
  await interaction.editReply(panel);
}

/**
 * Редактирование фракции из modal
 */
async function handleEditFaction(
  interaction: ModalSubmitInteraction,
  factionId: number,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('dept_name').trim();
  const description = interaction.fields.getTextInputValue('dept_description').trim();
  const logoUrl = interaction.fields.getTextInputValue('faction_logo_url').trim();

  const faction = await FactionService.updateFaction(factionId, {
    name,
    description: description || undefined,
    logo_url: logoUrl || null,
  });

  if (!faction) {
    throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
  }

  logger.info('Faction updated via admin panel', {
    factionId,
    name: faction.name,
    userId: interaction.user.id,
  });

  const panel = buildFactionDetailPanel(faction);
  await interaction.editReply(panel);
}

/**
 * Создание типа фракции из modal
 */
async function handleCreateFactionType(
  interaction: ModalSubmitInteraction,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('type_name').trim();
  const description = interaction.fields.getTextInputValue('type_description').trim();

  const factionType = await FactionTypeService.createFactionType({
    server_id: serverId,
    name,
    description: description || undefined,
  });

  logger.info('Faction type created via admin panel', {
    typeId: factionType.id,
    name: factionType.name,
    serverId,
    userId: interaction.user.id,
  });

  // Показать детальную панель нового типа
  const panel = await buildFactionTypeDetailPanel(factionType.id);
  await interaction.editReply(panel);
}

/**
 * Редактирование типа фракции из modal
 */
async function handleEditFactionType(
  interaction: ModalSubmitInteraction,
  typeId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('type_name').trim();
  const description = interaction.fields.getTextInputValue('type_description').trim();

  const factionType = await FactionTypeService.updateFactionType(typeId, {
    name,
    description: description || undefined,
  });

  if (!factionType) {
    throw new CalloutError('Тип фракции не найден', 'TYPE_NOT_FOUND', 404);
  }

  logger.info('Faction type updated via admin panel', {
    typeId,
    name: factionType.name,
    userId: interaction.user.id,
  });

  const panel = await buildFactionTypeDetailPanel(typeId);
  await interaction.editReply(panel);
}

/**
 * Добавление шаблона подразделения из modal
 */
async function handleAddTemplate(
  interaction: ModalSubmitInteraction,
  typeId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('template_name').trim();
  const description = interaction.fields.getTextInputValue('template_description').trim();

  const template = await FactionTypeService.addTemplate(typeId, {
    name,
    description: description || undefined,
  });

  logger.info('Subdivision template added via admin panel', {
    templateId: template.id,
    typeId,
    name: template.name,
    userId: interaction.user.id,
  });

  // Вернуться к деталям типа фракции
  const panel = await buildFactionTypeDetailPanel(typeId);
  await interaction.editReply(panel);
}

/**
 * Отклонение изменения с причиной из modal
 */
async function handleRejectChange(
  interaction: ModalSubmitInteraction,
  changeId: number,
  serverId: number
) {
  await interaction.deferUpdate();

  const reason = interaction.fields.getTextInputValue('rejection_reason').trim();

  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  await PendingChangeService.rejectChange(changeId, interaction.user.id, reason, interaction.guild);

  logger.info('Change rejected via admin panel', {
    changeId,
    reason,
    userId: interaction.user.id,
  });

  // Вернуться к списку pending изменений
  const panel = await buildPendingChangesPanel(serverId);
  await interaction.editReply(panel);
}

/**
 * Обработка редактирования поля шаблона
 * Обновляет draft состояние и перерисовывает панель с предпросмотром
 */
async function handleTemplateFieldEdit(
  interaction: ModalSubmitInteraction,
  typeId: number,
  templateId: number,
  field: string
) {
  await interaction.deferUpdate();

  const result = parseEmbedFieldFromModal(interaction, field, { nameInputCustomId: 'template_name', validateUrls: true });
  if (!result.ok) {
    await interaction.followUp({ content: result.errorMessage, flags: MessageFlags.Ephemeral });
    return;
  }

  setTemplateDraft(typeId, templateId, result.data);

  const currentDraft = getTemplateDraft(typeId, templateId);
  const panel = await buildTemplateEditorPanel(typeId, templateId, currentDraft);
  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.SUCCESS} Предпросмотр обновлен. Нажмите "Сохранить" чтобы применить изменения.`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Прямое редактирование настроек подразделения администратором.
 * Использует shared helper — тот же парсер что и в лидерской панели.
 * Применяет изменения немедленно, без pending запроса.
 */
async function handleAdminEditSubdivisionSettings(
  interaction: ModalSubmitInteraction,
  subdivisionId: number
) {
  await interaction.deferUpdate();

  const subdivision = await getVerifiedSubdivision(subdivisionId);

  // Парсинг и валидация через shared helper
  const settingsData = parseSubdivisionSettingsData(interaction);

  await SubdivisionService.updateSubdivision(subdivisionId, {
    short_description: settingsData.short_description ?? undefined,
    logo_url: settingsData.logo_url ?? undefined,
    discord_role_id: settingsData.discord_role_id ?? undefined,
  });

  logger.info('Subdivision settings updated directly by admin', {
    subdivisionId,
    userId: interaction.user.id,
    changes: settingsData,
  });

  // Вернуться на панель настроек подразделения
  const updatedSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (updatedSubdivision) {
    const panel = buildAdminSubdivisionSettingsPanel(updatedSubdivision, updatedSubdivision.faction_id);
    await interaction.editReply(panel);
  }

  await interaction.followUp({
    content: `${EMOJI.SUCCESS} Настройки подразделения **${subdivision.name}** обновлены`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Обработка редактирования поля подразделения (admin editor, draft-based)
 * Обновляет draft состояние и перерисовывает панель с предпросмотром
 */
async function handleSubEditorFieldEdit(
  interaction: ModalSubmitInteraction,
  subdivisionId: number,
  field: string
) {
  await interaction.deferUpdate();

  const subdivision = await getVerifiedSubdivision(subdivisionId);

  const result = parseEmbedFieldFromModal(interaction, field, { nameInputCustomId: 'sub_name', validateUrls: true });
  if (!result.ok) {
    await interaction.followUp({ content: result.errorMessage, flags: MessageFlags.Ephemeral });
    return;
  }

  setAdminSubDraft(subdivisionId, result.data);

  const currentDraft = getAdminSubDraft(subdivisionId);
  const panel = await buildAdminSubdivisionEditorPanel(subdivision.faction_id, subdivision, currentDraft);
  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.SUCCESS} Предпросмотр обновлен. Нажмите "Сохранить" чтобы применить изменения.`,
    flags: MessageFlags.Ephemeral,
  });
}


/**
 * Обработчик модальных окон из Audit Log канала (audit_modal_reject_change_)
 * Вызывается при отклонении изменения через кнопку в audit log сообщении
 */
export async function handleAuditLogModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isAdministrator(member)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Только администраторы могут отклонять изменения`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const customId = interaction.customId;

  if (customId.startsWith('audit_modal_reject_change_')) {
    const changeId = parseInt(customId.replace('audit_modal_reject_change_', ''));
    const reason = interaction.fields.getTextInputValue('rejection_reason').trim();

    try {
      // deferUpdate обновит оригинальное сообщение audit log (где была кнопка)
      await interaction.deferUpdate();

      await PendingChangeService.rejectChange(changeId, interaction.user.id, reason, interaction.guild);

      logger.info('Change rejected from audit log', {
        changeId,
        reason,
        userId: interaction.user.id,
      });

      const resultEmbed = new EmbedBuilder()
        .setTitle(`❌ Изменение #${changeId} отклонено`)
        .setColor(COLORS.ERROR)
        .addFields(
          { name: 'Отклонил', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Причина', value: reason, inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed], components: [] });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось отклонить изменение';
      logger.error('Failed to reject change from audit log', {
        changeId,
        error: error instanceof Error ? error.message : error,
      });
      try {
        await interaction.followUp({ content: `${EMOJI.ERROR} ${msg}`, flags: MessageFlags.Ephemeral });
      } catch {
        // ignore
      }
    }
  }
}
