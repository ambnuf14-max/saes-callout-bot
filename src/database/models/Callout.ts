import database from '../db';
import logger from '../../utils/logger';
import { Callout, CreateCalloutDTO, UpdateCalloutDTO } from '../../types/database.types';
import { CALLOUT_STATUS } from '../../config/constants';

/**
 * Модель для работы с таблицей callouts
 */
export class CalloutModel {
  /**
   * Создать новый каллаут
   */
  static async create(data: CreateCalloutDTO): Promise<Callout> {
    const result = await database.run(
      `INSERT INTO callouts (server_id, subdivision_id, author_id, author_name, description, location, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.server_id,
        data.subdivision_id,
        data.author_id,
        data.author_name,
        data.description,
        data.location || null,
        CALLOUT_STATUS.ACTIVE,
      ]
    );

    logger.info('Callout created', {
      calloutId: result.lastID,
      authorId: data.author_id,
      subdivisionId: data.subdivision_id,
    });

    const callout = await this.findById(result.lastID);
    if (!callout) {
      throw new Error('Failed to retrieve created callout');
    }

    return callout;
  }

  /**
   * Найти каллаут по ID
   */
  static async findById(id: number): Promise<Callout | undefined> {
    return await database.get<Callout>('SELECT * FROM callouts WHERE id = ?', [id]);
  }

  /**
   * Найти каллаут по ID канала Discord
   */
  static async findByChannelId(channelId: string): Promise<Callout | undefined> {
    return await database.get<Callout>(
      'SELECT * FROM callouts WHERE discord_channel_id = ?',
      [channelId]
    );
  }

  /**
   * Получить активные каллауты сервера
   */
  static async findActiveByServerId(serverId: number): Promise<Callout[]> {
    return await database.all<Callout>(
      'SELECT * FROM callouts WHERE server_id = ? AND status = ? ORDER BY created_at DESC',
      [serverId, CALLOUT_STATUS.ACTIVE]
    );
  }

  /**
   * Получить все каллауты сервера
   */
  static async findByServerId(serverId: number, limit?: number): Promise<Callout[]> {
    const sql = limit
      ? 'SELECT * FROM callouts WHERE server_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM callouts WHERE server_id = ? ORDER BY created_at DESC';

    const params = limit ? [serverId, limit] : [serverId];

    return await database.all<Callout>(sql, params);
  }

  /**
   * Получить каллауты по департаменту
   */
  static async findByDepartmentId(departmentId: number, limit?: number): Promise<Callout[]> {
    const sql = limit
      ? 'SELECT * FROM callouts WHERE department_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM callouts WHERE department_id = ? ORDER BY created_at DESC';

    const params = limit ? [departmentId, limit] : [departmentId];

    return await database.all<Callout>(sql, params);
  }

  /**
   * Получить каллауты по автору
   */
  static async findByAuthorId(authorId: string, limit?: number): Promise<Callout[]> {
    const sql = limit
      ? 'SELECT * FROM callouts WHERE author_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM callouts WHERE author_id = ? ORDER BY created_at DESC';

    const params = limit ? [authorId, limit] : [authorId];

    return await database.all<Callout>(sql, params);
  }

  /**
   * Обновить каллаут
   */
  static async update(id: number, data: UpdateCalloutDTO): Promise<Callout | undefined> {
    const updates: string[] = [];
    const params: any[] = [];

    if (data.discord_channel_id !== undefined) {
      updates.push('discord_channel_id = ?');
      params.push(data.discord_channel_id);
    }
    if (data.discord_message_id !== undefined) {
      updates.push('discord_message_id = ?');
      params.push(data.discord_message_id);
    }
    if (data.vk_message_id !== undefined) {
      updates.push('vk_message_id = ?');
      params.push(data.vk_message_id);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.closed_by !== undefined) {
      updates.push('closed_by = ?');
      params.push(data.closed_by);
    }
    if (data.closed_reason !== undefined) {
      updates.push('closed_reason = ?');
      params.push(data.closed_reason);
    }
    if (data.closed_at !== undefined) {
      updates.push('closed_at = ?');
      params.push(data.closed_at);
    }

    if (updates.length === 0) {
      return await this.findById(id);
    }

    params.push(id);

    await database.run(
      `UPDATE callouts SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logger.info('Callout updated', { calloutId: id });

    return await this.findById(id);
  }

  /**
   * Закрыть каллаут
   */
  static async close(
    id: number,
    closedBy: string,
    reason?: string
  ): Promise<Callout | undefined> {
    return await this.update(id, {
      status: CALLOUT_STATUS.CLOSED,
      closed_by: closedBy,
      closed_reason: reason,
      closed_at: new Date().toISOString(),
    });
  }

  /**
   * Удалить каллаут
   */
  static async delete(id: number): Promise<void> {
    await database.run('DELETE FROM callouts WHERE id = ?', [id]);
    logger.info('Callout deleted', { calloutId: id });
  }

  /**
   * Получить статистику по каллаутам
   */
  static async getStats(serverId: number): Promise<{
    total: number;
    active: number;
    closed: number;
  }> {
    const total = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM callouts WHERE server_id = ?',
      [serverId]
    );

    const active = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM callouts WHERE server_id = ? AND status = ?',
      [serverId, CALLOUT_STATUS.ACTIVE]
    );

    const closed = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM callouts WHERE server_id = ? AND status = ?',
      [serverId, CALLOUT_STATUS.CLOSED]
    );

    return {
      total: total?.count || 0,
      active: active?.count || 0,
      closed: closed?.count || 0,
    };
  }

  /**
   * Проверить, является ли каллаут активным
   */
  static isActive(callout: Callout): boolean {
    return callout.status === CALLOUT_STATUS.ACTIVE;
  }

  /**
   * Проверить, может ли пользователь закрыть каллаут
   */
  static canUserClose(callout: Callout, userId: string, userRoles: string[], leaderRoles: string[]): boolean {
    // Автор может закрыть
    if (callout.author_id === userId) {
      return true;
    }

    // Лидеры могут закрыть
    if (userRoles.some(role => leaderRoles.includes(role))) {
      return true;
    }

    // TODO: Проверить роль департамента (требуется передать department.discord_role_id)

    return false;
  }

  /**
   * Получить все активные каллауты (для всех серверов)
   */
  static async findActive(): Promise<Callout[]> {
    return await database.all<Callout>(
      'SELECT * FROM callouts WHERE status = ? ORDER BY created_at DESC',
      [CALLOUT_STATUS.ACTIVE]
    );
  }
}

export default CalloutModel;
