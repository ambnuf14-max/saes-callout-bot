import database from '../database/db';
import { ServerModel } from '../database/models';
import { CalloutRateLimit } from '../types/database.types';
import logger from '../utils/logger';
import { EMOJI } from '../config/constants';

/**
 * Результат проверки прав на создание каллаута
 */
export interface CalloutPermissionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Сервис для верификации прав на создание каллаутов
 */
export class CalloutGatewayService {
  /**
   * Rate limit в миллисекундах (5 минут)
   */
  private static readonly RATE_LIMIT_MS = 5 * 60 * 1000;

  /**
   * Проверить может ли пользователь создать каллаут
   */
  static async canUserCreateCallout(
    userId: string,
    userRoles: string[],
    serverId: number,
    isAdmin: boolean = false
  ): Promise<CalloutPermissionCheck> {
    try {
      // Администраторы игнорируют все проверки
      if (isAdmin) {
        logger.debug('Admin bypassing callout checks', { userId });
        return { allowed: true };
      }

      // 1. Проверка роли
      const roleCheck = await this.checkRolePermission(userRoles, serverId);
      if (!roleCheck.allowed) {
        return roleCheck;
      }

      // 2. Проверка rate limit
      const rateLimitCheck = await this.checkRateLimit(userId, serverId);
      if (!rateLimitCheck.allowed) {
        return rateLimitCheck;
      }

      return { allowed: true };
    } catch (error) {
      logger.error('Error checking callout permission', {
        error: error instanceof Error ? error.message : error,
        userId,
        serverId,
      });
      return {
        allowed: false,
        reason: `${EMOJI.ERROR} Произошла ошибка при проверке прав`,
      };
    }
  }

  /**
   * Проверить наличие разрешенной роли
   */
  static async checkRolePermission(
    userRoles: string[],
    serverId: number
  ): Promise<CalloutPermissionCheck> {
    // Получить настройки сервера
    const server = await ServerModel.findById(serverId);
    if (!server) {
      return {
        allowed: false,
        reason: `${EMOJI.ERROR} Сервер не настроен`,
      };
    }

    // Получить разрешенные роли
    const allowedRoleIds = ServerModel.getCalloutAllowedRoleIds(server);

    // Если разрешенные роли не настроены, разрешаем всем
    if (allowedRoleIds.length === 0) {
      return { allowed: true };
    }

    // Проверить есть ли у пользователя хотя бы одна из разрешенных ролей
    const hasAllowedRole = userRoles.some((roleId) => allowedRoleIds.includes(roleId));

    if (!hasAllowedRole) {
      return {
        allowed: false,
        reason: `${EMOJI.ERROR} У вас нет фракционных ролей для доступа к системе. Получите их в соответствующем канале.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Проверить rate limit (5 минут)
   */
  static async checkRateLimit(
    userId: string,
    serverId: number
  ): Promise<CalloutPermissionCheck> {
    try {
      const rateLimit = await this.getRateLimit(userId, serverId);

      if (!rateLimit) {
        // Первый каллаут пользователя
        return { allowed: true };
      }

      const lastCalloutTime = new Date(rateLimit.last_callout_at).getTime();
      const currentTime = Date.now();
      const timeSinceLastCallout = currentTime - lastCalloutTime;

      if (timeSinceLastCallout < this.RATE_LIMIT_MS) {
        const remainingMs = this.RATE_LIMIT_MS - timeSinceLastCallout;
        const remainingMinutes = Math.ceil(remainingMs / 60000);

        return {
          allowed: false,
          reason: `${EMOJI.WARNING} Вы можете создать следующий каллаут через ${remainingMinutes} мин.`,
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('Error checking rate limit', {
        error: error instanceof Error ? error.message : error,
        userId,
        serverId,
      });
      // В случае ошибки разрешаем создание
      return { allowed: true };
    }
  }

  /**
   * Записать время создания каллаута
   */
  static async recordCalloutCreation(
    userId: string,
    serverId: number,
    isAdmin: boolean = false
  ): Promise<void> {
    // Не записываем rate limit для администраторов
    if (isAdmin) {
      logger.debug('Skipping rate limit recording for admin', { userId });
      return;
    }

    try {
      const now = new Date().toISOString();

      await database.run(
        `INSERT INTO callout_rate_limits (user_id, server_id, last_callout_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, server_id) DO UPDATE SET
           last_callout_at = excluded.last_callout_at,
           updated_at = excluded.updated_at`,
        [userId, serverId, now, now, now]
      );

      logger.debug('Callout creation recorded', { userId, serverId });
    } catch (error) {
      logger.error('Failed to record callout creation', {
        error: error instanceof Error ? error.message : error,
        userId,
        serverId,
      });
    }
  }

  /**
   * Получить rate limit для пользователя
   */
  private static async getRateLimit(
    userId: string,
    serverId: number
  ): Promise<CalloutRateLimit | undefined> {
    try {
      const result = await database.get<CalloutRateLimit>(
        `SELECT * FROM callout_rate_limits WHERE user_id = ? AND server_id = ?`,
        [userId, serverId]
      );
      return result;
    } catch (error) {
      logger.error('Failed to get rate limit', {
        error: error instanceof Error ? error.message : error,
        userId,
        serverId,
      });
      return undefined;
    }
  }

  /**
   * Очистить старые записи rate limit (для обслуживания БД)
   */
  static async cleanupOldRateLimits(daysOld = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await database.run(
        `DELETE FROM callout_rate_limits WHERE last_callout_at < ?`,
        [cutoffDate.toISOString()]
      );

      logger.info('Old rate limits cleaned up', {
        deletedCount: result.changes,
        daysOld,
      });
    } catch (error) {
      logger.error('Failed to cleanup old rate limits', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}

export default CalloutGatewayService;
