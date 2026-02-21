import { InlineKeyboardMarkup } from 'node-telegram-bot-api';

/**
 * Утилиты для создания Telegram inline клавиатур
 */

/**
 * Payload для кнопки реагирования на каллаут (совместим с VK)
 */
export interface CalloutResponsePayload {
  action: 'respond';
  callout_id: number;
  subdivision_id: number;
}

/**
 * Создать клавиатуру с кнопкой "Отреагировать на инцидент"
 * Используем компактный формат callback_data для соблюдения лимита Telegram (64 байта):
 * r:{callout_id}:{subdivision_id}
 */
export function buildDetailedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: 'Отреагировать на инцидент',
          callback_data: `r:${calloutId}:${subdivisionId}`,
        },
      ],
    ],
  };
}

/**
 * Распарсить компактный callback_data в CalloutResponsePayload
 */
export function parseCompactCallbackData(data: string): CalloutResponsePayload | null {
  // Компактный формат: r:{callout_id}:{subdivision_id}
  if (data.startsWith('r:')) {
    const parts = data.split(':');
    if (parts.length < 3) return null;
    return {
      action: 'respond',
      callout_id: parseInt(parts[1], 10),
      subdivision_id: parseInt(parts[2], 10),
    };
  }

  // JSON fallback (старые кнопки)
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export default {
  buildDetailedCalloutKeyboard,
};
