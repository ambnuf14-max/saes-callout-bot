import { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { MESSAGES } from '../../config/constants';

/**
 * Утилиты для создания Telegram inline клавиатур
 */

export interface CalloutResponsePayload {
  action: 'respond' | 'decline' | 'revive' | 'specify_decline_reason' | 'cancel_decline' | 'cancel_response';
  callout_id: number;
  subdivision_id: number;
}

/**
 * Клавиатура для активного каллаута: "Отреагировать" + "Отклонить"
 * Компактный формат: r: = respond, dl: = decline
 */
export function buildDetailedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: MESSAGES.CALLOUT.BUTTON_RESPOND_TELEGRAM, callback_data: `r:${calloutId}:${subdivisionId}` }],
      [{ text: MESSAGES.CALLOUT.BUTTON_DECLINE_TELEGRAM, callback_data: `dl:${calloutId}:${subdivisionId}` }],
    ],
  };
}

/**
 * Клавиатура для отклонённого каллаута: "Возобновить реагирование"
 * rv: = revive
 */
export function buildDeclinedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: MESSAGES.CALLOUT.BUTTON_REVIVE_TELEGRAM, callback_data: `rv:${calloutId}:${subdivisionId}` }],
    ],
  };
}

/**
 * Клавиатура для сообщения об отклонении: кнопка "← Назад"
 * cd: = cancel_decline
 */
export function buildCancelDeclineKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '← Назад', callback_data: `cd:${calloutId}:${subdivisionId}` }],
    ],
  };
}

/**
 * Клавиатура после принятия запроса: "Отменить реагирование"
 * cr: = cancel_response
 */
export function buildCancelResponseKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: 'Отменить реагирование', callback_data: `cr:${calloutId}:${subdivisionId}` }],
    ],
  };
}

/**
 * Клавиатура для follow-up сообщения "Укажите причину"
 * sr: = specify_decline_reason
 */
export function buildSpecifyReasonKeyboard(
  calloutId: number,
  subdivisionId: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: MESSAGES.CALLOUT.BUTTON_SPECIFY_REASON_TELEGRAM, callback_data: `sr:${calloutId}:${subdivisionId}` }],
    ],
  };
}

/**
 * Распарсить компактный callback_data в CalloutResponsePayload
 */
export function parseCompactCallbackData(data: string): CalloutResponsePayload | null {
  if (data.startsWith('r:')) {
    const parts = data.split(':');
    if (parts.length < 3) return null;
    return { action: 'respond', callout_id: parseInt(parts[1], 10), subdivision_id: parseInt(parts[2], 10) };
  }
  if (data.startsWith('dl:')) {
    const parts = data.split(':');
    if (parts.length < 3) return null;
    return { action: 'decline', callout_id: parseInt(parts[1], 10), subdivision_id: parseInt(parts[2], 10) };
  }
  if (data.startsWith('rv:')) {
    const parts = data.split(':');
    if (parts.length < 3) return null;
    return { action: 'revive', callout_id: parseInt(parts[1], 10), subdivision_id: parseInt(parts[2], 10) };
  }
  if (data.startsWith('sr:')) {
    const parts = data.split(':');
    if (parts.length < 3) return null;
    return { action: 'specify_decline_reason', callout_id: parseInt(parts[1], 10), subdivision_id: parseInt(parts[2], 10) };
  }

  if (data.startsWith('cd:')) {
    const parts = data.split(':');
    if (parts.length < 3) return null;
    return { action: 'cancel_decline', callout_id: parseInt(parts[1], 10), subdivision_id: parseInt(parts[2], 10) };
  }

  if (data.startsWith('cr:')) {
    const parts = data.split(':');
    if (parts.length < 3) return null;
    return { action: 'cancel_response', callout_id: parseInt(parts[1], 10), subdivision_id: parseInt(parts[2], 10) };
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
  buildDeclinedCalloutKeyboard,
  buildSpecifyReasonKeyboard,
};
