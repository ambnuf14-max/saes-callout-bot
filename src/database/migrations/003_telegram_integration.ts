import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция для интеграции Telegram бота
 * Добавляет поддержку Telegram групп и универсализирует систему верификации
 */
export async function runTelegramIntegrationMigration(): Promise<void> {
  try {
    logger.info('Running Telegram integration migration...');

    // 1. Добавить telegram_chat_id в таблицу subdivisions (идемпотентно)
    try {
      await database.exec(`ALTER TABLE subdivisions ADD COLUMN telegram_chat_id TEXT;`);
      logger.debug('Added column telegram_chat_id to subdivisions');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column telegram_chat_id already exists, skipping');
      } else {
        throw error;
      }
    }

    // 2. Добавить telegram_message_id в таблицу callouts (идемпотентно)
    try {
      await database.exec(`ALTER TABLE callouts ADD COLUMN telegram_message_id TEXT;`);
      logger.debug('Added column telegram_message_id to callouts');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column telegram_message_id already exists, skipping');
      } else {
        throw error;
      }
    }

    // 3. Создать новую таблицу verification_tokens с поддержкой платформ
    await database.exec(`
      -- Создать новую таблицу для универсальных токенов верификации
      CREATE TABLE IF NOT EXISTS verification_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        subdivision_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        platform TEXT NOT NULL DEFAULT 'vk',
        created_by TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        is_used BOOLEAN DEFAULT 0,
        used_at DATETIME,
        chat_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (subdivision_id) REFERENCES subdivisions(id) ON DELETE CASCADE
      );
    `);

    // 4. Мигрировать данные из старой таблицы в новую (если есть)
    const vkTokensTableExists = await database.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='vk_verification_tokens'"
    );

    if (vkTokensTableExists && vkTokensTableExists.count > 0) {
      await database.exec(`
        -- Копировать данные из старой таблицы
        INSERT INTO verification_tokens (
          id, server_id, subdivision_id, token, platform, created_by,
          expires_at, is_used, used_at, chat_id, created_at
        )
        SELECT
          id, server_id, subdivision_id, token, 'vk' as platform, created_by,
          expires_at, is_used, used_at, vk_peer_id as chat_id, created_at
        FROM vk_verification_tokens;
      `);

      // Удалить старую таблицу
      await database.exec(`DROP TABLE IF EXISTS vk_verification_tokens;`);
      logger.info('Migrated vk_verification_tokens to verification_tokens');
    }

    // 5. Создать индексы для новых полей
    await database.exec(`
      -- Индекс для telegram_chat_id
      CREATE INDEX IF NOT EXISTS idx_subdivisions_telegram_chat
      ON subdivisions(telegram_chat_id);

      -- Индексы для verification_tokens
      CREATE INDEX IF NOT EXISTS idx_verification_tokens_token
      ON verification_tokens(token);

      CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires
      ON verification_tokens(expires_at);

      CREATE INDEX IF NOT EXISTS idx_verification_tokens_subdivision
      ON verification_tokens(subdivision_id);

      CREATE INDEX IF NOT EXISTS idx_verification_tokens_platform
      ON verification_tokens(platform);

      CREATE INDEX IF NOT EXISTS idx_verification_tokens_chat_id
      ON verification_tokens(chat_id);
    `);

    logger.info('Telegram integration migration completed successfully');
  } catch (error) {
    logger.error('Failed to run Telegram integration migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runTelegramIntegrationMigration;
