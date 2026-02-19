import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: таблица для хранения участников Telegram-чатов
 */
export async function runTelegramMembersMigration(): Promise<void> {
  try {
    logger.info('Running telegram_members migration...');

    await database.run(`
      CREATE TABLE IF NOT EXISTS telegram_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, user_id)
      )
    `);

    logger.info('telegram_members migration completed successfully');
  } catch (error) {
    logger.error('Failed to run telegram_members migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runTelegramMembersMigration;
