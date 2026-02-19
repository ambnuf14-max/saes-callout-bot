import database from '../db';
import logger from '../../utils/logger';
import { Faction, CreateFactionDTO, UpdateFactionDTO } from '../../types/database.types';

/**
 * Модель для работы с таблицей factions
 */
export class FactionModel {
  /**
   * Создать новую фракцию
   */
  static async create(data: CreateFactionDTO, factionTypeId?: number): Promise<Faction> {
    const allowCreate = data.allow_create_subdivisions !== undefined ? data.allow_create_subdivisions : true;

    const result = await database.run(
      `INSERT INTO factions (server_id, name, description, logo_url, general_leader_role_id, faction_role_id, allow_create_subdivisions, faction_type_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.server_id,
        data.name,
        data.description || null,
        data.logo_url || null,
        data.general_leader_role_id,
        data.faction_role_id,
        allowCreate ? 1 : 0,
        factionTypeId || null,
      ]
    );

    logger.info('Faction created', {
      factionId: result.lastID,
      name: data.name,
      serverId: data.server_id,
      allowCreate,
      typeId: factionTypeId || null,
    });

    const faction = await this.findById(result.lastID);
    if (!faction) {
      throw new Error('Failed to retrieve created faction');
    }

    // ВСЕГДА создавать дефолтное подразделение
    // (оно будет удалено если используются шаблоны типа)
    await this.createDefaultSubdivision(faction);

    return faction;
  }

  /**
   * Найти фракцию по ID
   */
  static async findById(id: number): Promise<Faction | undefined> {
    return await database.get<Faction>('SELECT * FROM factions WHERE id = ?', [id]);
  }

  /**
   * Найти фракцию по имени на сервере
   */
  static async findByName(serverId: number, name: string): Promise<Faction | undefined> {
    return await database.get<Faction>(
      'SELECT * FROM factions WHERE server_id = ? AND name = ?',
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
  ): Promise<Faction | undefined> {
    return await database.get<Faction>(
      'SELECT * FROM factions WHERE server_id = ? AND general_leader_role_id = ? AND faction_role_id = ?',
      [serverId, generalLeaderRoleId, factionRoleId]
    );
  }

  /**
   * Найти фракцию по роли фракции (вторая роль)
   */
  static async findByFactionRole(
    serverId: number,
    factionRoleId: string
  ): Promise<Faction | undefined> {
    return await database.get<Faction>(
      'SELECT * FROM factions WHERE server_id = ? AND faction_role_id = ?',
      [serverId, factionRoleId]
    );
  }

  /**
   * Получить все фракции сервера
   */
  static async findByServerId(serverId: number, activeOnly = false): Promise<Faction[]> {
    const sql = activeOnly
      ? 'SELECT * FROM factions WHERE server_id = ? AND is_active = 1 ORDER BY name'
      : 'SELECT * FROM factions WHERE server_id = ? ORDER BY name';

    return await database.all<Faction>(sql, [serverId]);
  }

  /**
   * Обновить фракцию
   */
  static async update(id: number, data: UpdateFactionDTO): Promise<Faction | undefined> {
    const currentFaction = await this.findById(id);
    if (!currentFaction) {
      throw new Error(`Faction with id ${id} not found`);
    }

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
    if (data.logo_url !== undefined) {
      updates.push('logo_url = ?');
      params.push(data.logo_url);
    }
    if (data.general_leader_role_id !== undefined) {
      updates.push('general_leader_role_id = ?');
      params.push(data.general_leader_role_id);
    }
    if (data.faction_role_id !== undefined) {
      updates.push('faction_role_id = ?');
      params.push(data.faction_role_id);
    }
    if (data.allow_create_subdivisions !== undefined) {
      updates.push('allow_create_subdivisions = ?');
      params.push(data.allow_create_subdivisions ? 1 : 0);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active ? 1 : 0);
    }
    if (data.standalone_needs_setup !== undefined) {
      updates.push('standalone_needs_setup = ?');
      params.push(data.standalone_needs_setup ? 1 : 0);
    }

    if (updates.length === 0) {
      return await this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await database.run(`UPDATE factions SET ${updates.join(', ')} WHERE id = ?`, params);

    logger.info('Faction updated', { factionId: id });

    const updatedFaction = await this.findById(id);
    if (!updatedFaction) {
      throw new Error('Failed to retrieve updated faction');
    }

    // Синхронизировать дефолтное подразделение если изменились name или faction_role_id
    if (data.name !== undefined || data.faction_role_id !== undefined) {
      await this.syncDefaultSubdivision(updatedFaction);
    }

    return updatedFaction;
  }

  /**
   * Удалить фракцию (каскадно удаляет все подразделения)
   */
  static async delete(id: number): Promise<void> {
    const faction = await this.findById(id);
    await database.run('DELETE FROM factions WHERE id = ?', [id]);

    logger.info('Faction deleted', {
      factionId: id,
      name: faction?.name,
    });
  }

  /**
   * Деактивировать фракцию (soft delete)
   */
  static async deactivate(id: number): Promise<Faction | undefined> {
    return await this.update(id, { is_active: false });
  }

  /**
   * Активировать фракцию
   */
  static async activate(id: number): Promise<Faction | undefined> {
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
      'SELECT COUNT(*) as count FROM factions WHERE server_id = ?',
      [serverId]
    );
    return result?.count || 0;
  }

  /**
   * Получить пару ролей лидера фракции
   */
  static getLeaderRoles(faction: Faction): [string, string] {
    return [faction.general_leader_role_id, faction.faction_role_id];
  }

  /**
   * Проверить, активна ли фракция
   */
  static isActive(faction: Faction): boolean {
    return faction.is_active;
  }

  /**
   * Создать дефолтное подразделение для standalone фракции
   */
  static async createDefaultSubdivision(faction: Faction): Promise<void> {
    const { SubdivisionModel } = await import('./Subdivision');

    // Проверить, существует ли уже дефолтное подразделение
    const existingDefault = await SubdivisionModel.findDefaultByFactionId(faction.id);
    if (existingDefault) {
      logger.debug('Default subdivision already exists', {
        factionId: faction.id,
        subdivisionId: existingDefault.id,
      });
      return;
    }

    // Создать дефолтное подразделение с is_default = 1
    await database.run(
      `INSERT INTO subdivisions (faction_id, server_id, name, discord_role_id, is_default, is_accepting_callouts, is_active)
       VALUES (?, ?, ?, ?, 1, 1, 1)`,
      [
        faction.id,
        faction.server_id,
        faction.name,
        faction.faction_role_id,
      ]
    );

    logger.info('Default subdivision created for standalone faction', {
      factionId: faction.id,
      factionName: faction.name,
    });
  }

  /**
   * Синхронизировать дефолтное подразделение с фракцией
   */
  private static async syncDefaultSubdivision(faction: Faction): Promise<void> {
    const { SubdivisionModel } = await import('./Subdivision');

    const defaultSubdivision = await SubdivisionModel.findDefaultByFactionId(faction.id);
    if (!defaultSubdivision) {
      logger.warn('Default subdivision not found for standalone faction, creating...', {
        factionId: faction.id,
      });
      await this.createDefaultSubdivision(faction);
      return;
    }

    // Синхронизировать name и discord_role_id
    await SubdivisionModel.update(defaultSubdivision.id, {
      name: faction.name,
      discord_role_id: faction.faction_role_id,
    });

    logger.info('Default subdivision synchronized with faction', {
      factionId: faction.id,
      subdivisionId: defaultSubdivision.id,
    });
  }
}

export default FactionModel;
