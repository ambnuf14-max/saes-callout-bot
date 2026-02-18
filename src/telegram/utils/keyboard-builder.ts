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
  type?: 'acknowledged' | 'on_way';
}

/**
 * Создать клавиатуру с кнопками "Принято" и "В пути"
 * Используем компактный формат callback_data для соблюдения лимита Telegram (64 байта):
 * r:{callout_id}:{subdivision_id}:{type_short}
 */
export function buildDetailedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '✅ Принято',
          callback_data: `r:${calloutId}:${subdivisionId}:a`,
        },
        {
          text: '🚗 В пути',
          callback_data: `r:${calloutId}:${subdivisionId}:w`,
        },
      ],
    ],
  };
}

/**
 * Распарсить компактный callback_data в CalloutResponsePayload
 */
export function parseCompactCallbackData(data: string): (CalloutResponsePayload & { type?: 'acknowledged' | 'on_way' }) | null {
  // Компактный формат: r:{callout_id}:{subdivision_id}:{type_short}
  if (data.startsWith('r:')) {
    const parts = data.split(':');
    if (parts.length < 3) return null;
    const typeMap: Record<string, 'acknowledged' | 'on_way'> = { a: 'acknowledged', w: 'on_way' };
    return {
      action: 'respond',
      callout_id: parseInt(parts[1], 10),
      subdivision_id: parseInt(parts[2], 10),
      type: parts[3] ? typeMap[parts[3]] : undefined,
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
