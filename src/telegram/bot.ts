import TelegramBot from 'node-telegram-bot-api';
import config from '../config/config';
import logger from '../utils/logger';
import { handleTelegramError } from '../utils/error-handler';
import handleCallbackQuery from './handlers/callback-handler';
import handleVerifyCommand from './handlers/verify-command-handler';
import { pendingDeclineReasonState } from '../services/decline-reason.state';
import { activeCaptureState } from '../services/chat-monitor.state';
import { PlatformChatMessageModel, SubdivisionModel } from '../database/models';
import CalloutService from '../services/callout.service';
import { trackTelegramMember } from './utils/member-tracker';
import { logAuditEventToAllGuilds, AuditEventType, BotStatusData } from '../discord/utils/audit-logger';

/**
 * Извлечь текстовое содержимое или описание медиа из Telegram сообщения.
 * Возвращает null если сообщение не содержит распознанного контента.
 */
function extractTelegramContent(msg: TelegramBot.Message): string | null {
  if (msg.text) return msg.text.trim() || null;
  if (msg.photo)      return '[фото]';
  if (msg.voice)      return `[голосовое ${msg.voice.duration} сек]`;
  if (msg.video)      return '[видео]';
  if (msg.video_note) return '[видеосообщение]';
  if (msg.sticker)    return msg.sticker.emoji ? `[стикер ${msg.sticker.emoji}]` : '[стикер]';
  if (msg.document)   return msg.document.file_name ? `[файл: ${msg.document.file_name}]` : '[файл]';
  if (msg.audio)      return '[аудио]';
  if (msg.animation)  return '[GIF]';
  return null;
}

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

      const failedData: BotStatusData = {
        userId: 'system', userName: 'Система', platform: 'Telegram',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      logAuditEventToAllGuilds(AuditEventType.BOT_CONNECTION_FAILED, failedData).catch(() => {});
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

    // Трекинг участников по любым сообщениям + перехват причины отклонения
    this.bot.on('message', async (msg) => {
      if (msg.from && msg.from.id && !msg.from.is_bot) {
        const chatType = msg.chat.type;
        if (chatType === 'group' || chatType === 'supergroup') {
          await trackTelegramMember(msg.chat.id, msg.from);

          // Проверяем, ждём ли причину отклонения от этого пользователя
          const stateKey = `telegram:${msg.from.id}`;
          const pending = pendingDeclineReasonState.get(stateKey);
          const text = msg.text?.trim();
          const content = extractTelegramContent(msg);
          if (pending && text && !text.startsWith('/') && msg.chat.id.toString() === pending.chatId) {
            pendingDeclineReasonState.delete(stateKey);
            clearTimeout(pending.timeout);

            try {
              const userName = msg.from.username
                ? `@${msg.from.username}`
                : `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}`;

              await CalloutService.declineCallout(
                null,
                pending.calloutId,
                `telegram_${msg.from.id}`,
                userName,
                text.substring(0, 300)
              );

              logger.info('TG decline reason received and processed', {
                userId: msg.from.id,
                calloutId: pending.calloutId,
              });
            } catch (error) {
              logger.error('Failed to process TG decline reason', {
                error: error instanceof Error ? error.message : error,
                userId: msg.from.id,
                calloutId: pending.calloutId,
              });
            }
            return;
          }

          // Захват сообщений для мониторинга / каллаут-capture
          if (content !== null) {
            const chatId = msg.chat.id.toString();
            const captureKey = `telegram:${chatId}`;
            const userName = msg.from.username
              ? `@${msg.from.username}`
              : `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}`;

            // Режим захвата после каллаута
            let capturedAsCallout = false;
            const queue = activeCaptureState.get(captureKey);
            const captureEntry = queue?.[0];
            if (captureEntry && captureEntry.remaining > 0) {
              try {
                await PlatformChatMessageModel.create({
                  subdivision_id: captureEntry.subdivisionId,
                  platform: 'telegram',
                  chat_id: chatId,
                  message_id: String(msg.message_id),
                  user_id: String(msg.from.id),
                  user_name: userName,
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
                const subdivision = await SubdivisionModel.findByTelegramChatId(chatId);
                if (subdivision?.monitoring_enabled) {
                  await PlatformChatMessageModel.createWithRollingBuffer({
                    subdivision_id: subdivision.id,
                    platform: 'telegram',
                    chat_id: chatId,
                    message_id: String(msg.message_id),
                    user_id: String(msg.from.id),
                    user_name: userName,
                    content: content.substring(0, 500),
                    capture_type: 'monitoring',
                    callout_id: null,
                    captured_at: new Date().toISOString(),
                  });
                }
              } catch { /* не критично */ }
            }
          }
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

      const mode = this.useWebhook ? 'Webhook' : 'Long Poll';
      logger.info('Telegram bot started successfully', {
        mode,
        botUsername: me.username,
      });

      const connectedData: BotStatusData = {
        userId: 'system', userName: 'Система', platform: 'Telegram', mode,
      };
      logAuditEventToAllGuilds(AuditEventType.BOT_CONNECTED, connectedData).catch(() => {});
    } catch (error) {
      logger.error('Failed to start Telegram bot', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      const failedData: BotStatusData = {
        userId: 'system', userName: 'Система', platform: 'Telegram',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      logAuditEventToAllGuilds(AuditEventType.BOT_CONNECTION_FAILED, failedData).catch(() => {});

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
