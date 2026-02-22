import database from '../db';
import logger from '../../utils/logger';

/**
 * Миграция: добавление колонки platform в callout_responses
 * Значения: 'vk' | 'telegram' | 'discord'
 */
export async function runCalloutResponsePlatformMigration(): Promise<void> {
  try {
    logger.info('Running callout_response_platform migration...');

    try {
      await database.run(
        `ALTER TABLE callout_responses ADD COLUMN platform TEXT NOT NULL DEFAULT 'vk'`
      );
      logger.debug('Added column platform to callout_responses');
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        logger.debug('Column platform already exists, skipping');
      } else {
        throw error;
      }
    }

    // Backfill: строки с vk_user_id начинающимся на 'discord_' — это Discord-реагирования
    const result = await database.run(
      `UPDATE callout_responses SET platform = 'discord' WHERE vk_user_id LIKE 'discord_%'`
    );
    if (result.changes && result.changes > 0) {
      logger.info(`Backfilled platform='discord' for ${result.changes} existing responses`);
    }

    logger.info('callout_response_platform migration completed successfully');
  } catch (error) {
    logger.error('Failed to run callout_response_platform migration', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export default runCalloutResponsePlatformMigration;
