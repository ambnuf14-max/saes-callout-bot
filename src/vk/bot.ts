import { VK } from 'vk-io';
import config from '../config/config';
import logger from '../utils/logger';
import { handleVkError } from '../utils/error-handler';
import handleCallbackEvent from './handlers/callback-handler';
import handleVerifyCommand from './handlers/verify-command-handler';
import { pendingDeclineReasonState } from '../services/decline-reason.state';
import { activeCaptureState } from '../services/chat-monitor.state';
import { PlatformChatMessageModel } from '../database/models';
import { SubdivisionModel } from '../database/models';
import CalloutService from '../services/callout.service';
import { logAuditEventToAllGuilds, AuditEventType, BotStatusData } from '../discord/utils/audit-logger';

/**
 * Извлечь текстовое содержимое или описание медиа из VK сообщения.
 * Возвращает null если сообщение не содержит ни текста ни вложений.
 */
function extractVkContent(context: { text?: string; attachments?: any[] }): string | null {
  const text = context.text?.trim();
  if (text) return text;

  const attachments: any[] = (context as any).attachments ?? [];
  if (attachments.length === 0) return null;

  const parts = attachments.map((att: any) => {
    switch (att.type) {
      case 'photo':        return '[фото]';
      case 'audio_message': return att.duration != null ? `[голосовое ${att.duration} сек]` : '[голосовое]';
      case 'video':        return '[видео]';
      case 'doc':          return att.title ? `[файл: ${att.title}]` : '[файл]';
      case 'sticker':      return '[стикер]';
      case 'audio':        return '[аудио]';
      case 'wall':         return '[запись со стены]';
      case 'graffiti':     return '[граффити]';
      default:             return att.type ? `[${att.type}]` : null;
    }
  }).filter((p): p is string => p !== null);

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Класс VK бота
 */
class VkBot {
  public vk: VK;
  private isRunning: boolean = false;

  constructor() {
    this.vk = new VK({
      token: config.vk.token,
      apiLimit: 20, // Лимит запросов в секунду
    });
  }

  /**
   * Регистрация обработчиков событий
   */
  private registerEventHandlers() {
    // Логирование всех входящих обновлений для отладки
    this.vk.updates.use(async (context, next) => {
      logger.debug('VK update received', {
        type: context.type,
        subTypes: context.subTypes,
      });
      await next();
    });

    // Обработка ошибок через хук (не событие)
    this.vk.updates.use(async (context, next) => {
      try {
        await next();
      } catch (error) {
        logger.error('VK updates error', {
          error: error instanceof Error ? error.message : error,
        });
        handleVkError(error as Error, { source: 'updates' });
      }
    });

    // Обработка callback кнопок (message_event)
    this.vk.updates.on('message_event', handleCallbackEvent);

    // Обработка текстовых сообщений и приглашения бота в беседу
    this.vk.updates.on('message_new', async (context) => {
      const text = context.text?.trim();
      const content = extractVkContent(context as any);

      // Проверяем, ожидаем ли причину отклонения от этого пользователя
      const stateKey = `vk:${context.senderId}`;
      const pending = pendingDeclineReasonState.get(stateKey);
      if (pending && text && !text.startsWith('/') && context.peerId.toString() === pending.chatId) {
        pendingDeclineReasonState.delete(stateKey);
        clearTimeout(pending.timeout);

        try {
          // Получить имя пользователя
          let userName = `VK User ${context.senderId}`;
          try {
            const [user] = await this.vk.api.users.get({ user_ids: [context.senderId] });
            userName = `${user.first_name} ${user.last_name}`;
          } catch { /* не критично */ }

          await CalloutService.declineCallout(
            null,
            pending.calloutId,
            context.senderId.toString(),
            userName,
            text.substring(0, 300)
          );

          // Редактировать сообщение-запрос причины
          if (pending.promptMessageId) {
            (this.vk.api.messages.edit as any)({
              peer_id: context.peerId,
              conversation_message_id: pending.promptMessageId,
              message: `❌ ${userName} отклоняет запрос поддержки.\nПричина: ${text.substring(0, 300)}`,
              keyboard: JSON.stringify({ buttons: [], inline: true }),
            }).catch((editErr: any) => {
              logger.error('Failed to edit VK decline prompt message', {
                error: editErr instanceof Error ? editErr.message : editErr,
                promptMessageId: pending.promptMessageId,
                peerId: context.peerId,
              });
            });
          }

          logger.info('VK decline reason received and processed', {
            userId: context.senderId,
            calloutId: pending.calloutId,
          });
        } catch (error) {
          logger.error('Failed to process VK decline reason', {
            error: error instanceof Error ? error.message : error,
            userId: context.senderId,
            calloutId: pending.calloutId,
          });
        }
        return;
      }

      // Захват сообщений для мониторинга / каллаут-capture
      if (content !== null && context.peerId > 2_000_000_000) {
        const chatId = context.peerId.toString();
        const captureKey = `vk:${chatId}`;

        // Получить имя пользователя VK (с fallback)
        let vkUserName = `VK User ${context.userId}`;
        try {
          const [vkUser] = await this.vk.api.users.get({ user_ids: [context.userId] });
          if (vkUser) vkUserName = `${vkUser.first_name} ${vkUser.last_name}`;
        } catch { /* не критично */ }

        // Режим захвата после каллаута
        let capturedAsCallout = false;
        const queue = activeCaptureState.get(captureKey);
        const captureEntry = queue?.[0];
        if (captureEntry && captureEntry.remaining > 0) {
          try {
            await PlatformChatMessageModel.create({
              subdivision_id: captureEntry.subdivisionId,
              platform: 'vk',
              chat_id: chatId,
              message_id: String((context as any).id || Date.now()),
              user_id: String(context.userId),
              user_name: vkUserName,
              content: content.substring(0, 500),
              capture_type: 'callout',
              callout_id: captureEntry.calloutId,
              captured_at: new Date().toISOString(),
            });
            capturedAsCallout = true;
          } catch { /* не критично */ }

          captureEntry.remaining -= 1;
          if (captureEntry.remaining <= 0) {
            queue!.shift();
            if (queue!.length === 0) {
              activeCaptureState.delete(captureKey);
            }
          }
        }

        // Режим полного мониторинга (только если не захвачено как callout)
        if (!capturedAsCallout) {
          try {
            const subdivision = await SubdivisionModel.findByVkChatId(chatId);
            if (subdivision?.monitoring_enabled) {
              await PlatformChatMessageModel.createWithRollingBuffer({
                subdivision_id: subdivision.id,
                platform: 'vk',
                chat_id: chatId,
                message_id: String((context as any).id || Date.now()),
                user_id: String(context.userId),
                user_name: vkUserName,
                content: content.substring(0, 500),
                capture_type: 'monitoring',
                callout_id: null,
                captured_at: new Date().toISOString(),
              });
            }
          } catch { /* не критично */ }
        }
      }

      const msgAction = (context as any).action;
      if (msgAction && msgAction.type === 'chat_invite_user') {
        // Проверяем, что пригласили именно нашего бота (group id с минусом)
        const invitedId = msgAction.memberId;
        const groupId = parseInt(config.vk.groupId);
        if (invitedId === -groupId) {
          try {
            await context.send(
              `👋 Привет. Это SAES Callout Bot.\n\n` +
              `Для привязки этого чата к подразделению:\n` +
              `1. Получите токен верификации у лидера фракции\n` +
              `2. Отправьте команду /verify ТОКЕН в этот чат\n\n` +
              `💡 Токен действителен 10 минут.`
            );

            logger.info('Sent welcome message to VK chat', {
              peerId: context.peerId,
            });
          } catch (error) {
            logger.error('Error sending VK welcome message', {
              error: error instanceof Error ? error.message : error,
            });
          }
          return;
        }
      }

      // Проверяем, начинается ли сообщение с /verify
      if (text && text.startsWith('/verify')) {
        await handleVerifyCommand(context);
      }
    });

    logger.info('VK event handlers registered', {
      handlers: ['message_event', 'message_new (for /verify, chat_invite)'],
    });
  }

  /**
   * Запуск бота
   */
  async start() {
    try {
      logger.info('Starting VK bot...', {
        groupId: config.vk.groupId,
        tokenPrefix: config.vk.token.substring(0, 10) + '...',
      });

      // Проверка подключения к VK API
      let groupData;
      try {
        const response = await this.vk.api.groups.getById({
          group_id: config.vk.groupId,
        });

        // VK API может вернуть либо массив, либо объект {groups: [...]}
        groupData = Array.isArray(response) ? response : (response as any).groups;

        logger.info('VK API response received', {
          responseType: typeof response,
          isArray: Array.isArray(response),
          hasGroups: 'groups' in (response as any),
          groupDataLength: Array.isArray(groupData) ? groupData.length : 'N/A',
        });
      } catch (apiError) {
        logger.error('VK API groups.getById failed', {
          error: apiError instanceof Error ? apiError.message : apiError,
          stack: apiError instanceof Error ? apiError.stack : undefined,
        });
        throw apiError;
      }

      if (!groupData || !Array.isArray(groupData) || groupData.length === 0) {
        throw new Error(
          `Invalid VK API response: group data is empty or invalid`
        );
      }

      logger.info('VK API connection successful', {
        groupId: groupData[0].id,
        groupName: groupData[0].name,
      });

      // Регистрация обработчиков
      this.registerEventHandlers();

      // Запуск Long Poll
      await this.vk.updates.start();
      this.isRunning = true;

      logger.info('VK bot started successfully', {
        mode: 'Long Poll',
      });

      const connectedData: BotStatusData = {
        userId: 'system', userName: 'Система', platform: 'VK', mode: 'Long Poll',
      };
      logAuditEventToAllGuilds(AuditEventType.BOT_CONNECTED, connectedData).catch(() => {});
    } catch (error) {
      logger.error('Failed to start VK bot', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      const failedData: BotStatusData = {
        userId: 'system', userName: 'Система', platform: 'VK',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      logAuditEventToAllGuilds(AuditEventType.BOT_CONNECTION_FAILED, failedData).catch(() => {});

      // VK бот не критичен для работы системы, логируем но не останавливаем приложение
      logger.warn('VK bot failed to start, but application will continue');
    }
  }

  /**
   * Остановка бота
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping VK bot...');

    try {
      await this.vk.updates.stop();
      this.isRunning = false;
      logger.info('VK bot stopped');
    } catch (error) {
      logger.error('Error stopping VK bot', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Проверить, запущен ли бот
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Получить VK API instance
   */
  getApi(): VK {
    return this.vk;
  }
}

// Singleton instance
const vkBot = new VkBot();

export default vkBot;
export { VkBot };
