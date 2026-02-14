import { Keyboard } from 'vk-io';
import { MESSAGES } from '../../config/constants';

/**
 * Утилиты для создания VK клавиатур
 */

/**
 * Payload для кнопки реагирования на каллаут
 */
export interface CalloutResponsePayload {
  action: 'respond';
  callout_id: number;
  subdivision_id: number;
}

/**
 * Создать клавиатуру для каллаута с кнопкой "Отреагировать"
 */
export function buildCalloutKeyboard(calloutId: number, subdivisionId: number): string {
  const payload: CalloutResponsePayload = {
    action: 'respond',
    callout_id: calloutId,
    subdivision_id: subdivisionId,
  };

  const keyboard = Keyboard.builder()
    .callbackButton({
      label: MESSAGES.CALLOUT.BUTTON_RESPOND_VK,
      payload: JSON.stringify(payload),
      color: Keyboard.PRIMARY_COLOR,
    })
    .inline()
    .toString();

  return keyboard;
}

/**
 * Создать клавиатуру с несколькими типами ответа (опционально для будущего)
 */
export function buildDetailedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): string {
  const acknowledgedPayload: CalloutResponsePayload = {
    action: 'respond',
    callout_id: calloutId,
    subdivision_id: subdivisionId,
  };

  const keyboard = Keyboard.builder()
    .callbackButton({
      label: '✅ Принято',
      payload: JSON.stringify({ ...acknowledgedPayload, type: 'acknowledged' }),
      color: Keyboard.POSITIVE_COLOR,
    })
    .callbackButton({
      label: '🚗 В пути',
      payload: JSON.stringify({ ...acknowledgedPayload, type: 'on_way' }),
      color: Keyboard.PRIMARY_COLOR,
    })
    .row()
    .callbackButton({
      label: '📍 Прибыли',
      payload: JSON.stringify({ ...acknowledgedPayload, type: 'arrived' }),
      color: Keyboard.POSITIVE_COLOR,
    })
    .inline()
    .toString();

  return keyboard;
}

export default {
  buildCalloutKeyboard,
  buildDetailedCalloutKeyboard,
};
