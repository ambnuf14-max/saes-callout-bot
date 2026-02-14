import database from '../db';
import logger from '../../utils/logger';
import { Department, CreateDepartmentDTO, UpdateDepartmentDTO } from '../../types/database.types';

/**
 * Модель для работы с таблицей departments
 */
export class DepartmentModel {
  /**
   * Создать новую фракцию
   */
  static async create(data: CreateDepartmentDTO): Promise<Department> {
    const result = await database.run(
      `INSERT INTO departments (server_id, name, description, general_leader_role_id, department_role_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.server_id,
        data.name,
        data.description || null,
        data.general_leader_role_id,
        data.department_role_id,
      ]
    );

    logger.info('Department created', {
      factionId: result.lastID,
      name: data.name,
      serverId: data.server_id,
    });

    const faction = await this.findById(result.lastID);
    if (!faction) {
      throw new Error('Failed to retrieve created faction');
    }

    return faction;
  }

  /**
   * Найти фракцию по ID
   */
  static async findById(id: number): Promise<Department | undefined> {
    return await database.get<Department>('SELECT * FROM departments WHERE id = ?', [id]);
  }

  /**
   * Найти фракцию по имени на сервере
   */
  static async findByName(serverId: number, name: string): Promise<Department | undefined> {
    return await database.get<Department>(
      'SELECT * FROM departments WHERE server_id = ? AND name = ?',
      [serverId, name]
    );
  }

  /**
   * Найти фракцию по комбинации ролей
   */
  static async findByRoles(
    serverId: number,
    generalLeaderRoleId: string,
    factionRoleId: string
  ): Promise<Department | undefined> {
    return await database.get<Department>(
      'SELECT * FROM departments WHERE server_id = ? AND general_leader_role_id = ? AND department_role_id = ?',
      [serverId, generalLeaderRoleId, factionRoleId]
    );
  }

  /**
   * Найти фракцию по роли фракции (вторая роль)
   */
  static async findByDepartmentRole(
    serverId: number,
    factionRoleId: string
  ): Promise<Department | undefined> {
    return await database.get<Department>(
      'SELECT * FROM departments WHERE server_id = ? AND department_role_id = ?',
      [serverId, factionRoleId]
    );
  }

  /**
   * Получить все фракции сервера
   */
  static async findByServerId(serverId: number, activeOnly = false): Promise<Department[]> {
    const sql = activeOnly
      ? 'SELECT * FROM departments WHERE server_id = ? AND is_active = 1 ORDER BY name'
      : 'SELECT * FROM departments WHERE server_id = ? ORDER BY name';

    return await database.all<Department>(sql, [serverId]);
  }

  /**
   * Обновить фракцию
   */
  static async update(id: number, data: UpdateDepartmentDTO): Promise<Department | undefined> {
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.general_leader_role_id !== undefined) {
      updates.push('general_leader_role_id = ?');
      params.push(data.general_leader_role_id);
    }
    if (data.department_role_id !== undefined) {
      updates.push('department_role_id = ?');
      params.push(data.department_role_id);
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

    await database.run(`UPDATE departments SET ${updates.join(', ')} WHERE id = ?`, params);

    logger.info('Department updated', { factionId: id });

    return await this.findById(id);
  }

  /**
   * Удалить фракцию (каскадно удаляет все подразделения)
   */
  static async delete(id: number): Promise<void> {
    const faction = await this.findById(id);
    await database.run('DELETE FROM departments WHERE id = ?', [id]);

    logger.info('Department deleted', {
      factionId: id,
      name: faction?.name,
    });
  }

  /**
   * Деактивировать фракцию (soft delete)
   */
  static async deactivate(id: number): Promise<Department | undefined> {
    return await this.update(id, { is_active: false });
  }

  /**
   * Активировать фракцию
   */
  static async activate(id: number): Promise<Department | undefined> {
    return await this.update(id, { is_active: true });
  }

  /**
   * Проверить существование фракции по имени
   */
  static async exists(serverId: number, name: string): Promise<boolean> {
    const faction = await this.findByName(serverId, name);
    return !!faction;
  }

  /**
   * Получить количество фракций на сервере
   */
  static async count(serverId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM departments WHERE server_id = ?',
      [serverId]
    );
    return result?.count || 0;
  }

  /**
   * Получить пару ролей лидера фракции
   */
  static getLeaderRoles(faction: Department): [string, string] {
    return [faction.general_leader_role_id, faction.department_role_id];
  }

  /**
   * Проверить, активна ли фракция
   */
  static isActive(faction: Department): boolean {
    return faction.is_active;
  }
}

export default DepartmentModel;
