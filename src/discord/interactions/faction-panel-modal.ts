import { ModalSubmitInteraction, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { getLeaderFaction } from '../utils/faction-permission-checker';
import { buildSubdivisionsList, buildSubdivisionDetailPanel, buildSettingsPanel, buildSubdivisionEmbedEditorPanel } from '../utils/faction-panel-builder';
import { parseSubdivisionSettingsData, isValidDiscordEmoji } from '../utils/subdivision-settings-helper';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { Subdivision } from '../../types/database.types';

// Временное хранилище для draft изменений embed подразделений
const subdivisionDraftState = new Map<string, Partial<Subdivision>>();

export function getSubdivisionDraft(subdivisionId: number): Partial<Subdivision> | undefined {
  return subdivisionDraftState.get(subdivisionId.toString());
}

function setSubdivisionDraft(subdivisionId: number, data: Partial<Subdivision>) {
  const key = subdivisionId.toString();
  const existing = subdivisionDraftState.get(key) || {};
  subdivisionDraftState.set(key, { ...existing, ...data });
}

export function clearSubdivisionDraft(subdivisionId: number) {
  subdivisionDraftState.delete(subdivisionId.toString());
}

/**
 * Установить роль в draft состоянии подразделения
 * Используется из faction-panel-button при выборе роли через RoleSelectMenu
 */
export function setSubdivisionDraftRole(subdivisionId: number, roleId: string | null) {
  setSubdivisionDraft(subdivisionId, { discord_role_id: roleId });
}

/**
 * Обработчик модальных окон лидерской панели
 */
export async function handleFactionPanelModal(interaction: ModalSubmitInteraction) {
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
    // Добавление подразделения
    if (customId === 'faction_modal_add_subdivision') {
      await handleAddSubdivision(interaction, faction.id, faction.server_id);
    }
    // Редактирование подразделения
    else if (customId.startsWith('faction_modal_edit_subdivision_')) {
      const subdivisionId = parseInt(customId.replace('faction_modal_edit_subdivision_', ''));
      await handleEditSubdivision(interaction, subdivisionId, faction.id);
    }
    // Настройка embed подразделения
    else if (customId.startsWith('faction_modal_configure_embed_')) {
      const subdivisionId = parseInt(customId.replace('faction_modal_configure_embed_', ''));
      await handleConfigureEmbed(interaction, subdivisionId, faction.id);
    }
    // Настройки подразделения (роль, логотип, краткое описание → pending)
    else if (customId.startsWith('faction_modal_settings_')) {
      const subdivisionId = parseInt(customId.replace('faction_modal_settings_', ''));
      await handleEditSettings(interaction, subdivisionId, faction.id);
    }
    // Объединённый модал "Описание / Эмодзи" (название + описание + краткое + эмодзи → pending)
    else if (customId.startsWith('faction_modal_sub_other_')) {
      const subdivisionId = parseInt(customId.replace('faction_modal_sub_other_', ''));
      await handleSubOtherSettings(interaction, subdivisionId, faction.id);
    }
    // === Редактирование полей embed подразделения (интерактивный редактор) ===
    else if (customId.startsWith('subdivision_modal_name_')) {
      const subdivisionId = parseInt(customId.replace('subdivision_modal_name_', ''));
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'name');
    }
    else if (customId.startsWith('subdivision_modal_title_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'title');
    }
    else if (customId.startsWith('subdivision_modal_description_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'description');
    }
    else if (customId.startsWith('subdivision_modal_color_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'color');
    }
    else if (customId.startsWith('subdivision_modal_author_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'author');
    }
    else if (customId.startsWith('subdivision_modal_footer_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'footer');
    }
    else if (customId.startsWith('subdivision_modal_image_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'image');
    }
    else if (customId.startsWith('subdivision_modal_thumbnail_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'thumbnail');
    }
    else if (customId.startsWith('subdivision_modal_short_desc_')) {
      const subdivisionId = parseInt(customId.replace('subdivision_modal_short_desc_', ''));
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'short_desc');
    }
    else if (customId.startsWith('subdivision_modal_logo_')) {
      const subdivisionId = parseInt(customId.replace('subdivision_modal_logo_', ''));
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'logo');
    }
    else if (customId.startsWith('subdivision_modal_role_')) {
      const subdivisionId = parseInt(customId.replace('subdivision_modal_role_', ''));
      await handleSubdivisionFieldEdit(interaction, subdivisionId, 'role');
    }
  } catch (error) {
    logger.error('Error handling faction panel modal', {
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
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Обработка добавления подразделения
 */
async function handleAddSubdivision(
  interaction: ModalSubmitInteraction,
  factionId: number,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('subdivision_name').trim();
  const description = interaction.fields.getTextInputValue('subdivision_description').trim();

  // Создать pending запрос на создание подразделения
  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  await PendingChangeService.requestCreateSubdivision(
    factionId,
    serverId,
    interaction.user.id,
    {
      name,
      description: description || undefined,
    },
    interaction.guild
  );

  logger.info('Subdivision creation requested via panel', {
    name,
    factionId,
    userId: interaction.user.id,
  });

  // Показать список подразделений с уведомлением
  const { FactionModel } = await import('../../database/models');
  const faction = await FactionModel.findById(factionId);
  if (!faction) {
    throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
  }

  const subdivisions = await SubdivisionService.getSubdivisionsByFactionId(factionId);
  const nonDefaultSubdivisions = subdivisions.filter(sub => !sub.is_default);

  const panel = buildSubdivisionsList(faction, nonDefaultSubdivisions);

  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на создание подразделения "${name}" отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Обработка редактирования подразделения
 */
async function handleEditSubdivision(
  interaction: ModalSubmitInteraction,
  subdivisionId: number,
  factionId: number
) {
  await interaction.deferUpdate();

  // Проверить что подразделение существует и принадлежит фракции
  const existingSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!existingSubdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (existingSubdivision.faction_id !== factionId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  const name = interaction.fields.getTextInputValue('subdivision_name').trim();
  const description = interaction.fields.getTextInputValue('subdivision_description').trim();

  // Создать pending запрос на обновление подразделения
  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  await PendingChangeService.requestUpdateSubdivision(
    subdivisionId,
    factionId,
    existingSubdivision.server_id,
    interaction.user.id,
    {
      name,
      description: description || undefined,
    },
    interaction.guild
  );

  logger.info('Subdivision update requested via panel', {
    subdivisionId,
    newName: name,
    userId: interaction.user.id,
  });

  // Показать панель подразделения с уведомлением
  const panel = await buildSubdivisionDetailPanel(existingSubdivision);

  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на обновление подразделения отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Обработка настройки embed подразделения
 */
async function handleConfigureEmbed(
  interaction: ModalSubmitInteraction,
  subdivisionId: number,
  factionId: number
) {
  await interaction.deferUpdate();

  // Проверить что подразделение существует и принадлежит фракции
  const existingSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!existingSubdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (existingSubdivision.faction_id !== factionId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  // Получить значения полей
  const title = interaction.fields.getTextInputValue('embed_title').trim() || undefined;
  const description = interaction.fields.getTextInputValue('embed_description').trim() || undefined;
  const imageUrl = interaction.fields.getTextInputValue('embed_image_url').trim() || undefined;
  const thumbnailUrl = interaction.fields.getTextInputValue('embed_thumbnail_url').trim() || undefined;
  const color = interaction.fields.getTextInputValue('embed_color').trim() || undefined;

  // Валидация URL изображений
  if (imageUrl && !isValidUrl(imageUrl)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректный URL основного изображения`,
      'INVALID_IMAGE_URL',
      400
    );
  }

  if (thumbnailUrl && !isValidUrl(thumbnailUrl)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректный URL миниатюры`,
      'INVALID_THUMBNAIL_URL',
      400
    );
  }

  // Валидация hex цвета
  if (color && !isValidHexColor(color)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректный hex цвет. Используйте формат #RRGGBB или RRGGBB`,
      'INVALID_HEX_COLOR',
      400
    );
  }

  // Нормализовать цвет (добавить # если нужно)
  const normalizedColor = color && !color.startsWith('#') ? `#${color}` : color;

  // Создать pending запрос на обновление embed
  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  await PendingChangeService.requestUpdateEmbed(
    subdivisionId,
    factionId,
    existingSubdivision.server_id,
    interaction.user.id,
    {
      embed_title: title,
      embed_description: description,
      embed_image_url: imageUrl,
      embed_thumbnail_url: thumbnailUrl,
      embed_color: normalizedColor,
    },
    interaction.guild
  );

  logger.info('Subdivision embed update requested via panel', {
    subdivisionId,
    userId: interaction.user.id,
  });

  // Показать панель настроек с уведомлением
  const panel = buildSettingsPanel(existingSubdivision);

  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на обновление embed отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Проверить корректность URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Проверить корректность hex цвета
 */
function isValidHexColor(color: string): boolean {
  // Поддержка форматов: #RRGGBB или RRGGBB
  const hexPattern = /^#?[0-9A-Fa-f]{6}$/;
  return hexPattern.test(color);
}

/**
 * Обработка настроек подразделения (роль, логотип, краткое описание).
 * Создаёт pending запрос на одобрение администратором.
 * Использует shared helper — тот же парсер что и в админ-панели.
 */
async function handleEditSettings(
  interaction: ModalSubmitInteraction,
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

  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  // Парсинг и валидация через shared helper
  const settingsData = parseSubdivisionSettingsData(interaction);

  await PendingChangeService.requestUpdateSubdivision(
    subdivisionId,
    factionId,
    subdivision.server_id,
    interaction.user.id,
    {
      short_description: settingsData.short_description,
      logo_url: settingsData.logo_url,
      discord_role_id: settingsData.discord_role_id,
    },
    interaction.guild
  );

  logger.info('Subdivision settings update requested via panel', {
    subdivisionId,
    userId: interaction.user.id,
  });

  const panel = buildSettingsPanel(subdivision);
  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на обновление настроек подразделения отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Обработка объединённого модала "Описание / Эмодзи"
 * Поля: название, описание, краткое описание, эмодзи → pending change
 */
async function handleSubOtherSettings(
  interaction: ModalSubmitInteraction,
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

  if (!interaction.guild) throw new Error('Guild not found');

  const name = interaction.fields.getTextInputValue('subdivision_name').trim() || subdivision.name;
  const description = interaction.fields.getTextInputValue('subdivision_description').trim() || undefined;
  const shortDescription = interaction.fields.getTextInputValue('short_description').trim() || null;
  const logoUrl = interaction.fields.getTextInputValue('logo_url').trim() || null;

  if (logoUrl && !isValidDiscordEmoji(logoUrl)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректное эмодзи. Укажите кастомное эмодзи Discord (<:name:id>) или unicode-эмодзи (например 🏢).`,
      'INVALID_LOGO_EMOJI',
      400
    );
  }

  await PendingChangeService.requestUpdateSubdivision(
    subdivisionId,
    factionId,
    subdivision.server_id,
    interaction.user.id,
    {
      name,
      description,
      short_description: shortDescription,
      logo_url: logoUrl,
    },
    interaction.guild
  );

  logger.info('Subdivision other settings update requested via panel', {
    subdivisionId,
    userId: interaction.user.id,
  });

  const panel = buildSettingsPanel(subdivision);
  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на обновление настроек подразделения отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

export default handleFactionPanelModal;

/**
 * Обработка редактирования поля embed подразделения
 * Обновляет draft состояние и перерисовывает панель с предпросмотром
 */
async function handleSubdivisionFieldEdit(
  interaction: ModalSubmitInteraction,
  subdivisionId: number,
  field: string
) {
  await interaction.deferUpdate();

  const draftData: Partial<Subdivision> = {};

  // Получить значения полей в зависимости от типа
  switch (field) {
    case 'name':
      const nameVal = interaction.fields.getTextInputValue('subdivision_name').trim();
      if (nameVal) {
        draftData.name = nameVal;
      }
      break;
    case 'title':
      const title = interaction.fields.getTextInputValue('embed_title').trim();
      draftData.embed_title = title || null;
      const titleUrl = interaction.fields.getTextInputValue('embed_title_url').trim();
      draftData.embed_title_url = titleUrl || null;
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
    case 'short_desc':
      const shortDesc = interaction.fields.getTextInputValue('short_description').trim();
      draftData.short_description = shortDesc || null;
      break;
    case 'logo':
      const logoUrl = interaction.fields.getTextInputValue('logo_url').trim();
      draftData.logo_url = logoUrl || null;
      break;
    case 'role':
      const roleId = interaction.fields.getTextInputValue('discord_role_id').trim();
      if (roleId && !/^\d{17,20}$/.test(roleId)) {
        await interaction.followUp({
          content: `${EMOJI.ERROR} Некорректный ID Discord роли. Должен содержать только цифры (17-20 символов).`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      draftData.discord_role_id = roleId || null;
      break;
  }

  // Обновить draft состояние
  setSubdivisionDraft(subdivisionId, draftData);

  // Получить текущий draft и перерисовать панель с обновленным предпросмотром
  const currentDraft = getSubdivisionDraft(subdivisionId);
  const panel = await buildSubdivisionEmbedEditorPanel(subdivisionId, currentDraft);
  await interaction.editReply(panel);

  // Показать ephemeral уведомление об изменении
  await interaction.followUp({
    content: `${EMOJI.SUCCESS} Предпросмотр обновлен. Нажмите "Отправить на одобрение" чтобы применить изменения.`,
    flags: MessageFlags.Ephemeral,
  });
}
