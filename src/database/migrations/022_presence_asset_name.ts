import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: имя Rich Presence asset для подразделения
 */
export async function runPresenceAssetNameMigration(): Promise<void> {
  try {
    logger.info('Running presence_asset_name migration...');

    try {
      await database.run(
        `ALTER TABLE subdivisions ADD COLUMN presence_asset_name TEXT DEFAULT NULL`
      );
      logger.debug('Added column presence_asset_name to subdivisions');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column presence_asset_name already exists, skipping');
      } else {
        throw error;
      }
    }

    logger.info('presence_asset_name migration completed successfully');
  } catch (error) {
    logger.error('Failed to run presence_asset_name migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runPresenceAssetNameMigration;
