import { ModalSubmitInteraction, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { FactionService } from '../../services/faction.service';
import { FactionTypeService } from '../../services/faction-type.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { isAdministrator } from '../utils/permission-checker';
import {
  buildFactionsSection,
  buildFactionDetailPanel,
  buildFactionTypesSection,
  buildFactionTypeDetailPanel,
  buildPendingChangesPanel,
  buildTemplateEditorPanel,
} from '../utils/admin-panel-builder';
import { EMOJI } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { getAddFactionState, clearAddFactionState } from './admin-panel-button';
import { SubdivisionTemplate } from '../../types/database.types';

// Временное хранилище для draft изменений шаблонов
const templateDraftState = new Map<string, Partial<SubdivisionTemplate>>();

export function getTemplateDraft(typeId: number, templateId: number): Partial<SubdivisionTemplate> | undefined {
  return templateDraftState.get(`${typeId}_${templateId}`);
}

function setTemplateDraft(typeId: number, templateId: number, data: Partial<SubdivisionTemplate>) {
  const key = `${typeId}_${templateId}`;
  const existing = templateDraftState.get(key) || {};
  templateDraftState.set(key, { ...existing, ...data });
}

export function clearTemplateDraft(typeId: number, templateId: number) {
  templateDraftState.delete(`${typeId}_${templateId}`);
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
    // Редактирование заголовка embed
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
    // Отклонение изменения с причиной
    else if (customId.startsWith('admin_modal_reject_change_')) {
      const changeId = parseInt(customId.replace('admin_modal_reject_change_', ''));
      await handleRejectChange(interaction, changeId, server.id);
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
 * Создание фракции из modal
 */
async function handleAddFaction(
  interaction: ModalSubmitInteraction,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('dept_name').trim();
  const description = interaction.fields.getTextInputValue('dept_description').trim();

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

  const faction = await FactionService.updateFaction(factionId, {
    name,
    description: description || undefined,
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

  const draftData: Partial<SubdivisionTemplate> = {};

  // Получить значения полей в зависимости от типа
  switch (field) {
    case 'name':
      draftData.name = interaction.fields.getTextInputValue('template_name').trim();
      break;
    case 'title':
      const title = interaction.fields.getTextInputValue('embed_title').trim();
      draftData.embed_title = title || null;
      break;
    case 'description':
      const desc = interaction.fields.getTextInputValue('embed_description').trim();
      draftData.embed_description = desc || null;
      break;
    case 'color':
      let color = interaction.fields.getTextInputValue('embed_color').trim();
      if (color) {
        // Нормализовать цвет (добавить # если нужно)
        color = color.startsWith('#') ? color : `#${color}`;
        // Валидация hex цвета
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
          await interaction.followUp({
            content: `${EMOJI.ERROR} Некорректный hex цвет. Используйте формат #RRGGBB или RRGGBB`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        draftData.embed_color = color;
      } else {
        draftData.embed_color = null;
      }
      break;
    case 'author':
      const authorName = interaction.fields.getTextInputValue('embed_author_name').trim();
      const authorUrl = interaction.fields.getTextInputValue('embed_author_url').trim();
      const authorIcon = interaction.fields.getTextInputValue('embed_author_icon_url').trim();
      draftData.embed_author_name = authorName || null;
      draftData.embed_author_url = authorUrl || null;
      draftData.embed_author_icon_url = authorIcon || null;
      break;
    case 'footer':
      const footerText = interaction.fields.getTextInputValue('embed_footer_text').trim();
      const footerIcon = interaction.fields.getTextInputValue('embed_footer_icon_url').trim();
      draftData.embed_footer_text = footerText || null;
      draftData.embed_footer_icon_url = footerIcon || null;
      break;
    case 'image':
      const imageUrl = interaction.fields.getTextInputValue('embed_image_url').trim();
      draftData.embed_image_url = imageUrl || null;
      break;
    case 'thumbnail':
      const thumbnailUrl = interaction.fields.getTextInputValue('embed_thumbnail_url').trim();
      draftData.embed_thumbnail_url = thumbnailUrl || null;
      break;
  }

  // Обновить draft состояние
  setTemplateDraft(typeId, templateId, draftData);

  // Получить текущий draft и перерисовать панель с обновленным предпросмотром
  const currentDraft = getTemplateDraft(typeId, templateId);
  const panel = await buildTemplateEditorPanel(typeId, templateId, currentDraft);
  await interaction.editReply(panel);

  // Показать ephemeral уведомление об изменении
  await interaction.followUp({
    content: `${EMOJI.SUCCESS} Предпросмотр обновлен. Нажмите "Сохранить" чтобы применить изменения.`,
    flags: MessageFlags.Ephemeral,
  });
}
