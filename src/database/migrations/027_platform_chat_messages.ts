import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: таблица сообщений из VK/TG чатов + флаг мониторинга на подразделении
 */
export default async function runPlatformChatMessagesMigration(): Promise<void> {
  try {
    // Таблица сообщений из платформ
    await database.exec(`
      CREATE TABLE IF NOT EXISTS platform_chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subdivision_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        content TEXT NOT NULL,
        capture_type TEXT NOT NULL DEFAULT 'callout',
        callout_id INTEGER,
        captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subdivision_id) REFERENCES subdivisions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_pcm_subdivision ON platform_chat_messages(subdivision_id);
      CREATE INDEX IF NOT EXISTS idx_pcm_platform_chat ON platform_chat_messages(platform, chat_id);
      CREATE INDEX IF NOT EXISTS idx_pcm_callout ON platform_chat_messages(callout_id);
    `);

    // Флаг мониторинга на подразделении
    const columns = await database.all<{ name: string }>(
      `PRAGMA table_info(subdivisions)`
    );
    const names = columns.map(c => c.name);

    if (!names.includes('monitoring_enabled')) {
      await database.exec(`ALTER TABLE subdivisions ADD COLUMN monitoring_enabled INTEGER NOT NULL DEFAULT 0`);
      logger.info('Added monitoring_enabled column to subdivisions');
    }

    logger.info('Platform chat messages migration completed');
  } catch (error) {
    logger.error('Platform chat messages migration failed', { error });
    throw error;
  }
}
