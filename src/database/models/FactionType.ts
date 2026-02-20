import database from '../db';
import logger from '../../utils/logger';
import {
  FactionType,
  CreateFactionTypeDTO,
  UpdateFactionTypeDTO,
  UpdateFactionTypeEmbedDTO,
  FactionTypeWithTemplates,
} from '../../types/database.types';

/**
 * Модель для работы с таблицей faction_types
 */
export class FactionTypeModel {
  /**
   * Создать новый тип фракции
   */
  static async create(data: CreateFactionTypeDTO): Promise<FactionType> {
    const result = await database.run(
      `INSERT INTO faction_types (server_id, name, description)
       VALUES (?, ?, ?)`,
      [data.server_id, data.name, data.description || null]
    );

    logger.info('Faction type created', {
      typeId: result.lastID,
      name: data.name,
      serverId: data.server_id,
    });

    const type = await this.findById(result.lastID);
    if (!type) {
      throw new Error('Failed to retrieve created faction type');
    }

    return type;
  }

  /**
   * Найти тип по ID
   */
  static async findById(id: number): Promise<FactionType | undefined> {
    return await database.get<FactionType>(
      'SELECT * FROM faction_types WHERE id = ?',
      [id]
    );
  }

  /**
   * Найти все типы сервера
   */
  static async findByServerId(serverId: number, activeOnly = false): Promise<FactionType[]> {
    const sql = activeOnly
      ? 'SELECT * FROM faction_types WHERE server_id = ? AND is_active = 1 ORDER BY name'
      : 'SELECT * FROM faction_types WHERE server_id = ? ORDER BY name';

    return await database.all<FactionType>(sql, [serverId]);
  }

  /**
   * Найти тип по имени
   */
  static async findByName(serverId: number, name: string): Promise<FactionType | undefined> {
    return await database.get<FactionType>(
      'SELECT * FROM faction_types WHERE server_id = ? AND name = ?',
      [serverId, name]
    );
  }

  /**
   * Обновить тип
   */
  static async update(id: number, data: UpdateFactionTypeDTO): Promise<FactionType | undefined> {
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
      `UPDATE faction_types SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logger.info('Faction type updated', { typeId: id });

    return await this.findById(id);
  }

  /**
   * Обновить embed-настройки типа
   */
  static async updateEmbed(id: number, data: UpdateFactionTypeEmbedDTO): Promise<FactionType | undefined> {
    const fields = [
      'embed_author_name', 'embed_author_url', 'embed_author_icon_url',
      'embed_title', 'embed_title_url', 'embed_description', 'embed_color',
      'embed_image_url', 'embed_thumbnail_url', 'embed_footer_text',
      'embed_footer_icon_url', 'logo_url', 'short_description',
    ] as const;

    const updates: string[] = [];
    const params: any[] = [];

    for (const field of fields) {
      if ((data as any)[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push((data as any)[field]);
      }
    }

    if (updates.length === 0) return await this.findById(id);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await database.run(
      `UPDATE faction_types SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logger.info('Faction type embed updated', { typeId: id });
    return await this.findById(id);
  }

  /**
   * Удалить тип (каскадно удаляет все шаблоны)
   */
  static async delete(id: number): Promise<void> {
    const type = await this.findById(id);
    await database.run('DELETE FROM faction_types WHERE id = ?', [id]);

    logger.info('Faction type deleted', {
      typeId: id,
      name: type?.name,
    });
  }

  /**
   * Проверить существование типа по имени
   */
  static async exists(serverId: number, name: string): Promise<boolean> {
    const type = await this.findByName(serverId, name);
    return !!type;
  }

  /**
   * Получить тип с шаблонами подразделений
   */
  static async findWithTemplates(id: number): Promise<FactionTypeWithTemplates | undefined> {
    const type = await this.findById(id);
    if (!type) {
      return undefined;
    }

    const { SubdivisionTemplateModel } = await import('./SubdivisionTemplate');
    const templates = await SubdivisionTemplateModel.findByFactionTypeId(id);

    return {
      ...type,
      templates,
    };
  }

  /**
   * Получить количество типов на сервере
   */
  static async count(serverId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM faction_types WHERE server_id = ?',
      [serverId]
    );
    return result?.count || 0;
  }

  /**
   * Деактивировать тип (soft delete)
   */
  static async deactivate(id: number): Promise<FactionType | undefined> {
    return await this.update(id, { is_active: false });
  }

  /**
   * Активировать тип
   */
  static async activate(id: number): Promise<FactionType | undefined> {
    return await this.update(id, { is_active: true });
  }
}

export default FactionTypeModel;
