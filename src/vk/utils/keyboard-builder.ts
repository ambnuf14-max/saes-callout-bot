import { Keyboard } from 'vk-io';
import { MESSAGES } from '../../config/constants';

/**
 * Утилиты для создания VK клавиатур
 */

export interface CalloutResponsePayload {
  action: 'respond' | 'decline' | 'revive' | 'specify_decline_reason' | 'cancel_decline' | 'cancel_response';
  callout_id: number;
  subdivision_id: number;
}

export interface VkAdminCheckPayload {
  action: 'check_vk_admin';
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
      color: Keyboard.POSITIVE_COLOR,
    })
    .row()
    .callbackButton({
      label: MESSAGES.CALLOUT.BUTTON_DECLINE_VK,
      payload: JSON.stringify(declinePayload),
      color: Keyboard.NEGATIVE_COLOR,
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
 * Клавиатура для сообщения об отклонении: кнопка "← Назад"
 */
export function buildCancelDeclineKeyboard(
  calloutId: number,
  subdivisionId: number
): string {
  const cancelPayload: CalloutResponsePayload = { action: 'cancel_decline', callout_id: calloutId, subdivision_id: subdivisionId };

  return Keyboard.builder()
    .callbackButton({
      label: '← Назад',
      payload: JSON.stringify(cancelPayload),
      color: Keyboard.SECONDARY_COLOR,
    })
    .inline()
    .toString();
}

/**
 * Клавиатура после принятия запроса: "Отменить реагирование"
 */
export function buildCancelResponseKeyboard(
  calloutId: number,
  subdivisionId: number
): string {
  const cancelPayload: CalloutResponsePayload = { action: 'cancel_response', callout_id: calloutId, subdivision_id: subdivisionId };

  return Keyboard.builder()
    .callbackButton({
      label: 'Отменить реагирование',
      payload: JSON.stringify(cancelPayload),
      color: Keyboard.NEGATIVE_COLOR,
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

/**
 * Клавиатура для запроса прав администратора перед верификацией
 */
export function buildCheckAdminRightsKeyboard(): string {
  const payload: VkAdminCheckPayload = { action: 'check_vk_admin' };

  return Keyboard.builder()
    .callbackButton({
      label: '✅ Я выдал права',
      payload: JSON.stringify(payload),
      color: Keyboard.POSITIVE_COLOR,
    })
    .inline()
    .toString();
}

export default {
  buildDetailedCalloutKeyboard,
  buildDeclinedCalloutKeyboard,
  buildSpecifyReasonKeyboard,
};
