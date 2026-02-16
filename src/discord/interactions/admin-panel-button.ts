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
} from '../utils/admin-panel-builder';
import { FactionTypeService } from '../../services/faction-type.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { EMOJI } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import {
  logAuditEvent,
  AuditEventType,
  LeaderRoleAddedData,
  LeaderRoleRemovedData,
  AuditLogChannelSetData,
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
  ];
  const isModalButton = modalButtons.some(prefix => customId === prefix || customId.startsWith(prefix)) ||
    customId.startsWith('admin_edit_faction_');

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
      addFactionStates.set(interaction.user.id, {
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
          .setCustomId('admin_factions')
          .setLabel('Отмена')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row, backRow] });
    }

    // Редактирование фракции (показать modal)
    else if (customId.startsWith('admin_edit_faction_')) {
      const factionId = parseInt(customId.replace('admin_edit_faction_', ''));
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

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      );

      await interaction.showModal(modal);
    }

    // Переключение разрешения на создание подразделений
    else if (customId.startsWith('admin_toggle_allow_create_')) {
      const factionId = parseInt(customId.replace('admin_toggle_allow_create_', ''));
      const faction = await FactionService.getFactionById(factionId);

      if (!faction) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Фракция не найдена`,
          embeds: [],
          components: [],
        });
        return;
      }

      // Переключить allow_create_subdivisions
      await FactionService.updateFaction(factionId, {
        allow_create_subdivisions: !faction.allow_create_subdivisions,
      });

      const updated = await FactionService.getFactionById(factionId);
      if (!updated) {
        throw new Error('Failed to retrieve updated faction');
      }

      const panel = buildFactionDetailPanel(updated);
      await interaction.editReply(panel);
    }

    // Удаление фракции — показать подтверждение
    else if (customId.startsWith('admin_delete_faction_')) {
      const factionId = parseInt(customId.replace('admin_delete_faction_', ''));
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
      const factionId = parseInt(customId.replace('admin_confirm_delete_fact_', ''));
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

    // === Управление типами фракций ===

    // Открыть секцию управления типами
    else if (customId === 'admin_fact_types' || customId === 'admin_back_to_fact_types') {
      const panel = await buildFactionTypesSection(server);
      await interaction.editReply(panel);
    }

    // Просмотр деталей типа фракции
    else if (customId.startsWith('admin_view_fact_type_')) {
      const typeId = parseInt(customId.replace('admin_view_fact_type_', ''));
      const panel = await buildFactionTypeDetailPanel(typeId);
      await interaction.editReply(panel);
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
      const typeId = parseInt(customId.replace('admin_edit_fact_type_', ''));
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
      const typeId = parseInt(customId.replace('admin_add_template_', ''));

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
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

      const panel = await buildTemplateEditorPanel(typeId, templateId);
      await interaction.editReply(panel);
    }

    // Удаление типа фракции
    else if (customId.startsWith('admin_delete_fact_type_')) {
      const typeId = parseInt(customId.replace('admin_delete_fact_type_', ''));

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
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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

    // Редактирование заголовка embed
    else if (customId.startsWith('template_edit_title_')) {
      const parts = customId.replace('template_edit_title_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput));
      await interaction.showModal(modal);
    }

    // Редактирование описания
    else if (customId.startsWith('template_edit_description_')) {
      const parts = customId.replace('template_edit_description_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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
        .setMaxLength(4096);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(descInput));
      await interaction.showModal(modal);
    }

    // Редактирование цвета
    else if (customId.startsWith('template_edit_color_')) {
      const parts = customId.replace('template_edit_color_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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

    // Сохранение изменений шаблона
    else if (customId.startsWith('template_save_')) {
      const parts = customId.replace('template_save_', '').split('_');
      const typeId = parseInt(parts[0]);
      const templateId = parseInt(parts[1]);

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
      const changeId = parseInt(customId.replace('admin_review_change_', ''));
      const panel = await buildReviewChangePanel(changeId);
      await interaction.editReply(panel);
    }

    // Одобрение изменения
    else if (customId.startsWith('admin_approve_change_')) {
      const changeId = parseInt(customId.replace('admin_approve_change_', ''));

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
      const changeId = parseInt(customId.replace('admin_reject_change_', ''));

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
      const typeId = parseInt(customId.replace('admin_fact_step3_type_', ''));

      const state = addFactionStates.get(interaction.user.id);
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

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      );

      await interaction.showModal(modal);
    }

    // Шаг 3: Без типа фракции
    else if (customId === 'admin_fact_step3_no_type') {
      const state = addFactionStates.get(interaction.user.id);
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

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      );

      await interaction.showModal(modal);
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

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, embeds: [], components: [] });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
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

      const updatedServer = await ServerModel.findById(server.id);
      const panel = buildCalloutRolesSection(updatedServer || freshServer);
      await interaction.editReply(panel);
    }

    // Шаг 1 добавления фракции — выбрана общая лидерская роль
    else if (customId === 'admin_fact_step1_role') {
      const roleId = interaction.values[0];

      const state = addFactionStates.get(interaction.user.id);
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

      const state = addFactionStates.get(interaction.user.id);
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
    // Выбор фракции для просмотра
    if (customId === 'admin_select_faction') {
      const factionId = parseInt(interaction.values[0]);
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
 * Получить состояние добавления фракции (для modal)
 */
export function getAddFactionState(userId: string): AddFactionState | undefined {
  const state = addFactionStates.get(userId);
  if (state && Date.now() - state.createdAt > STATE_TTL) {
    addFactionStates.delete(userId);
    return undefined;
  }
  return state;
}

/**
 * Удалить состояние добавления фракции
 */
export function clearAddFactionState(userId: string): void {
  addFactionStates.delete(userId);
}
