import logger from './utils/logger';
import database from './database/db';
import { runMigrations, checkTables } from './database/migrations';

async function main() {
  try {
    logger.info('Starting SAES Callout Bot...');

    // Инициализация базы данных
    logger.info('Connecting to database...');
    await database.connect();

    // Проверка и запуск миграций
    const tablesExist = await checkTables();
    if (!tablesExist) {
      logger.info('Tables not found, running migrations...');
      await runMigrations();
    } else {
      logger.info('Database tables exist');
    }

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

    logger.info('Bot initialized successfully');
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
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
