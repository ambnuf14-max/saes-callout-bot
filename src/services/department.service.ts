import { DepartmentModel, ServerModel } from '../database/models';
import {
  Department,
  CreateDepartmentDTO,
  UpdateDepartmentDTO,
} from '../types/database.types';
import logger from '../utils/logger';
import validators from '../utils/validators';
import { CalloutError } from '../utils/error-handler';
import { MESSAGES } from '../config/constants';

/**
 * Сервис для работы с департаментами
 */
export class DepartmentService {
  /**
   * Создать новый департамент
   */
  static async createDepartment(data: CreateDepartmentDTO): Promise<Department> {
    // Валидация названия
    const nameValidation = validators.validateDepartmentName(data.name);
    if (!nameValidation.valid) {
      throw new CalloutError(
        nameValidation.error || 'Невалидное название департамента',
        'INVALID_DEPARTMENT_NAME',
        400
      );
    }

    // Валидация VK chat ID
    if (!validators.isValidVkPeerId(data.vk_chat_id)) {
      throw new CalloutError(
        'Невалидный VK Peer ID. Должен начинаться с 2000000',
        'INVALID_VK_PEER_ID',
        400
      );
    }

    // Валидация Discord role ID
    if (!validators.isValidDiscordRole(data.discord_role_id)) {
      throw new CalloutError(
        'Невалидный ID роли Discord',
        'INVALID_DISCORD_ROLE',
        400
      );
    }

    // Проверка уникальности названия
    const existing = await DepartmentModel.findByName(
      data.server_id,
      data.name.toUpperCase()
    );
    if (existing) {
      throw new CalloutError(
        MESSAGES.DEPARTMENT.ERROR_ALREADY_EXISTS(data.name),
        'DEPARTMENT_EXISTS',
        400
      );
    }

    // Создание департамента
    const department = await DepartmentModel.create({
      ...data,
      name: data.name.toUpperCase(),
    });

    logger.info('Department created via service', {
      departmentId: department.id,
      name: department.name,
      serverId: data.server_id,
    });

    return department;
  }

  /**
   * Получить все департаменты сервера
   */
  static async getDepartments(
    serverId: number,
    activeOnly = false
  ): Promise<Department[]> {
    return await DepartmentModel.findByServerId(serverId, activeOnly);
  }

  /**
   * Получить департамент по имени
   */
  static async getDepartmentByName(
    serverId: number,
    name: string
  ): Promise<Department | undefined> {
    return await DepartmentModel.findByName(serverId, name.toUpperCase());
  }

  /**
   * Обновить департамент
   */
  static async updateDepartment(
    id: number,
    data: UpdateDepartmentDTO
  ): Promise<Department | undefined> {
    // Валидация, если обновляется название
    if (data.name) {
      const nameValidation = validators.validateDepartmentName(data.name);
      if (!nameValidation.valid) {
        throw new CalloutError(
          nameValidation.error || 'Невалидное название департамента',
          'INVALID_DEPARTMENT_NAME',
          400
        );
      }
      data.name = data.name.toUpperCase();
    }

    // Валидация VK chat ID
    if (data.vk_chat_id && !validators.isValidVkPeerId(data.vk_chat_id)) {
      throw new CalloutError(
        'Невалидный VK Peer ID',
        'INVALID_VK_PEER_ID',
        400
      );
    }

    // Валидация Discord role ID
    if (data.discord_role_id && !validators.isValidDiscordRole(data.discord_role_id)) {
      throw new CalloutError(
        'Невалидный ID роли Discord',
        'INVALID_DISCORD_ROLE',
        400
      );
    }

    const department = await DepartmentModel.update(id, data);

    logger.info('Department updated via service', { departmentId: id });

    return department;
  }

  /**
   * Удалить департамент
   */
  static async deleteDepartment(id: number): Promise<void> {
    const department = await DepartmentModel.findById(id);
    if (!department) {
      throw new CalloutError(
        MESSAGES.DEPARTMENT.ERROR_NOT_FOUND(id.toString()),
        'DEPARTMENT_NOT_FOUND',
        404
      );
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
    return await DepartmentModel.exists(serverId, name.toUpperCase());
  }
}

export default DepartmentService;
