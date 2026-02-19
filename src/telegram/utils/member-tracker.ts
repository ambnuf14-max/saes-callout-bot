import { TelegramMemberModel } from '../../database/models/TelegramMember';
import logger from '../../utils/logger';

/**
 * Сохранить/обновить участника Telegram-чата в БД
 */
export async function trackTelegramMember(
  chatId: string | number,
  user: { id: number; username?: string; first_name?: string; last_name?: string }
): Promise<void> {
  try {
    await TelegramMemberModel.upsert(String(chatId), user);
  } catch (error) {
    logger.error('Failed to track Telegram member', {
      error: error instanceof Error ? error.message : error,
      chatId,
      userId: user.id,
    });
  }
}
