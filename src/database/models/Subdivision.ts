import database from '../db';
import logger from '../../utils/logger';
import { Subdivision, CreateSubdivisionDTO, UpdateSubdivisionDTO } from '../../types/database.types';

/**
 * Модель для работы с таблицей subdivisions
 */
export class SubdivisionModel {
  /**
   * Создать новое подразделение
   */
  static async create(data: CreateSubdivisionDTO): Promise<Subdivision> {
    const result = await database.run(
      `INSERT INTO subdivisions (faction_id, server_id, name, description, discord_role_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.faction_id,
        data.server_id,
        data.name,
        data.description || null,
        data.discord_role_id || null,
      ]
    );

    logger.info('Subdivision created', {
      subdivisionId: result.lastID,
      name: data.name,
      factionId: data.faction_id,
    });

    const subdivision = await this.findById(result.lastID);
    if (!subdivision) {
      throw new Error('Failed to retrieve created subdivision');
    }

    return subdivision;
  }

  /**
   * Найти подразделение по ID
   */
  static async findById(id: number): Promise<Subdivision | undefined> {
    return await database.get<Subdivision>('SELECT * FROM subdivisions WHERE id = ?', [id]);
  }

  /**
   * Найти подразделение по имени во фракции
   */
  static async findByName(factionId: number, name: string): Promise<Subdivision | undefined> {
    return await database.get<Subdivision>(
      'SELECT * FROM subdivisions WHERE faction_id = ? AND name = ?',
      [factionId, name]
    );
  }

  /**
   * Найти дефолтное подразделение фракции
   */
  static async findDefaultByFactionId(factionId: number): Promise<Subdivision | undefined> {
    return await database.get<Subdivision>(
      'SELECT * FROM subdivisions WHERE faction_id = ? AND is_default = 1',
      [factionId]
    );
  }

  /**
   * Найти подразделение по VK chat_id
   */
  static async findByVkChatId(vkChatId: string): Promise<Subdivision | undefined> {
    return await database.get<Subdivision>(
      'SELECT * FROM subdivisions WHERE vk_chat_id = ?',
      [vkChatId]
    );
  }

  /**
   * Найти подразделение по Telegram chat_id
   */
  static async findByTelegramChatId(telegramChatId: string): Promise<Subdivision | undefined> {
    return await database.get<Subdivision>(
      'SELECT * FROM subdivisions WHERE telegram_chat_id = ?',
      [telegramChatId]
    );
  }

  /**
   * Получить все подразделения фракции
   */
  static async findByFactionId(factionId: number, activeOnly = false): Promise<Subdivision[]> {
    const sql = activeOnly
      ? 'SELECT * FROM subdivisions WHERE faction_id = ? AND is_active = 1 ORDER BY name'
      : 'SELECT * FROM subdivisions WHERE faction_id = ? ORDER BY name';

    return await database.all<Subdivision>(sql, [factionId]);
  }

  /**
   * Получить все подразделения сервера
   */
  static async findByServerId(serverId: number, activeOnly = false): Promise<Subdivision[]> {
    const sql = activeOnly
      ? 'SELECT * FROM subdivisions WHERE server_id = ? AND is_active = 1 ORDER BY name'
      : 'SELECT * FROM subdivisions WHERE server_id = ? ORDER BY name';

    return await database.all<Subdivision>(sql, [serverId]);
  }

  /**
   * Получить подразделения, принимающие каллауты
   */
  static async findAcceptingCallouts(serverId: number): Promise<Subdivision[]> {
    return await database.all<Subdivision>(
      'SELECT * FROM subdivisions WHERE server_id = ? AND is_active = 1 AND is_accepting_callouts = 1 ORDER BY name',
      [serverId]
    );
  }

  /**
   * Обновить подразделение
   */
  static async update(id: number, data: UpdateSubdivisionDTO): Promise<Subdivision | undefined> {
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
    if (data.short_description !== undefined) {
      updates.push('short_description = ?');
      params.push(data.short_description);
    }
    if (data.logo_url !== undefined) {
      updates.push('logo_url = ?');
      params.push(data.logo_url);
    }
    if (data.discord_role_id !== undefined) {
      updates.push('discord_role_id = ?');
      params.push(data.discord_role_id);
    }
    if (data.vk_chat_id !== undefined) {
      updates.push('vk_chat_id = ?');
      params.push(data.vk_chat_id);
    }
    if (data.telegram_chat_id !== undefined) {
      updates.push('telegram_chat_id = ?');
      params.push(data.telegram_chat_id);
    }
    if (data.is_accepting_callouts !== undefined) {
      updates.push('is_accepting_callouts = ?');
      params.push(data.is_accepting_callouts ? 1 : 0);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active ? 1 : 0);
    }

    // Embed настройки
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
    if (data.embed_title_url !== undefined) {
      updates.push('embed_title_url = ?');
      params.push(data.embed_title_url);
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

    await database.run(`UPDATE subdivisions SET ${updates.join(', ')} WHERE id = ?`, params);

    logger.info('Subdivision updated', { subdivisionId: id });

    return await this.findById(id);
  }

  /**
   * Привязать VK беседу к подразделению
   */
  static async linkVkChat(id: number, vkChatId: string): Promise<Subdivision | undefined> {
    return await this.update(id, { vk_chat_id: vkChatId });
  }

  /**
   * Отвязать VK беседу от подразделения
   */
  static async unlinkVkChat(id: number): Promise<Subdivision | undefined> {
    return await this.update(id, { vk_chat_id: null });
  }

  /**
   * Привязать Telegram группу к подразделению
   */
  static async linkTelegramChat(id: number, telegramChatId: string): Promise<Subdivision | undefined> {
    return await this.update(id, { telegram_chat_id: telegramChatId });
  }

  /**
   * Отвязать Telegram группу от подразделения
   */
  static async unlinkTelegramChat(id: number): Promise<Subdivision | undefined> {
    return await this.update(id, { telegram_chat_id: null });
  }

  /**
   * Переключить прием каллаутов
   */
  static async toggleCallouts(id: number, accepting: boolean): Promise<Subdivision | undefined> {
    return await this.update(id, { is_accepting_callouts: accepting });
  }

  /**
   * Удалить подразделение
   */
  static async delete(id: number): Promise<void> {
    const subdivision = await this.findById(id);
    await database.run('DELETE FROM subdivisions WHERE id = ?', [id]);

    logger.info('Subdivision deleted', {
      subdivisionId: id,
      name: subdivision?.name,
    });
  }

  /**
   * Деактивировать подразделение (soft delete)
   */
  static async deactivate(id: number): Promise<Subdivision | undefined> {
    return await this.update(id, { is_active: false });
  }

  /**
   * Активировать подразделение
   */
  static async activate(id: number): Promise<Subdivision | undefined> {
    return await this.update(id, { is_active: true });
  }

  /**
   * Проверить существование подразделения по имени
   */
  static async exists(factionId: number, name: string): Promise<boolean> {
    const subdivision = await this.findByName(factionId, name);
    return !!subdivision;
  }

  /**
   * Получить количество подразделений фракции
   */
  static async count(factionId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM subdivisions WHERE faction_id = ?',
      [factionId]
    );
    return result?.count || 0;
  }

  /**
   * Получить количество активных НЕ дефолтных подразделений
   */
  static async countActiveNonDefault(factionId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM subdivisions WHERE faction_id = ? AND is_active = 1 AND is_default = 0',
      [factionId]
    );
    return result?.count || 0;
  }

  /**
   * Деактивировать все НЕ дефолтные подразделения фракции
   */
  static async deactivateNonDefaultSubdivisions(factionId: number): Promise<void> {
    await database.run(
      'UPDATE subdivisions SET is_active = 0 WHERE faction_id = ? AND is_default = 0',
      [factionId]
    );

    logger.info('Deactivated all non-default subdivisions', {
      factionId,
    });
  }

  /**
   * Проверить, активно ли подразделение
   */
  static isActive(subdivision: Subdivision): boolean {
    return subdivision.is_active;
  }

  /**
   * Проверить, принимает ли подразделение каллауты
   */
  static isAcceptingCallouts(subdivision: Subdivision): boolean {
    return subdivision.is_accepting_callouts && subdivision.is_active;
  }

  /**
   * Проверить, привязана ли VK беседа
   */
  static hasVkChat(subdivision: Subdivision): boolean {
    return !!subdivision.vk_chat_id;
  }

  /**
   * Проверить, привязана ли Telegram группа
   */
  static hasTelegramChat(subdivision: Subdivision): boolean {
    return !!subdivision.telegram_chat_id;
  }
}

export default SubdivisionModel;
