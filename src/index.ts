import dotenv from 'dotenv';
import logger from './utils/logger';
import database from './database/db';
import { runMigrations, checkTables } from './database/migrations';

// Загрузка переменных окружения
dotenv.config();

async function main() {
  try {
    logger.info('Starting SAES Callout Bot...');
    logger.info('Environment loaded');

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

    logger.info('Bot initialized successfully');
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');

  try {
    const discordBot = (await import('./discord/bot')).default;
    const vkBot = (await import('./vk/bot')).default;
    await discordBot.stop();
    await vkBot.stop();
    await database.close();
  } catch (error) {
    logger.error('Error during shutdown', { error });
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');

  try {
    const discordBot = (await import('./discord/bot')).default;
    const vkBot = (await import('./vk/bot')).default;
    await discordBot.stop();
    await vkBot.stop();
    await database.close();
  } catch (error) {
    logger.error('Error during shutdown', { error });
  }

  process.exit(0);
});

main();
