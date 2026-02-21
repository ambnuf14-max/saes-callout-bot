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
}

/**
 * Создать клавиатуру с кнопкой "Отреагировать на инцидент"
 */
export function buildDetailedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): string {
  const payload: CalloutResponsePayload = {
    action: 'respond',
    callout_id: calloutId,
    subdivision_id: subdivisionId,
  };

  const keyboard = Keyboard.builder()
    .callbackButton({
      label: 'Отреагировать на инцидент',
      payload: JSON.stringify(payload),
      color: Keyboard.NEGATIVE_COLOR,
    })
    .inline()
    .toString();

  return keyboard;
}

export default {
  buildDetailedCalloutKeyboard,
};
