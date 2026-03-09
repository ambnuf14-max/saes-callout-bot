import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import logger from './utils/logger';
import database from './database/db';
import { runMigrations } from './database/migrations';
import { VerificationTokenModel } from './database/models/VerificationToken';
import { COLORS, EMOJI } from './config/constants';
import { VerificationService } from './services/verification.service';
import { FactionLinkService } from './services/faction-link.service';
import { FactionLinkTokenModel } from './database/models/FactionLinkToken';
import { CalloutGatewayService } from './services/callout-gateway.service';
import { CalloutModel } from './database/models/Callout';
import { ServerModel } from './database/models/Server';
import { CalloutService } from './services/callout.service';
import config from './config/config';

async function main() {
  try {
    logger.info('Starting SAES Callout Bot...');

    // Инициализация базы данных
    logger.info('Connecting to database...');
    await database.connect();

    // Запуск миграций (идемпотентные, безопасно запускать каждый раз)
    await runMigrations();
    logger.info('Database migrations applied');

    // Инициализация Discord бота
    logger.info('Starting Discord bot...');
    const discordBot = (await import('./discord/bot')).default;
    await discordBot.start();

    // Инициализация VK и Telegram ботов параллельно
    logger.info('Starting VK and Telegram bots...');
    const vkBot = (await import('./vk/bot')).default;
    const telegramBot = (await import('./telegram/bot')).default;
    await Promise.all([vkBot.start(), telegramBot.start()]);

    // Восстановить in-memory состояние после рестарта
    const { default: NotificationService } = await import('./services/notification.service');
    await NotificationService.restoreActiveCaptureStates();

    const { CalloutService } = await import('./services/callout.service');
    await CalloutService.restoreDeclineTimers();

    // Запустить периодическую проверку истёкших токенов (каждые 30 секунд)
    setInterval(() => notifyExpiredTokens(discordBot), 30 * 1000);
    setInterval(() => notifyExpiredFactionLinkTokens(discordBot), 30 * 1000);

    // Периодическая очистка БД (каждые 30 минут)
    setInterval(runScheduledCleanup, 30 * 60 * 1000);
    // Запустить очистку через 10 секунд после старта
    setTimeout(runScheduledCleanup, 10_000);

    // Авто-закрытие просроченных каллаутов (каждую минуту)
    setInterval(() => autoCloseExpiredCallouts(discordBot), 60_000);

    logger.info('Bot initialized successfully');
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

/**
 * Проверить истёкшие токены и отредактировать сообщения в Discord
 */
async function notifyExpiredTokens(discordBot: any): Promise<void> {
  try {
    const expiredTokens = await VerificationTokenModel.findExpiredWithInteractionToken();
    if (expiredTokens.length === 0) return;

    for (const token of expiredTokens) {
      try {
        const expiredEmbed = new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle(`${EMOJI.ERROR} Токен верификации истёк`)
          .setDescription(
            `Токен \`${token.token}\` больше недействителен.\n` +
            `Запросите новый токен через панель управления.`
          )
          .setTimestamp();

        const backButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('faction_back_list')
            .setLabel('Назад')
            .setStyle(ButtonStyle.Secondary)
        );

        await discordBot.client.rest.patch(
          `/webhooks/${token.discord_application_id}/${token.discord_interaction_token}/messages/@original`,
          { body: { embeds: [expiredEmbed.toJSON()], components: [backButton.toJSON()] } }
        );

        logger.info('Notified Discord about expired token', { tokenId: token.id });
      } catch (error) {
        // Webhook тоже истёк (>15 мин) — уже не можем редактировать
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('Unknown Webhook') || errMsg.includes('Invalid Webhook Token') || errMsg.includes('10015')) {
          logger.debug('Webhook token also expired, cannot edit message', { tokenId: token.id });
        } else {
          logger.warn('Failed to notify about expired token', { tokenId: token.id, error: errMsg });
        }
      }

      // В любом случае убираем interaction token чтобы не пытаться повторно
      await VerificationTokenModel.clearInteractionToken(token.id);
    }
  } catch (error) {
    logger.error('Error in notifyExpiredTokens', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Проверить истёкшие токены привязки faction-серверов и отредактировать сообщения в Discord
 */
async function notifyExpiredFactionLinkTokens(discordBot: any): Promise<void> {
  try {
    const expiredTokens = await FactionLinkTokenModel.findExpiredWithInteractionToken();
    if (expiredTokens.length === 0) return;

    for (const token of expiredTokens) {
      try {
        const expiredEmbed = new EmbedBuilder()
          .setColor(COLORS.ERROR)
          .setTitle(`${EMOJI.ERROR} Токен привязки сервера истёк`)
          .setDescription(
            `Токен \`${token.token}\` больше недействителен.\n` +
            `Запросите новый токен через лидерскую панель фракции (\`/faction\` → "Привязать сервер фракции").`
          )
          .setTimestamp();

        await discordBot.client.rest.patch(
          `/webhooks/${token.discord_application_id}/${token.discord_interaction_token}/messages/@original`,
          { body: { embeds: [expiredEmbed.toJSON()], components: [] } }
        );

        logger.info('Notified Discord about expired faction link token', { tokenId: token.id });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('Unknown Webhook') || errMsg.includes('Invalid Webhook Token') || errMsg.includes('10015')) {
          logger.debug('Webhook token also expired, cannot edit message', { tokenId: token.id });
        } else {
          logger.warn('Failed to notify about expired faction link token', { tokenId: token.id, error: errMsg });
        }
      }

      await FactionLinkTokenModel.clearInteractionToken(token.id);
    }
  } catch (error) {
    logger.error('Error in notifyExpiredFactionLinkTokens', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Авто-закрытие каллаутов, которые были активны дольше заданного таймаута
 */
async function autoCloseExpiredCallouts(discordBot: any): Promise<void> {
  try {
    const expiredCallouts = await CalloutModel.findExpiredActive(config.features.calloutAutoCloseMs);
    if (expiredCallouts.length === 0) return;

    for (const callout of expiredCallouts) {
      try {
        const server = await ServerModel.findById(callout.server_id);
        if (!server) continue;

        const guild = discordBot.client.guilds.cache.get(server.guild_id);
        if (!guild) continue;

        await CalloutService.closeCallout(guild, callout.id, 'system', 'Автоматическое закрытие по таймауту');
        logger.info('Auto-closed expired callout', { calloutId: callout.id });
      } catch (error) {
        logger.error('Failed to auto-close callout', {
          calloutId: callout.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  } catch (error) {
    logger.error('Error in autoCloseExpiredCallouts', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Периодическая очистка БД: удаление просроченных/использованных токенов и старых rate limits
 */
async function runScheduledCleanup(): Promise<void> {
  try {
    const [expiredTokens, usedTokens, oldRateLimits, expiredLinkTokens, usedLinkTokens] = await Promise.all([
      VerificationService.cleanupExpiredTokens(),
      VerificationService.cleanupUsedTokens(24),
      CalloutGatewayService.cleanupOldRateLimits(30),
      FactionLinkService.cleanupExpiredTokens(),
      FactionLinkService.cleanupUsedTokens(24),
    ]);

    if (expiredTokens > 0 || usedTokens > 0 || oldRateLimits > 0 || expiredLinkTokens > 0 || usedLinkTokens > 0) {
      logger.info('Scheduled cleanup completed', { expiredTokens, usedTokens, oldRateLimits, expiredLinkTokens, usedLinkTokens });
    }
  } catch (error) {
    logger.error('Error in scheduled cleanup', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    const discordBot = (await import('./discord/bot')).default;
    const vkBot = (await import('./vk/bot')).default;
    const telegramBot = (await import('./telegram/bot')).default;
    await discordBot.stop();
    await vkBot.stop();
    await telegramBot.stop();
    await database.close();
  } catch (error) {
    logger.error('Error during shutdown', { error });
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main();
