import database from '../db';
import logger from '../../utils/logger';
import {
  VkVerificationToken,
  CreateVerificationTokenDTO,
} from '../../types/database.types';

/**
 * Модель для работы с таблицей vk_verification_tokens
 */
export class VkVerificationTokenModel {
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
  static async create(data: CreateVerificationTokenDTO): Promise<VkVerificationToken> {
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + this.TOKEN_TTL_MS).toISOString();

    const result = await database.run(
      `INSERT INTO vk_verification_tokens (server_id, subdivision_id, token, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [data.server_id, data.subdivision_id, token, data.created_by, expiresAt]
    );

    logger.info('Verification token created', {
      tokenId: result.lastID,
      token: token,
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
  static async findById(id: number): Promise<VkVerificationToken | undefined> {
    return await database.get<VkVerificationToken>(
      'SELECT * FROM vk_verification_tokens WHERE id = ?',
      [id]
    );
  }

  /**
   * Найти токен по строке токена
   */
  static async findByToken(token: string): Promise<VkVerificationToken | undefined> {
    return await database.get<VkVerificationToken>(
      'SELECT * FROM vk_verification_tokens WHERE token = ?',
      [token]
    );
  }

  /**
   * Найти все токены подразделения
   */
  static async findBySubdivisionId(subdivisionId: number): Promise<VkVerificationToken[]> {
    return await database.all<VkVerificationToken>(
      'SELECT * FROM vk_verification_tokens WHERE subdivision_id = ? ORDER BY created_at DESC',
      [subdivisionId]
    );
  }

  /**
   * Пометить токен как использованный
   */
  static async markAsUsed(
    id: number,
    vkPeerId: string
  ): Promise<VkVerificationToken | undefined> {
    const usedAt = new Date().toISOString();

    await database.run(
      `UPDATE vk_verification_tokens
       SET is_used = 1, used_at = ?, vk_peer_id = ?
       WHERE id = ?`,
      [usedAt, vkPeerId, id]
    );

    logger.info('Verification token marked as used', {
      tokenId: id,
      vkPeerId: vkPeerId,
    });

    return await this.findById(id);
  }

  /**
   * Проверить, валиден ли токен
   */
  static isValid(token: VkVerificationToken): boolean {
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
  static getValidationInfo(token: VkVerificationToken): {
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
   * Очистить просроченные токены
   */
  static async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await database.run(
      'DELETE FROM vk_verification_tokens WHERE expires_at < ?',
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
      'DELETE FROM vk_verification_tokens WHERE is_used = 1 AND used_at < ?',
      [cutoffDate]
    );

    return result.changes || 0;
  }

  /**
   * Получить количество активных токенов для подразделения
   */
  static async countActiveForSubdivision(subdivisionId: number): Promise<number> {
    const now = new Date().toISOString();

    const result = await database.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM vk_verification_tokens
       WHERE subdivision_id = ? AND is_used = 0 AND expires_at > ?`,
      [subdivisionId, now]
    );

    return result?.count || 0;
  }

  /**
   * Получить оставшееся время жизни токена в минутах
   */
  static getRemainingMinutes(token: VkVerificationToken): number {
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    return Math.max(0, Math.floor(diff / 60000));
  }
}

export default VkVerificationTokenModel;
