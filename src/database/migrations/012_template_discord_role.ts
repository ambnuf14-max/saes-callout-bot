import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление discord_role_id в subdivision_templates
 */
export async function runTemplateDiscordRoleMigration(): Promise<void> {
  try {
    logger.info('Running template_discord_role migration...');

    try {
      await database.run(`ALTER TABLE subdivision_templates ADD COLUMN discord_role_id TEXT`);
      logger.debug('Added column discord_role_id to subdivision_templates');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column discord_role_id already exists in subdivision_templates, skipping');
      } else {
        throw error;
      }
    }

    logger.info('template_discord_role migration completed successfully');
  } catch (error) {
    logger.error('Failed to run template_discord_role migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runTemplateDiscordRoleMigration;
