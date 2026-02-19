import { Guild, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CalloutModel, SubdivisionModel, ServerModel, CalloutResponseModel } from '../database/models';
import { Callout, CreateCalloutDTO, Subdivision } from '../types/database.types';
import logger from '../utils/logger';
import validators from '../utils/validators';
import { CalloutError } from '../utils/error-handler';
import { createIncidentChannel, deleteIncidentChannel } from '../discord/utils/channel-manager';
import { buildCalloutEmbed, buildClosedCalloutEmbed, addResponsesToEmbed } from '../discord/utils/embed-builder';
import { EMOJI, CALLOUT_STATUS, MESSAGES } from '../config/constants';
import NotificationService from './notification.service';
import config from '../config/config';
import {
  logAuditEvent,
  AuditEventType,
  CalloutCreatedData,
  CalloutClosedData,
} from '../discord/utils/audit-logger';
import PresenceManager from '../discord/utils/presence-manager';

/**
 * Сервис для работы с каллаутами
 */
export class CalloutService {
  /**
   * Создать новый каллаут
   */
  static async createCallout(
    guild: Guild,
    data: CreateCalloutDTO
  ): Promise<{ callout: Callout; channel: TextChannel; subdivision: Subdivision }> {
    // Валидация описания
    const descValidation = validators.validateCalloutDescription(data.description);
    if (!descValidation.valid) {
      throw new CalloutError(
        descValidation.error || 'Невалидное описание каллаута',
        'INVALID_DESCRIPTION',
        400
      );
    }

    // Валидация места (если предоставлено)
    if (data.location) {
      const locationValidation = validators.validateLocation(data.location);
      if (!locationValidation.valid) {
        throw new CalloutError(
          locationValidation.error || 'Невалидное место',
          'INVALID_LOCATION',
          400
        );
      }
    }

    // Получить подразделение
    const subdivisionId = data.subdivision_id;
    if (!subdivisionId) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение не указано`,
        'SUBDIVISION_NOT_SPECIFIED',
        400
      );
    }

    const subdivision = await SubdivisionModel.findById(subdivisionId);
    if (!subdivision) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение не найдено`,
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    if (!subdivision.is_active) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение ${subdivision.name} неактивно`,
        'SUBDIVISION_INACTIVE',
        400
      );
    }

    // Проверить, принимает ли подразделение каллауты
    if (!subdivision.is_accepting_callouts) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение ${subdivision.name} временно не принимает каллауты`,
        'SUBDIVISION_NOT_ACCEPTING',
        400
      );
    }

    // Проверить, настроена ли Discord роль
    if (!subdivision.discord_role_id) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение ${subdivision.name} не настроено: не задана Discord роль`,
        'SUBDIVISION_NO_ROLE',
        400
      );
    }

    let callout: Callout | undefined;
    try {
      // 1. Создать запись в БД
      callout = await CalloutModel.create(data);

      logger.info('Callout created in database', {
        calloutId: callout.id,
        subdivisionId: subdivision.id,
        authorId: data.author_id,
      });

      // Обновить статус бота
      PresenceManager.forceUpdate().catch(err =>
        logger.error('Failed to update presence after callout created', { error: err })
      );

      // 2. Создать канал для инцидента
      const channel = await createIncidentChannel(guild, callout, subdivision, data.brief_description);

      // 3. Создать Embed сообщение
      const embed = buildCalloutEmbed(callout, subdivision);

      // 4. Создать кнопку "Закрыть инцидент"
      const closeButton = new ButtonBuilder()
        .setCustomId(`close_callout_${callout.id}`)
        .setLabel(MESSAGES.CALLOUT.BUTTON_CLOSE)
        .setStyle(ButtonStyle.Danger);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);

      // 5. Отправить Embed в канал с mention роли и кнопкой
      const message = await channel.send({
        content: `<@&${subdivision.discord_role_id}>`,
        embeds: [embed],
        components: [actionRow],
      });

      // 6. Обновить каллаут с ID канала и сообщения одним запросом
      await CalloutModel.update(callout.id, {
        discord_channel_id: channel.id,
        discord_message_id: message.id,
      });

      logger.info('Callout fully created', {
        calloutId: callout.id,
        channelId: channel.id,
        messageId: message.id,
      });

      // Логировать событие в audit log
      const auditData: CalloutCreatedData = {
        userId: data.author_id,
        userName: data.author_name,
        calloutId: callout.id,
        factionName: subdivision.name,
        description: data.description,
        channelId: channel.id,
      };
      await logAuditEvent(guild, AuditEventType.CALLOUT_CREATED, auditData);

      // Отправить уведомления в VK и Telegram параллельно (не критично, ошибки обрабатываются внутри)
      await Promise.all([
        NotificationService.notifyVkAboutCallout(callout, subdivision, data.author_faction_name),
        NotificationService.notifyTelegramAboutCallout(callout, subdivision, data.author_faction_name),
      ]);

      // Получить обновленный каллаут
      const updatedCallout = await CalloutModel.findById(callout.id);

      return {
        callout: updatedCallout || callout,
        channel,
        subdivision,
      };
    } catch (error) {
      logger.error('Failed to create callout', {
        error: error instanceof Error ? error.message : error,
        subdivisionId: subdivisionId,
        authorId: data.author_id,
      });

      // Удалить осиротевшую запись каллаута из БД
      if (callout) {
        try {
          await CalloutModel.delete(callout.id);
          logger.info('Cleaned up orphaned callout from DB', { calloutId: callout.id });
        } catch (cleanupError) {
          logger.error('Failed to cleanup orphaned callout', {
            error: cleanupError instanceof Error ? cleanupError.message : cleanupError,
            calloutId: callout.id,
          });
        }
      }

      throw error;
    }
  }

  /**
   * Получить каллаут по ID канала
   */
  static async getCalloutByChannel(channelId: string): Promise<Callout | undefined> {
    return await CalloutModel.findByChannelId(channelId);
  }

  /**
   * Получить активные каллауты сервера
   */
  static async getActiveCallouts(serverId: number): Promise<Callout[]> {
    return await CalloutModel.findActiveByServerId(serverId);
  }

  /**
   * Получить все каллауты сервера
   */
  static async getCallouts(serverId: number, limit?: number): Promise<Callout[]> {
    return await CalloutModel.findByServerId(serverId, limit);
  }

  /**
   * Закрыть каллаут
   */
  static async closeCallout(
    guild: Guild,
    calloutId: number,
    closedBy: string,
    reason?: string
  ): Promise<Callout | undefined> {
    const callout = await CalloutModel.findById(calloutId);

    if (!callout) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут не найден`,
        'CALLOUT_NOT_FOUND',
        404
      );
    }

    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут уже закрыт`,
        'CALLOUT_ALREADY_CLOSED',
        400
      );
    }

    try {
      // 1. Закрыть каллаут в БД
      const closedCallout = await CalloutModel.close(calloutId, closedBy, reason);

      if (!closedCallout) {
        throw new Error('Failed to close callout in database');
      }

      logger.info('Callout closed in database', {
        calloutId,
        closedBy,
        reason,
      });

      // Обновить статус бота
      PresenceManager.forceUpdate().catch(err =>
        logger.error('Failed to update presence after callout closed', { error: err })
      );

      // 2. Получить подразделение для обновления embed
      const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
      if (!subdivision) {
        logger.warn('Subdivision not found for closed callout', {
          calloutId,
          subdivisionId: callout.subdivision_id,
        });
      }

      // 3. Обновить embed в Discord канале
      if (callout.discord_channel_id && callout.discord_message_id && subdivision) {
        try {
          const channel = (await guild.channels.fetch(
            callout.discord_channel_id
          )) as TextChannel;

          if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(callout.discord_message_id);

            if (message) {
              // Создать обновленный embed
              const closedEmbed = buildClosedCalloutEmbed(closedCallout, subdivision);

              // Добавить лог инцидента (ответы + запись о закрытии)
              const allResponses = await CalloutResponseModel.findByCalloutId(calloutId);
              const subdivisionIds = [...new Set(allResponses.map(r => r.subdivision_id))];
              const subdivisionsMap = new Map<number, Subdivision>();
              for (const subId of subdivisionIds) {
                const sub = await SubdivisionModel.findById(subId);
                if (sub) subdivisionsMap.set(subId, sub);
              }
              addResponsesToEmbed(closedEmbed, allResponses, subdivisionsMap, closedCallout);

              await message.edit({ embeds: [closedEmbed], components: [] });

              logger.info('Discord embed updated for closed callout', {
                calloutId,
                channelId: channel.id,
              });
            }
          }
        } catch (error) {
          logger.error('Failed to update Discord embed', {
            error: error instanceof Error ? error.message : error,
            calloutId,
          });
          // Не критично, продолжаем
        }
      }

      // 4. Уведомить VK и Telegram о закрытии
      try {
        await NotificationService.notifyVkAboutCalloutClosed(closedCallout);
      } catch (error) {
        logger.error('Failed to notify VK about closed callout', {
          error: error instanceof Error ? error.message : error,
          calloutId,
        });
        // Не критично
      }

      try {
        await NotificationService.notifyTelegramAboutCalloutClosed(closedCallout);
      } catch (error) {
        logger.error('Failed to notify Telegram about closed callout', {
          error: error instanceof Error ? error.message : error,
          calloutId,
        });
        // Не критично
      }

      // Логировать событие в audit log
      if (subdivision) {
        const auditData: CalloutClosedData = {
          userId: closedBy,
          userName: closedBy, // TODO: получить username если нужно
          calloutId,
          factionName: subdivision.name,
          reason: reason,
          channelId: callout.discord_channel_id || undefined,
        };
        await logAuditEvent(guild, AuditEventType.CALLOUT_CLOSED, auditData);
      }

      // 5. Опционально: удалить канал через delay
      if (config.features.autoDeleteChannels && callout.discord_channel_id) {
        const delay = config.features.channelDeleteDelay;

        logger.info('Scheduling channel deletion', {
          calloutId,
          channelId: callout.discord_channel_id,
          delayMs: delay,
        });

        setTimeout(async () => {
          try {
            await deleteIncidentChannel(guild, callout.discord_channel_id!);
            logger.info('Channel deleted after delay', {
              calloutId,
              channelId: callout.discord_channel_id,
            });
          } catch (error) {
            logger.error('Failed to delete channel', {
              error: error instanceof Error ? error.message : error,
              calloutId,
              channelId: callout.discord_channel_id,
            });
          }
        }, delay);
      }

      return closedCallout;
    } catch (error) {
      logger.error('Error in closeCallout', {
        error: error instanceof Error ? error.message : error,
        calloutId,
      });
      throw error;
    }
  }

  /**
   * Проверить, может ли пользователь закрыть каллаут
   */
  static async canUserCloseCallout(
    callout: Callout,
    userId: string,
    userRoles: string[]
  ): Promise<boolean> {
    // Автор может закрыть
    if (callout.author_id === userId) {
      return true;
    }

    // Получить сервер для проверки лидерских ролей
    const server = await ServerModel.findById(callout.server_id);
    if (server) {
      const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
      if (userRoles.some((role) => leaderRoleIds.includes(role))) {
        return true;
      }
    }

    // Получить подразделение для проверки роли подразделения
    const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
    if (subdivision && subdivision.discord_role_id && userRoles.includes(subdivision.discord_role_id)) {
      return true;
    }

    return false;
  }

  /**
   * Получить статистику по каллаутам
   */
  static async getStats(serverId: number): Promise<{
    total: number;
    active: number;
    closed: number;
  }> {
    return await CalloutModel.getStats(serverId);
  }

  /**
   * Получить количество активных каллаутов (для всех серверов)
   */
  static async getActiveCalloutsCount(): Promise<number> {
    return await CalloutModel.countActive();
  }
}

export default CalloutService;
