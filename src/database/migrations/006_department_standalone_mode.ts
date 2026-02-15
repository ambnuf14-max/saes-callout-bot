import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция для поддержки автоматического режима департаментов
 * - allow_create_subdivisions на departments: администратор может запретить создание подразделений
 * - is_default на subdivisions: помечает авто-созданное дефолтное подразделение
 * - режим автоматически определяется по наличию обычных подразделений
 */
export async function runDepartmentStandaloneModeMigration(): Promise<void> {
  try {
    logger.info('Running department standalone mode migration...');

    // Добавить allow_create_subdivisions в departments
    try {
      await database.run(`ALTER TABLE departments ADD COLUMN allow_create_subdivisions BOOLEAN DEFAULT 1`);
      logger.debug('Added column allow_create_subdivisions to departments table');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column allow_create_subdivisions already exists, skipping');
      } else {
        throw error;
      }
    }

    // Добавить is_default в subdivisions
    try {
      await database.run(`ALTER TABLE subdivisions ADD COLUMN is_default BOOLEAN DEFAULT 0`);
      logger.debug('Added column is_default to subdivisions table');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column is_default already exists, skipping');
      } else {
        throw error;
      }
    }

    logger.info('Department standalone mode migration completed successfully');
  } catch (error) {
    logger.error('Failed to run department standalone mode migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runDepartmentStandaloneModeMigration;
