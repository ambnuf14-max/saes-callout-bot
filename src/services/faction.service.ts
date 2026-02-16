import { FactionModel } from '../database/models';
import { GuildMember } from 'discord.js';
import {
  Faction,
  CreateFactionDTO,
  UpdateFactionDTO,
} from '../types/database.types';
import logger from '../utils/logger';
import { CalloutError } from '../utils/error-handler';

/**
 * Сервис для работы с фракциями
 */
export class FactionService {
  /**
   * Создать новую фракцию
   */
  static async createFaction(data: CreateFactionDTO, typeId?: number): Promise<Faction> {
    // Валидация названия
    if (!data.name || data.name.length < 2 || data.name.length > 50) {
      throw new CalloutError(
        'Название фракции должно быть от 2 до 50 символов',
        'INVALID_FACTION_NAME',
        400
      );
    }

    // Проверка уникальности названия
    const existing = await FactionModel.findByName(data.server_id, data.name);
    if (existing) {
      throw new CalloutError(
        `Фракция с названием "${data.name}" уже существует`,
        'FACTION_EXISTS',
        400
      );
    }

    // Проверка уникальности комбинации ролей
    const existingRoles = await FactionModel.findByRoles(
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

    // Создание фракции
    const faction = await FactionModel.create(data, typeId);

    logger.info('Faction created via service', {
      factionId: faction.id,
      name: faction.name,
      serverId: data.server_id,
      typeId: typeId || null,
    });

    // Если указан тип - создать подразделения из шаблонов
    if (typeId) {
      const { FactionTypeService } = await import('./faction-type.service');
      await FactionTypeService.instantiateTemplates(faction.id, typeId, data.server_id);

      logger.info('Subdivision templates instantiated for faction', {
        factionId: faction.id,
        typeId,
      });
    }

    return faction;
  }

  /**
   * Получить все фракции сервера
   */
  static async getFactions(serverId: number, activeOnly = false): Promise<Faction[]> {
    return await FactionModel.findByServerId(serverId, activeOnly);
  }

  /**
   * Получить фракцию по ID
   */
  static async getFactionById(id: number): Promise<Faction | undefined> {
    return await FactionModel.findById(id);
  }

  /**
   * Получить фракцию по имени
   */
  static async getFactionByName(
    serverId: number,
    name: string
  ): Promise<Faction | undefined> {
    return await FactionModel.findByName(serverId, name);
  }

  /**
   * Определить фракцию лидера по его ролям Discord
   */
  static async getLeaderFaction(
    serverId: number,
    member: GuildMember
  ): Promise<Faction | null> {
    // Получить все роли пользователя
    const userRoleIds = member.roles.cache.map((role) => role.id);

    logger.debug('Checking leader faction', {
      userId: member.id,
      userName: member.user.tag,
      userRoles: userRoleIds,
      roleCount: userRoleIds.length,
    });

    // Получить все фракции сервера
    const factions = await FactionModel.findByServerId(serverId, true); // только активные

    logger.debug('Found factions for server', {
      serverId,
      factionCount: factions.length,
      factions: factions.map(f => ({
        id: f.id,
        name: f.name,
        general_leader_role_id: f.general_leader_role_id,
        department_role_id: f.department_role_id,
      })),
    });

    // Найти фракции, которым соответствует пользователь
    const matchingFactions: Faction[] = [];

    for (const faction of factions) {
      const hasGeneralRole = userRoleIds.includes(faction.general_leader_role_id);
      const hasFactionRole = userRoleIds.includes(faction.department_role_id);

      logger.debug('Checking faction match', {
        factionId: faction.id,
        factionName: faction.name,
        hasGeneralRole,
        hasFactionRole,
        requiredGeneralRole: faction.general_leader_role_id,
        requiredFactionRole: faction.department_role_id,
      });

      if (hasGeneralRole && hasFactionRole) {
        matchingFactions.push(faction);
      }
    }

    // Если найдено больше одной фракции - ошибка
    if (matchingFactions.length > 1) {
      logger.warn('User has multiple faction leader roles', {
        userId: member.id,
        factionCount: matchingFactions.length,
      });
      throw new CalloutError(
        'У вас роли нескольких фракций. Обратитесь к администратору.',
        'MULTIPLE_FACTIONS',
        400
      );
    }

    // Вернуть найденную фракцию или null
    return matchingFactions[0] || null;
  }

  /**
   * Проверить, является ли пользователь лидером конкретной фракции
   */
  static async isLeaderOfFaction(
    serverId: number,
    member: GuildMember,
    factionId: number
  ): Promise<boolean> {
    const faction = await this.getLeaderFaction(serverId, member);
    return faction?.id === factionId;
  }

  /**
   * Обновить фракцию
   */
  static async updateFaction(
    id: number,
    data: UpdateFactionDTO
  ): Promise<Faction | undefined> {
    // Валидация названия, если обновляется
    if (data.name) {
      if (data.name.length < 2 || data.name.length > 50) {
        throw new CalloutError(
          'Название фракции должно быть от 2 до 50 символов',
          'INVALID_FACTION_NAME',
          400
        );
      }
    }

    // Проверка уникальности комбинации ролей, если обновляются
    if (data.general_leader_role_id || data.department_role_id) {
      const currentFaction = await FactionModel.findById(id);
      if (!currentFaction) {
        throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
      }

      const generalRole = data.general_leader_role_id || currentFaction.general_leader_role_id;
      const factionRole = data.department_role_id || currentFaction.department_role_id;

      const existingRoles = await FactionModel.findByRoles(
        currentFaction.server_id,
        generalRole,
        factionRole
      );

      if (existingRoles && existingRoles.id !== id) {
        throw new CalloutError(
          'Фракция с такой комбинацией ролей уже существует',
          'FACTION_ROLES_EXISTS',
          400
        );
      }
    }

    const faction = await FactionModel.update(id, data);

    logger.info('Faction updated via service', { factionId: id });

    return faction;
  }

  /**
   * Удалить фракцию (каскадно удаляет все подразделения)
   */
  static async deleteFaction(id: number): Promise<void> {
    const faction = await FactionModel.findById(id);
    if (!faction) {
      throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
    }

    await FactionModel.delete(id);

    logger.info('Faction deleted via service', {
      factionId: id,
      name: faction.name,
    });
  }

  /**
   * Деактивировать фракцию (soft delete)
   */
  static async deactivateFaction(id: number): Promise<Faction | undefined> {
    return await FactionModel.deactivate(id);
  }

  /**
   * Активировать фракцию
   */
  static async activateFaction(id: number): Promise<Faction | undefined> {
    return await FactionModel.activate(id);
  }

  /**
   * Получить количество фракций
   */
  static async getFactionCount(serverId: number): Promise<number> {
    return await FactionModel.count(serverId);
  }

  /**
   * Проверить существование фракции
   */
  static async factionExists(serverId: number, name: string): Promise<boolean> {
    return await FactionModel.exists(serverId, name);
  }
}

export default FactionService;
