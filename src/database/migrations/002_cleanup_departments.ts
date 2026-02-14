import database from '../db';
import logger from '../../utils/logger';

/**
 * Безопасная очистка старой таблицы departments после успешной миграции
 *
 * Включает:
 * 1. Проверку orphaned callouts
 * 2. Пересоздание таблицы callouts без колонки department_id (SQLite не поддерживает DROP COLUMN)
 * 3. Удаление таблицы departments
 * 4. Очистку старых индексов
 */
export async function cleanupOldDepartments(): Promise<void> {
  const db = database;

  logger.warn('Starting cleanup of old departments table...');

  try {
    // ШАГ 1: Финальная проверка - есть ли каллауты со старыми ссылками?
    const orphanedCallouts = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM callouts
       WHERE department_id IS NOT NULL AND (subdivision_id IS NULL OR subdivision_id = 0)`
    );

    if (orphanedCallouts && orphanedCallouts.count > 0) {
      throw new Error(
        `Cannot cleanup: ${orphanedCallouts.count} callouts still reference old department_id without subdivision_id`
      );
    }

    logger.info('All callouts have been migrated to subdivisions');

    // ШАГ 2: Проверить существование колонки department_id
    const calloutsTableInfo = await db.all<{ name: string }>(
      `PRAGMA table_info(callouts)`
    );

    const hasDepartmentIdColumn = calloutsTableInfo.some((col) => col.name === 'department_id');

    if (hasDepartmentIdColumn) {
      logger.info('Recreating callouts table without department_id column...');

      // Пересоздание таблицы callouts без колонки department_id
      // SQLite не поддерживает DROP COLUMN напрямую
      await db.exec(`
        BEGIN TRANSACTION;

        -- Создать временную таблицу с новой схемой
        CREATE TABLE callouts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          subdivision_id INTEGER NOT NULL,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          description TEXT NOT NULL,
          location TEXT,
          discord_channel_id TEXT,
          discord_message_id TEXT,
          vk_message_id TEXT,
          status TEXT DEFAULT 'active',
          closed_by TEXT,
          closed_reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          closed_at DATETIME,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
          FOREIGN KEY (subdivision_id) REFERENCES subdivisions(id) ON DELETE CASCADE
        );

        -- Скопировать данные (только те, у которых есть subdivision_id)
        INSERT INTO callouts_new
          SELECT id, server_id, subdivision_id, author_id, author_name,
                 description, location, discord_channel_id, discord_message_id,
                 vk_message_id, status, closed_by, closed_reason, created_at, closed_at
          FROM callouts
          WHERE subdivision_id IS NOT NULL;

        -- Удалить старую таблицу
        DROP TABLE callouts;

        -- Переименовать новую таблицу
        ALTER TABLE callouts_new RENAME TO callouts;

        -- Пересоздать индексы
        CREATE INDEX idx_callouts_status ON callouts(status);
        CREATE INDEX idx_callouts_created ON callouts(created_at);
        CREATE INDEX idx_callouts_server ON callouts(server_id);
        CREATE INDEX idx_callouts_subdivision ON callouts(subdivision_id);

        COMMIT;
      `);

      logger.info('Callouts table recreated without department_id column');
    }

    // ШАГ 3: Удалить старую таблицу departments
    logger.info('Dropping departments table...');
    await db.exec('DROP TABLE IF EXISTS departments');
    logger.info('Old departments table dropped');

    // ШАГ 4: Очистить индексы departments
    await db.exec('DROP INDEX IF EXISTS idx_departments_server');
    logger.info('Old department indexes dropped');

    // ШАГ 5: Обновить callout_responses для использования subdivision через callout
    // callout_responses имеет department_id, но на самом деле это можно получить через callout_id
    // Проверяем, нужно ли обновлять схему
    const responsesTableInfo = await db.all<{ name: string }>(
      `PRAGMA table_info(callout_responses)`
    );

    const responsesHasDepartmentId = responsesTableInfo.some((col) => col.name === 'department_id');

    if (responsesHasDepartmentId) {
      logger.info('Recreating callout_responses table without department_id...');

      await db.exec(`
        BEGIN TRANSACTION;

        -- Создать временную таблицу
        CREATE TABLE callout_responses_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          callout_id INTEGER NOT NULL,
          vk_user_id TEXT NOT NULL,
          vk_user_name TEXT NOT NULL,
          response_type TEXT DEFAULT 'acknowledged',
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (callout_id) REFERENCES callouts(id) ON DELETE CASCADE
        );

        -- Скопировать данные
        INSERT INTO callout_responses_new
          SELECT id, callout_id, vk_user_id, vk_user_name, response_type, message, created_at
          FROM callout_responses;

        -- Удалить старую таблицу
        DROP TABLE callout_responses;

        -- Переименовать новую таблицу
        ALTER TABLE callout_responses_new RENAME TO callout_responses;

        -- Пересоздать индексы
        CREATE INDEX idx_responses_callout ON callout_responses(callout_id);

        COMMIT;
      `);

      logger.info('Callout_responses table recreated');
    }

    logger.info('Cleanup completed successfully');
  } catch (error) {
    logger.error('Failed to cleanup old departments', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Проверить, была ли выполнена очистка
 */
export async function isCleanupCompleted(): Promise<boolean> {
  try {
    // Проверяем, существует ли еще таблица departments
    const tables = await database.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='departments'`
    );

    return tables.length === 0; // true если таблица удалена
  } catch (error) {
    return false;
  }
}
