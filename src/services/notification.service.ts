import vkBot from '../vk/bot';
import logger from '../utils/logger';
import { Callout, Subdivision } from '../types/database.types';
import { CalloutModel } from '../database/models';
import { sendCalloutNotification, formatCalloutClosedMessage } from '../vk/utils/message-sender';
import { EMOJI } from '../config/constants';

/**
 * Сервис для отправки уведомлений
 */
export class NotificationService {
  /**
   * Отправить уведомление в VK о новом каллауте
   */
  static async notifyVkAboutCallout(
    callout: Callout,
    subdivision: Subdivision
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
      const messageId = await sendCalloutNotification(
        vkBot.getApi(),
        subdivision.vk_chat_id,
        callout,
        subdivision
      );

      // Сохранить ID сообщения в БД
      await CalloutModel.update(callout.id, {
        vk_message_id: messageId.toString(),
      });

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
      const subdivision = await (
        await import('../database/models')
      ).SubdivisionModel.findById(callout.subdivision_id);

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
        message = formatCalloutClosedMessage(callout);
      } else {
        message = `${EMOJI.INFO} Статус каллаута #${callout.id} обновлен: ${status}`;
      }

      // Обновить сообщение в VK
      await vkBot.getApi().api.messages.edit({
        peer_id: parseInt(subdivision.vk_chat_id),
        message_id: parseInt(callout.vk_message_id),
        message: message,
      });

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
}

export default NotificationService;
