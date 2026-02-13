import { VK } from 'vk-io';
import config from '../config/config';
import logger from '../utils/logger';
import { handleVkError } from '../utils/error-handler';
import handleCallbackEvent from './handlers/callback-handler';

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

    // TODO: Обработка текстовых сообщений (опционально для будущих функций)
    // this.vk.updates.on('message_new', messageHandler);

    logger.info('VK event handlers registered');
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
      let group;
      try {
        group = await this.vk.api.groups.getById({
          group_id: config.vk.groupId,
        });

        logger.info('VK API response received', {
          responseType: typeof group,
          isArray: Array.isArray(group),
          length: Array.isArray(group) ? group.length : 'N/A',
          response: JSON.stringify(group),
        });
      } catch (apiError) {
        logger.error('VK API groups.getById failed', {
          error: apiError instanceof Error ? apiError.message : apiError,
          stack: apiError instanceof Error ? apiError.stack : undefined,
        });
        throw apiError;
      }

      if (!group || !Array.isArray(group) || group.length === 0) {
        throw new Error(
          `Invalid VK API response: group data is empty or invalid. Response: ${JSON.stringify(group)}`
        );
      }

      logger.info('VK API connection successful', {
        groupId: group[0].id,
        groupName: group[0].name,
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
