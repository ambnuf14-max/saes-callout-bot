import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция для добавления настраиваемых embed полей для подразделений
 * Позволяет настраивать внешний вид embed каждого подразделения при создании каллаута
 */
export async function runSubdivisionEmbedsMigration(): Promise<void> {
  try {
    logger.info('Running subdivision embeds migration...');

    // Список колонок для добавления
    const columns = [
      'embed_author_name',
      'embed_author_url',
      'embed_author_icon_url',
      'embed_title',
      'embed_description',
      'embed_color',
      'embed_image_url',
      'embed_thumbnail_url',
      'embed_footer_text',
      'embed_footer_icon_url',
    ];

    // Добавить каждую колонку отдельно (идемпотентно)
    for (const column of columns) {
      try {
        await database.run(`ALTER TABLE subdivisions ADD COLUMN ${column} TEXT`);
        logger.debug(`Added column ${column} to subdivisions table`);
      } catch (error) {
        // Игнорировать ошибку если колонка уже существует
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column ${column} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('Subdivision embeds migration completed successfully');
  } catch (error) {
    logger.error('Failed to run subdivision embeds migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runSubdivisionEmbedsMigration;
