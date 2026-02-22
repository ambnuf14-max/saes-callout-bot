import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: хранение истории сообщений канала инцидента
 */
export async function runCalloutMessagesMigration(): Promise<void> {
  try {
    logger.info('Running callout_messages migration...');

    await database.run(`
      CREATE TABLE IF NOT EXISTS callout_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        callout_id INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        is_bot INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (callout_id) REFERENCES callouts(id)
      )
    `);

    await database.run(`
      CREATE INDEX IF NOT EXISTS idx_callout_messages_callout_id
      ON callout_messages(callout_id)
    `);

    logger.info('callout_messages migration completed successfully');
  } catch (error) {
    logger.error('Failed to run callout_messages migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runCalloutMessagesMigration;
