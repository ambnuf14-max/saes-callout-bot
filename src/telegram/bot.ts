import TelegramBot from 'node-telegram-bot-api';
import config from '../config/config';
import logger from '../utils/logger';
import { handleTelegramError } from '../utils/error-handler';
import handleCallbackQuery from './handlers/callback-handler';
import handleVerifyCommand from './handlers/verify-command-handler';

/**
 * Класс Telegram бота
 */
class TelegramBotClient {
  public bot: TelegramBot;
  private isRunning: boolean = false;

  constructor() {
    this.bot = new TelegramBot(config.telegram.token, {
      polling: false, // Запустим позже в start()
    });
  }

  /**
   * Регистрация обработчиков событий
   */
  private registerEventHandlers() {
    // Обработка ошибок polling
    this.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error', {
        error: error instanceof Error ? error.message : error,
      });
      handleTelegramError(error as Error, { source: 'polling' });
    });

    // Обработка ошибок webhook (на случай будущего переключения)
    this.bot.on('webhook_error', (error) => {
      logger.error('Telegram webhook error', {
        error: error instanceof Error ? error.message : error,
      });
      handleTelegramError(error as Error, { source: 'webhook' });
    });

    // Обработка callback кнопок (callback_query)
    this.bot.on('callback_query', async (query) => {
      try {
        await handleCallbackQuery(this.bot, query);
      } catch (error) {
        logger.error('Error in callback_query handler', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    // Обработка команды /verify
    this.bot.onText(/^\/verify/, async (msg) => {
      try {
        await handleVerifyCommand(this.bot, msg);
      } catch (error) {
        logger.error('Error in /verify handler', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    // Обработка команды /start для справки
    this.bot.onText(/^\/start/, async (msg) => {
      try {
        const helpText =
          `👋 <b>Привет! Я SAES Callout Bot для Telegram</b>\n\n` +
          `📋 <b>Доступные команды:</b>\n` +
          `/verify <token> - Привязать эту группу к подразделению\n` +
          `/help - Показать эту справку\n\n` +
          `💡 Для получения токена верификации обратитесь к лидеру вашего департамента в Discord.`;

        await this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error('Error in /start handler', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    // Обработка команды /help
    this.bot.onText(/^\/help/, async (msg) => {
      try {
        const helpText =
          `📋 <b>Справка SAES Callout Bot</b>\n\n` +
          `<b>Команды:</b>\n` +
          `/verify <token> - Привязать группу к подразделению\n` +
          `/help - Показать эту справку\n\n` +
          `<b>Как использовать:</b>\n` +
          `1. Получите токен верификации у лидера департамента в Discord\n` +
          `2. Введите /verify <token> в вашей группе Telegram\n` +
          `3. После успешной привязки вы будете получать уведомления о каллаутах\n` +
          `4. Нажимайте кнопку "Отреагировать" чтобы подтвердить получение каллаута`;

        await this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error('Error in /help handler', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    logger.info('Telegram event handlers registered', {
      handlers: ['callback_query', 'verify', 'start', 'help'],
    });
  }

  /**
   * Запуск бота
   */
  async start() {
    try {
      logger.info('Starting Telegram bot...', {
        botUsername: config.telegram.botUsername,
      });

      // Проверка подключения к Telegram API
      const me = await this.bot.getMe();

      logger.info('Telegram API connection successful', {
        botId: me.id,
        botUsername: me.username,
        botName: me.first_name,
      });

      // Регистрация обработчиков
      this.registerEventHandlers();

      // Запуск Long Polling
      await this.bot.startPolling({
        restart: true,
        onlyFirstMatch: true,
      });

      this.isRunning = true;

      logger.info('Telegram bot started successfully', {
        mode: 'Long Poll',
        botUsername: me.username,
      });
    } catch (error) {
      logger.error('Failed to start Telegram bot', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Telegram бот не критичен для работы системы, логируем но не останавливаем приложение
      logger.warn('Telegram bot failed to start, but application will continue');
    }
  }

  /**
   * Остановка бота
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Telegram bot...');

    try {
      await this.bot.stopPolling();
      this.isRunning = false;
      logger.info('Telegram bot stopped');
    } catch (error) {
      logger.error('Error stopping Telegram bot', {
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
   * Получить Telegram Bot API instance
   */
  getApi(): TelegramBot {
    return this.bot;
  }
}

// Singleton instance
const telegramBot = new TelegramBotClient();

export default telegramBot;
export { TelegramBotClient };
