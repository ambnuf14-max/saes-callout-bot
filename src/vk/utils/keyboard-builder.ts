import { Keyboard } from 'vk-io';

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
  type?: 'acknowledged' | 'on_way';
}

/**
 * Создать клавиатуру с кнопками "Принято" и "В пути"
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
      label: 'Отреагировать на инцидент',
      payload: JSON.stringify({ ...acknowledgedPayload, type: 'acknowledged' }),
      color: Keyboard.NEGATIVE_COLOR,
    })
    .inline()
    .toString();

  return keyboard;
}

export default {
  buildDetailedCalloutKeyboard,
};
