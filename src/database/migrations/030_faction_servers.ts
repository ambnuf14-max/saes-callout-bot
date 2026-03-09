import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: поддержка фракционных серверов
 * - Добавляет колонки server_type, linked_faction_id, linked_main_server_id, faction_server_needs_setup в servers
 * - Создаёт таблицу faction_link_tokens для токенов привязки faction-серверов
 */
export async function runFactionServersMigration(): Promise<void> {
  try {
    logger.info('Running faction_servers migration...');

    // Добавить server_type
    try {
      await database.run(
        `ALTER TABLE servers ADD COLUMN server_type TEXT NOT NULL DEFAULT 'main'`
      );
      logger.debug('Added column server_type to servers');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column server_type already exists, skipping');
      } else {
        throw error;
      }
    }

    // Добавить linked_faction_id
    try {
      await database.run(
        `ALTER TABLE servers ADD COLUMN linked_faction_id INTEGER REFERENCES factions(id) ON DELETE SET NULL`
      );
      logger.debug('Added column linked_faction_id to servers');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column linked_faction_id already exists, skipping');
      } else {
        throw error;
      }
    }

    // Добавить linked_main_server_id
    try {
      await database.run(
        `ALTER TABLE servers ADD COLUMN linked_main_server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL`
      );
      logger.debug('Added column linked_main_server_id to servers');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column linked_main_server_id already exists, skipping');
      } else {
        throw error;
      }
    }

    // Добавить faction_server_needs_setup
    try {
      await database.run(
        `ALTER TABLE servers ADD COLUMN faction_server_needs_setup INTEGER NOT NULL DEFAULT 0`
      );
      logger.debug('Added column faction_server_needs_setup to servers');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column faction_server_needs_setup already exists, skipping');
      } else {
        throw error;
      }
    }

    // Создать таблицу faction_link_tokens
    await database.exec(`
      CREATE TABLE IF NOT EXISTS faction_link_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        main_server_id INTEGER NOT NULL,
        faction_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_by TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        is_used INTEGER DEFAULT 0,
        used_at DATETIME,
        used_by_guild_id TEXT,
        discord_channel_id TEXT,
        discord_message_id TEXT,
        discord_interaction_token TEXT,
        discord_application_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (main_server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (faction_id) REFERENCES factions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_faction_link_tokens_token ON faction_link_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_faction_link_tokens_faction ON faction_link_tokens(faction_id);
      CREATE INDEX IF NOT EXISTS idx_faction_link_tokens_expires ON faction_link_tokens(expires_at);
    `);
    logger.debug('Created faction_link_tokens table and indexes');

    logger.info('faction_servers migration completed successfully');
  } catch (error) {
    logger.error('Failed to run faction_servers migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runFactionServersMigration;
