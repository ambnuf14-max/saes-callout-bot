import { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { MESSAGES } from '../../config/constants';

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
 * Создать inline клавиатуру для каллаута с кнопкой "Отреагировать"
 */
export function buildCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  const payload: CalloutResponsePayload = {
    action: 'respond',
    callout_id: calloutId,
    subdivision_id: subdivisionId,
  };

  return {
    inline_keyboard: [
      [
        {
          text: MESSAGES.CALLOUT.BUTTON_RESPOND_TELEGRAM || '✅ Отреагировать',
          callback_data: JSON.stringify(payload),
        },
      ],
    ],
  };
}

/**
 * Создать клавиатуру с несколькими типами ответа (опционально для будущего)
 */
export function buildDetailedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  const acknowledgedPayload: CalloutResponsePayload = {
    action: 'respond',
    callout_id: calloutId,
    subdivision_id: subdivisionId,
  };

  return {
    inline_keyboard: [
      [
        {
          text: '✅ Принято',
          callback_data: JSON.stringify({ ...acknowledgedPayload, type: 'acknowledged' }),
        },
        {
          text: '🚗 В пути',
          callback_data: JSON.stringify({ ...acknowledgedPayload, type: 'on_way' }),
        },
      ],
      [
        {
          text: '📍 Прибыли',
          callback_data: JSON.stringify({ ...acknowledgedPayload, type: 'arrived' }),
        },
      ],
    ],
  };
}

export default {
  buildCalloutKeyboard,
  buildDetailedCalloutKeyboard,
};
