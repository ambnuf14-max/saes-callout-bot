import { TextChannel } from 'discord.js';
import discordBot from '../discord/bot';
import logger from '../utils/logger';
import {
  CalloutModel,
  DepartmentModel,
  CalloutResponseModel,
} from '../database/models';
import { Callout, CalloutResponse, Department } from '../types/database.types';
import { CalloutResponsePayload } from '../vk/utils/keyboard-builder';
import { EMOJI, CALLOUT_STATUS } from '../config/constants';
import { CalloutError } from '../utils/error-handler';
import {
  logAuditEvent,
  AuditEventType,
  VkResponseReceivedData,
} from '../discord/utils/audit-logger';

/**
 * Сервис синхронизации между VK и Discord
 */
export class SyncService {
  /**
   * Обработать ответ из VK на каллаут
   */
  static async handleVkResponse(
    payload: CalloutResponsePayload,
    vkUserId: string,
    vkUserName: string
  ): Promise<CalloutResponse> {
    logger.info('Processing VK response', {
      calloutId: payload.callout_id,
      departmentId: payload.dept_id,
      vkUserId,
    });

    // 1. Проверить существование каллаута
    const callout = await CalloutModel.findById(payload.callout_id);
    if (!callout) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут #${payload.callout_id} не найден`,
        'CALLOUT_NOT_FOUND',
        404
      );
    }

    // 2. Проверить статус каллаута
    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут #${callout.id} уже закрыт`,
        'CALLOUT_ALREADY_CLOSED',
        400
      );
    }

    // 3. Проверить существование департамента
    const department = await DepartmentModel.findById(payload.dept_id);
    if (!department) {
      throw new CalloutError(
        `${EMOJI.ERROR} Департамент не найден`,
        'DEPARTMENT_NOT_FOUND',
        404
      );
    }

    // 4. Проверить, не отвечал ли уже этот пользователь
    const hasResponded = await CalloutResponseModel.hasUserResponded(
      callout.id,
      vkUserId
    );

    if (hasResponded) {
      logger.info('User already responded to this callout', {
        calloutId: callout.id,
        vkUserId,
      });
      // Не бросаем ошибку, просто возвращаем существующий ответ
      const existingResponse = await CalloutResponseModel.getLastUserResponse(
        callout.id,
        vkUserId
      );
      if (existingResponse) {
        return existingResponse;
      }
    }

    // 5. Создать запись ответа в БД
    const response = await CalloutResponseModel.create({
      callout_id: callout.id,
      department_id: department.id,
      vk_user_id: vkUserId,
      vk_user_name: vkUserName,
      response_type: 'acknowledged',
    });

    logger.info('VK response saved to database', {
      responseId: response.id,
      calloutId: callout.id,
      vkUserId,
    });

    // 6. Отправить уведомление в Discord
    try {
      await this.notifyDiscordAboutResponse(response, callout, department);
    } catch (error) {
      logger.error('Failed to notify Discord about VK response', {
        error: error instanceof Error ? error.message : error,
        responseId: response.id,
      });
      // Не критично, запись в БД уже создана
    }

    return response;
  }

  /**
   * Отправить уведомление в Discord о реагировании из VK
   */
  static async notifyDiscordAboutResponse(
    response: CalloutResponse,
    callout: Callout,
    department: Department
  ): Promise<void> {
    if (!callout.discord_channel_id) {
      logger.warn('No Discord channel for callout', {
        calloutId: callout.id,
      });
      return;
    }

    try {
      // Получить канал Discord
      const channel = (await discordBot.client.channels.fetch(
        callout.discord_channel_id
      )) as TextChannel;

      if (!channel || !channel.isTextBased()) {
        logger.warn('Discord channel not found or not text-based', {
          channelId: callout.discord_channel_id,
        });
        return;
      }

      // Форматировать сообщение
      const message = this.formatResponseMessage(response, department);

      // Отправить сообщение
      await channel.send(message);

      logger.info('Discord notified about VK response', {
        calloutId: callout.id,
        channelId: channel.id,
        responseId: response.id,
      });

      // Логировать в audit log
      const auditData: VkResponseReceivedData = {
        userId: response.vk_user_id,
        userName: response.vk_user_name,
        calloutId: callout.id,
        departmentName: department.name,
        vkUserId: response.vk_user_id,
        vkUserName: response.vk_user_name,
      };
      await logAuditEvent(channel.guild, AuditEventType.VK_RESPONSE_RECEIVED, auditData);

      // Опционально: обновить embed с списком ответов
      // TODO: можно добавить позже
    } catch (error) {
      logger.error('Failed to send Discord notification', {
        error: error instanceof Error ? error.message : error,
        channelId: callout.discord_channel_id,
      });
      throw error;
    }
  }

  /**
   * Форматировать сообщение о реагировании для Discord
   */
  private static formatResponseMessage(
    response: CalloutResponse,
    department: Department
  ): string {
    const timestamp = new Date(response.created_at).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
    });

    return (
      `${EMOJI.SUCCESS} **${department.name}** отреагировал на инцидент\n` +
      `👤 Ответил: ${response.vk_user_name} (VK)\n` +
      `🕐 Время: ${timestamp}`
    );
  }

  /**
   * Получить статистику ответов на каллаут
   */
  static async getCalloutResponses(
    calloutId: number
  ): Promise<CalloutResponse[]> {
    return await CalloutResponseModel.findByCalloutId(calloutId);
  }

  /**
   * Получить количество департаментов, ответивших на каллаут
   */
  static async getRespondedDepartmentsCount(
    calloutId: number
  ): Promise<number> {
    return await CalloutResponseModel.countUniqueDepartments(calloutId);
  }
}

export default SyncService;
