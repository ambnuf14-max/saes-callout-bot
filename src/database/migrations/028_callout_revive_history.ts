import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление полей истории отклонения/возобновления в таблицу callouts
 */
export async function runCalloutReviveHistoryMigration(): Promise<void> {
  try {
    logger.info('Running callout_revive_history migration...');

    const columns = [
      { name: 'last_declined_at',      sql: `ALTER TABLE callouts ADD COLUMN last_declined_at DATETIME NULL` },
      { name: 'last_declined_by_name', sql: `ALTER TABLE callouts ADD COLUMN last_declined_by_name TEXT NULL` },
      { name: 'last_decline_reason',   sql: `ALTER TABLE callouts ADD COLUMN last_decline_reason TEXT NULL` },
      { name: 'revived_at',            sql: `ALTER TABLE callouts ADD COLUMN revived_at DATETIME NULL` },
      { name: 'revived_by_name',       sql: `ALTER TABLE callouts ADD COLUMN revived_by_name TEXT NULL` },
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

    logger.info('callout_revive_history migration completed successfully');
  } catch (error) {
    logger.error('Failed to run callout_revive_history migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runCalloutReviveHistoryMigration;
