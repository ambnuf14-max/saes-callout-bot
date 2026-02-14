import { DepartmentModel } from '../database/models';
import { GuildMember } from 'discord.js';
import {
  Department,
  CreateDepartmentDTO,
  UpdateDepartmentDTO,
} from '../types/database.types';
import logger from '../utils/logger';
import { CalloutError } from '../utils/error-handler';

/**
 * Сервис для работы с фракциями
 */
export class DepartmentService {
  /**
   * Создать новую департамент
   */
  static async createDepartment(data: CreateDepartmentDTO): Promise<Department> {
    // Валидация названия
    if (!data.name || data.name.length < 2 || data.name.length > 50) {
      throw new CalloutError(
        'Название департамента должно быть от 2 до 50 символов',
        'INVALID_FACTION_NAME',
        400
      );
    }

    // Проверка уникальности названия
    const existing = await DepartmentModel.findByName(data.server_id, data.name);
    if (existing) {
      throw new CalloutError(
        `Фракция с названием "${data.name}" уже существует`,
        'FACTION_EXISTS',
        400
      );
    }

    // Проверка уникальности комбинации ролей
    const existingRoles = await DepartmentModel.findByRoles(
      data.server_id,
      data.general_leader_role_id,
      data.department_role_id
    );
    if (existingRoles) {
      throw new CalloutError(
        'Фракция с такой комбинацией ролей уже существует',
        'FACTION_ROLES_EXISTS',
        400
      );
    }

    // Создание департамента
    const department = await DepartmentModel.create(data);

    logger.info('Department created via service', {
      departmentId: department.id,
      name: department.name,
      serverId: data.server_id,
    });

    return department;
  }

  /**
   * Получить все департамента сервера
   */
  static async getDepartments(serverId: number, activeOnly = false): Promise<Department[]> {
    return await DepartmentModel.findByServerId(serverId, activeOnly);
  }

  /**
   * Получить департамент по ID
   */
  static async getDepartmentById(id: number): Promise<Department | undefined> {
    return await DepartmentModel.findById(id);
  }

  /**
   * Получить департамент по имени
   */
  static async getDepartmentByName(
    serverId: number,
    name: string
  ): Promise<Department | undefined> {
    return await DepartmentModel.findByName(serverId, name);
  }

  /**
   * Определить департамент лидера по его ролям Discord
   */
  static async getLeaderDepartment(
    serverId: number,
    member: GuildMember
  ): Promise<Department | null> {
    // Получить все роли пользователя
    const userRoleIds = member.roles.cache.map((role) => role.id);

    // Получить все департамента сервера
    const departments = await DepartmentModel.findByServerId(serverId, true); // только активные

    // Найти департамента, которым соответствует пользователь
    const matchingDepartments: Department[] = [];

    for (const department of departments) {
      const hasGeneralRole = userRoleIds.includes(department.general_leader_role_id);
      const hasDepartmentRole = userRoleIds.includes(department.department_role_id);

      if (hasGeneralRole && hasDepartmentRole) {
        matchingDepartments.push(department);
      }
    }

    // Если найдено больше одной департамента - ошибка
    if (matchingDepartments.length > 1) {
      logger.warn('User has multiple department leader roles', {
        userId: member.id,
        departmentCount: matchingDepartments.length,
      });
      throw new CalloutError(
        'У вас роли нескольких департаментов. Обратитесь к администратору.',
        'MULTIPLE_FACTIONS',
        400
      );
    }

    // Вернуть найденную департамент или null
    return matchingDepartments[0] || null;
  }

  /**
   * Проверить, является ли пользователь лидером конкретной департамента
   */
  static async isLeaderOfDepartment(
    serverId: number,
    member: GuildMember,
    departmentId: number
  ): Promise<boolean> {
    const department = await this.getLeaderDepartment(serverId, member);
    return department?.id === departmentId;
  }

  /**
   * Обновить департамент
   */
  static async updateDepartment(
    id: number,
    data: UpdateDepartmentDTO
  ): Promise<Department | undefined> {
    // Валидация названия, если обновляется
    if (data.name) {
      if (data.name.length < 2 || data.name.length > 50) {
        throw new CalloutError(
          'Название департамента должно быть от 2 до 50 символов',
          'INVALID_FACTION_NAME',
          400
        );
      }
    }

    // Проверка уникальности комбинации ролей, если обновляются
    if (data.general_leader_role_id || data.department_role_id) {
      const currentDepartment = await DepartmentModel.findById(id);
      if (!currentDepartment) {
        throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
      }

      const generalRole = data.general_leader_role_id || currentDepartment.general_leader_role_id;
      const departmentRole = data.department_role_id || currentDepartment.department_role_id;

      const existingRoles = await DepartmentModel.findByRoles(
        currentDepartment.server_id,
        generalRole,
        departmentRole
      );

      if (existingRoles && existingRoles.id !== id) {
        throw new CalloutError(
          'Фракция с такой комбинацией ролей уже существует',
          'FACTION_ROLES_EXISTS',
          400
        );
      }
    }

    const department = await DepartmentModel.update(id, data);

    logger.info('Department updated via service', { departmentId: id });

    return department;
  }

  /**
   * Удалить департамент (каскадно удаляет все подразделения)
   */
  static async deleteDepartment(id: number): Promise<void> {
    const department = await DepartmentModel.findById(id);
    if (!department) {
      throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
    }

    await DepartmentModel.delete(id);

    logger.info('Department deleted via service', {
      departmentId: id,
      name: department.name,
    });
  }

  /**
   * Деактивировать департамент (soft delete)
   */
  static async deactivateDepartment(id: number): Promise<Department | undefined> {
    return await DepartmentModel.deactivate(id);
  }

  /**
   * Активировать департамент
   */
  static async activateDepartment(id: number): Promise<Department | undefined> {
    return await DepartmentModel.activate(id);
  }

  /**
   * Получить количество департаментов
   */
  static async getDepartmentCount(serverId: number): Promise<number> {
    return await DepartmentModel.count(serverId);
  }

  /**
   * Проверить существование департамента
   */
  static async departmentExists(serverId: number, name: string): Promise<boolean> {
    return await DepartmentModel.exists(serverId, name);
  }
}

export default DepartmentService;
