import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция для переименования department → faction в колонках
 * - pending_changes.department_id → faction_id
 * - subdivision_templates.department_type_id → faction_type_id
 */
export async function runRenameDepartmentToFactionMigration(): Promise<void> {
  try {
    logger.info('Running rename department to faction migration...');

    // 1. Переименовать pending_changes.department_id → faction_id
    try {
      await database.run(`
        ALTER TABLE pending_changes RENAME COLUMN department_id TO faction_id
      `);
      logger.debug('Renamed pending_changes.department_id to faction_id');
    } catch (error) {
      if (error instanceof Error && error.message.includes('no such column')) {
        logger.debug('Column department_id does not exist, may already be renamed');
      } else {
        throw error;
      }
    }

    // 2. Переименовать subdivision_templates.department_type_id → faction_type_id
    try {
      await database.run(`
        ALTER TABLE subdivision_templates RENAME COLUMN department_type_id TO faction_type_id
      `);
      logger.debug('Renamed subdivision_templates.department_type_id to faction_type_id');
    } catch (error) {
      if (error instanceof Error && error.message.includes('no such column')) {
        logger.debug('Column department_type_id does not exist, may already be renamed');
      } else {
        throw error;
      }
    }

    // 3. Обновить индекс для pending_changes (удалить старый, создать новый)
    try {
      await database.run(`DROP INDEX IF EXISTS idx_pending_changes_department`);
      await database.run(`
        CREATE INDEX IF NOT EXISTS idx_pending_changes_faction ON pending_changes(faction_id)
      `);
      logger.debug('Updated index for pending_changes.faction_id');
    } catch (error) {
      logger.warn('Failed to update index for pending_changes', {
        error: error instanceof Error ? error.message : error,
      });
    }

    logger.info('Rename department to faction migration completed successfully');
  } catch (error) {
    logger.error('Failed to run rename department to faction migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runRenameDepartmentToFactionMigration;
