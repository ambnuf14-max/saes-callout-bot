import { TextChannel } from 'discord.js';
import discordBot from '../discord/bot';
import logger from '../utils/logger';
import {
  CalloutModel,
  SubdivisionModel,
  CalloutResponseModel,
} from '../database/models';
import { Callout, CalloutResponse, Subdivision } from '../types/database.types';
import { CalloutResponsePayload } from '../vk/utils/keyboard-builder';
import { EMOJI, CALLOUT_STATUS } from '../config/constants';
import { CalloutError } from '../utils/error-handler';
import {
  logAuditEvent,
  AuditEventType,
  VkResponseReceivedData,
} from '../discord/utils/audit-logger';

/**
 * Сервис синхронизации между VK, Telegram и Discord
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
      subdivisionId: payload.subdivision_id,
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

    // 3. Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(payload.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение не найдено`,
        'SUBDIVISION_NOT_FOUND',
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
      subdivision_id: subdivision.id,
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
      await this.notifyDiscordAboutResponse(response, callout, subdivision);
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
   * Обработать ответ из Telegram на каллаут
   */
  static async handleTelegramResponse(
    payload: CalloutResponsePayload,
    telegramUserId: string,
    telegramUserName: string
  ): Promise<CalloutResponse> {
    logger.info('Processing Telegram response', {
      calloutId: payload.callout_id,
      subdivisionId: payload.subdivision_id,
      telegramUserId,
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

    // 3. Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(payload.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение не найдено`,
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    // 4. Проверить, не отвечал ли уже этот пользователь
    const hasResponded = await CalloutResponseModel.hasUserResponded(
      callout.id,
      telegramUserId
    );

    if (hasResponded) {
      logger.info('User already responded to this callout', {
        calloutId: callout.id,
        telegramUserId,
      });
      // Не бросаем ошибку, просто возвращаем существующий ответ
      const existingResponse = await CalloutResponseModel.getLastUserResponse(
        callout.id,
        telegramUserId
      );
      if (existingResponse) {
        return existingResponse;
      }
    }

    // 5. Создать запись ответа в БД
    const response = await CalloutResponseModel.create({
      callout_id: callout.id,
      subdivision_id: subdivision.id,
      vk_user_id: telegramUserId, // Используем поле vk_user_id для хранения telegram user_id
      vk_user_name: telegramUserName,
      response_type: 'acknowledged',
    });

    logger.info('Telegram response saved to database', {
      responseId: response.id,
      calloutId: callout.id,
      telegramUserId,
    });

    // 6. Отправить уведомление в Discord
    try {
      await this.notifyDiscordAboutResponse(response, callout, subdivision, 'telegram');
    } catch (error) {
      logger.error('Failed to notify Discord about Telegram response', {
        error: error instanceof Error ? error.message : error,
        responseId: response.id,
      });
      // Не критично, запись в БД уже создана
    }

    return response;
  }

  /**
   * Отправить уведомление в Discord о реагировании из VK/Telegram
   */
  static async notifyDiscordAboutResponse(
    response: CalloutResponse,
    callout: Callout,
    subdivision: Subdivision,
    platform: 'vk' | 'telegram' = 'vk'
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
      const message = this.formatResponseMessage(response, subdivision, platform);

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
        factionName: subdivision.name,
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
    subdivision: Subdivision,
    platform: 'vk' | 'telegram' = 'vk'
  ): string {
    const timestamp = new Date(response.created_at).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
    });

    const platformName = platform === 'vk' ? 'VK' : 'Telegram';

    return (
      `${EMOJI.SUCCESS} **${subdivision.name}** отреагировал на инцидент\n` +
      `👤 Ответил: ${response.vk_user_name} (${platformName})\n` +
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
   * Получить количество фракций, ответивших на каллаут
   */
  static async getRespondedDepartmentsCount(
    calloutId: number
  ): Promise<number> {
    return await CalloutResponseModel.countUniqueSubdivisions(calloutId);
  }
}

export default SyncService;
