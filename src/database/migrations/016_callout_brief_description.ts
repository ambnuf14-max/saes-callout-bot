import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление поля brief_description в таблицу callouts
 */
export async function runCalloutBriefDescriptionMigration(): Promise<void> {
  try {
    logger.info('Running callout_brief_description migration...');

    try {
      await database.run(
        `ALTER TABLE callouts ADD COLUMN brief_description TEXT`
      );
      logger.debug('Added column brief_description to callouts');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column brief_description already exists in callouts, skipping');
      } else {
        throw error;
      }
    }

    logger.info('callout_brief_description migration completed successfully');
  } catch (error) {
    logger.error('Failed to run callout_brief_description migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runCalloutBriefDescriptionMigration;
