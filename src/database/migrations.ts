import database from './db';
import logger from '../utils/logger';

/**
 * SQL схема для всех таблиц
 */
const MIGRATIONS_SQL = `
-- Таблица настроек Discord сервера
CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT UNIQUE NOT NULL,
    callout_channel_id TEXT,
    callout_message_id TEXT,
    category_id TEXT,
    leader_role_ids TEXT,
    audit_log_channel_id TEXT,
    callout_allowed_role_ids TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица департаментов
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    discord_role_id TEXT NOT NULL,
    vk_chat_id TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    UNIQUE(server_id, name)
);

-- Таблица каллаутов
CREATE TABLE IF NOT EXISTS callouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    department_id INTEGER NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    description TEXT NOT NULL,
    discord_channel_id TEXT,
    discord_message_id TEXT,
    vk_message_id TEXT,
    status TEXT DEFAULT 'active',
    closed_by TEXT,
    closed_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- Таблица ответов на каллауты
CREATE TABLE IF NOT EXISTS callout_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    callout_id INTEGER NOT NULL,
    department_id INTEGER NOT NULL,
    vk_user_id TEXT NOT NULL,
    vk_user_name TEXT NOT NULL,
    response_type TEXT DEFAULT 'acknowledged',
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (callout_id) REFERENCES callouts(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- Таблица для rate limiting каллаутов
CREATE TABLE IF NOT EXISTS callout_rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    server_id INTEGER NOT NULL,
    last_callout_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    UNIQUE(user_id, server_id)
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_callouts_status ON callouts(status);
CREATE INDEX IF NOT EXISTS idx_callouts_created ON callouts(created_at);
CREATE INDEX IF NOT EXISTS idx_callouts_server ON callouts(server_id);
CREATE INDEX IF NOT EXISTS idx_departments_server ON departments(server_id);
CREATE INDEX IF NOT EXISTS idx_responses_callout ON callout_responses(callout_id);
CREATE INDEX IF NOT EXISTS idx_servers_guild ON servers(guild_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_server ON callout_rate_limits(user_id, server_id);
`;

/**
 * Выполнить миграции базы данных
 */
export async function runMigrations(): Promise<void> {
  try {
    logger.info('Running database migrations...');

    await database.exec(MIGRATIONS_SQL);

    // Применить дополнительные миграции колонок
    await applyColumnMigrations();

    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Failed to run migrations', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Применить миграции для добавления новых колонок в существующие таблицы
 */
async function applyColumnMigrations(): Promise<void> {
  try {
    // Проверить существование колонки audit_log_channel_id в таблице servers
    const tableInfo = await database.all<{ name: string }>(
      `PRAGMA table_info(servers)`
    );

    const hasAuditLogColumn = tableInfo.some((col) => col.name === 'audit_log_channel_id');
    const hasCalloutRolesColumn = tableInfo.some((col) => col.name === 'callout_allowed_role_ids');

    if (!hasAuditLogColumn) {
      logger.info('Adding audit_log_channel_id column to servers table...');
      await database.run('ALTER TABLE servers ADD COLUMN audit_log_channel_id TEXT');
      logger.info('Column audit_log_channel_id added successfully');
    }

    if (!hasCalloutRolesColumn) {
      logger.info('Adding callout_allowed_role_ids column to servers table...');
      await database.run('ALTER TABLE servers ADD COLUMN callout_allowed_role_ids TEXT');
      logger.info('Column callout_allowed_role_ids added successfully');
    }

    // Проверить существование колонки location в таблице callouts
    const calloutsTableInfo = await database.all<{ name: string }>(
      `PRAGMA table_info(callouts)`
    );

    const hasLocationColumn = calloutsTableInfo.some((col) => col.name === 'location');

    if (!hasLocationColumn) {
      logger.info('Adding location column to callouts table...');
      await database.run('ALTER TABLE callouts ADD COLUMN location TEXT');
      logger.info('Column location added successfully');
    }
  } catch (error) {
    logger.error('Failed to apply column migrations', {
      error: error instanceof Error ? error.message : error,
    });
    // Не бросаем ошибку, так как это может быть первый запуск
  }
}

/**
 * Проверить существование таблиц
 */
export async function checkTables(): Promise<boolean> {
  try {
    const tables = await database.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('servers', 'departments', 'callouts', 'callout_responses', 'callout_rate_limits')`
    );

    return tables.length === 5;
  } catch (error) {
    logger.error('Failed to check tables', { error });
    return false;
  }
}

/**
 * Очистить все таблицы (только для разработки/тестирования!)
 */
export async function clearAllTables(): Promise<void> {
  logger.warn('Clearing all tables - this should only be used in development!');

  try {
    await database.run('DELETE FROM callout_rate_limits');
    await database.run('DELETE FROM callout_responses');
    await database.run('DELETE FROM callouts');
    await database.run('DELETE FROM departments');
    await database.run('DELETE FROM servers');

    logger.info('All tables cleared');
  } catch (error) {
    logger.error('Failed to clear tables', { error });
    throw error;
  }
}

// Если этот файл запущен напрямую (npm run migrate)
if (require.main === module) {
  (async () => {
    try {
      await database.connect();
      await runMigrations();
      await database.close();
      process.exit(0);
    } catch (error) {
      logger.error('Migration failed', { error });
      process.exit(1);
    }
  })();
}
