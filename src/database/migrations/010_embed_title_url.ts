import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция для добавления:
 * - embed_title_url в subdivisions и subdivision_templates
 * - short_description и logo_url в subdivisions
 */
export async function runEmbedTitleUrlMigration(): Promise<void> {
  try {
    logger.info('Running embed_title_url migration...');

    // embed_title_url для обеих таблиц
    const tables = ['subdivisions', 'subdivision_templates'];
    for (const table of tables) {
      try {
        await database.run(`ALTER TABLE ${table} ADD COLUMN embed_title_url TEXT`);
        logger.debug(`Added column embed_title_url to ${table}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column embed_title_url already exists in ${table}, skipping`);
        } else {
          throw error;
        }
      }
    }

    // short_description и logo_url только для subdivisions
    const subdivisionColumns = ['short_description', 'logo_url'];
    for (const column of subdivisionColumns) {
      try {
        await database.run(`ALTER TABLE subdivisions ADD COLUMN ${column} TEXT`);
        logger.debug(`Added column ${column} to subdivisions`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column ${column} already exists in subdivisions, skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('embed_title_url migration completed successfully');
  } catch (error) {
    logger.error('Failed to run embed_title_url migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runEmbedTitleUrlMigration;
