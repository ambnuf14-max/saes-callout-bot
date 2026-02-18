import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление logo_url в таблицу factions
 */
export async function runFactionLogoUrlMigration(): Promise<void> {
  try {
    logger.info('Running faction_logo_url migration...');

    try {
      await database.run(`ALTER TABLE factions ADD COLUMN logo_url TEXT`);
      logger.debug('Added column logo_url to factions');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column logo_url already exists in factions, skipping');
      } else {
        throw error;
      }
    }

    logger.info('faction_logo_url migration completed successfully');
  } catch (error) {
    logger.error('Failed to run faction_logo_url migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runFactionLogoUrlMigration;
