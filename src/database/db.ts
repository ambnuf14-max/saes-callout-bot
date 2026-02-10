import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import config from '../config/config';
import logger from '../utils/logger';

// Включаем verbose режим для детального логирования
const Database = sqlite3.verbose().Database;

/**
 * Класс для работы с SQLite базой данных
 */
class DatabaseConnection {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.resolve(process.cwd(), config.database.path);
  }

  /**
   * Подключение к базе данных
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Создаем папку data если её нет
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Failed to connect to database', {
            error: err.message,
            path: this.dbPath,
          });
          reject(err);
        } else {
          // Включаем foreign keys после успешного подключения
          this.db!.run('PRAGMA foreign_keys = ON', (pragmaErr) => {
            if (pragmaErr) {
              logger.error('Failed to enable foreign keys', {
                error: pragmaErr.message,
              });
              reject(pragmaErr);
            } else {
              logger.info('Connected to database', { path: this.dbPath });
              resolve();
            }
          });
        }
      });
    });
  }

  /**
   * Получить подключение к БД
   */
  getConnection(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Выполнить SQL запрос
   */
  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Получить одну строку
   */
  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  /**
   * Получить все строки
   */
  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * Выполнить несколько SQL команд (для миграций)
   */
  async exec(sql: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Закрыть подключение к БД
   */
  async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          logger.error('Error closing database', { error: err.message });
          reject(err);
        } else {
          logger.info('Database connection closed');
          this.db = null;
          resolve();
        }
      });
    });
  }
}

// Singleton instance
const database = new DatabaseConnection();

export default database;
