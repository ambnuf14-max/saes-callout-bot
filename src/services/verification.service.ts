import { VerificationTokenModel, SubdivisionModel } from '../database/models';
import {
  VerificationToken,
  CreateVerificationTokenDTO,
  Subdivision,
  Platform,
} from '../types/database.types';
import { VerificationInstructions } from '../types/department.types';
import logger from '../utils/logger';
import { CalloutError } from '../utils/error-handler';

/**
 * Сервис для работы с верификацией VK бесед и Telegram групп
 */
export class VerificationService {
  // Максимальное количество активных токенов для одного подразделения
  static readonly MAX_ACTIVE_TOKENS_PER_SUBDIVISION = 3;

  /**
   * Генерировать токен верификации для подразделения
   */
  static async generateVerificationToken(
    data: CreateVerificationTokenDTO
  ): Promise<VerificationToken> {
    // Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(data.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение не найдено',
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    const platform = data.platform || 'vk';

    // Проверить количество активных токенов для этого подразделения и платформы (rate limiting)
    const activeCount = await VerificationTokenModel.countActiveForSubdivision(
      data.subdivision_id,
      platform
    );

    if (activeCount >= this.MAX_ACTIVE_TOKENS_PER_SUBDIVISION) {
      throw new CalloutError(
        `Превышен лимит активных токенов (${this.MAX_ACTIVE_TOKENS_PER_SUBDIVISION}). Подождите истечения существующих токенов.`,
        'TOO_MANY_ACTIVE_TOKENS',
        429
      );
    }

    // Создать токен
    const token = await VerificationTokenModel.create(data);

    logger.info('Verification token generated', {
      tokenId: token.id,
      platform: platform,
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
    const token = await VerificationTokenModel.findById(tokenId);
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
      platform: token.platform, // Добавляем платформу в инструкции
    };
  }

  /**
   * Верифицировать токен и привязать VK беседу или Telegram группу
   */
  static async verifyToken(
    tokenString: string,
    chatId: string,
    platform: Platform = 'vk',
    chatTitle?: string
  ): Promise<{ subdivision: Subdivision; token: VerificationToken }> {
    // Найти токен
    const token = await VerificationTokenModel.findByToken(tokenString);
    if (!token) {
      throw new CalloutError(
        'Токен не найден или истек',
        'TOKEN_NOT_FOUND',
        404
      );
    }

    // Проверить соответствие платформы
    if (token.platform !== platform) {
      throw new CalloutError(
        `Токен предназначен для ${token.platform === 'vk' ? 'VK' : 'Telegram'}, но используется в ${platform === 'vk' ? 'VK' : 'Telegram'}`,
        'PLATFORM_MISMATCH',
        400
      );
    }

    // Проверить валидность токена
    const validation = VerificationTokenModel.getValidationInfo(token);
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

    // Привязать чат к подразделению в зависимости от платформы
    if (platform === 'vk') {
      await SubdivisionModel.linkVkChat(token.subdivision_id, chatId, chatTitle);
    } else if (platform === 'telegram') {
      await SubdivisionModel.linkTelegramChat(token.subdivision_id, chatId, chatTitle);
    }

    // Сохранить interaction token до markAsUsed, т.к. markAsUsed зануляет их в БД
    const savedInteractionToken = token.discord_interaction_token;
    const savedApplicationId = token.discord_application_id;

    // Пометить токен как использованный
    const usedToken = await VerificationTokenModel.markAsUsed(token.id, chatId);
    if (!usedToken) {
      throw new Error('Failed to mark token as used');
    }

    // Восстановить для уведомления Discord (markAsUsed уже очистил их в БД)
    if (savedInteractionToken) {
      usedToken.discord_interaction_token = savedInteractionToken;
      usedToken.discord_application_id = savedApplicationId;
    }

    logger.info('Token verified and chat linked', {
      tokenId: token.id,
      platform: platform,
      subdivisionId: token.subdivision_id,
      chatId,
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
    const deletedCount = await VerificationTokenModel.cleanupExpired();

    logger.info('Expired verification tokens cleaned up', { deletedCount });

    return deletedCount;
  }

  /**
   * Очистить использованные токены старше указанного времени
   */
  static async cleanupUsedTokens(olderThanHours: number = 24): Promise<number> {
    const deletedCount = await VerificationTokenModel.cleanupUsed(olderThanHours);

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
    subdivisionId: number,
    platform?: Platform
  ): Promise<VerificationToken[]> {
    const allTokens = await VerificationTokenModel.findBySubdivisionId(subdivisionId, platform);

    // Фильтровать только валидные токены
    return allTokens.filter((token) => VerificationTokenModel.isValid(token));
  }

  /**
   * Получить информацию о токене
   */
  static async getTokenInfo(tokenString: string): Promise<{
    token: VerificationToken;
    subdivision: Subdivision;
    valid: boolean;
    reason?: string;
  }> {
    const token = await VerificationTokenModel.findByToken(tokenString);
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

    const validation = VerificationTokenModel.getValidationInfo(token);

    return {
      token,
      subdivision,
      valid: validation.valid,
      reason: validation.reason,
    };
  }
}

export default VerificationService;
