import database from '../db';
import logger from '../../utils/logger';
import {
  SubdivisionTemplate,
  CreateSubdivisionTemplateDTO,
  UpdateSubdivisionTemplateDTO,
} from '../../types/database.types';

/**
 * Модель для работы с таблицей subdivision_templates
 */
export class SubdivisionTemplateModel {
  /**
   * Создать новый шаблон подразделения
   */
  static async create(data: CreateSubdivisionTemplateDTO): Promise<SubdivisionTemplate> {
    const result = await database.run(
      `INSERT INTO subdivision_templates (
        faction_type_id, name, description, display_order,
        embed_author_name, embed_author_url, embed_author_icon_url,
        embed_title, embed_description, embed_color,
        embed_image_url, embed_thumbnail_url,
        embed_footer_text, embed_footer_icon_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.faction_type_id,
        data.name,
        data.description || null,
        data.display_order || 0,
        data.embed_author_name || null,
        data.embed_author_url || null,
        data.embed_author_icon_url || null,
        data.embed_title || null,
        data.embed_description || null,
        data.embed_color || null,
        data.embed_image_url || null,
        data.embed_thumbnail_url || null,
        data.embed_footer_text || null,
        data.embed_footer_icon_url || null,
      ]
    );

    logger.info('Subdivision template created', {
      templateId: result.lastID,
      name: data.name,
      typeId: data.faction_type_id,
    });

    const template = await this.findById(result.lastID);
    if (!template) {
      throw new Error('Failed to retrieve created subdivision template');
    }

    return template;
  }

  /**
   * Найти шаблон по ID
   */
  static async findById(id: number): Promise<SubdivisionTemplate | undefined> {
    return await database.get<SubdivisionTemplate>(
      'SELECT * FROM subdivision_templates WHERE id = ?',
      [id]
    );
  }

  /**
   * Найти все шаблоны типа фракции
   */
  static async findByFactionTypeId(typeId: number): Promise<SubdivisionTemplate[]> {
    return await database.all<SubdivisionTemplate>(
      'SELECT * FROM subdivision_templates WHERE faction_type_id = ? ORDER BY display_order, name',
      [typeId]
    );
  }

  /**
   * Обновить шаблон
   */
  static async update(
    id: number,
    data: UpdateSubdivisionTemplateDTO
  ): Promise<SubdivisionTemplate | undefined> {
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
    if (data.display_order !== undefined) {
      updates.push('display_order = ?');
      params.push(data.display_order);
    }

    // Embed поля
    if (data.embed_author_name !== undefined) {
      updates.push('embed_author_name = ?');
      params.push(data.embed_author_name);
    }
    if (data.embed_author_url !== undefined) {
      updates.push('embed_author_url = ?');
      params.push(data.embed_author_url);
    }
    if (data.embed_author_icon_url !== undefined) {
      updates.push('embed_author_icon_url = ?');
      params.push(data.embed_author_icon_url);
    }
    if (data.embed_title !== undefined) {
      updates.push('embed_title = ?');
      params.push(data.embed_title);
    }
    if (data.embed_description !== undefined) {
      updates.push('embed_description = ?');
      params.push(data.embed_description);
    }
    if (data.embed_color !== undefined) {
      updates.push('embed_color = ?');
      params.push(data.embed_color);
    }
    if (data.embed_image_url !== undefined) {
      updates.push('embed_image_url = ?');
      params.push(data.embed_image_url);
    }
    if (data.embed_thumbnail_url !== undefined) {
      updates.push('embed_thumbnail_url = ?');
      params.push(data.embed_thumbnail_url);
    }
    if (data.embed_footer_text !== undefined) {
      updates.push('embed_footer_text = ?');
      params.push(data.embed_footer_text);
    }
    if (data.embed_footer_icon_url !== undefined) {
      updates.push('embed_footer_icon_url = ?');
      params.push(data.embed_footer_icon_url);
    }

    if (updates.length === 0) {
      return await this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await database.run(
      `UPDATE subdivision_templates SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logger.info('Subdivision template updated', { templateId: id });

    return await this.findById(id);
  }

  /**
   * Удалить шаблон
   */
  static async delete(id: number): Promise<void> {
    const template = await this.findById(id);
    await database.run('DELETE FROM subdivision_templates WHERE id = ?', [id]);

    logger.info('Subdivision template deleted', {
      templateId: id,
      name: template?.name,
    });
  }

  /**
   * Удалить все шаблоны типа
   */
  static async deleteByFactionTypeId(typeId: number): Promise<void> {
    await database.run('DELETE FROM subdivision_templates WHERE faction_type_id = ?', [typeId]);

    logger.info('All subdivision templates deleted for type', { typeId });
  }

  /**
   * Получить количество шаблонов для типа
   */
  static async count(typeId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM subdivision_templates WHERE faction_type_id = ?',
      [typeId]
    );
    return result?.count || 0;
  }
}

export default SubdivisionTemplateModel;
