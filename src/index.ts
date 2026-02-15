import logger from './utils/logger';
import database from './database/db';
import { runMigrations, checkTables } from './database/migrations';
import { VerificationTokenModel } from './database/models/VerificationToken';
import { COLORS, EMOJI } from './config/constants';

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

    // Инициализация VK бота
    logger.info('Starting VK bot...');
    const vkBot = (await import('./vk/bot')).default;
    await vkBot.start();

    // Инициализация Telegram бота
    logger.info('Starting Telegram bot...');
    const telegramBot = (await import('./telegram/bot')).default;
    await telegramBot.start();

    // Запустить периодическую проверку истёкших токенов (каждые 30 секунд)
    setInterval(() => notifyExpiredTokens(discordBot), 30 * 1000);

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

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

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

        const backButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('department_back_list')
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
