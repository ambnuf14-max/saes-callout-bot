import { Keyboard } from 'vk-io';
import { MESSAGES } from '../../config/constants';

/**
 * Утилиты для создания VK клавиатур
 */

export interface CalloutResponsePayload {
  action: 'respond' | 'decline' | 'revive' | 'specify_decline_reason';
  callout_id: number;
  subdivision_id: number;
}

/**
 * Клавиатура для активного каллаута: "Отреагировать" + "Отклонить"
 */
export function buildDetailedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): string {
  const respondPayload: CalloutResponsePayload = { action: 'respond', callout_id: calloutId, subdivision_id: subdivisionId };
  const declinePayload: CalloutResponsePayload = { action: 'decline', callout_id: calloutId, subdivision_id: subdivisionId };

  return Keyboard.builder()
    .callbackButton({
      label: MESSAGES.CALLOUT.BUTTON_RESPOND_VK,
      payload: JSON.stringify(respondPayload),
      color: Keyboard.NEGATIVE_COLOR,
    })
    .row()
    .callbackButton({
      label: MESSAGES.CALLOUT.BUTTON_DECLINE_VK,
      payload: JSON.stringify(declinePayload),
      color: Keyboard.PRIMARY_COLOR,
    })
    .inline()
    .toString();
}

/**
 * Клавиатура для отклонённого каллаута: только "Возобновить реагирование"
 */
export function buildDeclinedCalloutKeyboard(
  calloutId: number,
  subdivisionId: number
): string {
  const revivePayload: CalloutResponsePayload = { action: 'revive', callout_id: calloutId, subdivision_id: subdivisionId };

  return Keyboard.builder()
    .callbackButton({
      label: MESSAGES.CALLOUT.BUTTON_REVIVE_VK,
      payload: JSON.stringify(revivePayload),
      color: Keyboard.POSITIVE_COLOR,
    })
    .inline()
    .toString();
}

/**
 * Клавиатура для follow-up сообщения "Укажите причину"
 */
export function buildSpecifyReasonKeyboard(
  calloutId: number,
  subdivisionId: number
): string {
  const specifyPayload: CalloutResponsePayload = { action: 'specify_decline_reason', callout_id: calloutId, subdivision_id: subdivisionId };

  return Keyboard.builder()
    .callbackButton({
      label: MESSAGES.CALLOUT.BUTTON_SPECIFY_REASON_VK,
      payload: JSON.stringify(specifyPayload),
      color: Keyboard.SECONDARY_COLOR,
    })
    .inline()
    .toString();
}

export default {
  buildDetailedCalloutKeyboard,
  buildDeclinedCalloutKeyboard,
  buildSpecifyReasonKeyboard,
};
