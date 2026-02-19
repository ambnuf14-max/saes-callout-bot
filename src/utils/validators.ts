import { LIMITS, MESSAGES } from '../config/constants';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Валидаторы для различных типов данных
 */
export const validators = {
  /**
   * Проверка Discord ID (snowflake: 17-19 цифр)
   */
  isValidDiscordId(id: string): boolean {
    return /^\d{17,19}$/.test(id);
  },

  /**
   * Проверка VK Peer ID (беседы начинаются с 2000000)
   */
  isValidVkPeerId(id: string): boolean {
    return /^2000000\d{3,}$/.test(id);
  },

  /**
   * Валидация описания каллаута
   */
  validateCalloutDescription(text: string): ValidationResult {
    if (!text || text.trim().length === 0) {
      return {
        valid: false,
        error: MESSAGES.VALIDATION.DESC_EMPTY,
      };
    }

    const trimmed = text.trim();

    if (trimmed.length > LIMITS.DESCRIPTION_MAX) {
      return {
        valid: false,
        error: MESSAGES.VALIDATION.DESC_TOO_LONG(LIMITS.DESCRIPTION_MAX),
      };
    }

    return { valid: true };
  },

  /**
   * Валидация места инцидента
   */
  validateLocation(location: string): ValidationResult {
    if (!location || location.trim().length === 0) {
      return {
        valid: false,
        error: MESSAGES.VALIDATION.LOCATION_EMPTY,
      };
    }

    const trimmed = location.trim();

    if (trimmed.length > LIMITS.LOCATION_MAX) {
      return {
        valid: false,
        error: MESSAGES.VALIDATION.LOCATION_TOO_LONG(LIMITS.LOCATION_MAX),
      };
    }

    return { valid: true };
  },

  /**
   * Валидация имени фракции
   * Формат: 2-10 символов, только заглавные буквы и цифры
   */
  validateFactionName(name: string): ValidationResult {
    if (!name || name.trim().length === 0) {
      return {
        valid: false,
        error: 'Название не может быть пустым',
      };
    }

    const trimmed = name.trim();

    if (
      trimmed.length < LIMITS.FACTION_NAME_MIN ||
      trimmed.length > LIMITS.FACTION_NAME_MAX
    ) {
      return {
        valid: false,
        error: MESSAGES.FACTION.ERROR_INVALID_NAME,
      };
    }

    if (!/^[A-Z0-9]+$/.test(trimmed)) {
      return {
        valid: false,
        error: MESSAGES.FACTION.ERROR_INVALID_NAME,
      };
    }

    return { valid: true };
  },

  /**
   * Проверка валидности роли Discord
   */
  isValidDiscordRole(roleId: string): boolean {
    return validators.isValidDiscordId(roleId);
  },

  /**
   * Валидация ID канала Discord
   */
  isValidChannelId(channelId: string): boolean {
    return validators.isValidDiscordId(channelId);
  },

  /**
   * Валидация ID сообщения Discord
   */
  isValidMessageId(messageId: string): boolean {
    return validators.isValidDiscordId(messageId);
  },

  /**
   * Проверка что строка не пустая
   */
  isNotEmpty(value: string): boolean {
    return value !== null && value !== undefined && value.trim().length > 0;
  },
};

export default validators;
