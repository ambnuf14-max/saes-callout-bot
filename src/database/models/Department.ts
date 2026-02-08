import database from '../db';
import logger from '../../utils/logger';
import { Department, CreateDepartmentDTO, UpdateDepartmentDTO } from '../../types/database.types';

/**
 * Модель для работы с таблицей departments
 */
export class DepartmentModel {
  /**
   * Создать новый департамент
   */
  static async create(data: CreateDepartmentDTO): Promise<Department> {
    const result = await database.run(
      `INSERT INTO departments (server_id, name, discord_role_id, vk_chat_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.server_id,
        data.name,
        data.discord_role_id,
        data.vk_chat_id,
        data.description || null,
      ]
    );

    logger.info('Department created', {
      departmentId: result.lastID,
      name: data.name,
      serverId: data.server_id,
    });

    const department = await this.findById(result.lastID);
    if (!department) {
      throw new Error('Failed to retrieve created department');
    }

    return department;
  }

  /**
   * Найти департамент по ID
   */
  static async findById(id: number): Promise<Department | undefined> {
    return await database.get<Department>('SELECT * FROM departments WHERE id = ?', [id]);
  }

  /**
   * Найти департамент по имени на сервере
   */
  static async findByName(serverId: number, name: string): Promise<Department | undefined> {
    return await database.get<Department>(
      'SELECT * FROM departments WHERE server_id = ? AND name = ?',
      [serverId, name]
    );
  }

  /**
   * Найти департамент по VK chat_id
   */
  static async findByVkChatId(vkChatId: string): Promise<Department | undefined> {
    return await database.get<Department>(
      'SELECT * FROM departments WHERE vk_chat_id = ?',
      [vkChatId]
    );
  }

  /**
   * Получить все департаменты сервера
   */
  static async findByServerId(serverId: number, activeOnly = false): Promise<Department[]> {
    const sql = activeOnly
      ? 'SELECT * FROM departments WHERE server_id = ? AND is_active = 1 ORDER BY name'
      : 'SELECT * FROM departments WHERE server_id = ? ORDER BY name';

    return await database.all<Department>(sql, [serverId]);
  }

  /**
   * Обновить департамент
   */
  static async update(id: number, data: UpdateDepartmentDTO): Promise<Department | undefined> {
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.discord_role_id !== undefined) {
      updates.push('discord_role_id = ?');
      params.push(data.discord_role_id);
    }
    if (data.vk_chat_id !== undefined) {
      updates.push('vk_chat_id = ?');
      params.push(data.vk_chat_id);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return await this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await database.run(
      `UPDATE departments SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logger.info('Department updated', { departmentId: id });

    return await this.findById(id);
  }

  /**
   * Удалить департамент
   */
  static async delete(id: number): Promise<void> {
    const department = await this.findById(id);
    await database.run('DELETE FROM departments WHERE id = ?', [id]);

    logger.info('Department deleted', {
      departmentId: id,
      name: department?.name,
    });
  }

  /**
   * Деактивировать департамент (soft delete)
   */
  static async deactivate(id: number): Promise<Department | undefined> {
    return await this.update(id, { is_active: false });
  }

  /**
   * Активировать департамент
   */
  static async activate(id: number): Promise<Department | undefined> {
    return await this.update(id, { is_active: true });
  }

  /**
   * Проверить существование департамента по имени
   */
  static async exists(serverId: number, name: string): Promise<boolean> {
    const department = await this.findByName(serverId, name);
    return !!department;
  }

  /**
   * Получить количество департаментов на сервере
   */
  static async count(serverId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM departments WHERE server_id = ?',
      [serverId]
    );
    return result?.count || 0;
  }
}

export default DepartmentModel;
