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
import { FactionService } from '../../services/faction.service';
import { isAdministrator } from '../utils/permission-checker';
import {
  buildAdminMainPanel,
  buildSettingsSection,
  buildRoleSettingsSection,
  buildSetupSection,
  buildLeaderRolesSection,
  buildCalloutRolesSection,
  buildAuditLogSection,
  buildFactionsSection,
  buildFactionDetailPanel,
  buildFactionDeleteConfirmation,
  buildFactionTypesSection,
  buildFactionTypeDetailPanel,
  buildPendingChangesPanel,
  buildReviewChangePanel,
  buildTemplateEditorPanel,
  buildFactionSubdivisionsPanel,
  buildTemplateRolePanel,
  buildAdminSubdivisionSettingsPanel,
  buildAdminSubdivisionEditorPanel,
  buildAdminSubEditorRolePanel,
  buildAdminLinksPanel,
  buildAdminDeleteConfirmation,
  buildFactionTypeEmbedEditorPanel,
} from '../utils/admin-panel-builder';
import { buildVerificationInstructions } from '../utils/faction-panel-builder';
import { VerificationService } from '../../services/verification.service';
import { buildSubdivisionSettingsModal, buildSubdivisionEmbedFieldModal, handleInteractionError } from '../utils/subdivision-settings-helper';
import { SubdivisionService } from '../../services/subdivision.service';
import { FactionTypeService } from '../../services/faction-type.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { EMOJI } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { safeParseInt } from '../../utils/validators';
import {
  logAuditEvent,
  AuditEventType,
  LeaderRoleAddedData,
  LeaderRoleRemovedData,
  AuditLogChannelSetData,
  CalloutRoleData,
} from '../utils/audit-logger';

// Состояние для добавления фракции (3-4 шага)
interface AddFactionState {
  generalLeaderRoleId?: string;
  departmentRoleId?: string;
  useSubdivisions?: boolean;
  selectedTypeId?: number;  // Тип фракции
  userId: string;
  createdAt: number;
}

const addFactionStates = new Map<string, AddFactionState>();
const STATE_TTL = 5 * 60 * 1000; // 5 минут

// Периодическая очистка
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of addFactionStates.entries()) {
    if (now - state.createdAt > STATE_TTL) {
      addFactionStates.delete(key);
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
  const startTime = Date.now();
  const customId = interaction.customId;

  logger.debug('Button interaction received', {
    customId,
    createdTimestamp: interaction.createdTimestamp,
    receivedAt: startTime,
    age: startTime - interaction.createdTimestamp,
  });

  // Кнопки, которые показывают модальные окна - для них НЕ нужно вызывать deferUpdate
  const modalButtons = [
    'admin_create_fact_type',
    'admin_edit_fact_type_',
    'admin_add_template_',
    'admin_reject_change_',
    'template_edit_name_',
    'template_edit_title_',
    'template_edit_description_',
    'template_edit_color_',
    'template_edit_author_',
    'template_edit_footer_',
    'template_edit_image_',
    'template_edit_thumbnail_',
    'template_edit_short_desc_',
    'template_edit_logo_',
    'admin_fact_step3_type_',
    'admin_fact_step3_no_type',
    'admin_sub_edit_name_',
    'admin_sub_edit_logo_',
    'admin_sub_edit_short_desc_',
    'admin_sub_edit_author_',
    'admin_sub_edit_title_',
    'admin_sub_edit_thumbnail_',
    'admin_sub_edit_description_',
    'admin_sub_edit_image_',
    'admin_sub_edit_color_',
    'admin_sub_edit_footer_',
    'type_embed_edit_name_',
    'type_embed_edit_logo_',
    'type_embed_edit_short_desc_',
    'type_embed_edit_author_',
    'type_embed_edit_title_',
    'type_embed_edit_thumbnail_',
    'type_embed_edit_description_',
    'type_embed_edit_image_',
    'type_embed_edit_color_',
    'type_embed_edit_footer_',
  ];
  const isModalButton = modalButtons.some(prefix => customId === prefix || customId.startsWith(prefix)) ||
    customId.startsWith('admin_edit_faction_') ||
    customId.startsWith('admin_sub_other_settings_');

  // Немедленно подтвердить взаимодействие (только если это НЕ модальная кнопка)
  if (!isModalButton) {
    const deferStart = Date.now();
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
        logger.debug('Defer successful', {
          customId,
          deferTime: Date.now() - deferStart,
        });
      }
    } catch (error) {
      logger.error('Failed to defer interaction', {
        error: error instanceof Error ? error.message : error,
        customId: interaction.customId,
        deferTime: Date.now() - deferStart,
        totalTime: Date.now() - startTime,
      });
      // Если defer не удался (обычно из-за таймаута), прекратить обработку
      // так как Discord уже не примет ответ на это взаимодействие
      return;
    }
  }

  const ctx = await getAdminContext(interaction);
  if (!ctx) {
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Произошла ошибка. Проверьте настройки сервера.`,
        });
      }
    } catch (err) {
      logger.error('Failed to send error message', { error: err });
    }
    return;
  }

  const { server } = ctx;

  try {
    if (customId === 'admin_back') {
      const panel = await buildAdminMainPanel(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_settings') {
      const panel = buildSettingsSection(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_role_settings') {
      const panel = buildRoleSettingsSection(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_back_to_settings') {
      const panel = buildSettingsSection(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_setup') {
      const panel = buildSetupSection(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_leader_roles') {
      const freshServer = await ServerModel.findById(server.id);
      const panel = buildLeaderRolesSection(freshServer || server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_callout_roles') {
      const freshServer = await ServerModel.findById(server.id);
      const panel = buildCalloutRolesSection(freshServer || server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_audit_log') {
      const freshServer = await ServerModel.findById(server.id);
      const panel = buildAuditLogSection(freshServer || server);
      await interaction.editReply(panel);
    }

    else if (customId === 'admin_factions' || customId === 'admin_back_to_factions') {
      const panel = await buildFactionsSection(server);
      await interaction.editReply(panel);
    }

    // Добавление фракции — шаг 1: выбор общей лидерской роли
    else if (customId === 'admin_add_faction') {
      // Инициировать состояние
      addFactionStates.set(`${interaction.guildId}:${interaction.user.id}`, {
        userId: interaction.user.id,
        createdAt: Date.now(),
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle('➕ Добавление фракции — Шаг 1/3')
        .setDescription('Выберите **общую лидерскую роль** (например: State Department Leader)')
        .setTimestamp();

      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('admin_fact_step1_role')
        .setPlaceholder('Выберите общую лидерскую роль');

      const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('role_manual_input_admin_fact_step1_role')
          .setLabel('Ввести ID')
          .setEmoji('⌨️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('admin_factions')
          .setLabel('Отмена')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row, backRow] });
    }

    // Редактирование фракции (показать modal)
    else if (customId.startsWith('admin_edit_faction_')) {
      const factionId = safeParseInt(customId.replace('admin_edit_faction_', ''));
      const faction = await FactionService.getFactionById(factionId);

      if (!faction) {
        await interaction.reply({
          content: `${EMOJI.ERROR} Фракция не найдена`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`admin_modal_edit_fact_${factionId}`)
        .setTitle(`Изменить: ${faction.name}`);

      const nameInput = new TextInputBuilder()
        .setCustomId('dept_name')
        .setLabel('Название фракции')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50)
        .setValue(faction.name);

      const descInput = new TextInputBuilder()
        .setCustomId('dept_description')
        .setLabel('Описание (опционально)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200)
        .setValue(faction.description || '');

      const logoInput = new TextInputBuilder()
        .setCustomId('faction_logo_url')
        .setLabel('Эмодзи фракции (ID, <:name:id> или 🏢)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(faction.logo_url || '');

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(logoInput),
      );

      await interaction.showModal(modal);
    }

    // Удаление фракции — показать подтверждение
    else if (customId.startsWith('admin_delete_faction_')) {
      const factionId = safeParseInt(customId.replace('admin_delete_faction_', ''));
      const faction = await FactionService.getFactionById(factionId);

      if (!faction) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Фракция не найдена`,
          embeds: [],
          components: [],
        });
        return;
      }

      const panel = buildFactionDeleteConfirmation(faction);
      await interaction.editReply(panel);
    }

    // Подтверждение удаления фракции
    else if (customId.startsWith('admin_confirm_delete_fact_')) {
      const factionId = safeParseInt(customId.replace('admin_confirm_delete_fact_', ''));
      const faction = await FactionService.getFactionById(factionId);

      if (!faction) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Фракция не найдена`,
          embeds: [],
          components: [],
        });
        return;
      }

      await FactionService.deleteFaction(factionId);

      logger.info('Faction deleted via admin panel', {
        factionId,
        name: faction.name,
        userId: interaction.user.id,
      });

      // Вернуться к списку
      const panel = await buildFactionsSection(server);
      await interaction.editReply(panel);
    }

    // === Управление подразделениями фракции (прямое редактирование) ===

    // Открыть список подразделений фракции
    else if (customId.startsWith('admin_faction_subdivisions_')) {
      const factionId = safeParseInt(customId.replace('admin_faction_subdivisions_', ''));
      const faction = await FactionService.getFactionById(factionId);
      if (!faction) {
        await interaction.editReply({ content: `${EMOJI.ERROR} Фракция не найдена`, embeds: [], components: [] });
        return;
      }
      const { SubdivisionModel } = await import('../../database/models');
      const allSubs = await SubdivisionModel.findByFactionId(factionId);
      const nonDefault = allSubs.filter((s: any) => !s.is_default);
      const panel = buildFactionSubdivisionsPanel(faction, nonDefault);
      await interaction.editReply(panel);
    }

    // Открыть редактор подразделения (полный embed-редактор, прямое сохранение)
    else if (customId.startsWith('admin_edit_sub_settings_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_edit_sub_settings_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) {
        throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      }
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subdivisionId);
      const panel = await buildAdminSubdivisionEditorPanel(subdivision.faction_id, subdivision, draft);
      await interaction.editReply(panel);
    }

    // Кнопка "Очистить роль" в панели настроек подразделения (прямое обновление без pending)
    else if (customId.startsWith('admin_sub_role_clear_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_sub_role_clear_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) {
        throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      }
      await SubdivisionService.updateSubdivision(subdivisionId, { discord_role_id: undefined });
      const updated = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (updated) {
        const panel = buildAdminSubdivisionSettingsPanel(updated, updated.faction_id);
        await interaction.editReply(panel);
      }
    }

    // Кнопка "Описание / Эмодзи" — открывает модал (без discord_role_id, только short_description + logo_url)
    else if (customId.startsWith('admin_sub_other_settings_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_sub_other_settings_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) {
        throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      }
      const modal = buildSubdivisionSettingsModal(subdivision, `admin_modal_sub_settings_${subdivisionId}`);
      await interaction.showModal(modal);
    }

    // === Редактор подразделения (admin, draft-based, прямое сохранение) ===

    // Редактирование названия подразделения
    else if (customId.startsWith('admin_sub_edit_name_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_name_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'name',
        `admin_modal_sub_edit_name_${subId}`,
        { name: draft?.name ?? subdivision?.name },
        'sub_name',
        true,
      );
      await interaction.showModal(modal);
    }

    // Редактирование эмодзи подразделения
    else if (customId.startsWith('admin_sub_edit_logo_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_logo_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'logo',
        `admin_modal_sub_edit_logo_${subId}`,
        { logo_url: draft?.logo_url ?? subdivision?.logo_url },
      );
      await interaction.showModal(modal);
    }

    // Редактирование краткого описания подразделения
    else if (customId.startsWith('admin_sub_edit_short_desc_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_short_desc_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'short_desc',
        `admin_modal_sub_edit_short_desc_${subId}`,
        { short_description: draft?.short_description ?? subdivision?.short_description },
      );
      await interaction.showModal(modal);
    }

    // Редактирование автора embed подразделения
    else if (customId.startsWith('admin_sub_edit_author_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_author_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'author',
        `admin_modal_sub_edit_author_${subId}`,
        {
          embed_author_name: draft?.embed_author_name ?? subdivision?.embed_author_name,
          embed_author_url: draft?.embed_author_url ?? subdivision?.embed_author_url,
          embed_author_icon_url: draft?.embed_author_icon_url ?? subdivision?.embed_author_icon_url,
        },
      );
      await interaction.showModal(modal);
    }

    // Редактирование заголовка embed подразделения
    else if (customId.startsWith('admin_sub_edit_title_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_title_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'title',
        `admin_modal_sub_edit_title_${subId}`,
        {
          embed_title: draft?.embed_title ?? subdivision?.embed_title,
          embed_title_url: draft?.embed_title_url ?? subdivision?.embed_title_url,
        },
      );
      await interaction.showModal(modal);
    }

    // Редактирование миниатюры embed подразделения
    else if (customId.startsWith('admin_sub_edit_thumbnail_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_thumbnail_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'thumbnail',
        `admin_modal_sub_edit_thumbnail_${subId}`,
        { embed_thumbnail_url: draft?.embed_thumbnail_url ?? subdivision?.embed_thumbnail_url },
      );
      await interaction.showModal(modal);
    }

    // Редактирование описания embed подразделения
    else if (customId.startsWith('admin_sub_edit_description_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_description_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'description',
        `admin_modal_sub_edit_description_${subId}`,
        { embed_description: draft?.embed_description ?? subdivision?.embed_description },
      );
      await interaction.showModal(modal);
    }

    // Редактирование изображения embed подразделения
    else if (customId.startsWith('admin_sub_edit_image_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_image_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'image',
        `admin_modal_sub_edit_image_${subId}`,
        { embed_image_url: draft?.embed_image_url ?? subdivision?.embed_image_url },
      );
      await interaction.showModal(modal);
    }

    // Редактирование цвета embed подразделения
    else if (customId.startsWith('admin_sub_edit_color_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_color_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'color',
        `admin_modal_sub_edit_color_${subId}`,
        { embed_color: draft?.embed_color ?? subdivision?.embed_color },
      );
      await interaction.showModal(modal);
    }

    // Редактирование футера embed подразделения
    else if (customId.startsWith('admin_sub_edit_footer_')) {
      const subId = safeParseInt(customId.replace('admin_sub_edit_footer_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const modal = buildSubdivisionEmbedFieldModal(
        'footer',
        `admin_modal_sub_edit_footer_${subId}`,
        {
          embed_footer_text: draft?.embed_footer_text ?? subdivision?.embed_footer_text,
          embed_footer_icon_url: draft?.embed_footer_icon_url ?? subdivision?.embed_footer_icon_url,
        },
      );
      await interaction.showModal(modal);
    }

    // Кнопка "Роль" в редакторе подразделения — переход на панель выбора роли
    else if (customId.startsWith('admin_sub_edit_role_')) {
      const parts = customId.replace('admin_sub_edit_role_', '').split('_');
      const factionId = safeParseInt(parts[0]);
      const subId = safeParseInt(parts[1]);
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subId);
      const draftRoleId = draft?.discord_role_id;
      const panel = await buildAdminSubEditorRolePanel(factionId, subId, draftRoleId);
      await interaction.editReply(panel);
    }

    // Кнопка "Назад к редактору" из панели выбора роли подразделения
    else if (customId.startsWith('admin_sub_editor_role_back_')) {
      const parts = customId.replace('admin_sub_editor_role_back_', '').split('_');
      const factionId = safeParseInt(parts[0]);
      const subId = safeParseInt(parts[1]);
      const subdivision = await SubdivisionService.getSubdivisionById(subId);
      if (!subdivision) {
        throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      }
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draftData = getAdminSubDraft(subId);
      const panel = await buildAdminSubdivisionEditorPanel(factionId, subdivision, draftData);
      await interaction.editReply(panel);
    }

    // Кнопка "Очистить роль" в панели выбора роли подразделения
    else if (customId.startsWith('admin_sub_editor_role_clear_')) {
      const parts = customId.replace('admin_sub_editor_role_clear_', '').split('_');
      const factionId = safeParseInt(parts[0]);
      const subId = safeParseInt(parts[1]);
      const { setAdminSubDraft } = await import('./admin-panel-modal');
      setAdminSubDraft(subId, { discord_role_id: null });
      const panel = await buildAdminSubEditorRolePanel(factionId, subId, null);
      await interaction.editReply(panel);
    }

    // Сохранение изменений подразделения (применить draft в БД)
    else if (customId.startsWith('admin_sub_editor_save_')) {
      const parts = customId.replace('admin_sub_editor_save_', '').split('_');
      const factionId = safeParseInt(parts[0]);
      const subId = safeParseInt(parts[1]);

      const { getAdminSubDraft, clearAdminSubDraft } = await import('./admin-panel-modal');
      const draftData = getAdminSubDraft(subId);

      if (!draftData || Object.keys(draftData).length === 0) {
        await interaction.editReply({
          content: `${EMOJI.WARNING} Нет изменений для сохранения`,
          embeds: [],
          components: [],
        });
        return;
      }

      await SubdivisionService.updateSubdivision(subId, draftData as any);
      clearAdminSubDraft(subId);

      logger.info('Subdivision updated via admin editor', {
        subdivisionId: subId,
        factionId,
        userId: interaction.user.id,
        changes: Object.keys(draftData),
      });

      // Вернуться к списку подразделений
      const faction = await FactionService.getFactionById(factionId);
      if (!faction) {
        throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
      }
      const { SubdivisionModel } = await import('../../database/models');
      const allSubs = await SubdivisionModel.findByFactionId(factionId);
      const nonDefault = allSubs.filter((s: any) => !s.is_default);
      const panel = buildFactionSubdivisionsPanel(faction, nonDefault);
      await interaction.editReply(panel);

      await interaction.followUp({
        content: `${EMOJI.SUCCESS} Подразделение успешно обновлено!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Кнопка "Роль" в редакторе шаблона — переход на панель выбора роли
    else if (customId.startsWith('template_set_role_')) {
      const parts = customId.replace('template_set_role_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);
      const { getTemplateDraft } = await import('./admin-panel-modal');
      const draft = getTemplateDraft(typeId, templateId);
      const draftRoleId = draft?.discord_role_id;
      const panel = await buildTemplateRolePanel(typeId, templateId, draftRoleId);
      await interaction.editReply(panel);
    }

    // Кнопка "Назад к шаблону" в панели выбора роли шаблона
    else if (customId.startsWith('admin_template_role_back_')) {
      const parts = customId.replace('admin_template_role_back_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);
      const { getTemplateDraft } = await import('./admin-panel-modal');
      const draftData = getTemplateDraft(typeId, templateId);
      const panel = await buildTemplateEditorPanel(typeId, templateId, draftData || undefined);
      await interaction.editReply(panel);
    }

    // Кнопка "Очистить роль" в панели выбора роли шаблона
    else if (customId.startsWith('admin_template_role_clear_')) {
      const parts = customId.replace('admin_template_role_clear_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);
      const { setTemplateDraft } = await import('./admin-panel-modal');
      setTemplateDraft(typeId, templateId, { discord_role_id: null });
      const panel = await buildTemplateRolePanel(typeId, templateId, null);
      await interaction.editReply(panel);
    }

    // Обработчик кнопки "Назад" из панели подразделений к деталям фракции
    else if (customId.startsWith('admin_faction_')) {
      const factionId = safeParseInt(customId.replace('admin_faction_', ''));
      const faction = await FactionService.getFactionById(factionId);
      if (!faction) {
        await interaction.editReply({ content: `${EMOJI.ERROR} Фракция не найдена`, embeds: [], components: [] });
        return;
      }
      const panel = buildFactionDetailPanel(faction);
      await interaction.editReply(panel);
    }

    // === Управление типами фракций ===

    // Открыть секцию управления типами
    else if (customId === 'admin_fact_types' || customId === 'admin_back_to_fact_types') {
      const panel = await buildFactionTypesSection(server);
      await interaction.editReply(panel);
    }

    // Просмотр деталей типа фракции
    else if (customId.startsWith('admin_view_fact_type_')) {
      const typeId = safeParseInt(customId.replace('admin_view_fact_type_', ''));
      const panel = await buildFactionTypeDetailPanel(typeId);
      await interaction.editReply(panel);
    }

    // Открыть редактор embed-настроек типа фракции
    else if (customId.startsWith('admin_type_embed_')) {
      const typeId = safeParseInt(customId.replace('admin_type_embed_', ''));
      const { getFactionTypeDraft } = await import('./admin-panel-modal');
      const draft = getFactionTypeDraft(typeId);
      const panel = await buildFactionTypeEmbedEditorPanel(typeId, draft);
      await interaction.editReply(panel);
    }

    // Сохранить embed-настройки типа фракции
    else if (customId.startsWith('type_embed_save_')) {
      const typeId = safeParseInt(customId.replace('type_embed_save_', ''));
      const { getFactionTypeDraft, clearFactionTypeDraft } = await import('./admin-panel-modal');
      const draftData = getFactionTypeDraft(typeId);

      if (!draftData || Object.keys(draftData).length === 0) {
        await interaction.editReply({ content: `${EMOJI.WARNING} Нет изменений для сохранения`, embeds: [], components: [] });
        return;
      }

      await FactionTypeService.updateFactionTypeEmbed(typeId, draftData as any);
      clearFactionTypeDraft(typeId);

      const panel = await buildFactionTypeDetailPanel(typeId);
      await interaction.editReply(panel);

      await interaction.followUp({
        content: `${EMOJI.SUCCESS} Embed-настройки типа сохранены.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Кнопка роли в редакторе типа (не применима на уровне типа)
    else if (customId.startsWith('type_embed_set_role_')) {
      const typeId = safeParseInt(customId.replace('type_embed_set_role_', ''));
      await interaction.editReply({
        content: '',
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setDescription('ℹ️ Роль задаётся на уровне шаблона подразделения, а не на уровне типа.'),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`admin_type_embed_${typeId}`)
              .setLabel('Назад')
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    }

    // Кнопки редактирования полей embed типа фракции (показывают modal)
    else if (customId.startsWith('type_embed_edit_')) {
      const { getFactionTypeDraft } = await import('./admin-panel-modal');
      const typeId = safeParseInt(customId.replace(/^type_embed_edit_[^_]+_/, ''));
      const draft = getFactionTypeDraft(typeId);
      const type = await FactionTypeService.getFactionTypeById(typeId);
      const current = type ? { ...type, ...draft } : draft;

      let field = '';
      if (customId.startsWith('type_embed_edit_name_')) field = 'name';
      else if (customId.startsWith('type_embed_edit_logo_')) field = 'logo';
      else if (customId.startsWith('type_embed_edit_short_desc_')) field = 'short_desc';
      else if (customId.startsWith('type_embed_edit_author_')) field = 'author';
      else if (customId.startsWith('type_embed_edit_title_')) field = 'title';
      else if (customId.startsWith('type_embed_edit_thumbnail_')) field = 'thumbnail';
      else if (customId.startsWith('type_embed_edit_description_')) field = 'description';
      else if (customId.startsWith('type_embed_edit_image_')) field = 'image';
      else if (customId.startsWith('type_embed_edit_color_')) field = 'color';
      else if (customId.startsWith('type_embed_edit_footer_')) field = 'footer';

      if (field) {
        const currentValues = {
          name: current?.name,
          logo_url: current?.logo_url,
          short_description: current?.short_description,
          embed_author_name: current?.embed_author_name,
          embed_author_url: current?.embed_author_url,
          embed_author_icon_url: current?.embed_author_icon_url,
          embed_title: current?.embed_title,
          embed_title_url: current?.embed_title_url,
          embed_thumbnail_url: current?.embed_thumbnail_url,
          embed_description: current?.embed_description,
          embed_image_url: current?.embed_image_url,
          embed_color: current?.embed_color,
          embed_footer_text: current?.embed_footer_text,
          embed_footer_icon_url: current?.embed_footer_icon_url,
        };
        const modal = buildSubdivisionEmbedFieldModal(
          field as Parameters<typeof buildSubdivisionEmbedFieldModal>[0],
          `type_embed_modal_${field}_${typeId}`,
          currentValues,
          'type_name',
        );
        await interaction.showModal(modal);
      }
    }

    // Создание нового типа фракции (показать modal)
    else if (customId === 'admin_create_fact_type') {
      const modal = new ModalBuilder()
        .setCustomId('admin_modal_create_fact_type')
        .setTitle('Создание типа фракции');

      const nameInput = new TextInputBuilder()
        .setCustomId('type_name')
        .setLabel('Название типа')
        .setPlaceholder('Например: Полицейская фракция')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50);

      const descInput = new TextInputBuilder()
        .setCustomId('type_description')
        .setLabel('Описание (опционально)')
        .setPlaceholder('Краткое описание типа фракции')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      );

      await interaction.showModal(modal);
    }

    // Редактирование типа фракции (показать modal)
    else if (customId.startsWith('admin_edit_fact_type_')) {
      const typeId = safeParseInt(customId.replace('admin_edit_fact_type_', ''));
      const factionType = await FactionTypeService.getFactionTypeById(typeId);

      if (!factionType) {
        await interaction.reply({
          content: `${EMOJI.ERROR} Тип фракции не найден`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`admin_modal_edit_fact_type_${typeId}`)
        .setTitle(`Редактировать: ${factionType.name}`);

      const nameInput = new TextInputBuilder()
        .setCustomId('type_name')
        .setLabel('Название типа')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50)
        .setValue(factionType.name);

      const descInput = new TextInputBuilder()
        .setCustomId('type_description')
        .setLabel('Описание (опционально)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200)
        .setValue(factionType.description || '');

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      );

      await interaction.showModal(modal);
    }

    // Добавление шаблона подразделения (показать modal)
    else if (customId.startsWith('admin_add_template_')) {
      const typeId = safeParseInt(customId.replace('admin_add_template_', ''));

      const modal = new ModalBuilder()
        .setCustomId(`admin_modal_add_template_${typeId}`)
        .setTitle('Добавление шаблона подразделения');

      const nameInput = new TextInputBuilder()
        .setCustomId('template_name')
        .setLabel('Название подразделения')
        .setPlaceholder('Например: Патруль')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50);

      const descInput = new TextInputBuilder()
        .setCustomId('template_description')
        .setLabel('Описание (опционально)')
        .setPlaceholder('Краткое описание подразделения')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      );

      await interaction.showModal(modal);
    }

    // Открыть интерактивный редактор шаблона
    else if (customId.startsWith('admin_edit_template_')) {
      const parts = customId.replace('admin_edit_template_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const panel = await buildTemplateEditorPanel(typeId, templateId);
      await interaction.editReply(panel);
    }

    // Удаление типа фракции
    else if (customId.startsWith('admin_delete_fact_type_')) {
      const typeId = safeParseInt(customId.replace('admin_delete_fact_type_', ''));

      try {
        await FactionTypeService.deleteFactionType(typeId);

        logger.info('Faction type deleted via admin panel', {
          typeId,
          userId: interaction.user.id,
        });

        // Вернуться к списку типов
        const panel = await buildFactionTypesSection(server);
        await interaction.editReply(panel);
      } catch (error) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Не удалось удалить тип фракции`,
          embeds: [],
          components: [],
        });
      }
    }

    // Удаление шаблона подразделения
    else if (customId.startsWith('admin_delete_template_')) {
      const parts = customId.replace('admin_delete_template_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      try {
        await FactionTypeService.deleteTemplate(templateId);

        logger.info('Subdivision template deleted via admin panel', {
          templateId,
          typeId,
          userId: interaction.user.id,
        });

        // Вернуться к деталям типа
        const panel = await buildFactionTypeDetailPanel(typeId);
        await interaction.editReply(panel);
      } catch (error) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Не удалось удалить шаблон`,
          embeds: [],
          components: [],
        });
      }
    }

    // === Редактирование полей шаблона подразделения ===

    // Редактирование названия шаблона
    else if (customId.startsWith('template_edit_name_')) {
      const parts = customId.replace('template_edit_name_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_name_${typeId}_${templateId}`)
        .setTitle('Редактирование названия');

      const nameInput = new TextInputBuilder()
        .setCustomId('template_name')
        .setLabel('Название подразделения')
        .setPlaceholder('Например: Патруль')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
      await interaction.showModal(modal);
    }

    // Редактирование заголовка embed (объединённый модал: заголовок + URL заголовка)
    else if (customId.startsWith('template_edit_title_')) {
      const parts = customId.replace('template_edit_title_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_title_${typeId}_${templateId}`)
        .setTitle('Редактирование заголовка Embed');

      const titleInput = new TextInputBuilder()
        .setCustomId('embed_title')
        .setLabel('Заголовок Embed')
        .setPlaceholder('Оставьте пустым для использования названия')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256);

      const titleUrlInput = new TextInputBuilder()
        .setCustomId('embed_title_url')
        .setLabel('URL заголовка (кликабельная ссылка)')
        .setPlaceholder('https://example.com')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleUrlInput),
      );
      await interaction.showModal(modal);
    }

    // Редактирование описания
    else if (customId.startsWith('template_edit_description_')) {
      const parts = customId.replace('template_edit_description_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      logger.debug('Parsing template_edit_description customId', {
        customId,
        parts,
        typeId,
        templateId,
        isTypeIdNaN: isNaN(typeId),
        isTemplateIdNaN: isNaN(templateId),
      });

      if (isNaN(typeId) || isNaN(templateId)) {
        throw new Error(`Invalid number value: typeId=${typeId}, templateId=${templateId}`);
      }

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_description_${typeId}_${templateId}`)
        .setTitle('Редактирование описания');

      const descInput = new TextInputBuilder()
        .setCustomId('embed_description')
        .setLabel('Описание Embed')
        .setPlaceholder('Описание каллаута для этого подразделения')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(descInput));
      await interaction.showModal(modal);
    }

    // Редактирование цвета
    else if (customId.startsWith('template_edit_color_')) {
      const parts = customId.replace('template_edit_color_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_color_${typeId}_${templateId}`)
        .setTitle('Редактирование цвета Embed');

      const colorInput = new TextInputBuilder()
        .setCustomId('embed_color')
        .setLabel('Цвет Embed (HEX)')
        .setPlaceholder('#FF5733 или FF5733')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMinLength(6)
        .setMaxLength(7);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput));
      await interaction.showModal(modal);
    }

    // Редактирование автора
    else if (customId.startsWith('template_edit_author_')) {
      const parts = customId.replace('template_edit_author_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_author_${typeId}_${templateId}`)
        .setTitle('Редактирование автора Embed');

      const authorNameInput = new TextInputBuilder()
        .setCustomId('embed_author_name')
        .setLabel('Имя автора')
        .setPlaceholder('Название организации')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256);

      const authorUrlInput = new TextInputBuilder()
        .setCustomId('embed_author_url')
        .setLabel('URL автора (опционально)')
        .setPlaceholder('https://example.com')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const authorIconInput = new TextInputBuilder()
        .setCustomId('embed_author_icon_url')
        .setLabel('URL иконки автора (опционально)')
        .setPlaceholder('https://example.com/icon.png')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(authorNameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(authorUrlInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(authorIconInput)
      );
      await interaction.showModal(modal);
    }

    // Редактирование футера
    else if (customId.startsWith('template_edit_footer_')) {
      const parts = customId.replace('template_edit_footer_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_footer_${typeId}_${templateId}`)
        .setTitle('Редактирование футера Embed');

      const footerTextInput = new TextInputBuilder()
        .setCustomId('embed_footer_text')
        .setLabel('Текст футера')
        .setPlaceholder('Нижний текст Embed')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048);

      const footerIconInput = new TextInputBuilder()
        .setCustomId('embed_footer_icon_url')
        .setLabel('URL иконки футера (опционально)')
        .setPlaceholder('https://example.com/icon.png')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(footerTextInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(footerIconInput)
      );
      await interaction.showModal(modal);
    }

    // Редактирование изображения
    else if (customId.startsWith('template_edit_image_')) {
      const parts = customId.replace('template_edit_image_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_image_${typeId}_${templateId}`)
        .setTitle('Редактирование изображения Embed');

      const imageInput = new TextInputBuilder()
        .setCustomId('embed_image_url')
        .setLabel('URL изображения')
        .setPlaceholder('https://example.com/image.png')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput));
      await interaction.showModal(modal);
    }

    // Редактирование миниатюры
    else if (customId.startsWith('template_edit_thumbnail_')) {
      const parts = customId.replace('template_edit_thumbnail_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_thumbnail_${typeId}_${templateId}`)
        .setTitle('Редактирование миниатюры Embed');

      const thumbnailInput = new TextInputBuilder()
        .setCustomId('embed_thumbnail_url')
        .setLabel('URL миниатюры')
        .setPlaceholder('https://example.com/thumbnail.png')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(thumbnailInput));
      await interaction.showModal(modal);
    }

    // Редактирование краткого описания шаблона
    else if (customId.startsWith('template_edit_short_desc_')) {
      const parts = customId.replace('template_edit_short_desc_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const { SubdivisionTemplateModel } = await import('../../database/models/SubdivisionTemplate');
      const template = await SubdivisionTemplateModel.findById(templateId);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_short_desc_${typeId}_${templateId}`)
        .setTitle('Краткое описание шаблона');

      const input = new TextInputBuilder()
        .setCustomId('short_description')
        .setLabel('Краткое описание')
        .setPlaceholder('Отображается в списке каллаутов (до 100 символов)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100)
        .setValue(template?.short_description ?? '');

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await interaction.showModal(modal);
    }

    // Редактирование логотипа шаблона
    else if (customId.startsWith('template_edit_logo_')) {
      const parts = customId.replace('template_edit_logo_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      const { SubdivisionTemplateModel } = await import('../../database/models/SubdivisionTemplate');
      const template = await SubdivisionTemplateModel.findById(templateId);

      const modal = new ModalBuilder()
        .setCustomId(`template_modal_logo_${typeId}_${templateId}`)
        .setTitle('Эмодзи шаблона');

      const input = new TextInputBuilder()
        .setCustomId('logo_url')
        .setLabel('Эмодзи шаблона')
        .setPlaceholder('ID, <:name:id> или 🏢')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(template?.logo_url ?? '');

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await interaction.showModal(modal);
    }

    // Сохранение изменений шаблона
    else if (customId.startsWith('template_save_')) {
      const parts = customId.replace('template_save_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);

      try {
        // Получить draft изменения (импортируем функцию из admin-panel-modal)
        const { getTemplateDraft, clearTemplateDraft } = await import('./admin-panel-modal');
        const draftData = getTemplateDraft(typeId, templateId);

        if (!draftData || Object.keys(draftData).length === 0) {
          await interaction.editReply({
            content: `${EMOJI.WARNING} Нет изменений для сохранения`,
            embeds: [],
            components: [],
          });
          return;
        }

        // Преобразовать null в undefined для совместимости с DTO
        const updateData: any = {};
        for (const [key, value] of Object.entries(draftData)) {
          updateData[key] = value === null ? undefined : value;
        }

        // Обновить шаблон в БД
        await FactionTypeService.updateTemplate(templateId, updateData);

        // Очистить draft
        clearTemplateDraft(typeId, templateId);

        logger.info('Template updated via editor', {
          templateId,
          typeId,
          userId: interaction.user.id,
          changes: Object.keys(draftData),
        });

        // Показать обновленную панель типа
        const panel = await buildFactionTypeDetailPanel(typeId);
        await interaction.editReply(panel);

        await interaction.followUp({
          content: `${EMOJI.SUCCESS} Шаблон успешно обновлен!`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        logger.error('Failed to save template', {
          error: error instanceof Error ? error.message : error,
          typeId,
          templateId,
        });

        await interaction.editReply({
          content: `${EMOJI.ERROR} Не удалось сохранить изменения`,
          embeds: [],
          components: [],
        });
      }
    }

    // === Система одобрения изменений ===

    // Открыть список pending изменений
    else if (customId === 'admin_view_pending_changes') {
      const panel = await buildPendingChangesPanel(server.id);
      await interaction.editReply(panel);
    }

    // Просмотр деталей конкретного изменения
    else if (customId.startsWith('admin_review_change_')) {
      const changeId = safeParseInt(customId.replace('admin_review_change_', ''));
      const panel = await buildReviewChangePanel(changeId);
      await interaction.editReply(panel);
    }

    // Одобрение изменения
    else if (customId.startsWith('admin_approve_change_')) {
      const changeId = safeParseInt(customId.replace('admin_approve_change_', ''));

      try {
        if (!interaction.guild) {
          throw new Error('Guild not found');
        }

        await PendingChangeService.approveChange(changeId, interaction.user.id, interaction.guild);

        logger.info('Change approved via admin panel', {
          changeId,
          userId: interaction.user.id,
        });

        // Вернуться к списку pending
        const panel = await buildPendingChangesPanel(server.id);
        await interaction.editReply(panel);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось одобрить изменение';
        await interaction.editReply({
          content: `${EMOJI.ERROR} ${message}`,
          embeds: [],
          components: [],
        });
      }
    }

    // Отклонение изменения (показать modal для причины)
    else if (customId.startsWith('admin_reject_change_')) {
      const changeId = safeParseInt(customId.replace('admin_reject_change_', ''));

      const modal = new ModalBuilder()
        .setCustomId(`admin_modal_reject_change_${changeId}`)
        .setTitle('Отклонение изменения');

      const reasonInput = new TextInputBuilder()
        .setCustomId('rejection_reason')
        .setLabel('Причина отклонения')
        .setPlaceholder('Укажите причину...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(200);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
      );

      await interaction.showModal(modal);
    }

    // === Flow создания фракции - выбор типа ===

    // Шаг 3: Выбран конкретный тип фракции
    else if (customId.startsWith('admin_fact_step3_type_')) {
      const typeId = safeParseInt(customId.replace('admin_fact_step3_type_', ''));

      const state = addFactionStates.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!state || !state.generalLeaderRoleId || !state.departmentRoleId) {
        await interaction.reply({
          content: `${EMOJI.ERROR} Сессия добавления истекла. Попробуйте снова.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      state.selectedTypeId = typeId;

      // Показать modal для названия и описания
      const modal = new ModalBuilder()
        .setCustomId('admin_modal_add_fact')
        .setTitle('Добавление фракции — Шаг 4/4');

      const nameInput = new TextInputBuilder()
        .setCustomId('dept_name')
        .setLabel('Название фракции')
        .setPlaceholder('Например: LSPD')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50);

      const descInput = new TextInputBuilder()
        .setCustomId('dept_description')
        .setLabel('Описание (опционально)')
        .setPlaceholder('Краткое описание фракции')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);

      const emojiInput = new TextInputBuilder()
        .setCustomId('dept_emoji')
        .setLabel('Эмодзи фракции (опционально)')
        .setPlaceholder('Кастомное: <:name:id> или unicode: 🚔')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(emojiInput),
      );

      await interaction.showModal(modal);
    }

    // Шаг 3: Без типа фракции
    else if (customId === 'admin_fact_step3_no_type') {
      const state = addFactionStates.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!state || !state.generalLeaderRoleId || !state.departmentRoleId) {
        await interaction.reply({
          content: `${EMOJI.ERROR} Сессия добавления истекла. Попробуйте снова.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // selectedTypeId остается undefined

      // Показать modal для названия и описания
      const modal = new ModalBuilder()
        .setCustomId('admin_modal_add_fact')
        .setTitle('Добавление фракции — Шаг 4/4');

      const nameInput = new TextInputBuilder()
        .setCustomId('dept_name')
        .setLabel('Название фракции')
        .setPlaceholder('Например: LSPD')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(50);

      const descInput = new TextInputBuilder()
        .setCustomId('dept_description')
        .setLabel('Описание (опционально)')
        .setPlaceholder('Краткое описание фракции')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);

      const emojiInput = new TextInputBuilder()
        .setCustomId('dept_emoji')
        .setLabel('Эмодзи фракции (опционально)')
        .setPlaceholder('Кастомное: <:name:id> или unicode: 🚔')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(emojiInput),
      );

      await interaction.showModal(modal);
    }

    // Кнопка "Настроить Embed" в панели управления подразделением (открывает интерактивный редактор)
    else if (customId.startsWith('admin_sub_configure_embed_')) {
      const parts = customId.replace('admin_sub_configure_embed_', '').split('_');
      const factionId = safeParseInt(parts[0]);
      const subdivisionId = safeParseInt(parts[1]);
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) {
        throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      }
      const { getAdminSubDraft } = await import('./admin-panel-modal');
      const draft = getAdminSubDraft(subdivisionId);
      const panel = await buildAdminSubdivisionEditorPanel(factionId, subdivision, draft);
      await interaction.editReply(panel);
    }

    // Кнопка "Привязки" — открывает панель VK/Telegram привязок подразделения
    else if (customId.startsWith('admin_sub_links_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_sub_links_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      await interaction.editReply(buildAdminLinksPanel(subdivision));
    }

    // Кнопка "Назад" из панели привязок — возвращает на панель управления подразделением
    else if (customId.startsWith('admin_sub_settings_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_sub_settings_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      await interaction.editReply(buildAdminSubdivisionSettingsPanel(subdivision, subdivision.faction_id));
    }

    // Кнопка "Отключить/Включить каллауты"
    else if (customId.startsWith('admin_toggle_callouts_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_toggle_callouts_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      const newStatus = !subdivision.is_accepting_callouts;
      await SubdivisionService.toggleCallouts(subdivisionId, newStatus);
      const updated = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (updated) await interaction.editReply(buildAdminSubdivisionSettingsPanel(updated, updated.faction_id));
    }

    // Кнопка "Привязать VK" — генерирует токен верификации и показывает инструкции
    else if (customId.startsWith('admin_link_vk_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_link_vk_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      const token = await VerificationService.generateVerificationToken({
        server_id: subdivision.server_id,
        subdivision_id: subdivisionId,
        created_by: interaction.user.id,
      });
      const instructions = await VerificationService.generateInstructions(token.id);
      const panel = buildVerificationInstructions(instructions);
      const message = await interaction.editReply(panel);
      const { VerificationTokenModel } = await import('../../database/models');
      await VerificationTokenModel.updateDiscordMessage(token.id, interaction.channelId, message.id, interaction.token, interaction.client.application.id);
    }

    // Кнопка "Отвязать VK"
    else if (customId.startsWith('admin_unlink_vk_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_unlink_vk_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      if (!subdivision.vk_chat_id) throw new CalloutError('VK беседа не привязана', 'VK_NOT_LINKED', 400);
      const updated = await SubdivisionService.sendVkGoodbyeAndUnlink(subdivisionId);
      if (updated) await interaction.editReply(buildAdminLinksPanel(updated));
    }

    // Кнопка "Привязать Telegram" — генерирует токен верификации
    else if (customId.startsWith('admin_link_telegram_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_link_telegram_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      const token = await VerificationService.generateVerificationToken({
        server_id: subdivision.server_id,
        subdivision_id: subdivisionId,
        created_by: interaction.user.id,
        platform: 'telegram',
      });
      const instructions = await VerificationService.generateInstructions(token.id);
      const panel = buildVerificationInstructions(instructions);
      const message = await interaction.editReply(panel);
      const { VerificationTokenModel } = await import('../../database/models');
      await VerificationTokenModel.updateDiscordMessage(token.id, interaction.channelId, message.id, interaction.token, interaction.client.application.id);
    }

    // Кнопка "Отвязать Telegram"
    else if (customId.startsWith('admin_unlink_telegram_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_unlink_telegram_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      if (!subdivision.telegram_chat_id) throw new CalloutError('Telegram группа не привязана', 'TELEGRAM_NOT_LINKED', 400);
      const updated = await SubdivisionService.sendTelegramGoodbyeAndUnlink(subdivisionId);
      if (updated) await interaction.editReply(buildAdminLinksPanel(updated));
    }

    // Кнопка "Удалить подразделение" — показывает подтверждение
    else if (customId.startsWith('admin_delete_sub_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_delete_sub_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      await interaction.editReply(buildAdminDeleteConfirmation(subdivision));
    }

    // Подтверждение удаления подразделения
    else if (customId.startsWith('admin_confirm_delete_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_confirm_delete_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      const factionId = subdivision.faction_id;
      await SubdivisionService.deleteSubdivision(subdivisionId);
      const faction = await FactionService.getFactionById(factionId);
      if (faction) {
        const { SubdivisionModel } = await import('../../database/models');
        const allSubs = await SubdivisionModel.findByFactionId(factionId);
        const nonDefault = allSubs.filter((s: any) => !s.is_default);
        await interaction.editReply(buildFactionSubdivisionsPanel(faction, nonDefault));
      }
    }

    // Отмена удаления подразделения
    else if (customId.startsWith('admin_cancel_delete_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_cancel_delete_', ''));
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      await interaction.editReply(buildAdminSubdivisionSettingsPanel(subdivision, subdivision.faction_id));
    }

  } catch (error) {
    try {
      await handleInteractionError(error, interaction, 'Error handling admin panel button', `${EMOJI.ERROR} Произошла ошибка`, { clearUI: true });
    } catch (replyError) {
      logger.error('Failed to send error message to user', {
        error: replyError instanceof Error ? replyError.message : replyError,
        originalError: error instanceof Error ? error.message : error,
      });
    }
  }
}

/**
 * Обработчик RoleSelectMenu для админ-панели
 */
export async function handleAdminRoleSelect(interaction: RoleSelectMenuInteraction) {
  // Немедленно подтвердить взаимодействие
  await interaction.deferUpdate();

  const ctx = await getAdminContext(interaction);
  if (!ctx) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Произошла ошибка. Проверьте настройки сервера.`,
    });
    return;
  }

  const { server } = ctx;
  const customId = interaction.customId;

  try {
    // Добавление лидерской роли
    if (customId === 'admin_add_leader_role') {
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

      if (interaction.guild) {
        const calloutRoleAddedData: CalloutRoleData = {
          userId: interaction.user.id,
          userName: interaction.user.tag,
          roleId,
        };
        await logAuditEvent(interaction.guild, AuditEventType.CALLOUT_ROLE_ADDED, calloutRoleAddedData);
      }

      const updatedServer = await ServerModel.findById(server.id);
      const panel = buildCalloutRolesSection(updatedServer || freshServer);
      await interaction.editReply(panel);
    }

    // Шаг 1 добавления фракции — выбрана общая лидерская роль
    else if (customId === 'admin_fact_step1_role') {
      const roleId = interaction.values[0];

      const state = addFactionStates.get(`${interaction.guildId}:${interaction.user.id}`);
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
        .setTitle('➕ Добавление фракции — Шаг 2/3')
        .setDescription(`Общая лидерская роль: <@&${roleId}>\n\nТеперь выберите **роль фракции** (например: LSPD)`)
        .setTimestamp();

      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('admin_fact_step2_role')
        .setPlaceholder('Выберите роль фракции');

      const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
      );

      await interaction.editReply({ embeds: [embed], components: [row, backRow] });
    }

    // Шаг 2 добавления фракции — выбрана роль фракции → выбор типа
    else if (customId === 'admin_fact_step2_role') {
      const roleId = interaction.values[0];

      const state = addFactionStates.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!state || !state.generalLeaderRoleId) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Сессия добавления истекла. Попробуйте снова.`,
          embeds: [],
          components: [],
        });
        return;
      }

      state.departmentRoleId = roleId;

      // Получить доступные типы фракций
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

      const buttons: ButtonBuilder[] = [];

      // Кнопки для каждого типа (максимум 4, чтобы уместились)
      const displayTypes = types.slice(0, 4);
      for (const type of displayTypes) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`admin_fact_step3_type_${type.id}`)
            .setLabel(type.name)
            .setStyle(ButtonStyle.Primary)
        );
      }

      // Кнопка "Без типа"
      buttons.push(
        new ButtonBuilder()
          .setCustomId('admin_fact_step3_no_type')
          .setLabel('Без типа')
          .setStyle(ButtonStyle.Secondary)
      );

      const rows: ActionRowBuilder<ButtonBuilder>[] = [];

      // Первый ряд - типы (до 4 кнопок)
      if (displayTypes.length > 0) {
        const typeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...buttons.slice(0, displayTypes.length)
        );
        rows.push(typeRow);
      }

      // Второй ряд - "Без типа" + "Отмена"
      const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttons[buttons.length - 1], // Без типа
        new ButtonBuilder()
          .setCustomId('admin_factions')
          .setLabel('Отмена')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger)
      );
      rows.push(controlRow);

      await interaction.editReply({ embeds: [embed], components: rows });
    }

    // Выбор роли для шаблона подразделения
    else if (customId.startsWith('admin_template_role_')) {
      const parts = customId.replace('admin_template_role_', '').split('_');
      const typeId = safeParseInt(parts[0]);
      const templateId = safeParseInt(parts[1]);
      const roleId = interaction.values[0];

      const { setTemplateDraft } = await import('./admin-panel-modal');
      setTemplateDraft(typeId, templateId, { discord_role_id: roleId });

      logger.info('Template role set via admin panel', { templateId, roleId, userId: interaction.user.id });

      const panel = await buildTemplateRolePanel(typeId, templateId, roleId);
      await interaction.editReply(panel);

      await interaction.followUp({
        content: `${EMOJI.SUCCESS} Роль <@&${roleId}> установлена. Нажмите "Сохранить" в редакторе шаблона.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Выбор роли для подразделения в редакторе (draft-based, сохраняется вместе с остальными данными)
    else if (customId.startsWith('admin_sub_editor_role_')) {
      const parts = customId.replace('admin_sub_editor_role_', '').split('_');
      const factionId = safeParseInt(parts[0]);
      const subId = safeParseInt(parts[1]);
      const roleId = interaction.values[0];

      const { setAdminSubDraft } = await import('./admin-panel-modal');
      setAdminSubDraft(subId, { discord_role_id: roleId });

      logger.info('Admin sub editor role set via draft', { subdivisionId: subId, roleId, userId: interaction.user.id });

      const panel = await buildAdminSubEditorRolePanel(factionId, subId, roleId);
      await interaction.editReply(panel);

      await interaction.followUp({
        content: `${EMOJI.SUCCESS} Роль <@&${roleId}> установлена. Нажмите "Назад к редактору" и "Сохранить" для применения.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Выбор роли для подразделения (прямое обновление администратором без pending)
    else if (customId.startsWith('admin_sub_role_')) {
      const subdivisionId = safeParseInt(customId.replace('admin_sub_role_', ''));
      const roleId = interaction.values[0];

      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) {
        throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
      }

      await SubdivisionService.updateSubdivision(subdivisionId, { discord_role_id: roleId });
      logger.info('Subdivision role set directly via admin panel', { subdivisionId, roleId, userId: interaction.user.id });

      const updated = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (updated) {
        const panel = buildAdminSubdivisionSettingsPanel(updated, updated.faction_id);
        await interaction.editReply(panel);
      }
    }

  } catch (error) {
    await handleInteractionError(error, interaction, 'Error handling admin role select', `${EMOJI.ERROR} Произошла ошибка`, { clearUI: true });
  }
}

/**
 * Обработчик ChannelSelectMenu для админ-панели (audit log)
 */
export async function handleAdminChannelSelect(interaction: ChannelSelectMenuInteraction) {
  // Немедленно подтвердить взаимодействие
  await interaction.deferUpdate();

  const ctx = await getAdminContext(interaction);
  if (!ctx) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Произошла ошибка. Проверьте настройки сервера.`,
    });
    return;
  }

  const { server } = ctx;
  const customId = interaction.customId;

  try {
    if (customId === 'admin_set_audit_channel') {
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
    await handleInteractionError(error, interaction, 'Error handling admin channel select', `${EMOJI.ERROR} Произошла ошибка`, { clearUI: true });
  }
}

/**
 * Обработчик StringSelectMenu для админ-панели
 */
export async function handleAdminStringSelect(interaction: StringSelectMenuInteraction) {
  // Немедленно подтвердить взаимодействие
  await interaction.deferUpdate();

  const ctx = await getAdminContext(interaction);
  if (!ctx) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Произошла ошибка. Проверьте настройки сервера.`,
    });
    return;
  }

  const { server } = ctx;
  const customId = interaction.customId;

  try {
    // Выбор типа фракции для просмотра
    if (customId === 'admin_select_fact_type') {
      const typeId = safeParseInt(interaction.values[0]);
      const panel = await buildFactionTypeDetailPanel(typeId);
      await interaction.editReply(panel);
    }

    // Выбор шаблона подразделения для редактирования
    else if (customId.startsWith('admin_select_template_')) {
      const typeId = safeParseInt(customId.replace('admin_select_template_', ''));
      const templateId = safeParseInt(interaction.values[0]);
      const panel = await buildTemplateEditorPanel(typeId, templateId);
      await interaction.editReply(panel);
    }

    // Выбор подразделения для редактирования (из StringSelectMenu в панели подразделений фракции)
    else if (customId.startsWith('admin_sub_select_')) {
      const factionId = safeParseInt(customId.replace('admin_sub_select_', ''));
      const subdivisionId = safeParseInt(interaction.values[0]);
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision) {
        await interaction.editReply({ content: `${EMOJI.ERROR} Подразделение не найдено`, embeds: [], components: [] });
        return;
      }
      const panel = buildAdminSubdivisionSettingsPanel(subdivision, factionId);
      await interaction.editReply(panel);
    }

    // Выбор фракции для просмотра
    else if (customId === 'admin_select_faction') {
      const factionId = safeParseInt(interaction.values[0]);
      const faction = await FactionService.getFactionById(factionId);

      if (!faction) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Фракция не найдена`,
          embeds: [],
          components: [],
        });
        return;
      }

      const panel = buildFactionDetailPanel(faction);
      await interaction.editReply(panel);
    }

    // Удаление лидерской роли
    else if (customId === 'admin_remove_leader_role') {
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

      if (interaction.guild) {
        const calloutRoleRemovedData: CalloutRoleData = {
          userId: interaction.user.id,
          userName: interaction.user.tag,
          roleId,
        };
        await logAuditEvent(interaction.guild, AuditEventType.CALLOUT_ROLE_REMOVED, calloutRoleRemovedData);
      }

      const updatedServer = await ServerModel.findById(server.id);
      const panel = buildCalloutRolesSection(updatedServer || freshServer);
      await interaction.editReply(panel);
    }

  } catch (error) {
    await handleInteractionError(error, interaction, 'Error handling admin string select', `${EMOJI.ERROR} Произошла ошибка`, { clearUI: true });
  }
}

/**
 * Получить состояние добавления фракции (для modal)
 */
export function getAddFactionState(guildId: string, userId: string): AddFactionState | undefined {
  const key = `${guildId}:${userId}`;
  const state = addFactionStates.get(key);
  if (state && Date.now() - state.createdAt > STATE_TTL) {
    addFactionStates.delete(key);
    return undefined;
  }
  return state;
}

/**
 * Удалить состояние добавления фракции
 */
export function clearAddFactionState(guildId: string, userId: string): void {
  addFactionStates.delete(`${guildId}:${userId}`);
}

/**
 * Обработчик кнопок из Audit Log канала (audit_approve_change_, audit_reject_change_)
 * Кнопки появляются в сообщениях о pending-запросах с before/after diff
 */
export async function handleAuditLogButton(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  // Для reject показываем modal — не нужно deferUpdate
  const isReject = customId.startsWith('audit_reject_change_');

  if (!isReject) {
    try {
      await interaction.deferUpdate();
    } catch (error) {
      logger.error('Failed to defer audit log button', { error, customId });
      return;
    }
  }

  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isAdministrator(member)) {
    const errorMsg = `${EMOJI.ERROR} Только администраторы могут одобрять или отклонять изменения`;
    if (isReject) {
      await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.editReply({ content: errorMsg, embeds: [], components: [] });
    }
    return;
  }

  if (customId.startsWith('audit_approve_change_')) {
    const changeId = safeParseInt(customId.replace('audit_approve_change_', ''));

    try {
      await PendingChangeService.approveChange(changeId, interaction.user.id, interaction.guild);

      logger.info('Change approved from audit log', { changeId, userId: interaction.user.id });

      const resultEmbed = new EmbedBuilder()
        .setTitle(`✅ Изменение #${changeId} одобрено`)
        .setColor(COLORS.SUCCESS)
        .addFields({ name: 'Одобрил', value: `<@${interaction.user.id}>`, inline: true })
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed], components: [] });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось одобрить изменение';
      await interaction.editReply({ content: `${EMOJI.ERROR} ${msg}`, embeds: [], components: [] });
    }
  }

  else if (customId.startsWith('audit_reject_change_')) {
    const changeId = safeParseInt(customId.replace('audit_reject_change_', ''));

    const modal = new ModalBuilder()
      .setCustomId(`audit_modal_reject_change_${changeId}`)
      .setTitle('Отклонение изменения');

    const reasonInput = new TextInputBuilder()
      .setCustomId('rejection_reason')
      .setLabel('Причина отклонения')
      .setPlaceholder('Укажите причину...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(200);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
    );

    await interaction.showModal(modal);
  }
}
