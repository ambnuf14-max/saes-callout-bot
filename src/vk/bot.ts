import { VK } from 'vk-io';
import config from '../config/config';
import logger from '../utils/logger';
import { handleVkError } from '../utils/error-handler';
import handleCallbackEvent from './handlers/callback-handler';
import handleVerifyCommand from './handlers/verify-command-handler';

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
      const msgAction = (context as any).action;
      if (msgAction && msgAction.type === 'chat_invite_user') {
        // Проверяем, что пригласили именно нашего бота (group id с минусом)
        const invitedId = msgAction.memberId;
        const groupId = parseInt(config.vk.groupId);
        if (invitedId === -groupId) {
          try {
            await context.send(
              `👋 Привет! Я SAES Callout Bot.\n\n` +
              `Для привязки этой беседы к подразделению:\n` +
              `1. Получите токен верификации у лидера департамента в Discord\n` +
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

      const text = context.text?.trim();
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
    } catch (error) {
      logger.error('Failed to start VK bot', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

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
