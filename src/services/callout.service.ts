import { Guild, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction } from 'discord.js';
import discordBot from '../discord/bot';
import { CalloutModel, SubdivisionModel, ServerModel, CalloutResponseModel, CalloutMessageModel } from '../database/models';
import { Callout, CreateCalloutDTO, Subdivision } from '../types/database.types';
import logger from '../utils/logger';
import validators from '../utils/validators';
import { CalloutError } from '../utils/error-handler';
import { createIncidentChannel, deleteIncidentChannel } from '../discord/utils/channel-manager';
import { buildCalloutEmbed, buildClosedCalloutEmbed, addResponsesToEmbed } from '../discord/utils/embed-builder';
import { EMOJI, CALLOUT_STATUS, MESSAGES, DECLINE_TIMERS } from '../config/constants';
import NotificationService from './notification.service';
import config from '../config/config';
import {
  logAuditEvent,
  AuditEventType,
  CalloutCreatedData,
  CalloutClosedData,
  CalloutAutoClosedData,
  CalloutDeclinedData,
  CalloutRevivedData,
  NotificationFailedData,
  resolveLogoThumbnailUrl,
  logAuditEventWithForwarding,
} from '../discord/utils/audit-logger';
import PresenceManager from '../discord/utils/presence-manager';

/**
 * Форматировать длительность инцидента
 */
function formatDuration(createdAt: string, closedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const diffMs = end - start;
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }
  return `${minutes} мин`;
}

/**
 * Сервис для работы с каллаутами
 */
export class CalloutService {
  /**
   * Таймеры отложенного удаления каналов, ключ — calloutId.
   * Хранение предотвращает дублирование таймеров и позволяет их отменить.
   */
  private static pendingDeletions = new Map<number, NodeJS.Timeout>();

  /**
   * Таймеры отложенного закрытия после отклонения (decline), ключ — calloutId.
   */
  private static pendingDeclineClose = new Map<number, NodeJS.Timeout>();

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

      // 3. Создать Embed сообщение (с начальным логом — строка о создании запроса)
      const embed = buildCalloutEmbed(callout, subdivision);
      addResponsesToEmbed(embed, [], new Map(), callout);

      // 4. Создать кнопки "Принять запрос поддержки" и "Отклонить запрос поддержки" (строка 1), "Закрыть инцидент" (строка 2)
      const respondButton = new ButtonBuilder()
        .setCustomId(`respond_callout_${callout.id}`)
        .setLabel(MESSAGES.CALLOUT.BUTTON_RESPOND_DISCORD)
        .setStyle(ButtonStyle.Secondary);

      const declineButton = new ButtonBuilder()
        .setCustomId(`decline_callout_${callout.id}`)
        .setLabel(MESSAGES.CALLOUT.BUTTON_DECLINE_DISCORD)
        .setStyle(ButtonStyle.Secondary);

      const closeButton = new ButtonBuilder()
        .setCustomId(`close_callout_${callout.id}`)
        .setLabel(MESSAGES.CALLOUT.BUTTON_CLOSE)
        .setStyle(ButtonStyle.Danger);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(respondButton, declineButton);
      const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);

      // 5. Отправить Embed в канал с mention роли и кнопкой
      const message = await channel.send({
        content: `<@&${subdivision.discord_role_id}>`,
        embeds: [embed],
        components: [actionRow, closeRow],
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

      // Отправить уведомления в VK и Telegram последовательно,
      // т.к. каждый вызов обновляет callout в БД (vk_message_id / telegram_message_id)
      // и параллельное выполнение может привести к перезатиранию полей
      let vkStatus: string;
      if (!subdivision.vk_chat_id) {
        vkStatus = 'Беседа не привязана';
      } else {
        try {
          await NotificationService.notifyVkAboutCallout(callout, subdivision, data.author_faction_name);
          vkStatus = '✅ Отправлено';
        } catch (vkErr) {
          const vkErrMsg = vkErr instanceof Error ? vkErr.message : String(vkErr);
          logger.error('Failed to notify VK about callout', {
            error: vkErrMsg,
            calloutId: callout.id,
          });
          vkStatus = `❌ Ошибка: ${vkErrMsg.substring(0, 200)}`;
          const vkFailData: NotificationFailedData = {
            userId: 'system',
            userName: 'Система',
            calloutId: callout.id,
            subdivisionName: subdivision.name,
            errorMessage: vkErrMsg,
            chatId: subdivision.vk_chat_id || undefined,
            chatTitle: subdivision.vk_chat_title || undefined,
          };
          logAuditEvent(guild, AuditEventType.VK_NOTIFICATION_FAILED, vkFailData).catch(() => {});
        }
      }

      let telegramStatus: string;
      if (!subdivision.telegram_chat_id) {
        telegramStatus = 'Беседа не привязана';
      } else {
        try {
          await NotificationService.notifyTelegramAboutCallout(callout, subdivision, data.author_faction_name);
          telegramStatus = '✅ Отправлено';
        } catch (tgErr) {
          const tgErrMsg = tgErr instanceof Error ? tgErr.message : String(tgErr);
          logger.error('Failed to notify Telegram about callout', {
            error: tgErrMsg,
            calloutId: callout.id,
          });
          telegramStatus = `❌ Ошибка: ${tgErrMsg.substring(0, 200)}`;
          const tgFailData: NotificationFailedData = {
            userId: 'system',
            userName: 'Система',
            calloutId: callout.id,
            subdivisionName: subdivision.name,
            errorMessage: tgErrMsg,
            chatId: subdivision.telegram_chat_id || undefined,
            chatTitle: subdivision.telegram_chat_title || undefined,
          };
          logAuditEvent(guild, AuditEventType.TELEGRAM_NOTIFICATION_FAILED, tgFailData).catch(() => {});
        }
      }

      // Логировать событие в audit log (после уведомлений, чтобы включить их статус)
      const auditData: CalloutCreatedData = {
        userId: data.author_id,
        userName: data.author_name,
        calloutId: callout.id,
        subdivisionName: subdivision.name,
        factionName: data.author_faction_name || undefined,
        description: data.description,
        channelId: channel.id,
        location: callout.location || undefined,
        briefDescription: callout.brief_description || undefined,
        tacChannel: callout.tac_channel || undefined,
        thumbnailUrl: resolveLogoThumbnailUrl(subdivision.logo_url),
        vkStatus,
        telegramStatus,
      };
      await logAuditEventWithForwarding(guild, AuditEventType.CALLOUT_CREATED, auditData);

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
    reason?: string,
    customChannelDeleteDelay?: number
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
              const responseSubIds = [...new Set(allResponses.map(r => r.subdivision_id))];
              const subdivisionsMap = await SubdivisionModel.findByIds(responseSubIds);
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
        const duration = formatDuration(callout.created_at, closedCallout.closed_at);
        if (closedBy === 'system') {
          const autoAuditData: CalloutAutoClosedData = {
            userId: 'system',
            userName: 'Система',
            calloutId,
            subdivisionName: subdivision.name,
            channelId: callout.discord_channel_id || undefined,
            duration,
            thumbnailUrl: resolveLogoThumbnailUrl(subdivision.logo_url),
          };
          await logAuditEventWithForwarding(guild, AuditEventType.CALLOUT_AUTO_CLOSED, autoAuditData);
        } else {
          const auditData: CalloutClosedData = {
            userId: closedBy,
            userName: closedBy,
            calloutId,
            subdivisionName: subdivision.name,
            reason: reason,
            channelId: callout.discord_channel_id || undefined,
            closedByDiscordId: closedBy,
            duration,
            thumbnailUrl: resolveLogoThumbnailUrl(subdivision.logo_url),
          };
          await logAuditEventWithForwarding(guild, AuditEventType.CALLOUT_CLOSED, auditData);
        }
      }

      // Отменить таймер decline-закрытия если есть
      const declineTimer = CalloutService.pendingDeclineClose.get(calloutId);
      if (declineTimer) {
        clearTimeout(declineTimer);
        CalloutService.pendingDeclineClose.delete(calloutId);
      }

      // 5. Опционально: удалить канал через delay
      if (config.features.autoDeleteChannels && callout.discord_channel_id) {
        const delay = customChannelDeleteDelay ?? config.features.channelDeleteDelay;

        // Отменить предыдущий таймер для этого каллаута если он есть
        const existingTimer = CalloutService.pendingDeletions.get(calloutId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        // Считать и сохранить историю сообщений сразу при закрытии (до таймера удаления)
        await CalloutService.archiveChannelMessages(guild, callout.discord_channel_id!, callout.id);

        logger.info('Scheduling channel deletion', {
          calloutId,
          channelId: callout.discord_channel_id,
          delayMs: delay,
        });

        const timer = setTimeout(async () => {
          CalloutService.pendingDeletions.delete(calloutId);
          try {
            // Повторная архивация перед удалением — перезапишет если были новые сообщения
            await CalloutService.archiveChannelMessages(guild, callout.discord_channel_id!, callout.id);

            await deleteIncidentChannel(guild, callout.discord_channel_id!);
            await CalloutModel.update(callout.id, { discord_channel_id: null });
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

        CalloutService.pendingDeletions.set(calloutId, timer);
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

  /**
   * Получить Guild для каллаута (нужен, когда вызов из VK/TG без guild объекта)
   */
  private static async getGuildForCallout(callout: Callout): Promise<Guild | null> {
    const server = await ServerModel.findById(callout.server_id);
    if (!server) return null;
    return discordBot.client.guilds.cache.get(server.guild_id) || null;
  }

  /**
   * Отклонить запрос поддержки
   */
  static async declineCallout(
    guildOrNull: Guild | null,
    calloutId: number,
    declinedBy: string,
    declinedByName: string,
    reason: string
  ): Promise<Callout | undefined> {
    const callout = await CalloutModel.findById(calloutId);

    if (!callout) {
      throw new CalloutError(`${EMOJI.ERROR} Каллаут не найден`, 'CALLOUT_NOT_FOUND', 404);
    }

    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      throw new CalloutError(`${EMOJI.ERROR} Каллаут уже закрыт`, 'CALLOUT_ALREADY_CLOSED', 400);
    }

    if (callout.declined_at) {
      throw new CalloutError(`${EMOJI.ERROR} Запрос поддержки уже отклонён`, 'CALLOUT_ALREADY_DECLINED', 400);
    }

    // 1. Сохранить decline в БД
    const declinedCallout = await CalloutModel.decline(calloutId, declinedBy, declinedByName, reason);
    if (!declinedCallout) {
      throw new Error('Failed to decline callout in database');
    }

    logger.info('Callout declined', { calloutId, declinedBy, reason });

    const guild = guildOrNull || (await this.getGuildForCallout(declinedCallout));

    const subdivision = await SubdivisionModel.findById(declinedCallout.subdivision_id);

    // 2. Обновить Discord embed + заменить кнопки
    if (guild && declinedCallout.discord_channel_id && declinedCallout.discord_message_id && subdivision) {
      try {
        const channel = (await guild.channels.fetch(declinedCallout.discord_channel_id)) as TextChannel;
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(declinedCallout.discord_message_id);
          if (message) {
            const { buildCalloutEmbed, addResponsesToEmbed } = await import('../discord/utils/embed-builder');
            const { CalloutResponseModel: CRM } = await import('../database/models');
            const allResponses = await CRM.findByCalloutId(calloutId);
            const responseSubIds = [...new Set(allResponses.map(r => r.subdivision_id))];
            const subdivisionsMap = await SubdivisionModel.findByIds(responseSubIds);

            const updatedEmbed = buildCalloutEmbed(declinedCallout, subdivision);
            addResponsesToEmbed(updatedEmbed, allResponses, subdivisionsMap, declinedCallout);

            // Кнопка "Возобновить реагирование" (строка 1) + "Закрыть инцидент" (строка 2)
            const reviveButton = new ButtonBuilder()
              .setCustomId(`revive_callout_${calloutId}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_REVIVE_DISCORD)
              .setStyle(ButtonStyle.Secondary);

            const closeButton = new ButtonBuilder()
              .setCustomId(`close_callout_${calloutId}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_CLOSE)
              .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(reviveButton);
            const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);
            await message.edit({ embeds: [updatedEmbed], components: [actionRow, closeRow] });
          }
        }
      } catch (error) {
        logger.error('Failed to update Discord embed on decline', {
          error: error instanceof Error ? error.message : error,
          calloutId,
        });
      }
    }

    // 3. Уведомить VK и TG
    try {
      await NotificationService.notifyVkAboutCalloutDeclined(declinedCallout);
    } catch (error) {
      logger.error('Failed to notify VK about declined callout', {
        error: error instanceof Error ? error.message : error, calloutId,
      });
    }

    try {
      await NotificationService.notifyTelegramAboutCalloutDeclined(declinedCallout);
    } catch (error) {
      logger.error('Failed to notify Telegram about declined callout', {
        error: error instanceof Error ? error.message : error, calloutId,
      });
    }

    // Логировать событие в audit log (с форвардингом на главный сервер)
    if (guild && subdivision) {
      const auditData: CalloutDeclinedData = {
        userId: declinedBy,
        userName: declinedByName,
        calloutId,
        subdivisionName: subdivision.name,
        reason,
        channelId: declinedCallout.discord_channel_id || undefined,
        thumbnailUrl: resolveLogoThumbnailUrl(subdivision.logo_url),
      };
      logAuditEventWithForwarding(guild, AuditEventType.CALLOUT_DECLINED, auditData).catch(() => {});
    }

    // 4. Запустить 5-минутный таймер → закрыть каллаут
    const existingTimer = CalloutService.pendingDeclineClose.get(calloutId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
      CalloutService.pendingDeclineClose.delete(calloutId);
      try {
        const freshCallout = await CalloutModel.findById(calloutId);
        if (!freshCallout || freshCallout.status !== CALLOUT_STATUS.ACTIVE) return;

        const g = guild || (await CalloutService.getGuildForCallout(freshCallout));
        if (!g) {
          logger.warn('Cannot auto-close declined callout: guild not found', { calloutId });
          return;
        }

        const declineReason = freshCallout.decline_reason
          ? `Отклонено: ${freshCallout.decline_reason}`
          : 'Запрос поддержки отклонён подразделением';

        await CalloutService.closeCallout(
          g,
          calloutId,
          'system',
          declineReason,
          DECLINE_TIMERS.CHANNEL_DELETE_DELAY
        );
      } catch (error) {
        logger.error('Failed to auto-close declined callout', {
          error: error instanceof Error ? error.message : error, calloutId,
        });
      }
    }, DECLINE_TIMERS.CLOSE_DELAY);

    CalloutService.pendingDeclineClose.set(calloutId, timer);

    return declinedCallout;
  }

  /**
   * Возобновить реагирование (отменить отклонение)
   */
  static async cancelDecline(
    guildOrNull: Guild | null,
    calloutId: number,
    revivedByName: string = 'Неизвестно'
  ): Promise<Callout | undefined> {
    const callout = await CalloutModel.findById(calloutId);

    if (!callout) {
      throw new CalloutError(`${EMOJI.ERROR} Каллаут не найден`, 'CALLOUT_NOT_FOUND', 404);
    }

    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      throw new CalloutError(`${EMOJI.ERROR} Каллаут уже закрыт`, 'CALLOUT_ALREADY_CLOSED', 400);
    }

    if (!callout.declined_at) {
      throw new CalloutError(`${EMOJI.ERROR} Каллаут не был отклонён`, 'CALLOUT_NOT_DECLINED', 400);
    }

    // 1. Отменить таймер закрытия
    const existingTimer = CalloutService.pendingDeclineClose.get(calloutId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      CalloutService.pendingDeclineClose.delete(calloutId);
    }

    // 2. Сбросить decline в БД (с сохранением снапшота для лога)
    const revivedCallout = await CalloutModel.cancelDecline(calloutId, revivedByName);
    if (!revivedCallout) throw new Error('Failed to cancel decline in database');

    logger.info('Callout decline cancelled', { calloutId });

    const guild = guildOrNull || (await this.getGuildForCallout(revivedCallout));
    const subdivision = await SubdivisionModel.findById(revivedCallout.subdivision_id);

    // 3. Обновить Discord embed + вернуть кнопки
    if (guild && revivedCallout.discord_channel_id && revivedCallout.discord_message_id && subdivision) {
      try {
        const channel = (await guild.channels.fetch(revivedCallout.discord_channel_id)) as TextChannel;
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(revivedCallout.discord_message_id);
          if (message) {
            const { buildCalloutEmbed, addResponsesToEmbed } = await import('../discord/utils/embed-builder');
            const { CalloutResponseModel: CRM } = await import('../database/models');
            const allResponses = await CRM.findByCalloutId(calloutId);
            const responseSubIds = [...new Set(allResponses.map(r => r.subdivision_id))];
            const subdivisionsMap = await SubdivisionModel.findByIds(responseSubIds);

            const updatedEmbed = buildCalloutEmbed(revivedCallout, subdivision);
            addResponsesToEmbed(updatedEmbed, allResponses, subdivisionsMap, revivedCallout);

            // Возвращаем кнопки "Принять" + "Отклонить" (строка 1) + "Закрыть" (строка 2)
            const respondButton = new ButtonBuilder()
              .setCustomId(`respond_callout_${calloutId}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_RESPOND_DISCORD)
              .setStyle(ButtonStyle.Secondary);

            const declineButton = new ButtonBuilder()
              .setCustomId(`decline_callout_${calloutId}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_DECLINE_DISCORD)
              .setStyle(ButtonStyle.Secondary);

            const closeButton = new ButtonBuilder()
              .setCustomId(`close_callout_${calloutId}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_CLOSE)
              .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(respondButton, declineButton);
            const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);
            await message.edit({ embeds: [updatedEmbed], components: [actionRow, closeRow] });

            // Отправить сообщение об возобновлении реагирования
            await channel.send(`<@${revivedCallout.author_id}>, ${revivedByName} возобновил реагирование на инцидент #${calloutId}.`);
          }
        }
      } catch (error) {
        logger.error('Failed to update Discord embed on revive', {
          error: error instanceof Error ? error.message : error,
          calloutId,
        });
      }
    }

    // 4. Уведомить VK и TG
    try {
      await NotificationService.notifyVkAboutCalloutRevived(revivedCallout);
    } catch (error) {
      logger.error('Failed to notify VK about revived callout', {
        error: error instanceof Error ? error.message : error, calloutId,
      });
    }

    try {
      await NotificationService.notifyTelegramAboutCalloutRevived(revivedCallout);
    } catch (error) {
      logger.error('Failed to notify Telegram about revived callout', {
        error: error instanceof Error ? error.message : error, calloutId,
      });
    }

    // Логировать событие в audit log (с форвардингом на главный сервер)
    if (guild && subdivision) {
      const auditData: CalloutRevivedData = {
        userId: revivedCallout.author_id,
        userName: revivedByName,
        calloutId,
        subdivisionName: subdivision.name,
        channelId: revivedCallout.discord_channel_id || undefined,
        thumbnailUrl: resolveLogoThumbnailUrl(subdivision.logo_url),
      };
      logAuditEventWithForwarding(guild, AuditEventType.CALLOUT_REVIVED, auditData).catch(() => {});
    }

    return revivedCallout;
  }

  /**
   * Восстановить таймеры decline-закрытия после рестарта бота.
   * Для каждого активного declined-каллаута пересчитывает оставшееся время
   * и запускает таймер (или закрывает сразу, если 5 мин уже истекли).
   */
  static async restoreDeclineTimers(): Promise<void> {
    try {
      const activeCallouts = await CalloutModel.findActive();
      const declined = activeCallouts.filter(c => c.declined_at);
      if (declined.length === 0) return;

      for (const callout of declined) {
        if (CalloutService.pendingDeclineClose.has(callout.id)) continue;

        const declinedAt = new Date(callout.declined_at!).getTime();
        const elapsed = Date.now() - declinedAt;
        const remaining = Math.max(0, DECLINE_TIMERS.CLOSE_DELAY - elapsed);

        const guild = await CalloutService.getGuildForCallout(callout);
        if (!guild) continue;

        const timer = setTimeout(async () => {
          CalloutService.pendingDeclineClose.delete(callout.id);
          try {
            const fresh = await CalloutModel.findById(callout.id);
            if (!fresh || fresh.status !== CALLOUT_STATUS.ACTIVE) return;
            const reason = fresh.decline_reason
              ? `Отклонено: ${fresh.decline_reason}`
              : 'Запрос поддержки отклонён подразделением';
            await CalloutService.closeCallout(guild, callout.id, 'system', reason, DECLINE_TIMERS.CHANNEL_DELETE_DELAY);
          } catch (err) {
            logger.error('Failed to auto-close declined callout after restart', {
              error: err instanceof Error ? err.message : err,
              calloutId: callout.id,
            });
          }
        }, remaining);

        CalloutService.pendingDeclineClose.set(callout.id, timer);
      }

      if (declined.length > 0) {
        logger.info('Restored decline timers after restart', { count: declined.length });
      }
    } catch (error) {
      logger.error('Failed to restore decline timers', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Считать все сообщения из канала инцидента и сохранить в БД
   */
  static async archiveChannelMessages(guild: Guild, channelId: string, calloutId: number): Promise<void> {
    try {
      const channel = await guild.channels.fetch(channelId) as TextChannel;
      if (!channel || !channel.isTextBased()) return;

      // Считываем сообщения порциями по 100 (лимит Discord API)
      const allMessages: { id: string; author: { id: string; username: string; bot: boolean }; content: string; createdAt: Date }[] = [];
      let lastId: string | undefined;

      while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (batch.size === 0) break;
        allMessages.push(...Array.from(batch.values()).map(m => ({
          id: m.id,
          author: { id: m.author.id, username: m.member?.displayName || m.author.displayName || m.author.username, bot: m.author.bot },
          content: m.content || (m.embeds.length > 0 ? '[Embed]' : '[Вложение]'),
          createdAt: m.createdAt,
        })));
        lastId = batch.last()?.id;
        if (batch.size < 100) break;
      }

      // Сортируем по времени (от старого к новому)
      allMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Фильтруем пустые сообщения
      const toSave = allMessages.filter(m => m.content.trim().length > 0);

      await CalloutMessageModel.bulkCreate(
        toSave.map(m => ({
          callout_id: calloutId,
          message_id: m.id,
          author_id: m.author.id,
          author_name: m.author.username,
          content: m.content,
          is_bot: m.author.bot,
          created_at: m.createdAt.toISOString(),
        }))
      );

      logger.info('Channel messages archived', { calloutId, channelId, count: toSave.length });
    } catch (error) {
      logger.error('Failed to archive channel messages', {
        error: error instanceof Error ? error.message : error,
        calloutId,
        channelId,
      });
    }
  }
}

export default CalloutService;
