import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление полей declined_* в таблицу callouts
 */
export async function runCalloutDeclineMigration(): Promise<void> {
  try {
    logger.info('Running callout_decline migration...');

    const columns = [
      { name: 'declined_at', sql: `ALTER TABLE callouts ADD COLUMN declined_at DATETIME NULL` },
      { name: 'declined_by', sql: `ALTER TABLE callouts ADD COLUMN declined_by TEXT NULL` },
      { name: 'declined_by_name', sql: `ALTER TABLE callouts ADD COLUMN declined_by_name TEXT NULL` },
      { name: 'decline_reason', sql: `ALTER TABLE callouts ADD COLUMN decline_reason TEXT NULL` },
    ];

    for (const col of columns) {
      try {
        await database.run(col.sql);
        logger.debug(`Added column ${col.name} to callouts`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column ${col.name} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('callout_decline migration completed successfully');
  } catch (error) {
    logger.error('Failed to run callout_decline migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runCalloutDeclineMigration;
