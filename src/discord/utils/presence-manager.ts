import { Client, ActivityType } from 'discord.js';
import logger from '../../utils/logger';
import { CalloutModel, SubdivisionModel } from '../../database/models';
import { CALLOUT_STATUS } from '../../config/constants';
import { Callout } from '../../types/database.types';

/**
 * Менеджер статуса (presence) Discord бота.
 * При активных инцидентах показывает Rich Presence с деталями,
 * чередуя между инцидентами каждые ~15 секунд.
 */
export class PresenceManager {
  private static client: Client | null = null;
  private static updateInterval: NodeJS.Timeout | null = null;
  private static rotateInterval: NodeJS.Timeout | null = null;
  private static currentIndex = 0;
  private static activeCallouts: Callout[] = [];
  private static lastKnownCount = -1;

  /**
   * Инициализировать менеджер статуса
   */
  static initialize(client: Client) {
    this.client = client;

    // Установить начальный статус
    this.refreshCallouts();

    // Обновлять список каллаутов каждые 30 секунд
    this.updateInterval = setInterval(() => {
      this.refreshCallouts();
    }, 30000);

    // Чередовать между инцидентами каждые 15 секунд
    this.rotateInterval = setInterval(() => {
      this.rotatePresence();
    }, 15000);

    logger.info('Presence manager initialized');
  }

  /**
   * Обновить список активных каллаутов и presence
   */
  private static async refreshCallouts() {
    if (!this.client?.user) {
      logger.warn('Cannot update presence: client not ready');
      return;
    }

    try {
      this.activeCallouts = await CalloutModel.findActive();
      const count = this.activeCallouts.length;

      if (count !== this.lastKnownCount) {
        this.lastKnownCount = count;
        this.currentIndex = 0;
      }

      await this.applyPresence();
    } catch (error) {
      logger.error('Failed to refresh callouts for presence', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Переключить на следующий инцидент
   */
  private static async rotatePresence() {
    if (this.activeCallouts.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % this.activeCallouts.length;
    await this.applyPresence();
  }

  /**
   * Применить текущий presence
   */
  private static async applyPresence() {
    if (!this.client?.user) return;

    try {
      if (this.activeCallouts.length === 0) {
        this.client.user.setPresence({
          activities: [{
            name: 'Standby for callouts',
            type: ActivityType.Custom,
            state: '🚨 Standby for callouts',
          }],
          status: 'online',
        });
        return;
      }

      const callout = this.activeCallouts[this.currentIndex];
      if (!callout) return;

      const subdivision = await SubdivisionModel.findById(callout.subdivision_id);

      const elapsedMs = Date.now() - new Date(callout.created_at).getTime();
      const elapsedMin = Math.floor(elapsedMs / 60000);
      const subName = subdivision?.name || 'Unknown';

      // Строка 1 (name): подразделение + номер инцидента
      const name = `🚨 Active Incident — ${subName}`;

      // Строка 2 (state): локация / описание / время
      const state = this.buildState(callout, elapsedMin);

      this.client.user.setPresence({
        activities: [{
          name,
          type: ActivityType.Playing,
          state,
        }],
        status: 'dnd',
      });

      logger.debug('Presence updated (Rich)', {
        calloutId: callout.id,
        subdivision: subdivision?.name,
        elapsedMin,
        index: this.currentIndex,
        total: this.activeCallouts.length,
      });
    } catch (error) {
      logger.error('Failed to apply presence', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Строка state (2-я строка presence)
   */
  private static buildState(callout: Callout, elapsedMin: number): string {
    const parts: string[] = [];

    if (callout.brief_description) parts.push(callout.brief_description);
    if (callout.location) parts.push(`📍 ${callout.location}`);
    parts.push(`⏱ ${elapsedMin} мин`);

    return parts.join(' · ');
  }

  /**
   * Принудительно обновить статус (вызывается при создании/закрытии каллаута)
   */
  static async forceUpdate() {
    this.lastKnownCount = -1;
    await this.refreshCallouts();
  }

  /**
   * Остановить менеджер статуса
   */
  static shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.rotateInterval) {
      clearInterval(this.rotateInterval);
      this.rotateInterval = null;
    }
    this.client = null;
    logger.info('Presence manager shutdown');
  }
}

export default PresenceManager;
