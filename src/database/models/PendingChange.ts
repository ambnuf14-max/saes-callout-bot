import database from '../db';
import logger from '../../utils/logger';
import {
  PendingChange,
  CreatePendingChangeDTO,
  ChangeStatus,
  PendingChangeWithDetails,
  CreateSubdivisionChangeData,
  UpdateSubdivisionChangeData,
  DeleteSubdivisionChangeData,
  UpdateEmbedChangeData,
} from '../../types/database.types';
import { CalloutError } from '../../utils/error-handler';

/**
 * Модель для работы с таблицей pending_changes
 */
export class PendingChangeModel {
  /**
   * Создать новый pending запрос
   */
  static async create(data: CreatePendingChangeDTO): Promise<PendingChange> {
    // Проверка существования server
    const server = await database.get('SELECT id FROM servers WHERE id = ?', [data.server_id]);
    if (!server) {
      throw new CalloutError(
        `Сервер с ID ${data.server_id} не найден в базе данных`,
        'SERVER_NOT_FOUND',
        404
      );
    }

    // Проверка существования фракции
    const faction = await database.get('SELECT id FROM factions WHERE id = ?', [
      data.faction_id,
    ]);
    if (!faction) {
      throw new CalloutError(
        `Фракция с ID ${data.faction_id} не найдена в базе данных`,
        'FACTION_NOT_FOUND',
        404
      );
    }

    const changeDataJson = JSON.stringify(data.change_data);

    // Детальное логирование для отладки foreign key constraint
    logger.debug('Creating pending change', {
      server_id: data.server_id,
      faction_id: data.faction_id,
      subdivision_id: data.subdivision_id,
      change_type: data.change_type,
      requested_by: data.requested_by,
    });

    try {
      const result = await database.run(
        `INSERT INTO pending_changes (
          server_id, faction_id, subdivision_id,
          change_type, requested_by, change_data
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          data.server_id,
          data.faction_id,
          data.subdivision_id || null,
          data.change_type,
          data.requested_by,
          changeDataJson,
        ]
      );

      logger.info('Pending change created', {
        changeId: result.lastID,
        changeType: data.change_type,
        factionId: data.faction_id,
        requestedBy: data.requested_by,
      });

      const change = await this.findById(result.lastID);
      if (!change) {
        throw new Error('Failed to retrieve created pending change');
      }

      return change;
    } catch (error) {
      logger.error('Failed to create pending change', {
        error: error instanceof Error ? error.message : error,
        data: {
          server_id: data.server_id,
          faction_id: data.faction_id,
          subdivision_id: data.subdivision_id,
          change_type: data.change_type,
        },
      });
      throw error;
    }
  }

  /**
   * Найти pending запрос по ID
   */
  static async findById(id: number): Promise<PendingChange | undefined> {
    return await database.get<PendingChange>('SELECT * FROM pending_changes WHERE id = ?', [id]);
  }

  /**
   * Найти все pending запросы фракции
   */
  static async findByFactionId(
    factionId: number,
    statusFilter?: ChangeStatus
  ): Promise<PendingChange[]> {
    if (statusFilter) {
      return await database.all<PendingChange>(
        'SELECT * FROM pending_changes WHERE faction_id = ? AND status = ? ORDER BY requested_at DESC',
        [factionId, statusFilter]
      );
    }

    return await database.all<PendingChange>(
      'SELECT * FROM pending_changes WHERE faction_id = ? ORDER BY requested_at DESC',
      [factionId]
    );
  }

  /**
   * Найти все pending запросы сервера
   */
  static async findByServerId(
    serverId: number,
    statusFilter?: ChangeStatus
  ): Promise<PendingChange[]> {
    if (statusFilter) {
      return await database.all<PendingChange>(
        'SELECT * FROM pending_changes WHERE server_id = ? AND status = ? ORDER BY requested_at DESC',
        [serverId, statusFilter]
      );
    }

    return await database.all<PendingChange>(
      'SELECT * FROM pending_changes WHERE server_id = ? ORDER BY requested_at DESC',
      [serverId]
    );
  }

  /**
   * Найти все pending запросы пользователя
   */
  static async findByRequesterId(
    requesterId: string,
    statusFilter?: ChangeStatus
  ): Promise<PendingChange[]> {
    if (statusFilter) {
      return await database.all<PendingChange>(
        'SELECT * FROM pending_changes WHERE requested_by = ? AND status = ? ORDER BY requested_at DESC',
        [requesterId, statusFilter]
      );
    }

    return await database.all<PendingChange>(
      'SELECT * FROM pending_changes WHERE requested_by = ? ORDER BY requested_at DESC',
      [requesterId]
    );
  }

  /**
   * Найти только pending (status='pending') запросы сервера
   */
  static async findPendingByServerId(serverId: number): Promise<PendingChange[]> {
    return await this.findByServerId(serverId, 'pending');
  }

  /**
   * Одобрить pending запрос (atomic operation)
   */
  static async approve(id: number, reviewedBy: string): Promise<PendingChange | undefined> {
    // Atomic update с проверкой статуса для предотвращения race conditions
    const result = await database.run(
      `UPDATE pending_changes
       SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [reviewedBy, id]
    );

    if (result.changes === 0) {
      logger.warn('Failed to approve change - already processed or not found', { changeId: id });
      return undefined;
    }

    logger.info('Pending change approved', { changeId: id, reviewedBy });

    return await this.findById(id);
  }

  /**
   * Отклонить pending запрос
   */
  static async reject(
    id: number,
    reviewedBy: string,
    reason?: string
  ): Promise<PendingChange | undefined> {
    // Atomic update с проверкой статуса
    const result = await database.run(
      `UPDATE pending_changes
       SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [reviewedBy, reason || null, id]
    );

    if (result.changes === 0) {
      logger.warn('Failed to reject change - already processed or not found', { changeId: id });
      return undefined;
    }

    logger.info('Pending change rejected', { changeId: id, reviewedBy, reason });

    return await this.findById(id);
  }

  /**
   * Отменить pending запрос (только автором)
   */
  static async cancel(id: number): Promise<PendingChange | undefined> {
    // Atomic update с проверкой статуса
    const result = await database.run(
      `UPDATE pending_changes
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [id]
    );

    if (result.changes === 0) {
      logger.warn('Failed to cancel change - already processed or not found', { changeId: id });
      return undefined;
    }

    logger.info('Pending change cancelled', { changeId: id });

    return await this.findById(id);
  }

  /**
   * Парсить JSON данные изменения
   */
  static parseChangeData<
    T = CreateSubdivisionChangeData | UpdateSubdivisionChangeData | DeleteSubdivisionChangeData | UpdateEmbedChangeData
  >(change: PendingChange): T {
    try {
      return JSON.parse(change.change_data) as T;
    } catch (error) {
      logger.error('Failed to parse change data', {
        changeId: change.id,
        changeData: change.change_data,
        error,
      });
      throw new Error('Invalid change data JSON');
    }
  }

  /**
   * Получить pending запрос с детальной информацией (с JOIN)
   */
  static async findWithDetails(id: number): Promise<PendingChangeWithDetails | undefined> {
    const result = await database.get<any>(
      `SELECT
        pc.*,
        f.name as faction_name,
        s.name as subdivision_name
      FROM pending_changes pc
      JOIN factions f ON pc.faction_id = f.id
      LEFT JOIN subdivisions s ON pc.subdivision_id = s.id
      WHERE pc.id = ?`,
      [id]
    );

    if (!result) {
      return undefined;
    }

    const change: PendingChange = {
      id: result.id,
      server_id: result.server_id,
      faction_id: result.faction_id,
      subdivision_id: result.subdivision_id,
      change_type: result.change_type,
      requested_by: result.requested_by,
      requested_at: result.requested_at,
      status: result.status,
      reviewed_by: result.reviewed_by,
      reviewed_at: result.reviewed_at,
      rejection_reason: result.rejection_reason,
      change_data: result.change_data,
      audit_log_message_id: result.audit_log_message_id ?? null,
      created_at: result.created_at,
      updated_at: result.updated_at,
    };

    const parsed_data = this.parseChangeData(change);

    return {
      ...change,
      faction_name: result.faction_name,
      subdivision_name: result.subdivision_name,
      parsed_data,
    };
  }

  /**
   * Сохранить ID сообщения в audit log канале
   */
  static async setAuditLogMessageId(id: number, messageId: string): Promise<void> {
    await database.run(
      'UPDATE pending_changes SET audit_log_message_id = ? WHERE id = ?',
      [messageId, id]
    );
  }

  /**
   * Получить все pending запросы фракции с деталями (один запрос вместо N+1)
   */
  static async findPendingWithDetailsByFactionId(
    factionId: number
  ): Promise<PendingChangeWithDetails[]> {
    const results = await database.all<any>(
      `SELECT
        pc.*,
        f.name as faction_name,
        s.name as subdivision_name
      FROM pending_changes pc
      JOIN factions f ON pc.faction_id = f.id
      LEFT JOIN subdivisions s ON pc.subdivision_id = s.id
      WHERE pc.faction_id = ? AND pc.status = 'pending'
      ORDER BY pc.requested_at DESC`,
      [factionId]
    );

    return results.map((result) => {
      const change: PendingChange = {
        id: result.id,
        server_id: result.server_id,
        faction_id: result.faction_id,
        subdivision_id: result.subdivision_id,
        change_type: result.change_type,
        requested_by: result.requested_by,
        requested_at: result.requested_at,
        status: result.status,
        reviewed_by: result.reviewed_by,
        reviewed_at: result.reviewed_at,
        rejection_reason: result.rejection_reason,
        change_data: result.change_data,
        audit_log_message_id: result.audit_log_message_id ?? null,
        created_at: result.created_at,
        updated_at: result.updated_at,
      };
      return { ...change, faction_name: result.faction_name, subdivision_name: result.subdivision_name, parsed_data: this.parseChangeData(change) };
    });
  }

  /**
   * Получить все pending запросы пользователя с деталями (один запрос вместо N+1)
   */
  static async findPendingWithDetailsByRequesterId(
    requesterId: string
  ): Promise<PendingChangeWithDetails[]> {
    const results = await database.all<any>(
      `SELECT
        pc.*,
        f.name as faction_name,
        s.name as subdivision_name
      FROM pending_changes pc
      JOIN factions f ON pc.faction_id = f.id
      LEFT JOIN subdivisions s ON pc.subdivision_id = s.id
      WHERE pc.requested_by = ? AND pc.status = 'pending'
      ORDER BY pc.requested_at DESC`,
      [requesterId]
    );

    return results.map((result) => {
      const change: PendingChange = {
        id: result.id,
        server_id: result.server_id,
        faction_id: result.faction_id,
        subdivision_id: result.subdivision_id,
        change_type: result.change_type,
        requested_by: result.requested_by,
        requested_at: result.requested_at,
        status: result.status,
        reviewed_by: result.reviewed_by,
        reviewed_at: result.reviewed_at,
        rejection_reason: result.rejection_reason,
        change_data: result.change_data,
        audit_log_message_id: result.audit_log_message_id ?? null,
        created_at: result.created_at,
        updated_at: result.updated_at,
      };
      return { ...change, faction_name: result.faction_name, subdivision_name: result.subdivision_name, parsed_data: this.parseChangeData(change) };
    });
  }

  /**
   * Получить все pending запросы сервера с деталями
   */
  static async findPendingWithDetailsByServerId(
    serverId: number
  ): Promise<PendingChangeWithDetails[]> {
    const results = await database.all<any>(
      `SELECT
        pc.*,
        f.name as faction_name,
        s.name as subdivision_name
      FROM pending_changes pc
      JOIN factions f ON pc.faction_id = f.id
      LEFT JOIN subdivisions s ON pc.subdivision_id = s.id
      WHERE pc.server_id = ? AND pc.status = 'pending'
      ORDER BY pc.requested_at DESC`,
      [serverId]
    );

    return results.map((result) => {
      const change: PendingChange = {
        id: result.id,
        server_id: result.server_id,
        faction_id: result.faction_id,
        subdivision_id: result.subdivision_id,
        change_type: result.change_type,
        requested_by: result.requested_by,
        requested_at: result.requested_at,
        status: result.status,
        reviewed_by: result.reviewed_by,
        reviewed_at: result.reviewed_at,
        rejection_reason: result.rejection_reason,
        change_data: result.change_data,
        audit_log_message_id: result.audit_log_message_id ?? null,
        created_at: result.created_at,
        updated_at: result.updated_at,
      };

      const parsed_data = this.parseChangeData(change);

      return {
        ...change,
        faction_name: result.faction_name,
        subdivision_name: result.subdivision_name,
        parsed_data,
      };
    });
  }

  /**
   * Очистить старые записи (старше N дней)
   */
  static async cleanupOldRecords(olderThanDays: number = 30): Promise<number> {
    const result = await database.run(
      `DELETE FROM pending_changes
       WHERE status != 'pending'
       AND datetime(updated_at) < datetime('now', '-' || ? || ' days')`,
      [olderThanDays]
    );

    logger.info('Cleaned up old pending changes', {
      deletedCount: result.changes,
      olderThanDays,
    });

    return result.changes || 0;
  }

  /**
   * Получить количество pending запросов
   */
  static async countPending(serverId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM pending_changes WHERE server_id = ? AND status = \'pending\'',
      [serverId]
    );
    return result?.count || 0;
  }

  /**
   * Получить pending запросы для конкретного подразделения
   */
  static async findPendingForSubdivision(subdivisionId: number): Promise<PendingChange[]> {
    const rows = await database.all<PendingChange>(
      `SELECT * FROM pending_changes
       WHERE subdivision_id = ? AND status = 'pending'
       ORDER BY requested_at DESC`,
      [subdivisionId]
    );
    return rows;
  }
}

export default PendingChangeModel;
