import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: хранение названий VK/Telegram чатов в подразделениях
 */
export async function runChatTitlesMigration(): Promise<void> {
  try {
    logger.info('Running chat_titles migration...');

    for (const column of ['vk_chat_title', 'telegram_chat_title']) {
      try {
        await database.run(`ALTER TABLE subdivisions ADD COLUMN ${column} TEXT DEFAULT NULL`);
        logger.debug(`Added column ${column} to subdivisions`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column ${column} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('chat_titles migration completed successfully');
  } catch (error) {
    logger.error('Failed to run chat_titles migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runChatTitlesMigration;
