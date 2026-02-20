import { Client, ActivityType } from 'discord.js';
import logger from '../../utils/logger';
import CalloutService from '../../services/callout.service';

/**
 * Менеджер статуса (presence) Discord бота
 */
export class PresenceManager {
  private static client: Client | null = null;
  private static updateInterval: NodeJS.Timeout | null = null;
  private static lastKnownCount = -1;

  /**
   * Инициализировать менеджер статуса
   */
  static initialize(client: Client) {
    this.client = client;

    // Установить начальный статус
    this.updatePresence();

    // Обновлять статус каждые 30 секунд
    this.updateInterval = setInterval(() => {
      this.updatePresence();
    }, 30000);

    logger.info('Presence manager initialized');
  }

  /**
   * Обновить статус бота
   */
  static async updatePresence() {
    if (!this.client?.user) {
      logger.warn('Cannot update presence: client not ready');
      return;
    }

    try {
      // Получить количество активных каллаутов
      const activeCallouts = await CalloutService.getActiveCalloutsCount();

      // Пропустить обновление если счётчик не изменился
      if (activeCallouts === this.lastKnownCount) return;
      this.lastKnownCount = activeCallouts;

      let activityName: string;
      let activityType: ActivityType;

      if (activeCallouts > 0) {
        // Есть активные каллауты
        activityName = `🚨 ${activeCallouts} active incident${activeCallouts > 1 ? 's' : ''}`;
        activityType = ActivityType.Watching;
      } else {
        // Нет активных каллаутов - в режиме ожидания
        activityName = '🚨 Standby for callouts';
        activityType = ActivityType.Watching;
      }

      this.client.user.setPresence({
        activities: [{
          name: activityName,
          type: activityType,
        }],
        status: 'online',
      });

      logger.debug('Presence updated', { activityName, activeCallouts });
    } catch (error) {
      logger.error('Failed to update presence', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Принудительно обновить статус (вызывается при создании/закрытии каллаута)
   */
  static async forceUpdate() {
    await this.updatePresence();
  }

  /**
   * Остановить менеджер статуса
   */
  static shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.client = null;
    logger.info('Presence manager shutdown');
  }
}

export default PresenceManager;
