import database from '../db';
import logger from '../../utils/logger';
import {
  VerificationToken,
  VkVerificationToken,
  CreateVerificationTokenDTO,
  Platform,
} from '../../types/database.types';

/**
 * Модель для работы с таблицей verification_tokens
 * Поддерживает как VK, так и Telegram платформы
 */
export class VerificationTokenModel {
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
   * Создать новый токен верификации
   */
  static async create(data: CreateVerificationTokenDTO): Promise<VerificationToken> {
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + this.TOKEN_TTL_MS).toISOString();
    const platform = data.platform || 'vk'; // По умолчанию VK для обратной совместимости

    const result = await database.run(
      `INSERT INTO verification_tokens (server_id, subdivision_id, token, platform, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.server_id, data.subdivision_id, token, platform, data.created_by, expiresAt]
    );

    logger.info('Verification token created', {
      tokenId: result.lastID,
      token: token,
      platform: platform,
      subdivisionId: data.subdivision_id,
      createdBy: data.created_by,
    });

    const createdToken = await this.findById(result.lastID);
    if (!createdToken) {
      throw new Error('Failed to retrieve created verification token');
    }

    return createdToken;
  }

  /**
   * Найти токен по ID
   */
  static async findById(id: number): Promise<VerificationToken | undefined> {
    return await database.get<VerificationToken>(
      'SELECT * FROM verification_tokens WHERE id = ?',
      [id]
    );
  }

  /**
   * Найти токен по строке токена
   */
  static async findByToken(token: string): Promise<VerificationToken | undefined> {
    return await database.get<VerificationToken>(
      'SELECT * FROM verification_tokens WHERE token = ?',
      [token]
    );
  }

  /**
   * Найти все токены подразделения
   */
  static async findBySubdivisionId(
    subdivisionId: number,
    platform?: Platform
  ): Promise<VerificationToken[]> {
    if (platform) {
      return await database.all<VerificationToken>(
        'SELECT * FROM verification_tokens WHERE subdivision_id = ? AND platform = ? ORDER BY created_at DESC',
        [subdivisionId, platform]
      );
    }

    return await database.all<VerificationToken>(
      'SELECT * FROM verification_tokens WHERE subdivision_id = ? ORDER BY created_at DESC',
      [subdivisionId]
    );
  }

  /**
   * Пометить токен как использованный
   */
  static async markAsUsed(
    id: number,
    chatId: string
  ): Promise<VerificationToken | undefined> {
    const usedAt = new Date().toISOString();

    // Очищаем discord_interaction_token при использовании,
    // чтобы чувствительный токен не оставался в БД
    await database.run(
      `UPDATE verification_tokens
       SET is_used = 1, used_at = ?, chat_id = ?, discord_interaction_token = NULL, discord_application_id = NULL
       WHERE id = ?`,
      [usedAt, chatId, id]
    );

    logger.info('Verification token marked as used', {
      tokenId: id,
      chatId: chatId,
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
      `UPDATE verification_tokens
       SET discord_channel_id = ?, discord_message_id = ?, discord_interaction_token = ?, discord_application_id = ?
       WHERE id = ?`,
      [channelId, messageId, interactionToken || null, applicationId || null, id]
    );

    logger.debug('Verification token Discord message updated', {
      tokenId: id,
      channelId,
      messageId,
      hasInteractionToken: !!interactionToken,
    });
  }

  /**
   * Проверить, валиден ли токен
   */
  static isValid(token: VerificationToken): boolean {
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
  static getValidationInfo(token: VerificationToken): {
    valid: boolean;
    reason?: string;
  } {
    if (token.is_used) {
      return { valid: false, reason: 'Токен уже использован' };
    }

    const expiresAt = new Date(token.expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      return { valid: false, reason: 'Токен истек' };
    }

    return { valid: true };
  }

  /**
   * Получить истёкшие неиспользованные токены с interaction token (для уведомления в Discord)
   */
  static async findExpiredWithInteractionToken(): Promise<VerificationToken[]> {
    const now = new Date().toISOString();

    return await database.all<VerificationToken>(
      `SELECT * FROM verification_tokens
       WHERE is_used = 0 AND expires_at < ? AND discord_interaction_token IS NOT NULL`,
      [now]
    );
  }

  /**
   * Убрать interaction token у токена (чтобы не пытаться повторно редактировать)
   */
  static async clearInteractionToken(id: number): Promise<void> {
    await database.run(
      `UPDATE verification_tokens SET discord_interaction_token = NULL WHERE id = ?`,
      [id]
    );
  }

  /**
   * Очистить просроченные токены
   */
  static async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await database.run(
      'DELETE FROM verification_tokens WHERE expires_at < ?',
      [now]
    );

    logger.info('Expired verification tokens cleaned up', {
      deletedCount: result.changes,
    });

    return result.changes || 0;
  }

  /**
   * Очистить использованные токены старше указанного времени (по умолчанию 24 часа)
   */
  static async cleanupUsed(olderThanHours: number = 24): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    const result = await database.run(
      'DELETE FROM verification_tokens WHERE is_used = 1 AND used_at < ?',
      [cutoffDate]
    );

    logger.info('Used verification tokens cleaned up', {
      deletedCount: result.changes,
      olderThanHours: olderThanHours,
    });

    return result.changes || 0;
  }

  /**
   * Получить количество активных токенов для подразделения
   */
  static async countActiveForSubdivision(
    subdivisionId: number,
    platform?: Platform
  ): Promise<number> {
    const now = new Date().toISOString();

    let sql = `SELECT COUNT(*) as count FROM verification_tokens
       WHERE subdivision_id = ? AND is_used = 0 AND expires_at > ?`;
    const params: any[] = [subdivisionId, now];

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    const result = await database.get<{ count: number }>(sql, params);

    return result?.count || 0;
  }

  /**
   * Получить оставшееся время жизни токена в минутах
   */
  static getRemainingMinutes(token: VerificationToken): number {
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    return Math.max(0, Math.floor(diff / 60000));
  }
}

// Для обратной совместимости экспортируем также как VkVerificationTokenModel
export class VkVerificationTokenModel extends VerificationTokenModel {
  /**
   * Пометить токен как использованный (VK-specific API для совместимости)
   */
  static async markAsUsed(
    id: number,
    vkPeerId: string
  ): Promise<VkVerificationToken | undefined> {
    const result = await super.markAsUsed(id, vkPeerId);
    if (!result) return undefined;

    // Добавляем vk_peer_id для обратной совместимости
    return { ...result, vk_peer_id: result.chat_id };
  }

  /**
   * Найти токен по ID (VK-specific)
   */
  static async findById(id: number): Promise<VkVerificationToken | undefined> {
    const result = await super.findById(id);
    if (!result) return undefined;

    return { ...result, vk_peer_id: result.chat_id };
  }

  /**
   * Найти токен по строке (VK-specific)
   */
  static async findByToken(token: string): Promise<VkVerificationToken | undefined> {
    const result = await super.findByToken(token);
    if (!result) return undefined;

    return { ...result, vk_peer_id: result.chat_id };
  }
}

export default VerificationTokenModel;
