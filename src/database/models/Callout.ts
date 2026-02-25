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
    if (data.declined_at !== undefined) {
      updates.push('declined_at = ?');
      params.push(data.declined_at);
    }
    if (data.declined_by !== undefined) {
      updates.push('declined_by = ?');
      params.push(data.declined_by);
    }
    if (data.declined_by_name !== undefined) {
      updates.push('declined_by_name = ?');
      params.push(data.declined_by_name);
    }
    if (data.decline_reason !== undefined) {
      updates.push('decline_reason = ?');
      params.push(data.decline_reason);
    }
    if (data.last_declined_at !== undefined) {
      updates.push('last_declined_at = ?');
      params.push(data.last_declined_at);
    }
    if (data.last_declined_by_name !== undefined) {
      updates.push('last_declined_by_name = ?');
      params.push(data.last_declined_by_name);
    }
    if (data.last_decline_reason !== undefined) {
      updates.push('last_decline_reason = ?');
      params.push(data.last_decline_reason);
    }
    if (data.revived_at !== undefined) {
      updates.push('revived_at = ?');
      params.push(data.revived_at);
    }
    if (data.revived_by_name !== undefined) {
      updates.push('revived_by_name = ?');
      params.push(data.revived_by_name);
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
   * Отклонить каллаут (decline)
   */
  static async decline(
    id: number,
    declinedBy: string,
    declinedByName: string,
    reason: string
  ): Promise<Callout | undefined> {
    return await this.update(id, {
      declined_at: new Date().toISOString(),
      declined_by: declinedBy,
      declined_by_name: declinedByName,
      decline_reason: reason,
    });
  }

  /**
   * Отменить отклонение каллаута (возобновить реагирование).
   * Снапшот decline сохраняется в last_declined_* для истории в логе.
   */
  static async cancelDecline(id: number, revivedByName: string): Promise<Callout | undefined> {
    const current = await this.findById(id);
    return await this.update(id, {
      // Сохранить снапшот для лога
      last_declined_at: current?.declined_at ?? null,
      last_declined_by_name: current?.declined_by_name ?? null,
      last_decline_reason: current?.decline_reason ?? null,
      revived_at: new Date().toISOString(),
      revived_by_name: revivedByName,
      // Сбросить активное отклонение
      declined_at: null,
      declined_by: null,
      declined_by_name: null,
      decline_reason: null,
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
   * Общая статистика за период (total/active/closed + avg duration)
   */
  static async getPeriodStats(
    serverId: number,
    sinceIso?: string
  ): Promise<{ total: number; active: number; closed: number; avg_duration_min: number | null }> {
    const where = sinceIso ? 'server_id = ? AND created_at >= ?' : 'server_id = ?';
    const params = sinceIso ? [serverId, sinceIso] : [serverId];
    const result = await database.get<{ total: number; active: number; closed: number; avg_duration_min: number | null }>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        AVG(CASE WHEN closed_at IS NOT NULL
          THEN (julianday(closed_at) - julianday(created_at)) * 24 * 60
          ELSE NULL END) as avg_duration_min
      FROM callouts WHERE ${where}`,
      params
    );
    return {
      total: result?.total || 0,
      active: result?.active || 0,
      closed: result?.closed || 0,
      avg_duration_min: result?.avg_duration_min ?? null,
    };
  }

  /**
   * Топ авторов каллаутов за период
   */
  static async getTopAuthors(
    serverId: number,
    limit: number = 5,
    sinceIso?: string
  ): Promise<{ author_id: string; author_name: string; count: number }[]> {
    const where = sinceIso ? 'server_id = ? AND created_at >= ?' : 'server_id = ?';
    const params = sinceIso ? [serverId, sinceIso, limit] : [serverId, limit];
    return await database.all(
      `SELECT author_id, author_name, COUNT(*) as count
       FROM callouts WHERE ${where}
       GROUP BY author_id ORDER BY count DESC LIMIT ?`,
      params
    );
  }

  /**
   * Самый загруженный час суток и день недели за период
   */
  static async getPeakTime(
    serverId: number,
    sinceIso?: string
  ): Promise<{ peak_hour: number | null; peak_dow: number | null }> {
    const where = sinceIso ? 'server_id = ? AND created_at >= ?' : 'server_id = ?';
    const params = sinceIso ? [serverId, sinceIso] : [serverId];

    const [hourRow, dowRow] = await Promise.all([
      database.get<{ hour: string; count: number }>(
        `SELECT strftime('%H', datetime(created_at, '+3 hours')) as hour, COUNT(*) as count
         FROM callouts WHERE ${where}
         GROUP BY hour ORDER BY count DESC LIMIT 1`,
        params
      ),
      database.get<{ dow: string; count: number }>(
        `SELECT strftime('%w', datetime(created_at, '+3 hours')) as dow, COUNT(*) as count
         FROM callouts WHERE ${where}
         GROUP BY dow ORDER BY count DESC LIMIT 1`,
        params
      ),
    ]);

    return {
      peak_hour: hourRow ? parseInt(hourRow.hour, 10) : null,
      peak_dow: dowRow ? parseInt(dowRow.dow, 10) : null,
    };
  }

  /**
   * Получить статистику по подразделениям (топ по количеству каллаутов)
   * @param sinceIso — опциональная нижняя граница created_at в ISO формате
   */
  static async getSubdivisionStats(
    serverId: number,
    limit: number = 10,
    sinceIso?: string
  ): Promise<{ subdivision_id: number; total: number; active: number; closed: number; avg_duration_min: number | null }[]> {
    const where = sinceIso
      ? 'WHERE server_id = ? AND created_at >= ?'
      : 'WHERE server_id = ?';
    const params = sinceIso ? [serverId, sinceIso, limit] : [serverId, limit];

    return await database.all(
      `SELECT
        subdivision_id,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        AVG(CASE WHEN closed_at IS NOT NULL
          THEN (julianday(closed_at) - julianday(created_at)) * 24 * 60
          ELSE NULL END) as avg_duration_min
      FROM callouts
      ${where}
      GROUP BY subdivision_id
      ORDER BY total DESC
      LIMIT ?`,
      params
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
    // closed_at хранится в ISO-формате (new Date().toISOString()), поэтому cutoff тоже ISO
    const cutoff = new Date(Date.now() - minAgeMs).toISOString();
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
