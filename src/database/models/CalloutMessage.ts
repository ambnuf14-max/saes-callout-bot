import database from '../db';
import logger from '../../utils/logger';
import { CalloutMessage, CreateCalloutMessageDTO } from '../../types/database.types';

export class CalloutMessageModel {
  /**
   * Сохранить сообщение
   */
  static async create(data: CreateCalloutMessageDTO): Promise<void> {
    await database.run(
      `INSERT INTO callout_messages (callout_id, message_id, author_id, author_name, content, is_bot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.callout_id,
        data.message_id,
        data.author_id,
        data.author_name,
        data.content,
        data.is_bot ? 1 : 0,
        data.created_at,
      ]
    );
  }

  /**
   * Удалить все сохранённые сообщения каллаута
   */
  static async deleteByCalloutId(calloutId: number): Promise<void> {
    await database.run(
      `DELETE FROM callout_messages WHERE callout_id = ?`,
      [calloutId]
    );
  }

  /**
   * Пакетное сохранение сообщений (перезаписывает существующие)
   */
  static async bulkCreate(messages: CreateCalloutMessageDTO[]): Promise<void> {
    if (messages.length === 0) return;

    await this.deleteByCalloutId(messages[0].callout_id);

    for (const msg of messages) {
      await this.create(msg);
    }

    logger.info('Callout messages saved', {
      calloutId: messages[0].callout_id,
      count: messages.length,
    });
  }

  /**
   * Получить все сообщения каллаута (с пагинацией)
   */
  static async findByCalloutId(
    calloutId: number,
    page = 1,
    pageSize = 10
  ): Promise<{ messages: CalloutMessage[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [messages, countResult] = await Promise.all([
      database.all<CalloutMessage>(
        `SELECT * FROM callout_messages WHERE callout_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
        [calloutId, pageSize, offset]
      ),
      database.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM callout_messages WHERE callout_id = ?`,
        [calloutId]
      ),
    ]);

    return {
      messages: messages.map(m => ({ ...m, is_bot: Boolean(m.is_bot) })),
      total: countResult?.count || 0,
    };
  }

  /**
   * Проверить, есть ли сохранённые сообщения для каллаута
   */
  static async hasMessages(calloutId: number): Promise<boolean> {
    const result = await database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM callout_messages WHERE callout_id = ?`,
      [calloutId]
    );
    return (result?.count || 0) > 0;
  }
}

export default CalloutMessageModel;
