import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  MessageComponentInteraction,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { Subdivision } from '../../types/database.types';
import { CalloutError } from '../../utils/error-handler';
import { EMOJI } from '../../config/constants';
import { SubdivisionService } from '../../services/subdivision.service';

/**
 * Фабрика для создания хранилища draft-изменений с автоматическим слиянием данных.
 */
export function createDraftState<T>() {
  const map = new Map<string, Partial<T>>();
  return {
    get(key: string): Partial<T> | undefined {
      return map.get(key);
    },
    set(key: string, data: Partial<T>): void {
      const existing = map.get(key) ?? {};
      map.set(key, { ...existing, ...data });
    },
    clear(key: string): void {
      map.delete(key);
    },
  };
}

export interface SubdivisionSettingsData {
  short_description: string | null;
  logo_url: string | null;
  discord_role_id: string | null;
}

export interface ParsedEmoji {
  name: string;
  id?: string;
  animated?: boolean;
}

/**
 * Парсит строку Discord эмодзи.
 * Принимает: <:name:id>, <a:name:id> (кастомные) или unicode-эмодзи.
 * Возвращает null если строка не является валидным эмодзи.
 */
export function parseDiscordEmoji(emojiString: string | null | undefined): ParsedEmoji | null {
  if (!emojiString) return null;

  // Кастомное эмодзи: <:name:id> или <a:name:id>
  const customMatch = emojiString.match(/^<(a)?:(\w+):(\d+)>$/);
  if (customMatch) {
    return {
      animated: !!customMatch[1],
      name: customMatch[2],
      id: customMatch[3],
    };
  }

  // Голый Snowflake ID (17-20 цифр)
  if (/^\d{17,20}$/.test(emojiString)) {
    return { name: 'emoji', id: emojiString };
  }

  // Unicode эмодзи (не URL, не кастомная разметка, короткая строка)
  if (!emojiString.startsWith('<') && !emojiString.includes('://') && emojiString.length <= 8) {
    return { name: emojiString };
  }

  return null;
}

/**
 * Возвращает CDN URL для кастомного Discord эмодзи.
 * Для unicode эмодзи возвращает null (их нельзя использовать как image URL).
 */
export function getEmojiCdnUrl(emoji: ParsedEmoji | null): string | null {
  if (!emoji?.id) return null;
  const ext = emoji.animated ? 'gif' : 'png';
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}`;
}

/**
 * Проверяет является ли строка валидным Discord эмодзи.
 */
export function isValidDiscordEmoji(value: string): boolean {
  if (!value) return false;
  // <:name:id> или <a:name:id>
  if (/^<a?:\w+:\d+>$/.test(value)) return true;
  // Голый Snowflake ID
  if (/^\d{17,20}$/.test(value)) return true;
  // Unicode эмодзи
  if (!value.startsWith('<') && !value.includes('://') && value.length <= 8) return true;
  return false;
}

/**
 * Построить модал редактирования настроек подразделения.
 * Используется как в лидерской, так и в админ-панели.
 *
 * @param subdivision - текущие данные подразделения (для предзаполнения)
 * @param modalCustomId - customId модала (разный для лидера и админа)
 */
export function buildSubdivisionSettingsModal(
  subdivision: Subdivision,
  modalCustomId: string
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(`Настройки: ${subdivision.name}`);

  const shortDescInput = new TextInputBuilder()
    .setCustomId('short_description')
    .setLabel('Краткое описание')
    .setPlaceholder('Отображается в списке каллаутов (до 100 символов)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setValue(subdivision.short_description ?? '');

  const logoInput = new TextInputBuilder()
    .setCustomId('logo_url')
    .setLabel('Эмодзи подразделения')
    .setPlaceholder('ID, <:name:id> или 🏢')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(subdivision.logo_url ?? '');

  const roleInput = new TextInputBuilder()
    .setCustomId('discord_role_id')
    .setLabel('ID Discord роли (упоминается при каллауте)')
    .setPlaceholder('Например: 123456789012345678')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(subdivision.discord_role_id ?? '');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(shortDescInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(logoInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(roleInput),
  );

  return modal;
}

type SubdivisionEmbedField =
  | 'name' | 'logo' | 'short_desc' | 'title' | 'description'
  | 'color' | 'author' | 'footer' | 'image' | 'thumbnail';

export interface SubdivisionEmbedFieldValues {
  name?: string | null;
  logo_url?: string | null;
  short_description?: string | null;
  embed_title?: string | null;
  embed_title_url?: string | null;
  embed_description?: string | null;
  embed_color?: string | null;
  embed_author_name?: string | null;
  embed_author_url?: string | null;
  embed_author_icon_url?: string | null;
  embed_footer_text?: string | null;
  embed_footer_icon_url?: string | null;
  embed_image_url?: string | null;
  embed_thumbnail_url?: string | null;
}

/**
 * Построить модал редактирования поля embed подразделения.
 * Универсальная функция для лидерской и админ-панели.
 *
 * @param field - тип поля
 * @param modalCustomId - customId модала
 * @param currentValues - текущие значения для предзаполнения (undefined = не предзаполнять)
 * @param nameInputCustomId - customId поля name (faction: 'subdivision_name', admin: 'sub_name')
 * @param nameRequired - является ли поле name обязательным
 */
export function buildSubdivisionEmbedFieldModal(
  field: SubdivisionEmbedField,
  modalCustomId: string,
  currentValues?: SubdivisionEmbedFieldValues,
  nameInputCustomId = 'subdivision_name',
  nameRequired = false,
): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(modalCustomId);

  switch (field) {
    case 'name': {
      modal.setTitle('Название подразделения');
      const input = new TextInputBuilder()
        .setCustomId(nameInputCustomId)
        .setLabel('Название подразделения')
        .setPlaceholder('Отображается в заголовке embed и списке каллаутов')
        .setStyle(TextInputStyle.Short)
        .setRequired(nameRequired)
        .setMaxLength(50);
      if (nameRequired) input.setMinLength(2);
      if (currentValues?.name !== undefined) input.setValue(currentValues.name ?? '');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      break;
    }
    case 'logo': {
      modal.setTitle('Эмодзи подразделения');
      const input = new TextInputBuilder()
        .setCustomId('logo_url')
        .setLabel('Эмодзи подразделения')
        .setPlaceholder('ID, <:name:id> или 🏢')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      if (currentValues?.logo_url !== undefined) input.setValue(currentValues.logo_url ?? '');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      break;
    }
    case 'short_desc': {
      modal.setTitle('Краткое описание');
      const input = new TextInputBuilder()
        .setCustomId('short_description')
        .setLabel('Краткое описание подразделения')
        .setPlaceholder('Отображается в списке каллаутов (до 100 символов)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
      if (currentValues?.short_description !== undefined) input.setValue(currentValues.short_description ?? '');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      break;
    }
    case 'title': {
      modal.setTitle('Редактирование заголовка');
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
      if (currentValues?.embed_title !== undefined) titleInput.setValue(currentValues.embed_title ?? '');
      if (currentValues?.embed_title_url !== undefined) titleUrlInput.setValue(currentValues.embed_title_url ?? '');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleUrlInput),
      );
      break;
    }
    case 'description': {
      modal.setTitle('Редактирование описания');
      const input = new TextInputBuilder()
        .setCustomId('embed_description')
        .setLabel('Описание Embed')
        .setPlaceholder('Описание каллаута для этого подразделения')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000);
      if (currentValues?.embed_description !== undefined) input.setValue(currentValues.embed_description ?? '');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      break;
    }
    case 'color': {
      modal.setTitle('Редактирование цвета');
      const input = new TextInputBuilder()
        .setCustomId('embed_color')
        .setLabel('Цвет Embed (HEX)')
        .setPlaceholder('#FF5733 или FF5733')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMinLength(6)
        .setMaxLength(7);
      if (currentValues?.embed_color !== undefined) input.setValue(currentValues.embed_color ?? '');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      break;
    }
    case 'author': {
      modal.setTitle('Редактирование автора');
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
      if (currentValues?.embed_author_name !== undefined) authorNameInput.setValue(currentValues.embed_author_name ?? '');
      if (currentValues?.embed_author_url !== undefined) authorUrlInput.setValue(currentValues.embed_author_url ?? '');
      if (currentValues?.embed_author_icon_url !== undefined) authorIconInput.setValue(currentValues.embed_author_icon_url ?? '');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(authorNameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(authorUrlInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(authorIconInput),
      );
      break;
    }
    case 'footer': {
      modal.setTitle('Редактирование футера');
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
      if (currentValues?.embed_footer_text !== undefined) footerTextInput.setValue(currentValues.embed_footer_text ?? '');
      if (currentValues?.embed_footer_icon_url !== undefined) footerIconInput.setValue(currentValues.embed_footer_icon_url ?? '');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(footerTextInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(footerIconInput),
      );
      break;
    }
    case 'image': {
      modal.setTitle('Редактирование изображения');
      const input = new TextInputBuilder()
        .setCustomId('embed_image_url')
        .setLabel('URL изображения')
        .setPlaceholder('https://example.com/image.png')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      if (currentValues?.embed_image_url !== undefined) input.setValue(currentValues.embed_image_url ?? '');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      break;
    }
    case 'thumbnail': {
      modal.setTitle('Редактирование миниатюры');
      const input = new TextInputBuilder()
        .setCustomId('embed_thumbnail_url')
        .setLabel('URL миниатюры')
        .setPlaceholder('https://example.com/thumbnail.png')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      if (currentValues?.embed_thumbnail_url !== undefined) input.setValue(currentValues.embed_thumbnail_url ?? '');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      break;
    }
  }

  return modal;
}

/**
 * Проверить корректность URL.
 */
export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Проверить корректность hex цвета (#RRGGBB или RRGGBB).
 */
export function isValidHexColor(color: string): boolean {
  return /^#?[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Данные, распарсенные из модала редактирования поля embed.
 * Совместим с Partial<Subdivision> и Partial<SubdivisionTemplate>.
 */
export type EmbedFieldData = {
  name?: string;
  logo_url?: string | null;
  short_description?: string | null;
  discord_role_id?: string | null;
  embed_title?: string | null;
  embed_title_url?: string | null;
  embed_description?: string | null;
  embed_color?: string | null;
  embed_author_name?: string | null;
  embed_author_url?: string | null;
  embed_author_icon_url?: string | null;
  embed_footer_text?: string | null;
  embed_footer_icon_url?: string | null;
  embed_image_url?: string | null;
  embed_thumbnail_url?: string | null;
};

export type ParseEmbedFieldResult =
  | { ok: true; data: EmbedFieldData }
  | { ok: false; errorMessage: string };

/**
 * Парсить поле embed из модала.
 * Универсальная функция для лидерской и админ-панели.
 *
 * @param interaction - ModalSubmitInteraction
 * @param field - тип поля ('name', 'logo', 'title' и т.д.)
 * @param options.nameInputCustomId - customId input'а для поля name (по умолчанию 'subdivision_name')
 * @param options.validateUrls - валидировать URL-поля (по умолчанию false)
 */
export function parseEmbedFieldFromModal(
  interaction: ModalSubmitInteraction,
  field: string,
  options?: { nameInputCustomId?: string; validateUrls?: boolean },
): ParseEmbedFieldResult {
  const { nameInputCustomId = 'subdivision_name', validateUrls = false } = options ?? {};
  const data: EmbedFieldData = {};

  switch (field) {
    case 'name': {
      const val = interaction.fields.getTextInputValue(nameInputCustomId).trim();
      if (val) data.name = val;
      break;
    }
    case 'logo': {
      const val = interaction.fields.getTextInputValue('logo_url').trim();
      if (val && !isValidDiscordEmoji(val)) {
        return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректное эмодзи. Укажите кастомное Discord-эмодзи (<:name:id>) или unicode-эмодзи.` };
      }
      data.logo_url = val || null;
      break;
    }
    case 'short_desc': {
      const val = interaction.fields.getTextInputValue('short_description').trim();
      data.short_description = val || null;
      break;
    }
    case 'title': {
      const title = interaction.fields.getTextInputValue('embed_title').trim();
      data.embed_title = title || null;
      const titleUrl = interaction.fields.getTextInputValue('embed_title_url').trim();
      if (validateUrls && titleUrl && !isValidUrl(titleUrl)) {
        return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректный URL заголовка. Используйте полный URL (https://...)` };
      }
      data.embed_title_url = titleUrl || null;
      break;
    }
    case 'description': {
      const val = interaction.fields.getTextInputValue('embed_description').trim();
      data.embed_description = val || null;
      break;
    }
    case 'color': {
      let color = interaction.fields.getTextInputValue('embed_color').trim();
      if (color) {
        color = color.startsWith('#') ? color : `#${color}`;
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректный hex цвет. Используйте формат #RRGGBB или RRGGBB` };
        }
        data.embed_color = color;
      } else {
        data.embed_color = null;
      }
      break;
    }
    case 'author': {
      const authorName = interaction.fields.getTextInputValue('embed_author_name').trim();
      const authorUrl = interaction.fields.getTextInputValue('embed_author_url').trim();
      const authorIcon = interaction.fields.getTextInputValue('embed_author_icon_url').trim();
      if (validateUrls && authorUrl && !isValidUrl(authorUrl)) {
        return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректный URL автора. Используйте полный URL (https://...)` };
      }
      if (validateUrls && authorIcon && !isValidUrl(authorIcon)) {
        return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректный URL иконки автора. Используйте полный URL (https://...)` };
      }
      data.embed_author_name = authorName || null;
      data.embed_author_url = authorUrl || null;
      data.embed_author_icon_url = authorIcon || null;
      break;
    }
    case 'footer': {
      const footerText = interaction.fields.getTextInputValue('embed_footer_text').trim();
      const footerIcon = interaction.fields.getTextInputValue('embed_footer_icon_url').trim();
      if (validateUrls && footerIcon && !isValidUrl(footerIcon)) {
        return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректный URL иконки футера. Используйте полный URL (https://...)` };
      }
      data.embed_footer_text = footerText || null;
      data.embed_footer_icon_url = footerIcon || null;
      break;
    }
    case 'image': {
      const val = interaction.fields.getTextInputValue('embed_image_url').trim();
      if (validateUrls && val && !isValidUrl(val)) {
        return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректный URL изображения. Используйте полный URL (https://...)` };
      }
      data.embed_image_url = val || null;
      break;
    }
    case 'thumbnail': {
      const val = interaction.fields.getTextInputValue('embed_thumbnail_url').trim();
      if (validateUrls && val && !isValidUrl(val)) {
        return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректный URL миниатюры. Используйте полный URL (https://...)` };
      }
      data.embed_thumbnail_url = val || null;
      break;
    }
    case 'role': {
      const roleId = interaction.fields.getTextInputValue('discord_role_id').trim();
      if (roleId && !/^\d{17,20}$/.test(roleId)) {
        return { ok: false, errorMessage: `${EMOJI.ERROR} Некорректный ID Discord роли. Должен содержать только цифры (17-20 символов).` };
      }
      data.discord_role_id = roleId || null;
      break;
    }
  }

  return { ok: true, data };
}

/**
 * Получить подразделение по ID с проверкой существования и, опционально, прав доступа.
 * Если передан factionId — проверяет что подразделение принадлежит этой фракции.
 */
export async function getVerifiedSubdivision(
  subdivisionId: number,
  factionId?: number,
): Promise<Subdivision> {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }
  if (factionId !== undefined && subdivision.faction_id !== factionId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403,
    );
  }
  return subdivision;
}

/**
 * Парсить и валидировать данные из модала настроек подразделения.
 * Выбрасывает CalloutError при невалидных данных.
 */
export function parseSubdivisionSettingsData(
  interaction: ModalSubmitInteraction
): SubdivisionSettingsData {
  const shortDescription = interaction.fields.getTextInputValue('short_description').trim() || null;
  const logoUrl = interaction.fields.getTextInputValue('logo_url').trim() || null;
  const discordRoleId = interaction.fields.getTextInputValue('discord_role_id').trim() || null;

  if (logoUrl && !isValidDiscordEmoji(logoUrl)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректное эмодзи. Укажите кастомное эмодзи Discord (<:name:id>) или unicode-эмодзи (например 🏢).`,
      'INVALID_LOGO_EMOJI',
      400
    );
  }

  if (discordRoleId && !/^\d{17,20}$/.test(discordRoleId)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректный ID Discord роли. Должен содержать только цифры (17-20 символов).`,
      'INVALID_ROLE_ID',
      400
    );
  }

  return { short_description: shortDescription, logo_url: logoUrl, discord_role_id: discordRoleId };
}

type ErrorableInteraction = MessageComponentInteraction | ModalSubmitInteraction;

/**
 * Стандартный обработчик ошибок для Discord-взаимодействий (кнопки, модалы, меню).
 * Логирует ошибку и отправляет пользователю сообщение об ошибке.
 *
 * @param clearUI - если true, очищает embeds и components при editReply (для кнопочных панелей)
 * @param logExtra - дополнительные поля для лога (например guildId)
 */
export async function handleInteractionError(
  error: unknown,
  interaction: ErrorableInteraction,
  logContext: string,
  fallbackMessage = `${EMOJI.ERROR} Произошла ошибка`,
  options?: { logExtra?: Record<string, unknown>; clearUI?: boolean },
): Promise<void> {
  const { logExtra, clearUI } = options ?? {};
  logger.error(logContext, {
    error: error instanceof Error ? error.message : error,
    customId: interaction.customId,
    userId: interaction.user.id,
    ...logExtra,
  });
  const content = error instanceof CalloutError ? error.message : fallbackMessage;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(clearUI ? { content, embeds: [], components: [] } : { content });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
