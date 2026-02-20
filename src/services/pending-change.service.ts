import {
  PendingChange,
  CreatePendingChangeDTO,
  PendingChangeWithDetails,
  CreateSubdivisionChangeData,
  UpdateSubdivisionChangeData,
  DeleteSubdivisionChangeData,
  UpdateEmbedChangeData,
  UpdateFactionChangeData,
} from '../types/database.types';
import PendingChangeModel from '../database/models/PendingChange';
import SubdivisionModel from '../database/models/Subdivision';
import FactionModel from '../database/models/Faction';
import ServerModel from '../database/models/Server';
import SubdivisionService from './subdivision.service';
import { CalloutError } from '../utils/error-handler';
import logger from '../utils/logger';
import { Guild } from 'discord.js';
import discordBot from '../discord/bot';
import {
  logAuditEvent,
  logPendingChangeWithButtons,
  editPendingChangeAuditMessage,
  AuditEventType,
  ChangeApprovedData,
  ChangeRejectedData,
  ChangeCancelledData,
  resolveLogoThumbnailUrl,
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

    // Отправить уведомление в audit log с кнопками Одобрить/Отклонить
    try {
      const changeWithDetails = await PendingChangeModel.findWithDetails(change.id);
      if (changeWithDetails) {
        await logPendingChangeWithButtons(guild, changeWithDetails);
      }
    } catch (error) {
      logger.warn('Failed to send audit log for create_subdivision', { error });
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

    const changeDataWithBefore = {
      ...data,
      _before: {
        name: subdivision.name,
        description: subdivision.description,
        short_description: subdivision.short_description,
        logo_url: subdivision.logo_url,
        discord_role_id: subdivision.discord_role_id,
      },
    };

    const change = await PendingChangeModel.create({
      server_id: serverId,
      faction_id: factionId,
      subdivision_id: subdivisionId,
      change_type: 'update_subdivision',
      requested_by: requestedBy,
      change_data: changeDataWithBefore,
    });

    // Отправить уведомление в audit log с кнопками Одобрить/Отклонить
    try {
      const changeWithDetails = await PendingChangeModel.findWithDetails(change.id);
      if (changeWithDetails) {
        await logPendingChangeWithButtons(guild, changeWithDetails);
      }
    } catch (error) {
      logger.warn('Failed to send audit log for update_subdivision', { error });
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

    // Отправить уведомление в audit log с кнопками Одобрить/Отклонить
    try {
      const changeWithDetails = await PendingChangeModel.findWithDetails(change.id);
      if (changeWithDetails) {
        await logPendingChangeWithButtons(guild, changeWithDetails);
      }
    } catch (error) {
      logger.warn('Failed to send audit log for delete_subdivision', { error });
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

    const changeDataWithBefore = {
      ...data,
      _before: {
        name: subdivision.name,
        embed_title: subdivision.embed_title,
        embed_description: subdivision.embed_description,
        embed_color: subdivision.embed_color,
        embed_image_url: subdivision.embed_image_url,
        embed_thumbnail_url: subdivision.embed_thumbnail_url,
        embed_author_name: subdivision.embed_author_name,
        embed_footer_text: subdivision.embed_footer_text,
        short_description: subdivision.short_description,
        logo_url: subdivision.logo_url,
      },
    };

    const change = await PendingChangeModel.create({
      server_id: serverId,
      faction_id: factionId,
      subdivision_id: subdivisionId,
      change_type: 'update_embed',
      requested_by: requestedBy,
      change_data: changeDataWithBefore,
    });

    // Отправить уведомление в audit log с кнопками Одобрить/Отклонить
    try {
      const changeWithDetails = await PendingChangeModel.findWithDetails(change.id);
      if (changeWithDetails) {
        await logPendingChangeWithButtons(guild, changeWithDetails);
      }
    } catch (error) {
      logger.warn('Failed to send audit log for update_embed', { error });
    }

    return change;
  }

  /**
   * Создать запрос на обновление фракции (название + эмодзи)
   */
  static async requestUpdateFaction(
    factionId: number,
    serverId: number,
    requestedBy: string,
    data: UpdateFactionChangeData,
    guild: Guild
  ): Promise<PendingChange> {
    const faction = await FactionModel.findById(factionId);
    if (!faction) {
      throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
    }

    if (data.name !== undefined && (data.name.length < 2 || data.name.length > 50)) {
      throw new CalloutError(
        'Название фракции должно быть от 2 до 50 символов',
        'INVALID_FACTION_NAME',
        400
      );
    }

    const changeDataWithBefore = {
      ...data,
      _before: {
        name: faction.name,
        logo_url: faction.logo_url,
      },
    };

    const change = await PendingChangeModel.create({
      server_id: serverId,
      faction_id: factionId,
      change_type: 'update_faction',
      requested_by: requestedBy,
      change_data: changeDataWithBefore,
    });

    try {
      const changeWithDetails = await PendingChangeModel.findWithDetails(change.id);
      if (changeWithDetails) {
        await logPendingChangeWithButtons(guild, changeWithDetails);
      }
    } catch (error) {
      logger.warn('Failed to send audit log for update_faction', { error });
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

    // Атомарно помечаем как одобренное ДО применения изменения.
    // approve() использует WHERE status = 'pending', поэтому только один
    // вызов из двух одновременных пройдёт — защита от race condition.
    const claimed = await PendingChangeModel.approve(changeId, reviewedBy);
    if (!claimed) {
      throw new CalloutError('Запрос уже обработан', 'CHANGE_ALREADY_PROCESSED', 400);
    }

    // Получить детали ДО применения (после delete_subdivision подразделение исчезнет из JOIN)
    const changeWithDetails = await PendingChangeModel.findWithDetails(changeId);
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

        case 'update_faction':
          await this.applyUpdateFaction(change);
          break;

        default:
          throw new Error(`Unknown change type: ${change.change_type}`);
      }
    } catch (error) {
      logger.error('Failed to apply pending change (change is marked approved in DB)', {
        changeId,
        changeType: change.change_type,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }

    logger.info('Pending change approved and applied', {
      changeId,
      changeType: change.change_type,
      reviewedBy,
    });

    // Редактировать исходное сообщение в audit log (убрать кнопки, показать итог)
    if (changeWithDetails) {
      try {
        await editPendingChangeAuditMessage(guild, changeWithDetails, 'approved', reviewedBy);
      } catch (error) {
        logger.warn('Failed to edit pending change audit message on approve', {
          changeId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

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
          reviewerId: reviewedBy,
          thumbnailUrl: resolveLogoThumbnailUrl(faction.logo_url),
        };
        await logAuditEvent(guild, AuditEventType.CHANGE_APPROVED, auditData);
      } catch (error) {
        logger.error('Failed to send approval audit log', {
          changeId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // DM уведомление автору запроса
    try {
      const requester = await discordBot.client.users.fetch(change.requested_by);
      await requester.send(
        `✅ **Твой запрос одобрен!**\n` +
        `**Тип:** ${changeTypeLabel}\n` +
        (faction ? `**Фракция:** ${faction.name}\n` : '') +
        `**Одобрил:** <@${reviewedBy}>`
      );
    } catch {
      // DM не критичны (пользователь мог закрыть их)
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

    // Редактировать исходное сообщение в audit log
    if (guild) {
      try {
        const changeWithDetails = await PendingChangeModel.findWithDetails(changeId);
        if (changeWithDetails) {
          await editPendingChangeAuditMessage(guild, changeWithDetails, 'rejected', reviewedBy, reason);
        }
      } catch (error) {
        logger.warn('Failed to edit pending change audit message on reject', {
          changeId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

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
            reviewerId: reviewedBy,
            reason: reason || 'Не указана',
            thumbnailUrl: resolveLogoThumbnailUrl(faction.logo_url),
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

    // DM уведомление автору запроса
    try {
      const faction = await FactionModel.findById(change.faction_id);
      const changeTypeLabel = getChangeTypeLabel(change.change_type);
      const requester = await discordBot.client.users.fetch(change.requested_by);
      await requester.send(
        `❌ **Твой запрос отклонён**\n` +
        `**Тип:** ${changeTypeLabel}\n` +
        (faction ? `**Фракция:** ${faction.name}\n` : '') +
        `**Причина:** ${reason || 'Не указана'}`
      );
    } catch {
      // DM не критичны
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

    // Получить реальное имя пользователя и guild
    let requesterName = requesterId;
    try {
      const user = await discordBot.client.users.fetch(requesterId);
      requesterName = user.displayName || user.username;
    } catch {
      // не критично
    }

    const server = await ServerModel.findById(change.server_id);
    const guild = server ? discordBot.client.guilds.cache.get(server.guild_id) : undefined;

    // Редактировать исходное сообщение в audit log
    if (guild) {
      try {
        const changeWithDetails = await PendingChangeModel.findWithDetails(changeId);
        if (changeWithDetails) {
          await editPendingChangeAuditMessage(guild, changeWithDetails, 'cancelled');
        }
      } catch (error) {
        logger.warn('Failed to edit pending change audit message on cancel', {
          changeId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // Логировать отмену в audit log
    try {
      if (guild) {
        const faction = await FactionModel.findById(change.faction_id);
        const auditData: ChangeCancelledData = {
          userId: requesterId,
          userName: requesterName,
          changeType: getChangeTypeLabel(change.change_type),
          factionName: faction?.name || 'Неизвестно',
          details: `Запрос #${changeId} отменён автором`,
          thumbnailUrl: resolveLogoThumbnailUrl(faction?.logo_url),
        };
        await logAuditEvent(guild, AuditEventType.CHANGE_CANCELLED, auditData);
      }
    } catch (auditError) {
      logger.error('Failed to log change cancellation audit event', {
        error: auditError instanceof Error ? auditError.message : auditError,
        changeId,
      });
    }
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

      case 'update_faction': {
        const data = PendingChangeModel.parseChangeData<UpdateFactionChangeData>(change);
        const faction = await FactionModel.findById(change.faction_id);
        const details = data.name ? `Новое название: ${data.name}` : 'Обновление эмодзи';
        return faction ? `Фракция: ${faction.name}\n${details}` : details;
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

    // Конвертировать null в undefined (UpdateSubdivisionDTO не принимает null)
    await SubdivisionService.updateSubdivision(change.subdivision_id, {
      name: data.name,
      description: data.description,
      short_description: data.short_description ?? undefined,
      logo_url: data.logo_url ?? undefined,
      discord_role_id: data.discord_role_id ?? undefined,
    });

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

    // Конвертировать null в undefined для SubdivisionDTO, передать все поля включая настройки
    await SubdivisionService.updateSubdivision(change.subdivision_id, {
      ...data,
      name: data.name ?? undefined,
      short_description: data.short_description ?? undefined,
      logo_url: data.logo_url ?? undefined,
      discord_role_id: data.discord_role_id ?? undefined,
    });

    logger.debug('Applied update_embed change', {
      changeId: change.id,
      subdivisionId: change.subdivision_id,
    });
  }

  /**
   * Применить обновление фракции (название + эмодзи)
   */
  private static async applyUpdateFaction(change: PendingChange): Promise<void> {
    const data = PendingChangeModel.parseChangeData<UpdateFactionChangeData>(change);

    await FactionModel.update(change.faction_id, {
      name: data.name,
      logo_url: data.logo_url,
    });

    logger.debug('Applied update_faction change', {
      changeId: change.id,
      factionId: change.faction_id,
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
