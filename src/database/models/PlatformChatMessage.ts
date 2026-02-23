import database from '../db';
import logger from '../../utils/logger';
import { PlatformChatMessage, CreatePlatformChatMessageDTO } from '../../types/database.types';
import { CHAT_MONITOR } from '../../config/constants';

export class PlatformChatMessageModel {
  /**
   * Сохранить сообщение
   */
  static async create(data: CreatePlatformChatMessageDTO): Promise<void> {
    await database.run(
      `INSERT INTO platform_chat_messages
        (subdivision_id, platform, chat_id, message_id, user_id, user_name, content, capture_type, callout_id, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.subdivision_id,
        data.platform,
        data.chat_id,
        data.message_id,
        data.user_id,
        data.user_name,
        data.content,
        data.capture_type,
        data.callout_id ?? null,
        data.captured_at,
      ]
    );
  }

  /**
   * Сохранить и автоматически обрезать rolling buffer для режима мониторинга
   */
  static async createWithRollingBuffer(data: CreatePlatformChatMessageDTO): Promise<void> {
    if (data.capture_type !== 'monitoring') {
      await this.create(data);
      return;
    }

    // Вся операция insert+count+delete — в одной транзакции, чтобы избежать race condition
    const db = database.getConnection();
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN IMMEDIATE', (err) => { if (err) return reject(err); });

        db.run(
          `INSERT INTO platform_chat_messages
            (subdivision_id, platform, chat_id, message_id, user_id, user_name, content, capture_type, callout_id, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [data.subdivision_id, data.platform, data.chat_id, data.message_id,
           data.user_id, data.user_name, data.content, data.capture_type,
           data.callout_id ?? null, data.captured_at],
          (err) => { if (err) { db.run('ROLLBACK'); return reject(err); } }
        );

        db.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM platform_chat_messages
           WHERE subdivision_id = ? AND platform = ? AND chat_id = ? AND capture_type = 'monitoring'`,
          [data.subdivision_id, data.platform, data.chat_id],
          (err, row) => {
            if (err) { db.run('ROLLBACK'); return reject(err); }
            const count = (row as any)?.count || 0;
            const excess = count - CHAT_MONITOR.MONITORING_MAX_MESSAGES;
            if (excess > 0) {
              db.run(
                `DELETE FROM platform_chat_messages
                 WHERE id IN (
                   SELECT id FROM platform_chat_messages
                   WHERE subdivision_id = ? AND platform = ? AND chat_id = ? AND capture_type = 'monitoring'
                   ORDER BY captured_at ASC
                   LIMIT ?
                 )`,
                [data.subdivision_id, data.platform, data.chat_id, excess],
                (err) => { if (err) { db.run('ROLLBACK'); return reject(err); } }
              );
            }
            db.run('COMMIT', (err) => { if (err) return reject(err); resolve(); });
          }
        );
      });
    });
  }

  /**
   * Получить сообщения подразделения с пагинацией
   */
  static async findBySubdivision(
    subdivisionId: number,
    platform?: 'vk' | 'telegram',
    calloutId?: number,
    page = 1,
    pageSize = 10
  ): Promise<{ messages: PlatformChatMessage[]; total: number }> {
    const conditions: string[] = ['subdivision_id = ?'];
    const params: any[] = [subdivisionId];

    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }
    if (calloutId !== undefined) {
      conditions.push('callout_id = ?');
      params.push(calloutId);
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const [messages, countResult] = await Promise.all([
      database.all<PlatformChatMessage>(
        `SELECT * FROM platform_chat_messages WHERE ${where} ORDER BY captured_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      ),
      database.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM platform_chat_messages WHERE ${where}`,
        params
      ),
    ]);

    return { messages, total: countResult?.count || 0 };
  }

  /**
   * Удалить старые сообщения каллаута (при закрытии не нужно, но для очистки)
   */
  static async deleteByCalloutId(calloutId: number): Promise<void> {
    await database.run(
      `DELETE FROM platform_chat_messages WHERE callout_id = ? AND capture_type = 'callout'`,
      [calloutId]
    );
  }

  /**
   * Получить количество захваченных сообщений каллаута по платформе
   */
  static async countByCalloutAndPlatform(calloutId: number, platform: 'vk' | 'telegram'): Promise<number> {
    const result = await database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM platform_chat_messages
       WHERE callout_id = ? AND platform = ? AND capture_type = 'callout'`,
      [calloutId, platform]
    );
    return result?.count || 0;
  }

  /**
   * Получить общее количество сообщений подразделения
   */
  static async countBySubdivision(subdivisionId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM platform_chat_messages WHERE subdivision_id = ?`,
      [subdivisionId]
    );
    return result?.count || 0;
  }
}

export default PlatformChatMessageModel;
