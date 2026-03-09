import database from '../db';
import logger from '../../utils/logger';
import { FactionLinkToken, CreateFactionLinkTokenDTO } from '../../types/database.types';

/**
 * Модель для работы с таблицей faction_link_tokens
 * Токены привязки faction-серверов к фракциям на главном сервере
 */
export class FactionLinkTokenModel {
  // Время жизни токена в миллисекундах (10 минут)
  static readonly TOKEN_TTL_MS = 10 * 60 * 1000;

  /**
   * Генерировать случайный токен (6 alphanumeric символов)
   */
  static generateToken(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 6; i++) {
      token += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return token;
  }

  /**
   * Создать новый токен привязки
   */
  static async create(data: CreateFactionLinkTokenDTO): Promise<FactionLinkToken> {
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + this.TOKEN_TTL_MS).toISOString();

    const result = await database.run(
      `INSERT INTO faction_link_tokens (main_server_id, faction_id, token, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [data.main_server_id, data.faction_id, token, data.created_by, expiresAt]
    );

    logger.info('Faction link token created', {
      tokenId: result.lastID,
      token: token,
      factionId: data.faction_id,
      createdBy: data.created_by,
    });

    const createdToken = await this.findById(result.lastID);
    if (!createdToken) {
      throw new Error('Failed to retrieve created faction link token');
    }

    return createdToken;
  }

  /**
   * Найти токен по ID
   */
  static async findById(id: number): Promise<FactionLinkToken | undefined> {
    return await database.get<FactionLinkToken>(
      'SELECT * FROM faction_link_tokens WHERE id = ?',
      [id]
    );
  }

  /**
   * Найти токен по строке токена
   */
  static async findByToken(token: string): Promise<FactionLinkToken | undefined> {
    return await database.get<FactionLinkToken>(
      'SELECT * FROM faction_link_tokens WHERE token = ?',
      [token]
    );
  }

  /**
   * Найти все активные токены для фракции
   */
  static async findByFactionId(factionId: number): Promise<FactionLinkToken[]> {
    return await database.all<FactionLinkToken>(
      'SELECT * FROM faction_link_tokens WHERE faction_id = ? ORDER BY created_at DESC',
      [factionId]
    );
  }

  /**
   * Атомарно захватить токен: пометить как использованный только если он ещё валиден.
   * Защищает от race condition при одновременных /link запросах.
   * Возвращает true если токен успешно захвачен, false если уже использован или истёк.
   */
  static async claimToken(
    id: number,
    usedByGuildId: string
  ): Promise<boolean> {
    const usedAt = new Date().toISOString();

    const result = await database.run(
      `UPDATE faction_link_tokens
       SET is_used = 1, used_at = ?, used_by_guild_id = ?, discord_interaction_token = NULL, discord_application_id = NULL
       WHERE id = ? AND is_used = 0 AND expires_at > ?`,
      [usedAt, usedByGuildId, id, usedAt]
    );

    return result.changes > 0;
  }

  /**
   * Пометить токен как использованный
   */
  static async markAsUsed(
    id: number,
    usedByGuildId: string
  ): Promise<FactionLinkToken | undefined> {
    const usedAt = new Date().toISOString();

    await database.run(
      `UPDATE faction_link_tokens
       SET is_used = 1, used_at = ?, used_by_guild_id = ?, discord_interaction_token = NULL, discord_application_id = NULL
       WHERE id = ?`,
      [usedAt, usedByGuildId, id]
    );

    logger.info('Faction link token marked as used', {
      tokenId: id,
      usedByGuildId: usedByGuildId,
    });

    return await this.findById(id);
  }

  /**
   * Обновить Discord message ID и interaction token для токена
   */
  static async updateDiscordMessage(
    id: number,
    channelId: string,
    messageId: string,
    interactionToken?: string,
    applicationId?: string
  ): Promise<void> {
    await database.run(
      `UPDATE faction_link_tokens
       SET discord_channel_id = ?, discord_message_id = ?, discord_interaction_token = ?, discord_application_id = ?
       WHERE id = ?`,
      [channelId, messageId, interactionToken || null, applicationId || null, id]
    );

    logger.debug('Faction link token Discord message updated', {
      tokenId: id,
      channelId,
      messageId,
      hasInteractionToken: !!interactionToken,
    });
  }

  /**
   * Проверить, валиден ли токен
   */
  static isValid(token: FactionLinkToken): boolean {
    if (token.is_used) {
      return false;
    }

    const expiresAt = new Date(token.expires_at);
    const now = new Date();

    return expiresAt > now;
  }

  /**
   * Получить информацию о валидности токена
   */
  static getValidationInfo(token: FactionLinkToken): {
    valid: boolean;
    reason?: string;
  } {
    if (token.is_used) {
      return { valid: false, reason: 'Токен уже использован' };
    }

    const expiresAt = new Date(token.expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      return { valid: false, reason: 'Токен истёк' };
    }

    return { valid: true };
  }

  /**
   * Получить истёкшие неиспользованные токены с interaction token (для уведомления в Discord)
   */
  static async findExpiredWithInteractionToken(): Promise<FactionLinkToken[]> {
    const now = new Date().toISOString();

    return await database.all<FactionLinkToken>(
      `SELECT * FROM faction_link_tokens
       WHERE is_used = 0 AND expires_at < ? AND discord_interaction_token IS NOT NULL`,
      [now]
    );
  }

  /**
   * Убрать interaction token у токена (чтобы не пытаться повторно редактировать)
   */
  static async clearInteractionToken(id: number): Promise<void> {
    await database.run(
      `UPDATE faction_link_tokens SET discord_interaction_token = NULL WHERE id = ?`,
      [id]
    );
  }

  /**
   * Очистить просроченные токены
   */
  static async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await database.run(
      'DELETE FROM faction_link_tokens WHERE expires_at < ? AND is_used = 0',
      [now]
    );

    return result.changes || 0;
  }

  /**
   * Очистить использованные токены старше указанного времени (по умолчанию 24 часа)
   */
  static async cleanupUsed(olderThanHours: number = 24): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    const result = await database.run(
      'DELETE FROM faction_link_tokens WHERE is_used = 1 AND used_at < ?',
      [cutoffDate]
    );

    return result.changes || 0;
  }

  /**
   * Получить количество активных токенов для фракции
   */
  static async countActiveForFaction(factionId: number): Promise<number> {
    const now = new Date().toISOString();

    const result = await database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM faction_link_tokens
       WHERE faction_id = ? AND is_used = 0 AND expires_at > ?`,
      [factionId, now]
    );

    return result?.count || 0;
  }

  /**
   * Получить оставшееся время жизни токена в минутах
   */
  static getRemainingMinutes(token: FactionLinkToken): number {
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    return Math.max(0, Math.floor(diff / 60000));
  }
}

export default FactionLinkTokenModel;
