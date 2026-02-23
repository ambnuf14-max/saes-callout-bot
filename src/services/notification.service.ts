import vkBot from '../vk/bot';
import telegramBot from '../telegram/bot';
import discordBot from '../discord/bot';
import logger from '../utils/logger';
import { Callout, Subdivision } from '../types/database.types';
import { CalloutModel, SubdivisionModel, CalloutResponseModel } from '../database/models';
import { PlatformChatMessageModel } from '../database/models/PlatformChatMessage';
import { activeCaptureState } from './chat-monitor.state';
import { CHAT_MONITOR } from '../config/constants';
import { sendCalloutNotification as sendVkCallout, formatCalloutClosedMessage as formatVkClosed, formatCalloutDeclinedMessage as formatVkDeclined } from '../vk/utils/message-sender';
import { sendCalloutNotification as sendTelegramCallout, formatCalloutClosedMessage as formatTelegramClosed, formatCalloutDeclinedMessage as formatTelegramDeclined, editMessage } from '../telegram/utils/message-sender';
import { buildDetailedCalloutKeyboard as buildVkKeyboard, buildDeclinedCalloutKeyboard as buildVkDeclinedKeyboard } from '../vk/utils/keyboard-builder';
import { buildDetailedCalloutKeyboard as buildTgKeyboard, buildDeclinedCalloutKeyboard as buildTgDeclinedKeyboard } from '../telegram/utils/keyboard-builder';
import { EMOJI } from '../config/constants';

const TELEGRAM_MAX_RETRIES = 3;
const TELEGRAM_RETRY_BASE_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getRetryAfterMs(error: unknown): number | null {
  const message = getErrorMessage(error);
  const retryAfterMatch = message.match(/retry after\s+(\d+)/i);
  if (!retryAfterMatch) return null;

  const seconds = parseInt(retryAfterMatch[1], 10);
  if (Number.isNaN(seconds) || seconds <= 0) return null;
  return seconds * 1000;
}

function isRetryableTelegramError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const retryableMarkers = [
    'efatal',
    'socket hang up',
    'econnreset',
    'etimedout',
    'eai_again',
    'enotfound',
    'too many requests',
    'retry after',
    '429',
  ];

  return retryableMarkers.some(marker => message.includes(marker));
}

async function runTelegramWithRetry<T>(
  operation: string,
  context: Record<string, unknown>,
  action: () => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TELEGRAM_MAX_RETRIES; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < TELEGRAM_MAX_RETRIES && isRetryableTelegramError(error);
      if (!shouldRetry) throw error;

      const delayMs = getRetryAfterMs(error) ?? TELEGRAM_RETRY_BASE_DELAY_MS * attempt;
      logger.warn('Telegram request failed, retrying', {
        operation,
        attempt,
        maxAttempts: TELEGRAM_MAX_RETRIES,
        delayMs,
        error: getErrorMessage(error),
        ...context,
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Сервис для отправки уведомлений в VK и Telegram
 */
export class NotificationService {
  /**
   * Отправить уведомление в VK о новом каллауте
   */
  static async notifyVkAboutCallout(
    callout: Callout,
    subdivision: Subdivision,
    authorFactionName?: string
  ): Promise<void> {
    // Проверить что VK бот активен
    if (!vkBot.isActive()) {
      logger.warn('VK bot is not active, skipping notification', {
        calloutId: callout.id,
      });
      return;
    }

    // Проверить что у подразделения есть VK чат
    if (!subdivision.vk_chat_id) {
      logger.warn('Subdivision has no VK chat linked, skipping notification', {
        calloutId: callout.id,
        subdivisionId: subdivision.id,
      });
      return;
    }

    try {
      logger.info('Sending VK notification about callout', {
        calloutId: callout.id,
        subdivisionId: subdivision.id,
        vkChatId: subdivision.vk_chat_id,
      });

      // Отправить уведомление в VK
      const messageId = await sendVkCallout(
        vkBot.getApi(),
        subdivision.vk_chat_id,
        callout,
        subdivision,
        authorFactionName
      );

      // Сохранить ID сообщения в БД
      await CalloutModel.update(callout.id, {
        vk_message_id: messageId.toString(),
      });

      // Поставить в очередь захват следующих N сообщений из этого чата
      const captureKey = `vk:${subdivision.vk_chat_id}`;
      const entry = { calloutId: callout.id, subdivisionId: subdivision.id, remaining: CHAT_MONITOR.CALLOUT_CAPTURE_COUNT };
      const queue = activeCaptureState.get(captureKey);
      if (queue) {
        queue.push(entry);
      } else {
        activeCaptureState.set(captureKey, [entry]);
      }

      logger.info('VK notification sent successfully', {
        calloutId: callout.id,
        vkMessageId: messageId,
      });
    } catch (error) {
      // Логируем ошибку, но не бросаем её дальше
      // VK уведомление не должно ломать создание каллаута в Discord
      logger.error('Failed to send VK notification', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
        subdivisionId: subdivision.id,
      });

      // Можно отправить уведомление администраторам Discord об ошибке VK
      // TODO: Опционально
    }
  }

  /**
   * Обновить статус каллаута в VK
   */
  static async updateVkCalloutStatus(
    callout: Callout,
    status: string
  ): Promise<void> {
    if (!vkBot.isActive()) {
      return;
    }

    if (!callout.vk_message_id || !callout.subdivision_id) {
      logger.warn('Cannot update VK message - missing data', {
        calloutId: callout.id,
      });
      return;
    }

    try {
      const subdivision = await SubdivisionModel.findById(callout.subdivision_id);

      if (!subdivision) {
        logger.warn('Subdivision not found for VK update', {
          calloutId: callout.id,
          subdivisionId: callout.subdivision_id,
        });
        return;
      }

      if (!subdivision.vk_chat_id) {
        logger.warn('Subdivision has no VK chat linked', {
          calloutId: callout.id,
          subdivisionId: callout.subdivision_id,
        });
        return;
      }

      // Форматировать сообщение о закрытии
      let message: string;
      if (status === 'closed') {
        const allResponses = await CalloutResponseModel.findByCalloutId(callout.id);
        const uniqueSubIds = [...new Set(allResponses.map(r => r.subdivision_id))];
        const subdivisionsMap = await SubdivisionModel.findByIds(uniqueSubIds);
        message = formatVkClosed(callout, subdivision, allResponses, subdivisionsMap);
      } else {
        message = `${EMOJI.INFO} Статус каллаута #${callout.id} обновлен: ${status}`;
      }

      // Обновить сообщение в VK
      const editParams: { peer_id: number; cmid: number; message: string; keyboard?: string } = {
        peer_id: parseInt(subdivision.vk_chat_id),
        cmid: parseInt(callout.vk_message_id),
        message: message,
      };

      if (status === 'closed') {
        // Удалить клавиатуру при закрытии
        editParams.keyboard = JSON.stringify({ buttons: [], inline: true });
      } else {
        // Сохранить клавиатуру при обновлении статуса
        const { buildDetailedCalloutKeyboard } = await import('../vk/utils/keyboard-builder');
        editParams.keyboard = buildDetailedCalloutKeyboard(callout.id, callout.subdivision_id);
      }

      await vkBot.getApi().api.messages.edit(editParams);

      logger.info('VK callout status updated', {
        calloutId: callout.id,
        status,
      });
    } catch (error) {
      logger.error('Failed to update VK callout status', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
        status,
      });
      // Не критично, не бросаем ошибку
    }
  }

  /**
   * Отправить уведомление в VK о закрытии каллаута
   */
  static async notifyVkAboutCalloutClosed(callout: Callout): Promise<void> {
    await this.updateVkCalloutStatus(callout, 'closed');
  }

  /**
   * Отправить уведомление в Telegram о новом каллауте
   */
  static async notifyTelegramAboutCallout(
    callout: Callout,
    subdivision: Subdivision,
    authorFactionName?: string
  ): Promise<void> {
    // Проверить что Telegram бот активен
    if (!telegramBot.isActive()) {
      logger.warn('Telegram bot is not active, skipping notification', {
        calloutId: callout.id,
      });
      return;
    }

    // Проверить что у подразделения есть Telegram чат
    if (!subdivision.telegram_chat_id) {
      logger.warn('Subdivision has no Telegram chat linked, skipping notification', {
        calloutId: callout.id,
        subdivisionId: subdivision.id,
      });
      return;
    }

    try {
      logger.info('Sending Telegram notification about callout', {
        calloutId: callout.id,
        subdivisionId: subdivision.id,
        telegramChatId: subdivision.telegram_chat_id,
      });

      // Отправить уведомление в Telegram
      const messageId = await runTelegramWithRetry(
        'send-callout',
        {
          calloutId: callout.id,
          subdivisionId: subdivision.id,
          telegramChatId: subdivision.telegram_chat_id,
        },
        () => sendTelegramCallout(
          telegramBot.getApi(),
          subdivision.telegram_chat_id!,
          callout,
          subdivision,
          authorFactionName
        )
      );

      // Сохранить ID сообщения в БД
      await CalloutModel.update(callout.id, {
        telegram_message_id: messageId.toString(),
      });

      // Поставить в очередь захват следующих N сообщений из этого чата
      const captureKey = `telegram:${subdivision.telegram_chat_id}`;
      const entry = { calloutId: callout.id, subdivisionId: subdivision.id, remaining: CHAT_MONITOR.CALLOUT_CAPTURE_COUNT };
      const queue = activeCaptureState.get(captureKey);
      if (queue) {
        queue.push(entry);
      } else {
        activeCaptureState.set(captureKey, [entry]);
      }

      logger.info('Telegram notification sent successfully', {
        calloutId: callout.id,
        telegramMessageId: messageId,
      });
    } catch (error) {
      // Логируем ошибку, но не бросаем её дальше
      // Telegram уведомление не должно ломать создание каллаута в Discord
      logger.error('Failed to send Telegram notification', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
        subdivisionId: subdivision.id,
      });
    }
  }

  /**
   * Обновить статус каллаута в Telegram
   */
  static async updateTelegramCalloutStatus(
    callout: Callout,
    status: string
  ): Promise<void> {
    if (!telegramBot.isActive()) {
      return;
    }

    if (!callout.telegram_message_id || !callout.subdivision_id) {
      logger.warn('Cannot update Telegram message - missing data', {
        calloutId: callout.id,
      });
      return;
    }

    try {
      const subdivision = await SubdivisionModel.findById(callout.subdivision_id);

      if (!subdivision) {
        logger.warn('Subdivision not found for Telegram update', {
          calloutId: callout.id,
          subdivisionId: callout.subdivision_id,
        });
        return;
      }

      if (!subdivision.telegram_chat_id) {
        logger.warn('Subdivision has no Telegram chat linked', {
          calloutId: callout.id,
          subdivisionId: callout.subdivision_id,
        });
        return;
      }

      // Форматировать сообщение о закрытии
      let message: string;
      if (status === 'closed') {
        const allResponses = await CalloutResponseModel.findByCalloutId(callout.id);
        const uniqueSubIds = [...new Set(allResponses.map(r => r.subdivision_id))];
        const subdivisionsMap = await SubdivisionModel.findByIds(uniqueSubIds);
        let closedByName: string | undefined;
        if (callout.closed_by === 'system') {
          closedByName = 'System';
        } else if (callout.closed_by && discordBot.client.isReady()) {
          try {
            const user = await discordBot.client.users.fetch(callout.closed_by);
            closedByName = user.displayName || user.username;
          } catch {
            closedByName = undefined;
          }
        }
        message = formatTelegramClosed(callout, subdivision, allResponses, subdivisionsMap, closedByName);
      } else {
        message = `${EMOJI.INFO} Статус каллаута #${callout.id} обновлен: ${status}`;
      }

      // Обновить сообщение в Telegram (удалить клавиатуру при закрытии)
      await runTelegramWithRetry(
        'edit-callout-status',
        {
          calloutId: callout.id,
          subdivisionId: subdivision.id,
          telegramChatId: subdivision.telegram_chat_id,
          status,
        },
        () => editMessage(
          telegramBot.getApi(),
          subdivision.telegram_chat_id!,
          parseInt(callout.telegram_message_id!),
          message,
          status === 'closed'
        )
      );

      logger.info('Telegram callout status updated', {
        calloutId: callout.id,
        status,
      });
    } catch (error) {
      logger.error('Failed to update Telegram callout status', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
        status,
      });
      // Не критично, не бросаем ошибку
    }
  }

  /**
   * Отправить уведомление в Telegram о закрытии каллаута
   */
  static async notifyTelegramAboutCalloutClosed(callout: Callout): Promise<void> {
    await this.updateTelegramCalloutStatus(callout, 'closed');
  }

  /**
   * Обновить VK сообщение об отклонении каллаута
   */
  static async notifyVkAboutCalloutDeclined(callout: Callout): Promise<void> {
    if (!vkBot.isActive() || !callout.vk_message_id || callout.vk_message_id === '0') return;

    try {
      const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
      if (!subdivision?.vk_chat_id) return;

      const message = formatVkDeclined(callout, subdivision);
      const keyboard = buildVkDeclinedKeyboard(callout.id, callout.subdivision_id);

      await (vkBot.getApi().api.messages.edit as any)({
        peer_id: parseInt(subdivision.vk_chat_id),
        cmid: parseInt(callout.vk_message_id),
        message,
        keyboard,
      });

      logger.info('VK message updated for declined callout', { calloutId: callout.id });
    } catch (error) {
      logger.error('Failed to notify VK about declined callout', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
      });
    }
  }

  /**
   * Обновить Telegram сообщение об отклонении каллаута
   */
  static async notifyTelegramAboutCalloutDeclined(callout: Callout): Promise<void> {
    if (!telegramBot.isActive() || !callout.telegram_message_id) return;

    try {
      const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
      if (!subdivision?.telegram_chat_id) return;

      const message = formatTelegramDeclined(callout, subdivision);
      const keyboard = buildTgDeclinedKeyboard(callout.id, callout.subdivision_id);

      await runTelegramWithRetry(
        'edit-declined-callout',
        {
          calloutId: callout.id,
          subdivisionId: subdivision.id,
          telegramChatId: subdivision.telegram_chat_id,
        },
        () => telegramBot.getApi().editMessageText(message, {
          chat_id: subdivision.telegram_chat_id!,
          message_id: parseInt(callout.telegram_message_id!),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: keyboard,
        })
      );

      logger.info('Telegram message updated for declined callout', { calloutId: callout.id });
    } catch (error) {
      logger.error('Failed to notify Telegram about declined callout', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
      });
    }
  }

  /**
   * Обновить VK сообщение при возобновлении реагирования
   */
  static async notifyVkAboutCalloutRevived(callout: Callout): Promise<void> {
    if (!vkBot.isActive() || !callout.vk_message_id || callout.vk_message_id === '0') return;

    try {
      const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
      if (!subdivision?.vk_chat_id) return;

      const allResponses = await CalloutResponseModel.findByCalloutId(callout.id);
      const uniqueSubIds = [...new Set(allResponses.map(r => r.subdivision_id))];
      const subdivisionsMap = await SubdivisionModel.findByIds(uniqueSubIds);

      // Если уже есть ответы — убрать клавиатуру, иначе вернуть активную
      let keyboard: string;
      if (allResponses.length > 0) {
        keyboard = JSON.stringify({ buttons: [], inline: true });
      } else {
        keyboard = buildVkKeyboard(callout.id, callout.subdivision_id);
      }

      const { formatActiveCalloutWithLog } = await import('../vk/utils/message-sender');
      const message = formatActiveCalloutWithLog(callout, subdivision, allResponses, subdivisionsMap);

      await (vkBot.getApi().api.messages.edit as any)({
        peer_id: parseInt(subdivision.vk_chat_id),
        cmid: parseInt(callout.vk_message_id),
        message,
        keyboard,
      });

      logger.info('VK message updated for revived callout', { calloutId: callout.id });
    } catch (error) {
      logger.error('Failed to notify VK about revived callout', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
      });
    }
  }

  /**
   * Обновить Telegram сообщение при возобновлении реагирования
   */
  static async notifyTelegramAboutCalloutRevived(callout: Callout): Promise<void> {
    if (!telegramBot.isActive() || !callout.telegram_message_id) return;

    try {
      const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
      if (!subdivision?.telegram_chat_id) return;

      const allResponses = await CalloutResponseModel.findByCalloutId(callout.id);
      const uniqueSubIds = [...new Set(allResponses.map(r => r.subdivision_id))];
      const subdivisionsMap = await SubdivisionModel.findByIds(uniqueSubIds);

      const { formatActiveCalloutWithLog } = await import('../telegram/utils/message-sender');
      const message = formatActiveCalloutWithLog(callout, subdivision, allResponses, subdivisionsMap);

      // Если уже есть ответы — убрать клавиатуру, иначе вернуть активную
      const removeKeyboard = allResponses.length > 0;
      const replyMarkup = removeKeyboard
        ? { inline_keyboard: [] }
        : buildTgKeyboard(callout.id, callout.subdivision_id);

      await runTelegramWithRetry(
        'edit-revived-callout',
        {
          calloutId: callout.id,
          subdivisionId: subdivision.id,
          telegramChatId: subdivision.telegram_chat_id,
        },
        () => telegramBot.getApi().editMessageText(message, {
          chat_id: subdivision.telegram_chat_id!,
          message_id: parseInt(callout.telegram_message_id!),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: replyMarkup,
        })
      );

      logger.info('Telegram message updated for revived callout', { calloutId: callout.id });
    } catch (error) {
      logger.error('Failed to notify Telegram about revived callout', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
      });
    }
  }

  /**
   * Восстановить activeCaptureState при рестарте бота из активных каллаутов в БД.
   * remaining вычисляется как CALLOUT_CAPTURE_COUNT минус уже захваченные сообщения.
   */
  static async restoreActiveCaptureStates(): Promise<void> {
    try {
      const activeCallouts = await CalloutModel.findActive();
      let restored = 0;

      for (const callout of activeCallouts) {
        const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
        if (!subdivision) continue;

        if (subdivision.vk_chat_id) {
          const captureKey = `vk:${subdivision.vk_chat_id}`;
          if (!activeCaptureState.has(captureKey)) {
            const captured = await PlatformChatMessageModel.countByCalloutAndPlatform(callout.id, 'vk');
            const remaining = CHAT_MONITOR.CALLOUT_CAPTURE_COUNT - captured;
            if (remaining > 0) {
              activeCaptureState.set(captureKey, [{
                calloutId: callout.id,
                subdivisionId: subdivision.id,
                remaining,
              }]);
              restored++;
            }
          }
        }

        if (subdivision.telegram_chat_id) {
          const captureKey = `telegram:${subdivision.telegram_chat_id}`;
          if (!activeCaptureState.has(captureKey)) {
            const captured = await PlatformChatMessageModel.countByCalloutAndPlatform(callout.id, 'telegram');
            const remaining = CHAT_MONITOR.CALLOUT_CAPTURE_COUNT - captured;
            if (remaining > 0) {
              activeCaptureState.set(captureKey, [{
                calloutId: callout.id,
                subdivisionId: subdivision.id,
                remaining,
              }]);
              restored++;
            }
          }
        }
      }

      if (restored > 0) {
        logger.info('Restored active capture states after restart', { restored, total: activeCallouts.length });
      }
    } catch (error) {
      logger.error('Failed to restore active capture states', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}

export default NotificationService;
