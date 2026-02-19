import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление поля tac_channel в таблицу callouts
 */
export async function runCalloutTacChannelMigration(): Promise<void> {
  try {
    logger.info('Running callout_tac_channel migration...');

    try {
      await database.run(
        `ALTER TABLE callouts ADD COLUMN tac_channel TEXT`
      );
      logger.debug('Added column tac_channel to callouts');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column tac_channel already exists in callouts, skipping');
      } else {
        throw error;
      }
    }

    logger.info('callout_tac_channel migration completed successfully');
  } catch (error) {
    logger.error('Failed to run callout_tac_channel migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runCalloutTacChannelMigration;
