import { ButtonInteraction, RoleSelectMenuInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { logAuditEvent, AuditEventType, SubdivisionToggleData } from '../utils/audit-logger';
import { FactionService } from '../../services/faction.service';
import { SubdivisionService } from '../../services/subdivision.service';
import { VerificationService } from '../../services/verification.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { getLeaderFaction } from '../utils/faction-permission-checker';
import {
  buildStandaloneSetupRequiredPanel,
  buildStandaloneMainPanel,
  buildMainPanel,
  buildSubdivisionsList,
  buildSubdivisionDetailPanel,
  buildLinksPanel,
  buildSettingsPanel,
  buildEmbedPreview,
  buildVerificationInstructions,
  buildDeleteConfirmation,
  buildSubdivisionEmbedEditorPanel,
  buildSubdivisionRolePanel,
  buildFactionCalloutHistoryPanel,
} from '../utils/faction-panel-builder';
import { buildSubdivisionSettingsModal, buildSubdivisionEmbedFieldModal, handleInteractionError } from '../utils/subdivision-settings-helper';
import { FactionModel, SubdivisionModel, ServerModel } from '../../database/models';
import { EMOJI, MESSAGES, COLORS } from '../../config/constants';
import { EmbedBuilder } from 'discord.js';
import { FactionLinkService } from '../../services/faction-link.service';
import { FactionLinkTokenModel } from '../../database/models/FactionLinkToken';
import { CalloutError } from '../../utils/error-handler';
import { safeParseInt } from '../../utils/validators';

/**
 * Обработчик кнопок лидерской панели
 */
export async function handleFactionPanelButton(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);

  // Получить фракцию лидера
  const faction = await getLeaderFaction(member);
  if (!faction) {
    await interaction.reply({
      content: MESSAGES.FACTION.NO_FACTION,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Просмотр списка подразделений
    if (customId === 'faction_view_subdivisions') {
      await handleViewSubdivisions(interaction, faction.id);
    }
    // История каллаутов фракции (стр. 1)
    else if (customId.startsWith('faction_callout_history_')) {
      await interaction.deferUpdate();
      const panel = await buildFactionCalloutHistoryPanel(faction, 1);
      await interaction.editReply(panel);
    }
    // Пагинация истории каллаутов
    else if (customId.startsWith('faction_history_prev_') || customId.startsWith('faction_history_next_')) {
      await interaction.deferUpdate();
      const parts = customId.split('_');
      const direction = parts[2]; // 'prev' или 'next'
      const currentPage = safeParseInt(parts[3], 10);
      const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
      if (newPage < 1) return;
      const panel = await buildFactionCalloutHistoryPanel(faction, newPage);
      await interaction.editReply(panel);
    }
    // Добавление подразделения (показать modal)
    else if (customId === 'faction_add_subdivision') {
      await showAddSubdivisionModal(interaction, faction);
    }
    // Генерация токена для привязки faction-сервера
    else if (customId === 'faction_generate_link_token') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const server = await ServerModel.findByGuildId(interaction.guild!.id);
        if (!server) {
          await interaction.editReply({ content: `${EMOJI.ERROR} Сервер не найден в БД` });
          return;
        }
        const token = await FactionLinkService.generateLinkToken({
          main_server_id: server.id,
          faction_id: faction.id,
          created_by: interaction.user.id,
        });
        const remaining = FactionLinkTokenModel.getRemainingMinutes(token);
        const embed = new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle('🔗 Токен привязки сервера фракции')
          .setDescription(
            `**Токен:** \`${token.token}\`\n\n` +
            `Действителен **${remaining} мин**.\n\n` +
            `**Инструкция:**\n` +
            `1. Добавьте бота на Discord-сервер вашей фракции\n` +
            `2. Там запустите команду \`/link ${token.token}\` (только для Administrator)\n` +
            `3. После привязки используйте \`/settings\` для настройки`
          )
          .addFields({ name: 'Фракция', value: faction.name, inline: true })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Ошибка генерации токена';
        await interaction.editReply({ content: `${EMOJI.ERROR} ${msg}` });
      }
    }
    // Возврат к главной панели
    else if (customId === 'faction_back_main') {
      await handleBackToMain(interaction, faction.id);
    }
    // Возврат к списку подразделений
    else if (customId === 'faction_back_list') {
      await handleViewSubdivisions(interaction, faction.id);
    }
    // Панель привязок
    else if (customId.startsWith('faction_links_')) {
      const subdivisionId = safeParseInt(customId.split('_')[2]);
      await handleShowLinks(interaction, subdivisionId, faction.id);
    }
    // Панель настроек
    else if (customId.startsWith('faction_settings_')) {
      const subdivisionId = safeParseInt(customId.split('_')[2]);
      await handleShowSettings(interaction, subdivisionId, faction.id);
    }
    // Возврат к детальной панели подразделения
    else if (customId.startsWith('faction_back_detail_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleBackToDetail(interaction, subdivisionId);
    }
    // Изменение подразделения (название + описание → pending)
    else if (customId.startsWith('faction_edit_sub_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEditSubdivisionModal(interaction, subdivisionId);
    }
    // Настройки подразделения (роль, логотип, краткое описание → pending)
    else if (customId.startsWith('faction_edit_settings_')) {
      const subdivisionId = safeParseInt(customId.replace('faction_edit_settings_', ''));
      await showEditSettingsModal(interaction, subdivisionId);
    }
    // Привязка VK беседы
    else if (customId.startsWith('faction_link_vk_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleLinkVk(interaction, subdivisionId, faction.id);
    }
    // Привязка Telegram группы
    else if (customId.startsWith('faction_link_telegram_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleLinkTelegram(interaction, subdivisionId, faction.id);
    }
    // Отвязка VK беседы
    else if (customId.startsWith('faction_unlink_vk_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleUnlinkVk(interaction, subdivisionId, faction.id);
    }
    // Отвязка Telegram группы
    else if (customId.startsWith('faction_unlink_telegram_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleUnlinkTelegram(interaction, subdivisionId, faction.id);
    }
    // Переключение приема каллаутов
    else if (customId.startsWith('faction_toggle_callouts_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleToggleCallouts(interaction, subdivisionId, faction.id);
    }
    // Standalone: Панель привязок
    else if (customId.startsWith('faction_standalone_links_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleShowLinks(interaction, subdivisionId, faction.id);
    }
    // Standalone: Панель настроек
    else if (customId.startsWith('faction_standalone_settings_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleShowSettings(interaction, subdivisionId, faction.id);
    }
    // Переход к списку подразделений
    else if (customId.startsWith('faction_subdivisions_')) {
      await handleViewSubdivisions(interaction, faction.id);
    }
    // Предпросмотр embed подразделения
    else if (customId.startsWith('faction_preview_embed_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handlePreviewEmbed(interaction, subdivisionId);
    }
    // Настройка embed подразделения - открыть интерактивную панель
    else if (customId.startsWith('faction_configure_embed_')) {
      await interaction.deferUpdate();
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      // Передать текущий draft чтобы в предпросмотре была актуальная роль
      const { getSubdivisionDraft } = await import('./faction-panel-modal');
      const currentDraft = getSubdivisionDraft(subdivisionId);
      const panel = await buildSubdivisionEmbedEditorPanel(subdivisionId, currentDraft);
      await interaction.editReply(panel);
    }
    // Удаление подразделения (показать подтверждение)
    else if (customId.startsWith('faction_delete_sub_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showDeleteConfirmation(interaction, subdivisionId, faction.id);
    }
    // Подтверждение удаления
    else if (customId.startsWith('faction_confirm_delete_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleDeleteSubdivision(interaction, subdivisionId, faction.id);
    }
    // Отмена удаления
    else if (customId === 'faction_cancel_delete') {
      await handleViewSubdivisions(interaction, faction.id);
    }
    // Возврат к подразделению из верификации
    else if (customId === 'faction_back_subdivision') {
      // Получить subdivision_id из сообщения (предполагаем что оно сохранено)
      await handleViewSubdivisions(interaction, faction.id);
    }
    // Редактирование фракции (название + эмодзи)
    else if (customId.startsWith('faction_edit_faction_')) {
      const factionId = safeParseInt(customId.replace('faction_edit_faction_', ''));
      await showEditFactionModal(interaction, factionId);
    }
    // Отмена pending запроса
    else if (customId.startsWith('faction_cancel_change_')) {
      const changeId = safeParseInt(customId.replace('faction_cancel_change_', ''));
      await handleCancelChange(interaction, changeId, faction.id);
    }
    // === Редактирование полей embed подразделения ===

    // Редактирование названия подразделения
    else if (customId.startsWith('subdivision_edit_name_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEmbedEditorNameModal(interaction, subdivisionId);
    }
    // Редактирование заголовка (с URL)
    else if (customId.startsWith('subdivision_edit_title_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEditTitleModal(interaction, subdivisionId);
    }
    // Редактирование описания
    else if (customId.startsWith('subdivision_edit_description_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEditDescriptionModal(interaction, subdivisionId);
    }
    // Редактирование цвета
    else if (customId.startsWith('subdivision_edit_color_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEditColorModal(interaction, subdivisionId);
    }
    // Редактирование автора
    else if (customId.startsWith('subdivision_edit_author_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEditAuthorModal(interaction, subdivisionId);
    }
    // Редактирование футера
    else if (customId.startsWith('subdivision_edit_footer_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEditFooterModal(interaction, subdivisionId);
    }
    // Редактирование изображения
    else if (customId.startsWith('subdivision_edit_image_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEditImageModal(interaction, subdivisionId);
    }
    // Редактирование миниатюры
    else if (customId.startsWith('subdivision_edit_thumbnail_')) {
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await showEditThumbnailModal(interaction, subdivisionId);
    }
    // Краткое описание (интерактивный редактор)
    else if (customId.startsWith('subdivision_edit_short_desc_')) {
      const subdivisionId = safeParseInt(customId.replace('subdivision_edit_short_desc_', ''));
      await showEmbedEditorShortDescModal(interaction, subdivisionId);
    }
    // Логотип (интерактивный редактор)
    else if (customId.startsWith('subdivision_edit_logo_')) {
      const subdivisionId = safeParseInt(customId.replace('subdivision_edit_logo_', ''));
      await showEmbedEditorLogoModal(interaction, subdivisionId);
    }
    // Discord роль (интерактивный редактор) — показать панель выбора роли
    else if (customId.startsWith('subdivision_edit_role_')) {
      await interaction.deferUpdate();
      const subdivisionId = safeParseInt(customId.replace('subdivision_edit_role_', ''));
      // Передать текущее значение из draft если есть
      const { getSubdivisionDraft } = await import('./faction-panel-modal');
      const draft = getSubdivisionDraft(subdivisionId);
      const draftRoleId = draft?.discord_role_id;
      const panel = await buildSubdivisionRolePanel(subdivisionId, draftRoleId);
      await interaction.editReply(panel);
    }
    // Очистить роль из draft (из панели выбора роли)
    else if (customId.startsWith('subdivision_role_clear_')) {
      await interaction.deferUpdate();
      const subdivisionId = safeParseInt(customId.replace('subdivision_role_clear_', ''));
      const { setSubdivisionDraftRole } = await import('./faction-panel-modal');
      setSubdivisionDraftRole(subdivisionId, null);
      const panel = await buildSubdivisionRolePanel(subdivisionId, null);
      await interaction.editReply(panel);
    }
    // Отправка на одобрение
    else if (customId.startsWith('subdivision_submit_embed_')) {
      await interaction.deferUpdate();
      const subdivisionId = safeParseInt(customId.split('_')[3]);
      await handleSubmitEmbedChanges(interaction, subdivisionId, faction.id);
    }
    // Возврат к настройкам из редактора embed
    else if (customId.startsWith('faction_back_to_settings_')) {
      await interaction.deferUpdate();
      const subdivisionId = safeParseInt(customId.split('_')[4]);
      const subdivision = await SubdivisionModel.findById(subdivisionId);
      if (subdivision) {
        const panel = await buildSettingsPanel(subdivision);
        await interaction.editReply(panel);
      }
    }
    // Описание / Эмодзи — открыть модал с объединёнными полями
    else if (customId.startsWith('faction_sub_other_settings_')) {
      const subdivisionId = safeParseInt(customId.replace('faction_sub_other_settings_', ''));
      await showSubdivisionOtherSettingsModal(interaction, subdivisionId);
    }
    // Очистить роль в настройках (pending change)
    else if (customId.startsWith('faction_settings_role_clear_')) {
      await interaction.deferUpdate();
      const subdivisionId = safeParseInt(customId.replace('faction_settings_role_clear_', ''));
      await handleSettingsRoleClear(interaction, subdivisionId, faction.id);
    }
  } catch (error) {
    await handleInteractionError(error, interaction, 'Error handling faction panel button', `${EMOJI.ERROR} Произошла ошибка при выполнении действия`);
  }
}

/**
 * Показать список подразделений
 */
async function handleViewSubdivisions(interaction: ButtonInteraction, factionId: number) {
  await interaction.deferUpdate();

  const allSubdivisions = await SubdivisionService.getSubdivisionsByFactionId(factionId);

  // Отфильтровать дефолтное подразделение из списка
  const subdivisions = allSubdivisions.filter(sub => !sub.is_default);

  // Получить фракцию
  const { FactionModel } = await import('../../database/models');
  const faction = await FactionModel.findById(factionId);
  if (!faction) {
    throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
  }

  const panel = buildSubdivisionsList(faction, subdivisions);

  await interaction.editReply(panel);
}

/**
 * Возврат к главной панели
 */
async function handleBackToMain(interaction: ButtonInteraction, factionId: number) {
  await interaction.deferUpdate();

  const { FactionModel, SubdivisionModel } = await import('../../database/models');
  const faction = await FactionModel.findById(factionId);
  if (!faction) {
    throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
  }

  // Подсчитать активные НЕ дефолтные подразделения
  const activeNonDefaultCount = await SubdivisionModel.countActiveNonDefault(faction.id);

  let panel;

  if (activeNonDefaultCount > 0) {
    // Есть подразделения (в т.ч. из шаблонов типа) — показать обычную панель
    const allSubdivisions = await SubdivisionService.getSubdivisionsByFactionId(faction.id, true);
    const subdivisions = allSubdivisions.filter(sub => !sub.is_default);
    const missingRoleCount = subdivisions.filter(sub => !sub.discord_role_id).length;
    panel = buildMainPanel(faction, subdivisions.length, subdivisions.length, missingRoleCount);
  } else {
    // Нет обычных подразделений — standalone режим, нужно дефолтное
    const defaultSubdivision = await SubdivisionModel.findDefaultByFactionId(faction.id);
    if (!defaultSubdivision) {
      await interaction.editReply({
        content: `${EMOJI.ERROR} Ошибка конфигурации: дефолтное подразделение не найдено. Обратитесь к администратору.`,
      });
      return;
    }
    panel = faction.standalone_needs_setup
      ? buildStandaloneSetupRequiredPanel(faction, defaultSubdivision)
      : buildStandaloneMainPanel(faction, defaultSubdivision);
  }

  await interaction.editReply(panel);
}

/**
 * Показать modal для добавления подразделения
 */
async function showAddSubdivisionModal(interaction: ButtonInteraction, faction: any) {
  // Проверить, разрешено ли создание подразделений
  if (!faction.allow_create_subdivisions) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Администратор запретил создание подразделений для этой фракции`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('faction_modal_add_subdivision')
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
    .setCustomId(`faction_modal_edit_subdivision_${subdivisionId}`)
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
 * Показать панель привязок
 */
async function handleShowLinks(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(`${EMOJI.ERROR} У вас нет прав на управление этим подразделением`, 'PERMISSION_DENIED', 403);
  }

  const panel = buildLinksPanel(subdivision);
  await interaction.editReply(panel);
}

/**
 * Показать панель настроек
 */
async function handleShowSettings(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(`${EMOJI.ERROR} У вас нет прав на управление этим подразделением`, 'PERMISSION_DENIED', 403);
  }

  const panel = await buildSettingsPanel(subdivision);
  await interaction.editReply(panel);
}

/**
 * Возврат к детальной панели подразделения
 */
async function handleBackToDetail(interaction: ButtonInteraction, subdivisionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  const panel = await buildSubdivisionDetailPanel(subdivision);
  await interaction.editReply(panel);
}

/**
 * Обработка привязки VK беседы
 */
async function handleLinkVk(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
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

  const message = await interaction.editReply(panel);

  // Сохранить Discord message ID и interaction token для последующего редактирования
  const { VerificationTokenModel } = await import('../../database/models');
  await VerificationTokenModel.updateDiscordMessage(
    token.id,
    interaction.channelId,
    message.id,
    interaction.token,
    interaction.client.application.id
  );

  logger.info('VK verification token generated via panel', {
    tokenId: token.id,
    subdivisionId,
    userId: interaction.user.id,
    messageId: message.id,
  });
}

/**
 * Обработка привязки Telegram группы
 */
async function handleLinkTelegram(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  // Генерировать токен верификации для Telegram
  const token = await VerificationService.generateVerificationToken({
    server_id: subdivision.server_id,
    subdivision_id: subdivisionId,
    created_by: interaction.user.id,
    platform: 'telegram',
  });

  // Получить инструкции
  const instructions = await VerificationService.generateInstructions(token.id);

  // Показать инструкции
  const panel = buildVerificationInstructions(instructions);

  const message = await interaction.editReply(panel);

  // Сохранить Discord message ID и interaction token для последующего редактирования
  const { VerificationTokenModel } = await import('../../database/models');
  await VerificationTokenModel.updateDiscordMessage(
    token.id,
    interaction.channelId,
    message.id,
    interaction.token,
    interaction.client.application.id
  );

  logger.info('Telegram verification token generated via panel', {
    tokenId: token.id,
    subdivisionId,
    userId: interaction.user.id,
    messageId: message.id,
  });
}

/**
 * Обработка отвязки VK беседы
 */
async function handleUnlinkVk(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(`${EMOJI.ERROR} У вас нет прав на управление этим подразделением`, 'PERMISSION_DENIED', 403);
  }
  if (!subdivision.vk_chat_id) throw new CalloutError('VK беседа не привязана', 'VK_NOT_LINKED', 400);

  const updated = await SubdivisionService.sendVkGoodbyeAndUnlink(subdivisionId);
  if (!updated) throw new Error('Failed to retrieve updated subdivision');

  await interaction.editReply(buildLinksPanel(updated));
  logger.info('VK chat unlinked successfully', { subdivisionId, userId: interaction.user.id });
}

/**
 * Обработка отвязки Telegram группы
 */
async function handleUnlinkTelegram(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(`${EMOJI.ERROR} У вас нет прав на управление этим подразделением`, 'PERMISSION_DENIED', 403);
  }
  if (!subdivision.telegram_chat_id) throw new CalloutError('Telegram группа не привязана', 'TELEGRAM_NOT_LINKED', 400);

  const updated = await SubdivisionService.sendTelegramGoodbyeAndUnlink(subdivisionId);
  if (!updated) throw new Error('Failed to retrieve updated subdivision');

  await interaction.editReply(buildLinksPanel(updated));
  logger.info('Telegram chat unlinked successfully', { subdivisionId, userId: interaction.user.id });
}

/**
 * Переключение приема каллаутов
 */
async function handleToggleCallouts(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  // Переключить флаг
  const newStatus = !subdivision.is_accepting_callouts;
  await SubdivisionService.toggleCallouts(subdivisionId, newStatus);

  // Обновить панель настроек
  const updatedSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!updatedSubdivision) {
    throw new Error('Failed to retrieve updated subdivision');
  }

  const panel = await buildSettingsPanel(updatedSubdivision);

  await interaction.editReply(panel);

  logger.info('Subdivision callouts toggled via panel', {
    subdivisionId,
    newStatus,
    userId: interaction.user.id,
  });

  if (interaction.guild) {
    const faction = await FactionService.getFactionById(updatedSubdivision.faction_id);
    const auditData: SubdivisionToggleData = {
      userId: interaction.user.id,
      userName: interaction.user.username,
      subdivisionName: updatedSubdivision.name,
      factionName: faction?.name || 'Unknown',
    };
    await logAuditEvent(interaction.guild, newStatus ? AuditEventType.SUBDIVISION_UNPAUSED : AuditEventType.SUBDIVISION_PAUSED, auditData);
  }
}

/**
 * Показать подтверждение удаления
 */
async function showDeleteConfirmation(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
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
  factionId: number
) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.faction_id !== factionId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  // Создать pending запрос на удаление подразделения
  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  await PendingChangeService.requestDeleteSubdivision(
    subdivisionId,
    factionId,
    subdivision.server_id,
    interaction.user.id,
    interaction.guild
  );

  logger.info('Subdivision deletion requested via panel', {
    subdivisionId,
    name: subdivision.name,
    userId: interaction.user.id,
  });

  // Вернуться к списку подразделений с уведомлением
  const allSubdivisions = await SubdivisionService.getSubdivisionsByFactionId(factionId);
  const subdivisions = allSubdivisions.filter(sub => !sub.is_default);

  const faction = await FactionModel.findById(factionId);
  if (!faction) {
    throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
  }

  const panel = buildSubdivisionsList(faction, subdivisions);
  await interaction.editReply({
    content: `${EMOJI.PENDING} Запрос на удаление подразделения "${subdivision.name}" отправлен администратору`,
    ...panel,
  });
}

/**
 * Показать предпросмотр embed
 */
async function handlePreviewEmbed(interaction: ButtonInteraction, subdivisionId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  const panel = buildEmbedPreview(subdivision);
  await interaction.editReply(panel);
}

/**
 * Показать modal для настройки embed подразделения
 */
async function showConfigureEmbedModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  // Запретить редактирование embed для дефолтного подразделения
  if (subdivision.is_default) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Нельзя настраивать embed для подразделения без подразделений. Создайте подразделение, чтобы настроить его embed.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`faction_modal_configure_embed_${subdivisionId}`)
    .setTitle(`Настроить Embed: ${subdivision.name.substring(0, 30)}`);

  // Поле 1: Заголовок
  const titleInput = new TextInputBuilder()
    .setCustomId('embed_title')
    .setLabel('Заголовок Embed')
    .setPlaceholder('Оставьте пустым для использования названия подразделения')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256)
    .setValue(subdivision.embed_title || '');

  // Поле 2: Описание
  const descriptionInput = new TextInputBuilder()
    .setCustomId('embed_description')
    .setLabel('Описание Embed')
    .setPlaceholder('Оставьте пустым для использования описания подразделения')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(4000)
    .setValue(subdivision.embed_description || '');

  // Поле 3: URL изображения
  const imageInput = new TextInputBuilder()
    .setCustomId('embed_image_url')
    .setLabel('URL основного изображения')
    .setPlaceholder('https://example.com/image.png')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(subdivision.embed_image_url || '');

  // Поле 4: URL миниатюры
  const thumbnailInput = new TextInputBuilder()
    .setCustomId('embed_thumbnail_url')
    .setLabel('URL миниатюры (thumbnail)')
    .setPlaceholder('https://example.com/thumbnail.png')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(subdivision.embed_thumbnail_url || '');

  // Поле 5: Цвет
  const colorInput = new TextInputBuilder()
    .setCustomId('embed_color')
    .setLabel('Цвет в hex формате')
    .setPlaceholder('#3498db или 3498db')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(7)
    .setValue(subdivision.embed_color || '');

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
  const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput);
  const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(thumbnailInput);
  const row5 = new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput);

  modal.addComponents(row1, row2, row3, row4, row5);

  await interaction.showModal(modal);
}

/**
 * Отмена pending изменения
 */
async function handleCancelChange(
  interaction: ButtonInteraction,
  changeId: number,
  factionId: number
) {
  await interaction.deferUpdate();

  try {
    await PendingChangeService.cancelChange(changeId, interaction.user.id);

    logger.info('Change cancelled by leader', {
      changeId,
      userId: interaction.user.id,
    });

    // Вернуться к списку подразделений
    await handleViewSubdivisions(interaction, factionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отменить изменение';
    await interaction.editReply({
      content: `${EMOJI.ERROR} ${message}`,
      embeds: [],
      components: [],
    });
  }
}

export default handleFactionPanelButton;

/**
 * Обработчик выбора подразделения из списка (StringSelectMenu)
 */
export async function handleFactionSubdivisionSelect(interaction: import('discord.js').StringSelectMenuInteraction) {
  await interaction.deferUpdate();

  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const faction = await getLeaderFaction(member);
  if (!faction) {
    await interaction.editReply({ content: MESSAGES.FACTION.NO_FACTION, embeds: [], components: [] });
    return;
  }

  const subdivisionId = safeParseInt(interaction.values[0]);
  const subdivision = await SubdivisionModel.findById(subdivisionId);

  if (!subdivision || subdivision.faction_id !== faction.id) {
    await interaction.editReply({ content: `${EMOJI.ERROR} Подразделение не найдено`, embeds: [], components: [] });
    return;
  }

  const panel = await buildSubdivisionDetailPanel(subdivision);
  await interaction.editReply(panel);
}

// === Функции для показа модалов редактирования embed полей ===

async function showEditTitleModal(interaction: ButtonInteraction, subdivisionId: number) {
  const modal = buildSubdivisionEmbedFieldModal('title', `subdivision_modal_title_${subdivisionId}`);
  await interaction.showModal(modal);
}

async function showEmbedEditorNameModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }
  const modal = buildSubdivisionEmbedFieldModal('name', `subdivision_modal_name_${subdivisionId}`, { name: subdivision.name });
  await interaction.showModal(modal);
}

async function showEditDescriptionModal(interaction: ButtonInteraction, subdivisionId: number) {
  const modal = buildSubdivisionEmbedFieldModal('description', `subdivision_modal_description_${subdivisionId}`);
  await interaction.showModal(modal);
}

async function showEditColorModal(interaction: ButtonInteraction, subdivisionId: number) {
  const modal = buildSubdivisionEmbedFieldModal('color', `subdivision_modal_color_${subdivisionId}`);
  await interaction.showModal(modal);
}

async function showEditAuthorModal(interaction: ButtonInteraction, subdivisionId: number) {
  const modal = buildSubdivisionEmbedFieldModal('author', `subdivision_modal_author_${subdivisionId}`);
  await interaction.showModal(modal);
}

async function showEditFooterModal(interaction: ButtonInteraction, subdivisionId: number) {
  const modal = buildSubdivisionEmbedFieldModal('footer', `subdivision_modal_footer_${subdivisionId}`);
  await interaction.showModal(modal);
}

async function showEditImageModal(interaction: ButtonInteraction, subdivisionId: number) {
  const modal = buildSubdivisionEmbedFieldModal('image', `subdivision_modal_image_${subdivisionId}`);
  await interaction.showModal(modal);
}

async function showEditThumbnailModal(interaction: ButtonInteraction, subdivisionId: number) {
  const modal = buildSubdivisionEmbedFieldModal('thumbnail', `subdivision_modal_thumbnail_${subdivisionId}`);
  await interaction.showModal(modal);
}

async function showEmbedEditorShortDescModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }
  const modal = buildSubdivisionEmbedFieldModal('short_desc', `subdivision_modal_short_desc_${subdivisionId}`, { short_description: subdivision.short_description });
  await interaction.showModal(modal);
}

async function showEmbedEditorLogoModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }
  const modal = buildSubdivisionEmbedFieldModal('logo', `subdivision_modal_logo_${subdivisionId}`, { logo_url: subdivision.logo_url });
  await interaction.showModal(modal);
}

/**
 * Обработчик RoleSelectMenu для лидерской панели
 * Обрабатывает subdivision_role_{subdivisionId} — выбор роли в интерактивном редакторе embed
 */
export async function handleFactionRoleSelect(interaction: RoleSelectMenuInteraction) {
  await interaction.deferUpdate();

  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const { getLeaderFaction } = await import('../utils/faction-permission-checker');
  const faction = await getLeaderFaction(member);
  if (!faction) {
    await interaction.editReply({ content: `${EMOJI.ERROR} У вас нет прав лидера фракции` });
    return;
  }

  const customId = interaction.customId;

  try {
    if (customId.startsWith('subdivision_role_')) {
      const subdivisionId = safeParseInt(customId.replace('subdivision_role_', ''));

      // Проверить принадлежность подразделения фракции
      const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
      if (!subdivision || subdivision.faction_id !== faction.id) {
        await interaction.editReply({ content: `${EMOJI.ERROR} Подразделение не найдено` });
        return;
      }

      const roleId = interaction.values[0];

      // Сохранить роль в draft состояние
      const { setSubdivisionDraftRole } = await import('./faction-panel-modal');
      setSubdivisionDraftRole(subdivisionId, roleId);

      // Обновить панель выбора роли
      const panel = await buildSubdivisionRolePanel(subdivisionId, roleId);
      await interaction.editReply(panel);

      await interaction.followUp({
        content: `${EMOJI.SUCCESS} Роль <@&${roleId}> добавлена в предпросмотр. Нажмите "Отправить на одобрение" в редакторе embed.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    logger.error('Error handling faction role select', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Произошла ошибка` });
    }
  }
}

/**
 * Показать modal для редактирования настроек подразделения (роль, логотип, краткое описание)
 * Использует shared helper — тот же модал что и в админ-панели
 */
async function showEditSettingsModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  const modal = buildSubdivisionSettingsModal(subdivision, `faction_modal_settings_${subdivisionId}`);
  await interaction.showModal(modal);
}

/**
 * Показать модал "Описание / Эмодзи" (название + описание + краткое описание + эмодзи)
 */
async function showSubdivisionOtherSettingsModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  const modal = new ModalBuilder()
    .setCustomId(`faction_modal_sub_other_${subdivisionId}`)
    .setTitle(`Настройки: ${subdivision.name.substring(0, 30)}`);

  const nameInput = new TextInputBuilder()
    .setCustomId('subdivision_name')
    .setLabel('Название')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50)
    .setValue(subdivision.name);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('subdivision_description')
    .setLabel('Описание')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(200)
    .setValue(subdivision.description || '');

  const shortDescInput = new TextInputBuilder()
    .setCustomId('short_description')
    .setLabel('Краткое описание (в списке, до 100 симв.)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setValue(subdivision.short_description || '');

  const logoInput = new TextInputBuilder()
    .setCustomId('logo_url')
    .setLabel('Эмодзи')
    .setPlaceholder('ID, <:name:id> или 🏢')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(subdivision.logo_url || '');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(shortDescInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(logoInput),
  );

  await interaction.showModal(modal);
}

/**
 * Очистить роль подразделения через pending change
 */
async function handleSettingsRoleClear(interaction: ButtonInteraction, subdivisionId: number, factionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision || subdivision.faction_id !== factionId) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (!interaction.guild) throw new Error('Guild not found');

  await PendingChangeService.requestUpdateSubdivision(
    subdivisionId,
    factionId,
    subdivision.server_id,
    interaction.user.id,
    { discord_role_id: null },
    interaction.guild
  );

  const panel = await buildSettingsPanel(subdivision);
  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на очистку роли отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Обработчик RoleSelectMenu в панели настроек (faction_settings_role_{id})
 * Создаёт pending change напрямую (без draft)
 */
export async function handleFactionSettingsRoleSelect(interaction: RoleSelectMenuInteraction) {
  await interaction.deferUpdate();

  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const faction = await getLeaderFaction(member);
  if (!faction) {
    await interaction.editReply({ content: `${EMOJI.ERROR} У вас нет прав лидера фракции` });
    return;
  }

  const subdivisionId = safeParseInt(interaction.customId.replace('faction_settings_role_', ''));

  try {
    const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
    if (!subdivision || subdivision.faction_id !== faction.id) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Подразделение не найдено` });
      return;
    }

    const roleId = interaction.values[0];

    await PendingChangeService.requestUpdateSubdivision(
      subdivisionId,
      faction.id,
      subdivision.server_id,
      interaction.user.id,
      { discord_role_id: roleId },
      interaction.guild
    );

    const panel = await buildSettingsPanel(subdivision);
    await interaction.editReply(panel);

    await interaction.followUp({
      content: `${EMOJI.PENDING} Запрос на установку роли <@&${roleId}> отправлен администратору`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    logger.error('Error handling faction settings role select', {
      error: error instanceof Error ? error.message : error,
      customId: interaction.customId,
      userId: interaction.user.id,
    });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Произошла ошибка` });
    }
  }
}

/**
 * Показать модал для редактирования фракции (название + эмодзи)
 */
async function showEditFactionModal(interaction: ButtonInteraction, factionId: number) {
  const faction = await FactionModel.findById(factionId);
  if (!faction) {
    throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
  }

  const modal = new ModalBuilder()
    .setCustomId(`faction_modal_update_faction_${factionId}`)
    .setTitle(`Изменить: ${faction.name.substring(0, 30)}`);

  const nameInput = new TextInputBuilder()
    .setCustomId('faction_name')
    .setLabel('Название фракции')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMinLength(2)
    .setMaxLength(50)
    .setValue(faction.name);

  const logoInput = new TextInputBuilder()
    .setCustomId('faction_logo')
    .setLabel('Эмодзи фракции (thumbnail в embed)')
    .setPlaceholder('ID, <:name:id> или 🏛️')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(faction.logo_url || '');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(logoInput),
  );

  await interaction.showModal(modal);
}

async function handleSubmitEmbedChanges(
  interaction: ButtonInteraction,
  subdivisionId: number,
  factionId: number
) {
  try {
    // Получить draft изменения
    const { getSubdivisionDraft, clearSubdivisionDraft } = await import('./faction-panel-modal');
    const draftData = getSubdivisionDraft(subdivisionId);

    if (!draftData || Object.keys(draftData).length === 0) {
      await interaction.editReply({
        content: `${EMOJI.WARNING} Нет изменений для отправки`,
        embeds: [],
        components: [],
      });
      return;
    }

    // Получить подразделение
    const subdivision = await SubdivisionModel.findById(subdivisionId);
    if (!subdivision) {
      throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
    }

    // Отправить pending запрос на обновление embed
    await PendingChangeService.requestUpdateEmbed(
      subdivisionId,
      factionId,
      subdivision.server_id,
      interaction.user.id,
      draftData,
      interaction.guild!
    );

    // Снять флаг обязательной настройки, если это дефолтное подразделение
    if (subdivision.is_default) {
      const { FactionModel } = await import('../../database/models');
      const faction = await FactionModel.findById(factionId);
      if (faction?.standalone_needs_setup) {
        await FactionModel.update(factionId, { standalone_needs_setup: false });
      }
    }

    // Очистить draft
    clearSubdivisionDraft(subdivisionId);

    logger.info('Embed update requested via interactive editor', {
      subdivisionId,
      factionId,
      userId: interaction.user.id,
      changes: Object.keys(draftData),
    });

    // Вернуться к панели настроек
    const panel = await buildSettingsPanel(subdivision);
    await interaction.editReply(panel);

    await interaction.followUp({
      content: `${EMOJI.PENDING} Запрос на обновление embed отправлен администратору`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    logger.error('Failed to submit embed changes', {
      error: error instanceof Error ? error.message : error,
      subdivisionId,
      factionId,
    });

    await interaction.editReply({
      content: `${EMOJI.ERROR} Не удалось отправить запрос`,
      embeds: [],
      components: [],
    });
  }
}
