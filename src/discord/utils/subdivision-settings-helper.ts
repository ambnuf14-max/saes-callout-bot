import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';
import { Subdivision } from '../../types/database.types';
import { CalloutError } from '../../utils/error-handler';
import { EMOJI } from '../../config/constants';

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
