import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция для системы одобрения и типов департаментов
 * - department_types: типы департаментов с шаблонами
 * - subdivision_templates: предопределенные подразделения для типов
 * - pending_changes: ожидающие одобрения изменения от лидеров
 * - department_type_id в departments: связь департамента с типом
 */
export async function runApprovalAndTypesSystemMigration(): Promise<void> {
  try {
    logger.info('Running approval and types system migration...');

    // 1. Создать таблицу department_types
    try {
      await database.run(`
        CREATE TABLE IF NOT EXISTS department_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
          UNIQUE(server_id, name)
        )
      `);
      logger.debug('Created department_types table');
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.debug('Table department_types already exists, skipping');
      } else {
        throw error;
      }
    }

    // 2. Создать таблицу subdivision_templates
    try {
      await database.run(`
        CREATE TABLE IF NOT EXISTS subdivision_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          department_type_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          embed_author_name TEXT,
          embed_author_url TEXT,
          embed_author_icon_url TEXT,
          embed_title TEXT,
          embed_description TEXT,
          embed_color TEXT,
          embed_image_url TEXT,
          embed_thumbnail_url TEXT,
          embed_footer_text TEXT,
          embed_footer_icon_url TEXT,
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (department_type_id) REFERENCES department_types(id) ON DELETE CASCADE
        )
      `);
      logger.debug('Created subdivision_templates table');
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.debug('Table subdivision_templates already exists, skipping');
      } else {
        throw error;
      }
    }

    // 3. Создать таблицу pending_changes
    try {
      await database.run(`
        CREATE TABLE IF NOT EXISTS pending_changes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          department_id INTEGER NOT NULL,
          subdivision_id INTEGER,
          change_type TEXT NOT NULL,
          requested_by TEXT NOT NULL,
          requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'pending',
          reviewed_by TEXT,
          reviewed_at DATETIME,
          rejection_reason TEXT,
          change_data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
          FOREIGN KEY (subdivision_id) REFERENCES subdivisions(id) ON DELETE CASCADE
        )
      `);
      logger.debug('Created pending_changes table');
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.debug('Table pending_changes already exists, skipping');
      } else {
        throw error;
      }
    }

    // 4. Создать индексы для pending_changes
    try {
      await database.run(`
        CREATE INDEX IF NOT EXISTS idx_pending_changes_status ON pending_changes(status)
      `);
      await database.run(`
        CREATE INDEX IF NOT EXISTS idx_pending_changes_department ON pending_changes(department_id)
      `);
      await database.run(`
        CREATE INDEX IF NOT EXISTS idx_pending_changes_requested_by ON pending_changes(requested_by)
      `);
      logger.debug('Created indexes for pending_changes table');
    } catch (error) {
      logger.warn('Failed to create some indexes (may already exist)', {
        error: error instanceof Error ? error.message : error,
      });
    }

    // 5. Добавить department_type_id в departments
    try {
      await database.run(`
        ALTER TABLE departments ADD COLUMN department_type_id INTEGER REFERENCES department_types(id) ON DELETE SET NULL
      `);
      logger.debug('Added column department_type_id to departments table');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column department_type_id already exists, skipping');
      } else {
        throw error;
      }
    }

    logger.info('Approval and types system migration completed successfully');
  } catch (error) {
    logger.error('Failed to run approval and types system migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runApprovalAndTypesSystemMigration;
