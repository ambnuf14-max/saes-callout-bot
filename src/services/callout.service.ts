import { Guild, TextChannel } from 'discord.js';
import { CalloutModel, DepartmentModel, ServerModel } from '../database/models';
import { Callout, CreateCalloutDTO, Department } from '../types/database.types';
import logger from '../utils/logger';
import validators from '../utils/validators';
import { CalloutError } from '../utils/error-handler';
import { createIncidentChannel, deleteIncidentChannel } from '../discord/utils/channel-manager';
import { buildCalloutEmbed, buildClosedCalloutEmbed } from '../discord/utils/embed-builder';
import { EMOJI, CALLOUT_STATUS } from '../config/constants';
import NotificationService from './notification.service';
import config from '../config/config';
import {
  logAuditEvent,
  AuditEventType,
  CalloutCreatedData,
  CalloutClosedData,
} from '../discord/utils/audit-logger';

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
  ): Promise<{ callout: Callout; channel: TextChannel; department: Department }> {
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

    // Получить департамент
    const department = await DepartmentModel.findById(data.department_id);
    if (!department) {
      throw new CalloutError(
        `${EMOJI.ERROR} Департамент не найден`,
        'DEPARTMENT_NOT_FOUND',
        404
      );
    }

    if (!department.is_active) {
      throw new CalloutError(
        `${EMOJI.ERROR} Департамент ${department.name} неактивен`,
        'DEPARTMENT_INACTIVE',
        400
      );
    }

    try {
      // 1. Создать запись в БД
      const callout = await CalloutModel.create(data);

      logger.info('Callout created in database', {
        calloutId: callout.id,
        departmentId: department.id,
        authorId: data.author_id,
      });

      // 2. Создать канал для инцидента
      const channel = await createIncidentChannel(guild, callout, department);

      // 3. Создать Embed сообщение
      const embed = buildCalloutEmbed(callout, department);

      // 4. Отправить Embed в канал с mention роли
      const message = await channel.send({
        content: `<@&${department.discord_role_id}> - новый каллаут!`,
        embeds: [embed],
      });

      // 5. Обновить каллаут с ID канала и сообщения одним запросом
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
        departmentName: department.name,
        description: data.description,
        channelId: channel.id,
      };
      await logAuditEvent(guild, AuditEventType.CALLOUT_CREATED, auditData);

      // Отправить уведомление в VK (не критично, ошибки обрабатываются внутри)
      await NotificationService.notifyVkAboutCallout(callout, department);

      // Получить обновленный каллаут
      const updatedCallout = await CalloutModel.findById(callout.id);

      return {
        callout: updatedCallout || callout,
        channel,
        department,
      };
    } catch (error) {
      logger.error('Failed to create callout', {
        error: error instanceof Error ? error.message : error,
        departmentId: data.department_id,
        authorId: data.author_id,
      });

      // Попытаться удалить каллаут из БД если что-то пошло не так
      // (канал удалится автоматически при следующей попытке или вручную)

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

      // 2. Получить департамент для обновления embed
      const department = await DepartmentModel.findById(callout.department_id);
      if (!department) {
        logger.warn('Department not found for closed callout', {
          calloutId,
          departmentId: callout.department_id,
        });
      }

      // 3. Обновить embed в Discord канале
      if (callout.discord_channel_id && callout.discord_message_id && department) {
        try {
          const channel = (await guild.channels.fetch(
            callout.discord_channel_id
          )) as TextChannel;

          if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(callout.discord_message_id);

            if (message) {
              // Создать обновленный embed
              const closedEmbed = buildClosedCalloutEmbed(closedCallout, department);

              await message.edit({ embeds: [closedEmbed] });

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

      // 4. Уведомить VK о закрытии
      try {
        await NotificationService.notifyVkAboutCalloutClosed(closedCallout);
      } catch (error) {
        logger.error('Failed to notify VK about closed callout', {
          error: error instanceof Error ? error.message : error,
          calloutId,
        });
        // Не критично
      }

      // Логировать событие в audit log
      if (department) {
        const auditData: CalloutClosedData = {
          userId: closedBy,
          userName: closedBy, // TODO: получить username если нужно
          calloutId,
          departmentName: department.name,
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

    // Получить департамент для проверки роли департамента
    const department = await DepartmentModel.findById(callout.department_id);
    if (department && userRoles.includes(department.discord_role_id)) {
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
}

export default CalloutService;
