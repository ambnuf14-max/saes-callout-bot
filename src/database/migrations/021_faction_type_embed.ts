import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление embed-настроек в faction_types
 * Применяются к дефолтному подразделению при создании фракции без шаблонов
 */
export async function runFactionTypeEmbedMigration(): Promise<void> {
  try {
    logger.info('Running faction_type_embed migration...');

    const columns = [
      'embed_author_name',
      'embed_author_url',
      'embed_author_icon_url',
      'embed_title',
      'embed_title_url',
      'embed_description',
      'embed_color',
      'embed_image_url',
      'embed_thumbnail_url',
      'embed_footer_text',
      'embed_footer_icon_url',
      'logo_url',
      'short_description',
    ];

    for (const column of columns) {
      try {
        await database.run(`ALTER TABLE faction_types ADD COLUMN ${column} TEXT`);
        logger.debug(`Added column ${column} to faction_types`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column ${column} already exists in faction_types, skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('faction_type_embed migration completed successfully');
  } catch (error) {
    logger.error('Failed to run faction_type_embed migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runFactionTypeEmbedMigration;
