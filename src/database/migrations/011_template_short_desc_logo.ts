import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление short_description и logo_url в subdivision_templates
 */
export async function runTemplateShortDescLogoMigration(): Promise<void> {
  try {
    logger.info('Running template_short_desc_logo migration...');

    const columns = ['short_description', 'logo_url'];
    for (const column of columns) {
      try {
        await database.run(`ALTER TABLE subdivision_templates ADD COLUMN ${column} TEXT`);
        logger.debug(`Added column ${column} to subdivision_templates`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column ${column} already exists in subdivision_templates, skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('template_short_desc_logo migration completed successfully');
  } catch (error) {
    logger.error('Failed to run template_short_desc_logo migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runTemplateShortDescLogoMigration;
