import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление поля audit_log_message_id в таблицу pending_changes
 * Хранит ID сообщения в audit log канале для последующего редактирования
 */
export default async function runPendingChangeAuditMessageMigration(): Promise<void> {
  try {
    logger.info('Running pending_change_audit_message migration...');

    await database.exec(`
      ALTER TABLE pending_changes ADD COLUMN audit_log_message_id TEXT;
    `);

    logger.info('pending_change_audit_message migration completed successfully');
  } catch (error) {
    if (error instanceof Error && error.message.includes('duplicate column name')) {
      logger.info('Column audit_log_message_id already exists, skipping');
      return;
    }
    logger.error('Failed to run pending_change_audit_message migration', {
      error: error instanceof Error ? error.message : error,
    });
  }
}
