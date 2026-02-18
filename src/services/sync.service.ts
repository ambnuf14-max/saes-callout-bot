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
import { buildCalloutEmbed, addResponsesToEmbed } from '../discord/utils/embed-builder';

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
    vkUserName: string,
    responseType: 'acknowledged' | 'on_way' = 'acknowledged'
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
    const existingResponse = await CalloutResponseModel.getLastUserResponse(
      callout.id,
      vkUserId
    );

    if (existingResponse) {
      // Если пользователь уже ответил acknowledged и шлёт on_way — обновить
      if (existingResponse.response_type === 'acknowledged' && responseType === 'on_way') {
        const updated = await CalloutResponseModel.updateResponseType(existingResponse.id, 'on_way');
        if (updated) {
          // Отправить уведомление об обновлении в Discord
          try {
            await this.notifyDiscordAboutResponse(updated, callout, subdivision);
          } catch (error) {
            logger.error('Failed to notify Discord about updated VK response', {
              error: error instanceof Error ? error.message : error,
            });
          }
          return updated;
        }
      }
      // Тот же или ниже статус — вернуть существующий
      logger.info('User already responded to this callout', {
        calloutId: callout.id,
        vkUserId,
      });
      return existingResponse;
    }

    // 5. Создать запись ответа в БД
    const response = await CalloutResponseModel.create({
      callout_id: callout.id,
      subdivision_id: subdivision.id,
      vk_user_id: vkUserId,
      vk_user_name: vkUserName,
      response_type: responseType,
    });

    logger.info('VK response saved to database', {
      responseId: response.id,
      calloutId: callout.id,
      vkUserId,
      responseType,
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
    telegramUserName: string,
    responseType: 'acknowledged' | 'on_way' = 'acknowledged'
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
    const existingTgResponse = await CalloutResponseModel.getLastUserResponse(
      callout.id,
      telegramUserId
    );

    if (existingTgResponse) {
      // Если пользователь уже ответил acknowledged и шлёт on_way — обновить
      if (existingTgResponse.response_type === 'acknowledged' && responseType === 'on_way') {
        const updated = await CalloutResponseModel.updateResponseType(existingTgResponse.id, 'on_way');
        if (updated) {
          try {
            await this.notifyDiscordAboutResponse(updated, callout, subdivision, 'telegram');
          } catch (error) {
            logger.error('Failed to notify Discord about updated Telegram response', {
              error: error instanceof Error ? error.message : error,
            });
          }
          return updated;
        }
      }
      // Тот же или ниже статус — вернуть существующий
      logger.info('User already responded to this callout', {
        calloutId: callout.id,
        telegramUserId,
      });
      return existingTgResponse;
    }

    // 5. Создать запись ответа в БД
    const response = await CalloutResponseModel.create({
      callout_id: callout.id,
      subdivision_id: subdivision.id,
      vk_user_id: telegramUserId,
      vk_user_name: telegramUserName,
      response_type: responseType,
    });

    logger.info('Telegram response saved to database', {
      responseId: response.id,
      calloutId: callout.id,
      telegramUserId,
      responseType,
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

      logger.info('Discord notified about response', {
        calloutId: callout.id,
        channelId: channel.id,
        responseId: response.id,
        platform,
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

      // Обновить embed оригинального сообщения с ответами
      if (callout.discord_message_id) {
        try {
          const originalMessage = await channel.messages.fetch(callout.discord_message_id);
          if (originalMessage) {
            const allResponses = await CalloutResponseModel.findByCalloutId(callout.id);
            const subdivisionIds = [...new Set(allResponses.map(r => r.subdivision_id))];
            const subdivisionsMap = new Map<number, Subdivision>();
            for (const subId of subdivisionIds) {
              const sub = await SubdivisionModel.findById(subId);
              if (sub) subdivisionsMap.set(subId, sub);
            }

            // Загружаем subdivision каллаута (может отличаться от subdivision ответчика)
            const calloutSubdivision = await SubdivisionModel.findById(callout.subdivision_id);
            if (!calloutSubdivision) throw new Error('Callout subdivision not found');

            const updatedEmbed = buildCalloutEmbed(callout, calloutSubdivision);
            addResponsesToEmbed(updatedEmbed, allResponses, subdivisionsMap);

            await originalMessage.edit({
              embeds: [updatedEmbed],
              components: originalMessage.components,
            });
          }
        } catch (embedError) {
          logger.error('Failed to update original embed with responses', {
            error: embedError instanceof Error ? embedError.message : embedError,
            calloutId: callout.id,
          });
        }
      }
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
    const typeLabel = response.response_type === 'on_way' ? '🚗 В пути' : '✅ Принято';

    return (
      `${EMOJI.SUCCESS} **${subdivision.name}** отреагировал на инцидент\n` +
      `👤 Ответил: ${response.vk_user_name} (${platformName})\n` +
      `📋 Статус: ${typeLabel}\n` +
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
