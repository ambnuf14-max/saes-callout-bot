import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция для добавления Discord message tracking в verification tokens
 * Позволяет редактировать сообщение с инструкциями при успешной верификации
 */
export async function runVerificationDiscordMessageMigration(): Promise<void> {
  try {
    logger.info('Running verification discord message migration...');

    // Список колонок для добавления
    const columns = [
      'discord_channel_id',
      'discord_message_id',
    ];

    // Добавить каждую колонку отдельно (идемпотентно)
    for (const column of columns) {
      try {
        await database.run(`ALTER TABLE verification_tokens ADD COLUMN ${column} TEXT`);
        logger.debug(`Added column ${column} to verification_tokens table`);
      } catch (error) {
        // Игнорировать ошибку если колонка уже существует
        if (error instanceof Error && error.message.includes('duplicate column')) {
          logger.debug(`Column ${column} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('Verification discord message migration completed successfully');
  } catch (error) {
    logger.error('Failed to run verification discord message migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runVerificationDiscordMessageMigration;
