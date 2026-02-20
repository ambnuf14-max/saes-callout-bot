import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление недостающих индексов для часто используемых запросов
 */
export default async function runAddMissingIndexesMigration(): Promise<void> {
  try {
    logger.info('Running add_missing_indexes migration...');

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_callouts_discord_channel ON callouts(discord_channel_id);
      CREATE INDEX IF NOT EXISTS idx_subdivisions_telegram_chat ON subdivisions(telegram_chat_id);
    `);

    logger.info('add_missing_indexes migration completed successfully');
  } catch (error) {
    logger.error('Failed to run add_missing_indexes migration', {
      error: error instanceof Error ? error.message : error,
    });
  }
}
