import { SubdivisionModel } from '../database/models';
import {
  Subdivision,
  CreateSubdivisionDTO,
  UpdateSubdivisionDTO,
} from '../types/database.types';
import logger from '../utils/logger';
import { CalloutError } from '../utils/error-handler';

/**
 * Сервис для работы с подразделениями
 */
export class SubdivisionService {
  /**
   * Создать новое подразделение
   */
  static async createSubdivision(data: CreateSubdivisionDTO): Promise<Subdivision> {
    // Валидация названия
    if (!data.name || data.name.length < 2 || data.name.length > 50) {
      throw new CalloutError(
        'Название подразделения должно быть от 2 до 50 символов',
        'INVALID_SUBDIVISION_NAME',
        400
      );
    }

    // Проверка уникальности названия в фракции
    const existing = await SubdivisionModel.findByName(data.department_id, data.name);
    if (existing) {
      throw new CalloutError(
        `Подразделение с названием "${data.name}" уже существует в этом департаменте`,
        'SUBDIVISION_EXISTS',
        400
      );
    }

    // Создание подразделения
    const subdivision = await SubdivisionModel.create(data);

    logger.info('Subdivision created via service', {
      subdivisionId: subdivision.id,
      name: subdivision.name,
      departmentId: data.department_id,
    });

    // Если это первое обычное подразделение - деактивировать дефолтное
    const nonDefaultCount = await SubdivisionModel.countActiveNonDefault(data.department_id);
    if (nonDefaultCount === 1) {
      const defaultSubdivision = await SubdivisionModel.findDefaultByDepartmentId(data.department_id);
      if (defaultSubdivision && defaultSubdivision.is_active) {
        await SubdivisionModel.update(defaultSubdivision.id, { is_active: false });
        logger.info('Default subdivision deactivated (first regular subdivision created)', {
          departmentId: data.department_id,
          defaultSubdivisionId: defaultSubdivision.id,
        });
      }
    }

    return subdivision;
  }

  /**
   * Получить все подразделения фракции
   */
  static async getSubdivisionsByDepartmentId(
    departmentId: number,
    activeOnly = false
  ): Promise<Subdivision[]> {
    return await SubdivisionModel.findByDepartmentId(departmentId, activeOnly);
  }

  /**
   * Получить все подразделения сервера
   */
  static async getSubdivisionsByServerId(
    serverId: number,
    activeOnly = false
  ): Promise<Subdivision[]> {
    return await SubdivisionModel.findByServerId(serverId, activeOnly);
  }

  /**
   * Получить подразделения, принимающие каллауты
   */
  static async getAcceptingCallouts(serverId: number): Promise<Subdivision[]> {
    return await SubdivisionModel.findAcceptingCallouts(serverId);
  }

  /**
   * Получить подразделение по ID
   */
  static async getSubdivisionById(id: number): Promise<Subdivision | undefined> {
    return await SubdivisionModel.findById(id);
  }

  /**
   * Получить подразделение по VK chat ID
   */
  static async getSubdivisionByVkChatId(vkChatId: string): Promise<Subdivision | undefined> {
    return await SubdivisionModel.findByVkChatId(vkChatId);
  }

  /**
   * Обновить подразделение
   */
  static async updateSubdivision(
    id: number,
    data: UpdateSubdivisionDTO
  ): Promise<Subdivision | undefined> {
    // Валидация названия, если обновляется
    if (data.name) {
      if (data.name.length < 2 || data.name.length > 50) {
        throw new CalloutError(
          'Название подразделения должно быть от 2 до 50 символов',
          'INVALID_SUBDIVISION_NAME',
          400
        );
      }
    }

    const subdivision = await SubdivisionModel.update(id, data);

    logger.info('Subdivision updated via service', { subdivisionId: id });

    return subdivision;
  }

  /**
   * Привязать VK беседу к подразделению
   */
  static async linkVkChat(id: number, vkChatId: string): Promise<Subdivision | undefined> {
    // Проверить, не привязана ли эта беседа уже к другому подразделению
    const existing = await SubdivisionModel.findByVkChatId(vkChatId);
    if (existing && existing.id !== id) {
      // Автоматически отвязать от старого подразделения
      logger.info('VK chat is already linked to another subdivision, unlinking', {
        oldSubdivisionId: existing.id,
        newSubdivisionId: id,
        vkChatId,
      });
      await SubdivisionModel.unlinkVkChat(existing.id);
    }

    const subdivision = await SubdivisionModel.linkVkChat(id, vkChatId);

    logger.info('VK chat linked to subdivision', {
      subdivisionId: id,
      vkChatId,
    });

    return subdivision;
  }

  /**
   * Отвязать VK беседу от подразделения
   */
  static async unlinkVkChat(id: number): Promise<Subdivision | undefined> {
    const subdivision = await SubdivisionModel.unlinkVkChat(id);

    logger.info('VK chat unlinked from subdivision', { subdivisionId: id });

    return subdivision;
  }

  /**
   * Переключить прием каллаутов
   */
  static async toggleCallouts(
    id: number,
    accepting: boolean
  ): Promise<Subdivision | undefined> {
    const subdivision = await SubdivisionModel.toggleCallouts(id, accepting);

    logger.info('Subdivision callouts toggled', {
      subdivisionId: id,
      accepting,
    });

    return subdivision;
  }

  /**
   * Удалить подразделение
   */
  static async deleteSubdivision(id: number): Promise<void> {
    const subdivision = await SubdivisionModel.findById(id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение не найдено',
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    // Запретить удаление дефолтного подразделения
    if (subdivision.is_default) {
      throw new CalloutError(
        'Невозможно удалить дефолтное подразделение департамента',
        'CANNOT_DELETE_DEFAULT',
        400
      );
    }

    const departmentId = subdivision.department_id;

    await SubdivisionModel.delete(id);

    logger.info('Subdivision deleted via service', {
      subdivisionId: id,
      name: subdivision.name,
    });

    // Если это было последнее обычное подразделение - активировать дефолтное
    const nonDefaultCount = await SubdivisionModel.countActiveNonDefault(departmentId);
    if (nonDefaultCount === 0) {
      const defaultSubdivision = await SubdivisionModel.findDefaultByDepartmentId(departmentId);
      if (defaultSubdivision && !defaultSubdivision.is_active) {
        await SubdivisionModel.update(defaultSubdivision.id, { is_active: true });
        logger.info('Default subdivision reactivated (last regular subdivision deleted)', {
          departmentId,
          defaultSubdivisionId: defaultSubdivision.id,
        });
      }
    }
  }

  /**
   * Деактивировать подразделение (soft delete)
   */
  static async deactivateSubdivision(id: number): Promise<Subdivision | undefined> {
    return await SubdivisionModel.deactivate(id);
  }

  /**
   * Активировать подразделение
   */
  static async activateSubdivision(id: number): Promise<Subdivision | undefined> {
    return await SubdivisionModel.activate(id);
  }

  /**
   * Получить количество подразделений фракции
   */
  static async getSubdivisionCount(departmentId: number): Promise<number> {
    return await SubdivisionModel.count(departmentId);
  }

  /**
   * Проверить существование подразделения
   */
  static async subdivisionExists(departmentId: number, name: string): Promise<boolean> {
    return await SubdivisionModel.exists(departmentId, name);
  }
}

export default SubdivisionService;
