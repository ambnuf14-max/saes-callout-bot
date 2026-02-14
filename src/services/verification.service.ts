import { VkVerificationTokenModel, SubdivisionModel } from '../database/models';
import {
  VkVerificationToken,
  CreateVerificationTokenDTO,
  Subdivision,
} from '../types/database.types';
import { VerificationInstructions } from '../types/department.types';
import logger from '../utils/logger';
import { CalloutError } from '../utils/error-handler';

/**
 * Сервис для работы с верификацией VK бесед
 */
export class VerificationService {
  // Максимальное количество активных токенов для одного подразделения
  static readonly MAX_ACTIVE_TOKENS_PER_SUBDIVISION = 3;

  /**
   * Генерировать токен верификации для подразделения
   */
  static async generateVerificationToken(
    data: CreateVerificationTokenDTO
  ): Promise<VkVerificationToken> {
    // Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(data.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение не найдено',
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    // Проверить количество активных токенов для этого подразделения (rate limiting)
    const activeCount = await VkVerificationTokenModel.countActiveForSubdivision(
      data.subdivision_id
    );

    if (activeCount >= this.MAX_ACTIVE_TOKENS_PER_SUBDIVISION) {
      throw new CalloutError(
        `Превышен лимит активных токенов (${this.MAX_ACTIVE_TOKENS_PER_SUBDIVISION}). Подождите истечения существующих токенов.`,
        'TOO_MANY_ACTIVE_TOKENS',
        429
      );
    }

    // Создать токен
    const token = await VkVerificationTokenModel.create(data);

    logger.info('Verification token generated', {
      tokenId: token.id,
      subdivisionId: data.subdivision_id,
      createdBy: data.created_by,
    });

    return token;
  }

  /**
   * Сгенерировать инструкции для верификации
   */
  static async generateInstructions(
    tokenId: number
  ): Promise<VerificationInstructions> {
    const token = await VkVerificationTokenModel.findById(tokenId);
    if (!token) {
      throw new CalloutError('Токен не найден', 'TOKEN_NOT_FOUND', 404);
    }

    const subdivision = await SubdivisionModel.findById(token.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение не найдено',
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    const expiresAt = new Date(token.expires_at);
    const commandText = `/verify ${token.token}`;

    return {
      token: token.token,
      subdivisionName: subdivision.name,
      expiresAt,
      commandText,
    };
  }

  /**
   * Верифицировать токен и привязать VK беседу
   */
  static async verifyToken(
    tokenString: string,
    vkPeerId: string
  ): Promise<{ subdivision: Subdivision; token: VkVerificationToken }> {
    // Найти токен
    const token = await VkVerificationTokenModel.findByToken(tokenString);
    if (!token) {
      throw new CalloutError(
        'Токен не найден или истек',
        'TOKEN_NOT_FOUND',
        404
      );
    }

    // Проверить валидность токена
    const validation = VkVerificationTokenModel.getValidationInfo(token);
    if (!validation.valid) {
      throw new CalloutError(
        validation.reason || 'Токен невалиден',
        'TOKEN_INVALID',
        400
      );
    }

    // Получить подразделение
    const subdivision = await SubdivisionModel.findById(token.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение не найдено',
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    // Привязать VK беседу к подразделению
    await SubdivisionModel.linkVkChat(token.subdivision_id, vkPeerId);

    // Пометить токен как использованный
    const usedToken = await VkVerificationTokenModel.markAsUsed(token.id, vkPeerId);
    if (!usedToken) {
      throw new Error('Failed to mark token as used');
    }

    logger.info('Token verified and VK chat linked', {
      tokenId: token.id,
      subdivisionId: token.subdivision_id,
      vkPeerId,
    });

    // Вернуть обновленное подразделение
    const updatedSubdivision = await SubdivisionModel.findById(token.subdivision_id);
    if (!updatedSubdivision) {
      throw new Error('Failed to retrieve updated subdivision');
    }

    return { subdivision: updatedSubdivision, token: usedToken };
  }

  /**
   * Очистить просроченные токены
   */
  static async cleanupExpiredTokens(): Promise<number> {
    const deletedCount = await VkVerificationTokenModel.cleanupExpired();

    logger.info('Expired verification tokens cleaned up', { deletedCount });

    return deletedCount;
  }

  /**
   * Очистить использованные токены старше указанного времени
   */
  static async cleanupUsedTokens(olderThanHours: number = 24): Promise<number> {
    const deletedCount = await VkVerificationTokenModel.cleanupUsed(olderThanHours);

    logger.info('Used verification tokens cleaned up', {
      deletedCount,
      olderThanHours,
    });

    return deletedCount;
  }

  /**
   * Получить активные токены для подразделения
   */
  static async getActiveTokensForSubdivision(
    subdivisionId: number
  ): Promise<VkVerificationToken[]> {
    const allTokens = await VkVerificationTokenModel.findBySubdivisionId(subdivisionId);

    // Фильтровать только валидные токены
    return allTokens.filter((token) => VkVerificationTokenModel.isValid(token));
  }

  /**
   * Получить информацию о токене
   */
  static async getTokenInfo(tokenString: string): Promise<{
    token: VkVerificationToken;
    subdivision: Subdivision;
    valid: boolean;
    reason?: string;
  }> {
    const token = await VkVerificationTokenModel.findByToken(tokenString);
    if (!token) {
      throw new CalloutError(
        'Токен не найден',
        'TOKEN_NOT_FOUND',
        404
      );
    }

    const subdivision = await SubdivisionModel.findById(token.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение не найдено',
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    const validation = VkVerificationTokenModel.getValidationInfo(token);

    return {
      token,
      subdivision,
      valid: validation.valid,
      reason: validation.reason,
    };
  }
}

export default VerificationService;
