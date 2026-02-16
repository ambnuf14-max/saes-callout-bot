import {
  PendingChange,
  CreatePendingChangeDTO,
  PendingChangeWithDetails,
  CreateSubdivisionChangeData,
  UpdateSubdivisionChangeData,
  DeleteSubdivisionChangeData,
  UpdateEmbedChangeData,
} from '../types/database.types';
import PendingChangeModel from '../database/models/PendingChange';
import SubdivisionModel from '../database/models/Subdivision';
import FactionModel from '../database/models/Faction';
import SubdivisionService from './subdivision.service';
import { CalloutError } from '../utils/error-handler';
import logger from '../utils/logger';
import { Guild } from 'discord.js';
import {
  logAuditEvent,
  AuditEventType,
  ChangeRequestedData,
  ChangeApprovedData,
  ChangeRejectedData,
} from '../discord/utils/audit-logger';
import { getChangeTypeLabel } from '../discord/utils/change-formatter';

/**
 * Сервис для работы с системой одобрения изменений
 */
export class PendingChangeService {
  /**
   * Создать запрос на создание подразделения
   */
  static async requestCreateSubdivision(
    factionId: number,
    serverId: number,
    requestedBy: string,
    data: CreateSubdivisionChangeData,
    guild: Guild
  ): Promise<PendingChange> {
    // Валидация
    if (!data.name || data.name.length < 2 || data.name.length > 50) {
      throw new CalloutError(
        'Название подразделения должно быть от 2 до 50 символов',
        'INVALID_SUBDIVISION_NAME',
        400
      );
    }

    // Проверка уникальности названия
    const existing = await SubdivisionModel.findByName(factionId, data.name);
    if (existing) {
      throw new CalloutError(
        `Подразделение с названием "${data.name}" уже существует в этой фракции`,
        'SUBDIVISION_EXISTS',
        400
      );
    }

    const change = await PendingChangeModel.create({
      server_id: serverId,
      faction_id: factionId,
      change_type: 'create_subdivision',
      requested_by: requestedBy,
      change_data: data,
    });

    // Отправить уведомление в audit log
    const faction = await FactionModel.findById(factionId);
    if (faction) {
      const user = await guild.members.fetch(requestedBy);
      const auditData: ChangeRequestedData = {
        userId: requestedBy,
        userName: user.user.tag,
        changeType: getChangeTypeLabel('create_subdivision'),
        factionName: faction.name,
        details: `Название: ${data.name}`,
        changeId: change.id,
      };
      await logAuditEvent(guild, AuditEventType.SUBDIVISION_CREATE_REQUESTED, auditData);
    }

    return change;
  }

  /**
   * Создать запрос на обновление подразделения
   */
  static async requestUpdateSubdivision(
    subdivisionId: number,
    factionId: number,
    serverId: number,
    requestedBy: string,
    data: UpdateSubdivisionChangeData,
    guild: Guild
  ): Promise<PendingChange> {
    // Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(subdivisionId);
    if (!subdivision) {
      throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
    }

    // Валидация названия если оно меняется
    if (data.name) {
      if (data.name.length < 2 || data.name.length > 50) {
        throw new CalloutError(
          'Название подразделения должно быть от 2 до 50 символов',
          'INVALID_SUBDIVISION_NAME',
          400
        );
      }

      // Проверка уникальности нового названия
      if (data.name !== subdivision.name) {
        const existing = await SubdivisionModel.findByName(factionId, data.name);
        if (existing && existing.id !== subdivisionId) {
          throw new CalloutError(
            `Подразделение с названием "${data.name}" уже существует в этой фракции`,
            'SUBDIVISION_EXISTS',
            400
          );
        }
      }
    }

    const change = await PendingChangeModel.create({
      server_id: serverId,
      faction_id: factionId,
      subdivision_id: subdivisionId,
      change_type: 'update_subdivision',
      requested_by: requestedBy,
      change_data: data,
    });

    // Отправить уведомление в audit log
    const faction = await FactionModel.findById(factionId);
    if (faction) {
      const user = await guild.members.fetch(requestedBy);
      const details = data.name ? `Новое название: ${data.name}` : 'Обновление описания';
      const auditData: ChangeRequestedData = {
        userId: requestedBy,
        userName: user.user.tag,
        changeType: getChangeTypeLabel('update_subdivision'),
        factionName: faction.name,
        details: `Подразделение: ${subdivision.name}\n${details}`,
        changeId: change.id,
      };
      await logAuditEvent(guild, AuditEventType.SUBDIVISION_UPDATE_REQUESTED, auditData);
    }

    return change;
  }

  /**
   * Создать запрос на удаление подразделения
   */
  static async requestDeleteSubdivision(
    subdivisionId: number,
    factionId: number,
    serverId: number,
    requestedBy: string,
    guild: Guild
  ): Promise<PendingChange> {
    const subdivision = await SubdivisionModel.findById(subdivisionId);
    if (!subdivision) {
      throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
    }

    // Запретить удаление дефолтного подразделения
    if (subdivision.is_default) {
      throw new CalloutError(
        'Невозможно удалить дефолтное подразделение фракции',
        'CANNOT_DELETE_DEFAULT',
        400
      );
    }

    const data: DeleteSubdivisionChangeData = {
      subdivision_name: subdivision.name,
    };

    const change = await PendingChangeModel.create({
      server_id: serverId,
      faction_id: factionId,
      subdivision_id: subdivisionId,
      change_type: 'delete_subdivision',
      requested_by: requestedBy,
      change_data: data,
    });

    // Отправить уведомление в audit log
    const faction = await FactionModel.findById(factionId);
    if (faction) {
      const user = await guild.members.fetch(requestedBy);
      const auditData: ChangeRequestedData = {
        userId: requestedBy,
        userName: user.user.tag,
        changeType: getChangeTypeLabel('delete_subdivision'),
        factionName: faction.name,
        details: `Подразделение: ${subdivision.name}`,
        changeId: change.id,
      };
      await logAuditEvent(guild, AuditEventType.SUBDIVISION_DELETE_REQUESTED, auditData);
    }

    return change;
  }

  /**
   * Создать запрос на обновление embed настроек
   */
  static async requestUpdateEmbed(
    subdivisionId: number,
    factionId: number,
    serverId: number,
    requestedBy: string,
    data: UpdateEmbedChangeData,
    guild: Guild
  ): Promise<PendingChange> {
    const subdivision = await SubdivisionModel.findById(subdivisionId);
    if (!subdivision) {
      throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
    }

    // Валидация цвета если он указан
    if (data.embed_color && !this.isValidHexColor(data.embed_color)) {
      throw new CalloutError(
        'Неверный формат цвета. Используйте hex формат (например, #FF0000)',
        'INVALID_COLOR_FORMAT',
        400
      );
    }

    const change = await PendingChangeModel.create({
      server_id: serverId,
      faction_id: factionId,
      subdivision_id: subdivisionId,
      change_type: 'update_embed',
      requested_by: requestedBy,
      change_data: data,
    });

    // Отправить уведомление в audit log
    const faction = await FactionModel.findById(factionId);
    if (faction) {
      const user = await guild.members.fetch(requestedBy);
      const auditData: ChangeRequestedData = {
        userId: requestedBy,
        userName: user.user.tag,
        changeType: getChangeTypeLabel('update_embed'),
        factionName: faction.name,
        details: `Подразделение: ${subdivision.name}\nНастройка embed сообщения`,
        changeId: change.id,
      };
      await logAuditEvent(guild, AuditEventType.EMBED_UPDATE_REQUESTED, auditData);
    }

    return change;
  }

  /**
   * Одобрить pending запрос и применить изменение
   */
  static async approveChange(changeId: number, reviewedBy: string, guild: Guild): Promise<void> {
    const change = await PendingChangeModel.findById(changeId);
    if (!change) {
      throw new CalloutError('Запрос не найден', 'CHANGE_NOT_FOUND', 404);
    }

    if (change.status !== 'pending') {
      throw new CalloutError('Запрос уже обработан', 'CHANGE_ALREADY_PROCESSED', 400);
    }

    // Получить детали для audit log
    const faction = await FactionModel.findById(change.faction_id);
    const changeTypeLabel = getChangeTypeLabel(change.change_type);
    const details = await this.getChangeDetails(change);

    // Применить изменение в зависимости от типа
    try {
      switch (change.change_type) {
        case 'create_subdivision':
          await this.applyCreateSubdivision(change);
          break;

        case 'update_subdivision':
          await this.applyUpdateSubdivision(change);
          break;

        case 'delete_subdivision':
          await this.applyDeleteSubdivision(change);
          break;

        case 'update_embed':
          await this.applyUpdateEmbed(change);
          break;

        default:
          throw new Error(`Unknown change type: ${change.change_type}`);
      }
    } catch (error) {
      logger.error('Failed to apply pending change', {
        changeId,
        changeType: change.change_type,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }

    // Пометить как одобренное
    await PendingChangeModel.approve(changeId, reviewedBy);

    logger.info('Pending change approved and applied', {
      changeId,
      changeType: change.change_type,
      reviewedBy,
    });

    // Отправить audit log уведомление
    if (faction) {
      try {
        const reviewer = await guild.members.fetch(reviewedBy);
        const requester = await guild.members.fetch(change.requested_by);
        const auditData: ChangeApprovedData = {
          userId: change.requested_by,
          userName: requester.user.tag,
          changeType: changeTypeLabel,
          factionName: faction.name,
          details,
          reviewerName: reviewer.user.tag,
        };
        await logAuditEvent(guild, AuditEventType.CHANGE_APPROVED, auditData);
      } catch (error) {
        logger.error('Failed to send approval audit log', {
          changeId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  /**
   * Отклонить pending запрос
   */
  static async rejectChange(
    changeId: number,
    reviewedBy: string,
    reason?: string,
    guild?: Guild
  ): Promise<void> {
    const change = await PendingChangeModel.findById(changeId);
    if (!change) {
      throw new CalloutError('Запрос не найден', 'CHANGE_NOT_FOUND', 404);
    }

    if (change.status !== 'pending') {
      throw new CalloutError('Запрос уже обработан', 'CHANGE_ALREADY_PROCESSED', 400);
    }

    await PendingChangeModel.reject(changeId, reviewedBy, reason);

    logger.info('Pending change rejected', {
      changeId,
      changeType: change.change_type,
      reviewedBy,
      reason,
    });

    // Отправить audit log уведомление
    if (guild) {
      try {
        const faction = await FactionModel.findById(change.faction_id);
        if (faction) {
          const reviewer = await guild.members.fetch(reviewedBy);
          const requester = await guild.members.fetch(change.requested_by);
          const changeTypeLabel = getChangeTypeLabel(change.change_type);
          const details = await this.getChangeDetails(change);
          const auditData: ChangeRejectedData = {
            userId: change.requested_by,
            userName: requester.user.tag,
            changeType: changeTypeLabel,
            factionName: faction.name,
            details,
            reviewerName: reviewer.user.tag,
            reason: reason || 'Не указана',
          };
          await logAuditEvent(guild, AuditEventType.CHANGE_REJECTED, auditData);
        }
      } catch (error) {
        logger.error('Failed to send rejection audit log', {
          changeId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  /**
   * Отменить pending запрос (автором)
   */
  static async cancelChange(changeId: number, requesterId: string): Promise<void> {
    const change = await PendingChangeModel.findById(changeId);
    if (!change) {
      throw new CalloutError('Запрос не найден', 'CHANGE_NOT_FOUND', 404);
    }

    if (change.status !== 'pending') {
      throw new CalloutError('Запрос уже обработан', 'CHANGE_ALREADY_PROCESSED', 400);
    }

    // Проверить, что отменяет автор запроса
    if (change.requested_by !== requesterId) {
      throw new CalloutError(
        'Вы можете отменить только свои запросы',
        'NOT_REQUEST_AUTHOR',
        403
      );
    }

    await PendingChangeModel.cancel(changeId);

    logger.info('Pending change cancelled', {
      changeId,
      changeType: change.change_type,
      cancelledBy: requesterId,
    });
  }

  /**
   * Получить pending запросы фракции
   */
  static async getPendingChangesForFaction(
    factionId: number
  ): Promise<PendingChangeWithDetails[]> {
    const changes = await PendingChangeModel.findByFactionId(factionId, 'pending');

    // Преобразовать в PendingChangeWithDetails
    const withDetails: PendingChangeWithDetails[] = [];
    for (const change of changes) {
      const detailed = await PendingChangeModel.findWithDetails(change.id);
      if (detailed) {
        withDetails.push(detailed);
      }
    }

    return withDetails;
  }

  /**
   * Получить pending запросы сервера
   */
  static async getPendingChangesForServer(serverId: number): Promise<PendingChangeWithDetails[]> {
    return await PendingChangeModel.findPendingWithDetailsByServerId(serverId);
  }

  /**
   * Получить pending запросы лидера
   */
  static async getPendingChangesForLeader(
    requesterId: string
  ): Promise<PendingChangeWithDetails[]> {
    const changes = await PendingChangeModel.findByRequesterId(requesterId, 'pending');

    const withDetails: PendingChangeWithDetails[] = [];
    for (const change of changes) {
      const detailed = await PendingChangeModel.findWithDetails(change.id);
      if (detailed) {
        withDetails.push(detailed);
      }
    }

    return withDetails;
  }

  /**
   * Проверить наличие pending изменений для фракции
   */
  static async hasPendingChanges(factionId: number): Promise<boolean> {
    const changes = await PendingChangeModel.findByFactionId(factionId, 'pending');
    return changes.length > 0;
  }

  /**
   * Получить количество pending запросов сервера
   */
  static async getPendingCount(serverId: number): Promise<number> {
    return await PendingChangeModel.countPending(serverId);
  }

  /**
   * Получить детали изменения для audit log
   */
  private static async getChangeDetails(change: PendingChange): Promise<string> {
    switch (change.change_type) {
      case 'create_subdivision': {
        const data = PendingChangeModel.parseChangeData<CreateSubdivisionChangeData>(change);
        return `Название: ${data.name}`;
      }

      case 'update_subdivision': {
        const data = PendingChangeModel.parseChangeData<UpdateSubdivisionChangeData>(change);
        const subdivision = change.subdivision_id
          ? await SubdivisionModel.findById(change.subdivision_id)
          : null;
        const details = data.name ? `Новое название: ${data.name}` : 'Обновление описания';
        return subdivision ? `Подразделение: ${subdivision.name}\n${details}` : details;
      }

      case 'delete_subdivision': {
        const data = PendingChangeModel.parseChangeData<DeleteSubdivisionChangeData>(change);
        return `Подразделение: ${data.subdivision_name}`;
      }

      case 'update_embed': {
        const subdivision = change.subdivision_id
          ? await SubdivisionModel.findById(change.subdivision_id)
          : null;
        return subdivision
          ? `Подразделение: ${subdivision.name}\nНастройка embed сообщения`
          : 'Настройка embed сообщения';
      }

      default:
        return 'Детали недоступны';
    }
  }

  // ========== PRIVATE METHODS - Apply Changes ==========

  /**
   * Применить создание подразделения
   */
  private static async applyCreateSubdivision(change: PendingChange): Promise<void> {
    const data = PendingChangeModel.parseChangeData<CreateSubdivisionChangeData>(change);

    await SubdivisionService.createSubdivision({
      faction_id: change.faction_id,
      server_id: change.server_id,
      name: data.name,
      description: data.description,
    });

    logger.debug('Applied create_subdivision change', {
      changeId: change.id,
      subdivisionName: data.name,
    });
  }

  /**
   * Применить обновление подразделения
   */
  private static async applyUpdateSubdivision(change: PendingChange): Promise<void> {
    if (!change.subdivision_id) {
      throw new Error('subdivision_id is required for update_subdivision change');
    }

    // Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(change.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение было удалено, изменение не может быть применено',
        'SUBDIVISION_DELETED',
        400
      );
    }

    const data = PendingChangeModel.parseChangeData<UpdateSubdivisionChangeData>(change);

    await SubdivisionService.updateSubdivision(change.subdivision_id, data);

    logger.debug('Applied update_subdivision change', {
      changeId: change.id,
      subdivisionId: change.subdivision_id,
    });
  }

  /**
   * Применить удаление подразделения
   */
  private static async applyDeleteSubdivision(change: PendingChange): Promise<void> {
    if (!change.subdivision_id) {
      throw new Error('subdivision_id is required for delete_subdivision change');
    }

    // Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(change.subdivision_id);
    if (!subdivision) {
      // Подразделение уже удалено, ничего не делаем
      logger.warn('Subdivision already deleted, skipping delete change', {
        changeId: change.id,
        subdivisionId: change.subdivision_id,
      });
      return;
    }

    await SubdivisionService.deleteSubdivision(change.subdivision_id);

    logger.debug('Applied delete_subdivision change', {
      changeId: change.id,
      subdivisionId: change.subdivision_id,
    });
  }

  /**
   * Применить обновление embed настроек
   */
  private static async applyUpdateEmbed(change: PendingChange): Promise<void> {
    if (!change.subdivision_id) {
      throw new Error('subdivision_id is required for update_embed change');
    }

    // Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(change.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        'Подразделение было удалено, изменение не может быть применено',
        'SUBDIVISION_DELETED',
        400
      );
    }

    const data = PendingChangeModel.parseChangeData<UpdateEmbedChangeData>(change);

    await SubdivisionService.updateSubdivision(change.subdivision_id, data);

    logger.debug('Applied update_embed change', {
      changeId: change.id,
      subdivisionId: change.subdivision_id,
    });
  }

  /**
   * Валидация hex цвета
   */
  private static isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }
}

export default PendingChangeService;
