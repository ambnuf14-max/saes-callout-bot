import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление поля cancelled_at в таблицу callout_responses
 * для поддержки мягкого удаления (soft delete) при отмене реагирования.
 */
export async function runCalloutResponseCancelledMigration(): Promise<void> {
  try {
    logger.info('Running callout_response_cancelled migration...');

    const columns = [
      { name: 'cancelled_at', sql: `ALTER TABLE callout_responses ADD COLUMN cancelled_at DATETIME NULL` },
    ];

    for (const col of columns) {
      try {
        await database.run(col.sql);
        logger.debug(`Added column ${col.name} to callout_responses`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column ${col.name} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('callout_response_cancelled migration completed successfully');
  } catch (error) {
    logger.error('Failed to run callout_response_cancelled migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runCalloutResponseCancelledMigration;
