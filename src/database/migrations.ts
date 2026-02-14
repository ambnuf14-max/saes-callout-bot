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

-- Таблица каллаутов
CREATE TABLE IF NOT EXISTS callouts (
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

-- Таблица ответов на каллауты
CREATE TABLE IF NOT EXISTS callout_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    callout_id INTEGER NOT NULL,
    subdivision_id INTEGER NOT NULL,
    vk_user_id TEXT NOT NULL,
    vk_user_name TEXT NOT NULL,
    response_type TEXT DEFAULT 'acknowledged',
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (callout_id) REFERENCES callouts(id) ON DELETE CASCADE,
    FOREIGN KEY (subdivision_id) REFERENCES subdivisions(id) ON DELETE CASCADE
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

-- Таблица департаментов
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    general_leader_role_id TEXT NOT NULL,
    department_role_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    UNIQUE(server_id, name),
    UNIQUE(server_id, general_leader_role_id, department_role_id)
);

-- Таблица подразделений внутри департаментов
CREATE TABLE IF NOT EXISTS subdivisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    discord_role_id TEXT,
    vk_chat_id TEXT,
    is_accepting_callouts BOOLEAN DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    UNIQUE(department_id, name)
);

-- Таблица токенов верификации VK бесед
CREATE TABLE IF NOT EXISTS vk_verification_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    subdivision_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    is_used BOOLEAN DEFAULT 0,
    used_at DATETIME,
    vk_peer_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (subdivision_id) REFERENCES subdivisions(id) ON DELETE CASCADE
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_callouts_status ON callouts(status);
CREATE INDEX IF NOT EXISTS idx_callouts_created ON callouts(created_at);
CREATE INDEX IF NOT EXISTS idx_callouts_server ON callouts(server_id);
CREATE INDEX IF NOT EXISTS idx_callouts_subdivision ON callouts(subdivision_id);
CREATE INDEX IF NOT EXISTS idx_responses_callout ON callout_responses(callout_id);
CREATE INDEX IF NOT EXISTS idx_responses_subdivision ON callout_responses(subdivision_id);
CREATE INDEX IF NOT EXISTS idx_servers_guild ON servers(guild_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_server ON callout_rate_limits(user_id, server_id);

-- Индексы для новых таблиц
CREATE INDEX IF NOT EXISTS idx_departments_server ON departments(server_id);
CREATE INDEX IF NOT EXISTS idx_departments_roles ON departments(general_leader_role_id, department_role_id);
CREATE INDEX IF NOT EXISTS idx_subdivisions_department ON subdivisions(department_id);
CREATE INDEX IF NOT EXISTS idx_subdivisions_server ON subdivisions(server_id);
CREATE INDEX IF NOT EXISTS idx_subdivisions_vk_chat ON subdivisions(vk_chat_id);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON vk_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires ON vk_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_subdivision ON vk_verification_tokens(subdivision_id);
`;

/**
 * Выполнить миграции базы данных
 */
export async function runMigrations(): Promise<void> {
  try {
    logger.info('Running database migrations...');

    // Создать таблицы
    await database.exec(MIGRATIONS_SQL);

    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Failed to run migrations', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Проверить существование таблиц
 */
export async function checkTables(): Promise<boolean> {
  try {
    const tables = await database.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('servers', 'departments', 'subdivisions', 'callouts', 'callout_responses', 'callout_rate_limits', 'vk_verification_tokens')`
    );

    return tables.length === 7;
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
    await database.run('DELETE FROM vk_verification_tokens');
    await database.run('DELETE FROM callout_rate_limits');
    await database.run('DELETE FROM callout_responses');
    await database.run('DELETE FROM callouts');
    await database.run('DELETE FROM subdivisions');
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
