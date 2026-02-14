import database from '../db';
import logger from '../../utils/logger';
import { Server, CreateServerDTO, UpdateServerDTO } from '../../types/database.types';

/**
 * Модель для работы с таблицей servers
 */
export class ServerModel {
  /**
   * Создать новый сервер
   */
  static async create(data: CreateServerDTO): Promise<Server> {
    const leaderRoleIds = data.leader_role_ids ? JSON.stringify(data.leader_role_ids) : null;

    const result = await database.run(
      `INSERT INTO servers (guild_id, callout_channel_id, callout_message_id, category_id, leader_role_ids)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.guild_id,
        data.callout_channel_id || null,
        data.callout_message_id || null,
        data.category_id || null,
        leaderRoleIds,
      ]
    );

    logger.info('Server created', { serverId: result.lastID, guildId: data.guild_id });

    const server = await this.findById(result.lastID);
    if (!server) {
      throw new Error('Failed to retrieve created server');
    }

    return server;
  }

  /**
   * Найти сервер по ID
   */
  static async findById(id: number): Promise<Server | undefined> {
    return await database.get<Server>('SELECT * FROM servers WHERE id = ?', [id]);
  }

  /**
   * Найти сервер по guild_id
   */
  static async findByGuildId(guildId: string): Promise<Server | undefined> {
    return await database.get<Server>('SELECT * FROM servers WHERE guild_id = ?', [guildId]);
  }

  /**
   * Обновить сервер
   */
  static async update(id: number, data: UpdateServerDTO): Promise<Server | undefined> {
    const updates: string[] = [];
    const params: any[] = [];

    if (data.callout_channel_id !== undefined) {
      updates.push('callout_channel_id = ?');
      params.push(data.callout_channel_id);
    }
    if (data.callout_message_id !== undefined) {
      updates.push('callout_message_id = ?');
      params.push(data.callout_message_id);
    }
    if (data.category_id !== undefined) {
      updates.push('category_id = ?');
      params.push(data.category_id);
    }
    if (data.leader_role_ids !== undefined) {
      updates.push('leader_role_ids = ?');
      params.push(JSON.stringify(data.leader_role_ids));
    }
    if (data.audit_log_channel_id !== undefined) {
      updates.push('audit_log_channel_id = ?');
      params.push(data.audit_log_channel_id);
    }
    if (data.callout_allowed_role_ids !== undefined) {
      updates.push('callout_allowed_role_ids = ?');
      params.push(JSON.stringify(data.callout_allowed_role_ids));
    }

    if (updates.length === 0) {
      return await this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await database.run(
      `UPDATE servers SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logger.info('Server updated', { serverId: id });

    return await this.findById(id);
  }

  /**
   * Удалить сервер
   */
  static async delete(id: number): Promise<void> {
    await database.run('DELETE FROM servers WHERE id = ?', [id]);
    logger.info('Server deleted', { serverId: id });
  }

  /**
   * Получить все серверы
   */
  static async findAll(): Promise<Server[]> {
    return await database.all<Server>('SELECT * FROM servers');
  }

  /**
   * Получить ID лидерских ролей
   */
  static getLeaderRoleIds(server: Server): string[] {
    if (!server.leader_role_ids) {
      return [];
    }
    try {
      return JSON.parse(server.leader_role_ids);
    } catch {
      return [];
    }
  }

  /**
   * Проверить, является ли роль лидерской
   */
  static isLeaderRole(server: Server, roleId: string): boolean {
    const leaderRoles = this.getLeaderRoleIds(server);
    return leaderRoles.includes(roleId);
  }

  /**
   * Получить ID ролей которые могут создавать каллауты
   */
  static getCalloutAllowedRoleIds(server: Server): string[] {
    if (!server.callout_allowed_role_ids) {
      return [];
    }
    try {
      return JSON.parse(server.callout_allowed_role_ids);
    } catch {
      return [];
    }
  }
}

export default ServerModel;
