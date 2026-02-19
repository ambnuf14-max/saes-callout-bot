import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: флаг обязательной настройки при переходе в standalone режим
 */
export async function runStandaloneNeedsSetupMigration(): Promise<void> {
  try {
    logger.info('Running standalone_needs_setup migration...');

    try {
      await database.run(
        `ALTER TABLE factions ADD COLUMN standalone_needs_setup INTEGER NOT NULL DEFAULT 0`
      );
      logger.debug('Added column standalone_needs_setup to factions');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column standalone_needs_setup already exists in factions, skipping');
      } else {
        throw error;
      }
    }

    logger.info('standalone_needs_setup migration completed successfully');
  } catch (error) {
    logger.error('Failed to run standalone_needs_setup migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runStandaloneNeedsSetupMigration;
