import TelegramBot from 'node-telegram-bot-api';
import config from '../config/config';
import logger from '../utils/logger';
import { handleTelegramError } from '../utils/error-handler';
import handleCallbackQuery from './handlers/callback-handler';
import handleVerifyCommand from './handlers/verify-command-handler';
import { trackTelegramMember } from './utils/member-tracker';

/**
 * Класс Telegram бота
 */
class TelegramBotClient {
  public bot: TelegramBot;
  private isRunning: boolean = false;
  private useWebhook: boolean;

  constructor() {
    this.useWebhook = !!config.telegram.webhookUrl;

    if (this.useWebhook) {
      this.bot = new TelegramBot(config.telegram.token, {
        webHook: {
          port: config.telegram.webhookPort,
          host: '0.0.0.0',
        },
      });
    } else {
      this.bot = new TelegramBot(config.telegram.token, {
        polling: false,
        onlyFirstMatch: true,
      });
    }
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
          `💡 Для получения токена верификации обратитесь к лидеру вашей фракции в Discord.`;

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
          `1. Получите токен верификации у лидера фракции в Discord\n` +
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

    // Трекинг участников по любым сообщениям в групповых чатах
    this.bot.on('message', async (msg) => {
      if (msg.from && msg.from.id && !msg.from.is_bot) {
        const chatType = msg.chat.type;
        if (chatType === 'group' || chatType === 'supergroup') {
          await trackTelegramMember(msg.chat.id, msg.from);
        }
      }
    });

    // Обработка добавления бота в группу + трекинг новых участников
    this.bot.on('new_chat_members', async (msg) => {
      try {
        const me = await this.bot.getMe();
        const botAdded = msg.new_chat_members?.some(m => m.id === me.id);

        // Трекинг всех вступивших (кроме ботов)
        if (msg.new_chat_members) {
          for (const member of msg.new_chat_members) {
            if (!member.is_bot) {
              await trackTelegramMember(msg.chat.id, member);
            }
          }
        }

        if (!botAdded) return;

        const welcomeText =
          `👋 Привет. Это SAES Callout Bot.\n\n` +
          `Для привязки этого чата к подразделению:\n` +
          `1. Получите токен верификации у лидера фракции\n` +
          `2. Отправьте команду <code>/verify ТОКЕН</code> в этот чат\n\n` +
          `💡 Токен действителен 10 минут.`;

        await this.bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'HTML' });

        logger.info('Sent welcome message to Telegram group', {
          chatId: msg.chat.id,
          chatTitle: msg.chat.title,
        });
      } catch (error) {
        logger.error('Error sending Telegram welcome message', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    logger.info('Telegram event handlers registered', {
      handlers: ['callback_query', 'verify', 'start', 'help', 'new_chat_members'],
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

      // Бот подключён к API — уже может отправлять сообщения
      this.isRunning = true;

      // Регистрация обработчиков
      this.registerEventHandlers();

      if (this.useWebhook) {
        // Webhook режим
        const webhookUrl = config.telegram.webhookUrl!;
        const setWebHookOptions: TelegramBot.SetWebHookOptions = {};
        if (config.telegram.webhookSecret) {
          setWebHookOptions.secret_token = config.telegram.webhookSecret;
        }
        await this.bot.setWebHook(`${webhookUrl}/telegram-webhook`, setWebHookOptions);
        logger.info('Telegram webhook set', { url: `${webhookUrl}/telegram-webhook` });
      } else {
        // Long Polling режим
        await this.bot.startPolling({
          restart: true,
        });
      }

      logger.info('Telegram bot started successfully', {
        mode: this.useWebhook ? 'Webhook' : 'Long Poll',
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
      if (this.useWebhook) {
        await this.bot.deleteWebHook();
        await this.bot.closeWebHook();
      } else {
        await this.bot.stopPolling();
      }
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
