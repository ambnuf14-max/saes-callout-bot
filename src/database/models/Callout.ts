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
      `INSERT INTO callouts (server_id, subdivision_id, author_id, author_name, author_faction_name, description, brief_description, location, tac_channel, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.server_id,
        data.subdivision_id,
        data.author_id,
        data.author_name,
        data.author_faction_name || null,
        data.description,
        data.brief_description || null,
        data.location || null,
        data.tac_channel || null,
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
    if (data.telegram_message_id !== undefined) {
      updates.push('telegram_message_id = ?');
      params.push(data.telegram_message_id);
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
    const result = await database.get<{ total: number; active: number; closed: number }>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as closed
      FROM callouts WHERE server_id = ?`,
      [CALLOUT_STATUS.ACTIVE, CALLOUT_STATUS.CLOSED, serverId]
    );

    return {
      total: result?.total || 0,
      active: result?.active || 0,
      closed: result?.closed || 0,
    };
  }

  /**
   * Получить последние каллауты фракции (по всем её подразделениям)
   */
  static async findByFactionId(factionId: number, limit: number = 15): Promise<Callout[]> {
    return await database.all<Callout>(
      `SELECT c.* FROM callouts c
       JOIN subdivisions s ON c.subdivision_id = s.id
       WHERE s.faction_id = ?
       ORDER BY c.created_at DESC
       LIMIT ?`,
      [factionId, limit]
    );
  }

  /**
   * Получить каллауты фракции с пагинацией
   */
  static async findByFactionIdPaginated(
    factionId: number,
    page: number = 1,
    pageSize: number = 5
  ): Promise<{ callouts: Callout[]; total: number }> {
    const countResult = await database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM callouts c
       JOIN subdivisions s ON c.subdivision_id = s.id
       WHERE s.faction_id = ?`,
      [factionId]
    );
    const total = countResult?.count || 0;

    const offset = (page - 1) * pageSize;
    const callouts = await database.all<Callout>(
      `SELECT c.* FROM callouts c
       JOIN subdivisions s ON c.subdivision_id = s.id
       WHERE s.faction_id = ?
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [factionId, pageSize, offset]
    );

    return { callouts, total };
  }

  /**
   * Получить каллауты с фильтрацией и пагинацией
   */
  static async findFiltered(
    serverId: number,
    filters: { subdivisionId?: number; authorId?: string; status?: string },
    page: number = 1,
    pageSize: number = 10
  ): Promise<{ callouts: Callout[]; total: number }> {
    const conditions: string[] = ['server_id = ?'];
    const params: any[] = [serverId];

    if (filters.subdivisionId != null) {
      conditions.push('subdivision_id = ?');
      params.push(filters.subdivisionId);
    }
    if (filters.authorId != null) {
      conditions.push('author_id = ?');
      params.push(filters.authorId);
    }
    if (filters.status && filters.status !== 'all') {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM callouts WHERE ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    const offset = (page - 1) * pageSize;
    const callouts = await database.all<Callout>(
      `SELECT * FROM callouts WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return { callouts, total };
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
   * Найти активные каллауты, созданные раньше чем timeoutMs миллисекунд назад
   */
  static async findExpiredActive(timeoutMs: number): Promise<Callout[]> {
    // SQLite хранит CURRENT_TIMESTAMP как 'YYYY-MM-DD HH:MM:SS' (без T и Z),
    // поэтому приводим cutoff к тому же формату для корректного строкового сравнения
    const cutoff = new Date(Date.now() - timeoutMs)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '');
    return await database.all<Callout>(
      'SELECT * FROM callouts WHERE status = ? AND created_at < ?',
      [CALLOUT_STATUS.ACTIVE, cutoff]
    );
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

  /**
   * Найти закрытые каллауты с каналом, закрытые раньше чем minAgeMs миллисекунд назад
   */
  static async findClosedWithChannelOlderThan(minAgeMs: number): Promise<Callout[]> {
    // SQLite хранит CURRENT_TIMESTAMP как 'YYYY-MM-DD HH:MM:SS' (без T и Z),
    // поэтому приводим cutoff к тому же формату для корректного строкового сравнения
    const cutoff = new Date(Date.now() - minAgeMs)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '');
    return await database.all<Callout>(
      `SELECT * FROM callouts
       WHERE status != ?
         AND discord_channel_id IS NOT NULL
         AND closed_at IS NOT NULL
         AND closed_at < ?`,
      [CALLOUT_STATUS.ACTIVE, cutoff]
    );
  }

  /**
   * Получить количество активных каллаутов (для всех серверов)
   */
  static async countActive(): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM callouts WHERE status = ?',
      [CALLOUT_STATUS.ACTIVE]
    );
    return result?.count || 0;
  }
}

export default CalloutModel;
