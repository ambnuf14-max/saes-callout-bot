import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: Добавление полей для отслеживания объектов, созданных ботом
 *
 * Добавляет поля в таблицу servers:
 * - bot_created_channel: отслеживает, был ли канал каллаутов создан ботом
 * - bot_created_category: отслеживает, была ли категория создана ботом
 */
export async function runTrackBotCreatedObjectsMigration(): Promise<void> {
  try {
    logger.info('Running track bot created objects migration...');

    // Добавить колонку bot_created_channel
    try {
      await database.run(`
        ALTER TABLE servers ADD COLUMN bot_created_channel INTEGER DEFAULT 0
      `);
      logger.debug('Added bot_created_channel column');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column name')) {
        logger.debug('Column bot_created_channel already exists');
      } else {
        throw error;
      }
    }

    // Добавить колонку bot_created_category
    try {
      await database.run(`
        ALTER TABLE servers ADD COLUMN bot_created_category INTEGER DEFAULT 0
      `);
      logger.debug('Added bot_created_category column');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column name')) {
        logger.debug('Column bot_created_category already exists');
      } else {
        throw error;
      }
    }

    logger.info('Track bot created objects migration completed successfully');
  } catch (error) {
    logger.error('Failed to run track bot created objects migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runTrackBotCreatedObjectsMigration;
