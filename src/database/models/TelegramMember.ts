import database from '../db';

export interface TelegramMember {
  id: number;
  chat_id: string;
  user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  updated_at: string;
}

export class TelegramMemberModel {
  static async upsert(
    chatId: string,
    user: { id: number; username?: string; first_name?: string; last_name?: string }
  ): Promise<void> {
    await database.run(
      `INSERT INTO telegram_members (chat_id, user_id, username, first_name, last_name, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         updated_at = CURRENT_TIMESTAMP`,
      [chatId, user.id, user.username ?? null, user.first_name ?? null, user.last_name ?? null]
    );
  }

  static async findByChatId(chatId: string): Promise<TelegramMember[]> {
    return await database.all<TelegramMember>(
      `SELECT * FROM telegram_members WHERE chat_id = ?`,
      [chatId]
    );
  }
}
