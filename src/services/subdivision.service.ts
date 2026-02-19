import { SubdivisionModel } from '../database/models';
import {
  Subdivision,
  CreateSubdivisionDTO,
  UpdateSubdivisionDTO,
} from '../types/database.types';
import logger from '../utils/logger';
import { CalloutError } from '../utils/error-handler';

/**
 * Сервис для работы с подразделениями
 */
export class SubdivisionService {
  /**
   * Создать новое подразделение
   */
  static async createSubdivision(data: CreateSubdivisionDTO): Promise<Subdivision> {
    // Валидация названия
    if (!data.name || data.name.length < 2 || data.name.length > 50) {
      throw new CalloutError(
        'Название подразделения должно быть от 2 до 50 символов',
        'INVALID_SUBDIVISION_NAME',
        400
      );
    }

    // Проверка уникальности названия в фракции
    const existing = await SubdivisionModel.findByName(data.faction_id, data.name);
    if (existing) {
      throw new CalloutError(
        `Подразделение с названием "${data.name}" уже существует в этой фракции`,
        'SUBDIVISION_EXISTS',
        400
      );
    }

    // Создание подразделения
    const subdivision = await SubdivisionModel.create(data);

    logger.info('Subdivision created via service', {
      subdivisionId: subdivision.id,
      name: subdivision.name,
      factionId: data.faction_id,
    });

    // Если это первое обычное подразделение - деактивировать дефолтное
    const nonDefaultCount = await SubdivisionModel.countActiveNonDefault(data.faction_id);
    if (nonDefaultCount === 1) {
      const defaultSubdivision = await SubdivisionModel.findDefaultByFactionId(data.faction_id);
      if (defaultSubdivision && defaultSubdivision.is_active) {
        await SubdivisionModel.update(defaultSubdivision.id, { is_active: false });
        logger.info('Default subdivision deactivated (first regular subdivision created)', {
          factionId: data.faction_id,
          defaultSubdivisionId: defaultSubdivision.id,
        });
      }
    }

    return subdivision;
  }

  /**
   * Получить все подразделения фракции
   */
  static async getSubdivisionsByFactionId(
    factionId: number,
    activeOnly = false
  ): Promise<Subdivision[]> {
    return await SubdivisionModel.findByFactionId(factionId, activeOnly);
  }

  /**
   * Получить все подразделения сервера
   */
  static async getSubdivisionsByServerId(
    serverId: number,
    activeOnly = false
  ): Promise<Subdivision[]> {
    return await SubdivisionModel.findByServerId(serverId, activeOnly);
  }

  /**
   * Получить подразделения, принимающие каллауты
   */
  static async getAcceptingCallouts(serverId: number): Promise<Subdivision[]> {
    return await SubdivisionModel.findAcceptingCallouts(serverId);
  }

  /**
   * Получить подразделение по ID
   */
  static async getSubdivisionById(id: number): Promise<Subdivision | undefined> {
    return await SubdivisionModel.findById(id);
  }

  /**
   * Получить подразделение по VK chat ID
   */
  static async getSubdivisionByVkChatId(vkChatId: string): Promise<Subdivision | undefined> {
    return await SubdivisionModel.findByVkChatId(vkChatId);
  }

  /**
   * Обновить подразделение
   */
  static async updateSubdivision(
    id: number,
    data: UpdateSubdivisionDTO
  ): Promise<Subdivision | undefined> {
    // Валидация названия, если обновляется
    if (data.name) {
      if (data.name.length < 2 || data.name.length > 50) {
        throw new CalloutError(
          'Название подразделения должно быть от 2 до 50 символов',
          'INVALID_SUBDIVISION_NAME',
          400
        );
      }
    }

    const subdivision = await SubdivisionModel.update(id, data);

    logger.info('Subdivision updated via service', { subdivisionId: id });

    return subdivision;
  }

  /**
   * Привязать VK беседу к подразделению
   */
  static async linkVkChat(id: number, vkChatId: string): Promise<Subdivision | undefined> {
    // Проверить, не привязана ли эта беседа уже к другому подразделению
    const existing = await SubdivisionModel.findByVkChatId(vkChatId);
    if (existing && existing.id !== id) {
      // Автоматически отвязать от старого подразделения
      logger.info('VK chat is already linked to another subdivision, unlinking', {
        oldSubdivisionId: existing.id,
        newSubdivisionId: id,
        vkChatId,
      });
      await SubdivisionModel.unlinkVkChat(existing.id);
    }

    const subdivision = await SubdivisionModel.linkVkChat(id, vkChatId);

    logger.info('VK chat linked to subdivision', {
      subdivisionId: id,
      vkChatId,
    });

    return subdivision;
  }

  /**
   * Отвязать VK беседу от подразделения
   */
  static async unlinkVkChat(id: number): Promise<Subdivision | undefined> {
    const subdivision = await SubdivisionModel.unlinkVkChat(id);

    logger.info('VK chat unlinked from subdivision', { subdivisionId: id });

    return subdivision;
  }

  /**
   * Отправить прощальное сообщение в VK беседу и отвязать её.
   * Вернуть обновлённое подразделение.
   */
  static async sendVkGoodbyeAndUnlink(id: number): Promise<Subdivision | null> {
    const subdivision = await SubdivisionModel.findById(id);
    if (!subdivision?.vk_chat_id) return null;

    try {
      const vkBot = (await import('../vk/bot')).default;
      await vkBot.getApi().api.messages.send({
        peer_id: parseInt(subdivision.vk_chat_id),
        message: `ℹ️ Бот был отвязан от подразделения "${subdivision.name}".\n\nДо встречи!`,
        random_id: Math.floor(Math.random() * 1000000),
      });
      logger.info('Sent goodbye message to VK chat', { subdivisionId: id, vkChatId: subdivision.vk_chat_id });
    } catch (error) {
      logger.warn('Failed to send goodbye message to VK', {
        error: error instanceof Error ? error.message : error,
        vkChatId: subdivision.vk_chat_id,
      });
    }

    await SubdivisionModel.update(id, { vk_chat_id: null });
    logger.info('VK chat unlinked from subdivision', { subdivisionId: id });

    return (await SubdivisionModel.findById(id)) ?? null;
  }

  /**
   * Отправить прощальное сообщение в Telegram группу, покинуть её и отвязать.
   * Вернуть обновлённое подразделение.
   */
  static async sendTelegramGoodbyeAndUnlink(id: number): Promise<Subdivision | null> {
    const subdivision = await SubdivisionModel.findById(id);
    if (!subdivision?.telegram_chat_id) return null;

    const telegramBot = (await import('../telegram/bot')).default;

    try {
      await telegramBot.getApi().sendMessage(
        subdivision.telegram_chat_id,
        `ℹ️ Бот был отвязан от подразделения "${subdivision.name}".\n\nДо встречи!`,
      );
      logger.info('Sent goodbye message to Telegram chat', { subdivisionId: id, telegramChatId: subdivision.telegram_chat_id });
    } catch (error) {
      logger.warn('Failed to send goodbye message to Telegram', {
        error: error instanceof Error ? error.message : error,
        telegramChatId: subdivision.telegram_chat_id,
      });
    }

    try {
      await telegramBot.getApi().leaveChat(subdivision.telegram_chat_id);
      logger.info('Left Telegram chat successfully', { subdivisionId: id, telegramChatId: subdivision.telegram_chat_id });
    } catch (error) {
      logger.warn('Failed to leave Telegram chat', {
        error: error instanceof Error ? error.message : error,
        telegramChatId: subdivision.telegram_chat_id,
      });
    }

    await SubdivisionModel.update(id, { telegram_chat_id: null });
    logger.info('Telegram chat unlinked from subdivision', { subdivisionId: id });

    return (await SubdivisionModel.findById(id)) ?? null;
  }

  /**
   * Переключить прием каллаутов
   */
  static async toggleCallouts(
    id: number,
    accepting: boolean
  ): Promise<Subdivision | undefined> {
    const subdivision = await SubdivisionModel.toggleCallouts(id, accepting);

    logger.info('Subdivision callouts toggled', {
      subdivisionId: id,
      accepting,
    });

    return subdivision;
  }

  /**
   * Удалить подразделение
   */
  static async deleteSubdivision(id: number): Promise<void> {
    const subdivision = await SubdivisionModel.findById(id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение не найдено',
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    // Запретить удаление дефолтного подразделения
    if (subdivision.is_default) {
      throw new CalloutError(
        'Невозможно удалить дефолтное подразделение фракции',
        'CANNOT_DELETE_DEFAULT',
        400
      );
    }

    const factionId = subdivision.faction_id;

    await SubdivisionModel.delete(id);

    logger.info('Subdivision deleted via service', {
      subdivisionId: id,
      name: subdivision.name,
    });

    // Если это было последнее обычное подразделение - восстановить standalone режим
    const nonDefaultCount = await SubdivisionModel.countActiveNonDefault(factionId);
    if (nonDefaultCount === 0) {
      const { FactionModel } = await import('../database/models/Faction');

      const defaultSubdivision = await SubdivisionModel.findDefaultByFactionId(factionId);
      if (defaultSubdivision) {
        if (!defaultSubdivision.is_active) {
          await SubdivisionModel.update(defaultSubdivision.id, { is_active: true });
          logger.info('Default subdivision reactivated (last regular subdivision deleted)', {
            factionId,
            defaultSubdivisionId: defaultSubdivision.id,
          });
        }
      } else {
        // Дефолтного нет (фракция была с типом) — создать из данных фракции
        const faction = await FactionModel.findById(factionId);
        if (faction) {
          await FactionModel.createDefaultSubdivision(faction);
          logger.info('Default subdivision created after last template subdivision deleted', { factionId });
        }
      }

      // Пометить фракцию как требующую обязательной настройки
      await FactionModel.update(factionId, { standalone_needs_setup: true });
      logger.info('Faction marked as standalone_needs_setup', { factionId });
    }
  }

  /**
   * Деактивировать подразделение (soft delete)
   */
  static async deactivateSubdivision(id: number): Promise<Subdivision | undefined> {
    return await SubdivisionModel.deactivate(id);
  }

  /**
   * Активировать подразделение
   */
  static async activateSubdivision(id: number): Promise<Subdivision | undefined> {
    return await SubdivisionModel.activate(id);
  }

  /**
   * Получить количество подразделений фракции
   */
  static async getSubdivisionCount(factionId: number): Promise<number> {
    return await SubdivisionModel.count(factionId);
  }

  /**
   * Проверить существование подразделения
   */
  static async subdivisionExists(factionId: number, name: string): Promise<boolean> {
    return await SubdivisionModel.exists(factionId, name);
  }
}

export default SubdivisionService;
