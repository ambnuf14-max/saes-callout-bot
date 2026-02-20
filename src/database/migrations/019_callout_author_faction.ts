import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление поля author_faction_name в таблицу callouts
 */
export default async function runCalloutAuthorFactionMigration(): Promise<void> {
  try {
    logger.info('Running callout_author_faction migration...');

    await database.exec(`
      ALTER TABLE callouts ADD COLUMN author_faction_name TEXT;
    `);

    logger.info('callout_author_faction migration completed successfully');
  } catch (error) {
    // SQLite бросает ошибку если колонка уже существует — это нормально
    if (error instanceof Error && error.message.includes('duplicate column name')) {
      logger.info('Column author_faction_name already exists, skipping');
      return;
    }
    logger.error('Failed to run callout_author_faction migration', {
      error: error instanceof Error ? error.message : error,
    });
  }
}
