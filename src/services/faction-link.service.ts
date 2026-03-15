import { FactionLinkTokenModel } from '../database/models/FactionLinkToken';
import { ServerModel } from '../database/models/Server';
import { FactionModel } from '../database/models/Faction';
import { FactionLinkToken, Faction, Server } from '../types/database.types';
import logger from '../utils/logger';

export interface LinkFactionServerResult {
  mainServer: Server;
  faction: Faction;
  factionServer: Server;
  localFaction: Faction;
}

/**
 * Сервис для управления привязкой faction-серверов к фракциям главного сервера
 */
export class FactionLinkService {
  static readonly MAX_ACTIVE_TOKENS_PER_FACTION = 3;

  /**
   * Генерировать токен привязки для фракции.
   * Вызывается лидером фракции на главном сервере.
   */
  static async generateLinkToken(data: {
    main_server_id: number;
    faction_id: number;
    created_by: string;
  }): Promise<FactionLinkToken> {
    const activeCount = await FactionLinkTokenModel.countActiveForFaction(data.faction_id);
    if (activeCount >= this.MAX_ACTIVE_TOKENS_PER_FACTION) {
      throw new Error(
        `Достигнут лимит активных токенов (${this.MAX_ACTIVE_TOKENS_PER_FACTION}). Дождитесь истечения предыдущих.`
      );
    }

    const token = await FactionLinkTokenModel.create({
      main_server_id: data.main_server_id,
      faction_id: data.faction_id,
      created_by: data.created_by,
    });

    logger.info('Faction link token generated', {
      tokenId: token.id,
      factionId: data.faction_id,
      mainServerId: data.main_server_id,
      createdBy: data.created_by,
    });

    return token;
  }

  /**
   * Привязать Discord-сервер к фракции по токену.
   * Вызывается администратором faction-сервера командой /link <TOKEN>.
   */
  static async linkFactionServer(
    tokenString: string,
    guildId: string
  ): Promise<LinkFactionServerResult> {
    // 1. Найти и валидировать токен
    const token = await FactionLinkTokenModel.findByToken(tokenString.toUpperCase());
    if (!token) {
      throw new Error('Токен не найден. Убедитесь, что токен введён правильно.');
    }

    const validation = FactionLinkTokenModel.getValidationInfo(token);
    if (!validation.valid) {
      throw new Error(validation.reason || 'Токен недействителен.');
    }

    // 2. Проверить, не привязан ли уже этот сервер (до захвата токена, чтобы не сжечь его зря)
    const existingServer = await ServerModel.findByGuildId(guildId);
    if (existingServer && existingServer.server_type === 'faction') {
      throw new Error('Этот сервер уже привязан к фракции. Отвяжите его перед повторной привязкой.');
    }

    // Атомарно захватить токен — защита от race condition при одновременных /link
    const claimed = await FactionLinkTokenModel.claimToken(token.id, guildId);
    if (!claimed) {
      throw new Error('Токен только что был использован или истёк. Запросите новый токен у лидера фракции.');
    }

    // 3. Найти главный сервер и фракцию
    const mainServer = await ServerModel.findById(token.main_server_id);
    if (!mainServer) {
      throw new Error('Главный сервер не найден. Токен недействителен.');
    }

    const faction = await FactionModel.findById(token.faction_id);
    if (!faction) {
      throw new Error('Фракция не найдена. Возможно, она была удалена.');
    }

    // 4. Создать или обновить запись servers для этого guild
    let factionServer: Server;
    if (existingServer) {
      // Сервер уже есть в БД (бот ранее был добавлен) — обновляем
      const updated = await ServerModel.update(existingServer.id, {
        server_type: 'faction',
        linked_faction_id: token.faction_id,
        linked_main_server_id: token.main_server_id,
        faction_server_needs_setup: 1,
      });
      if (!updated) {
        throw new Error('Не удалось обновить запись сервера.');
      }
      factionServer = updated;
    } else {
      // Первый раз — создаём
      const created = await ServerModel.create({ guild_id: guildId });
      const updated = await ServerModel.update(created.id, {
        server_type: 'faction',
        linked_faction_id: token.faction_id,
        linked_main_server_id: token.main_server_id,
        faction_server_needs_setup: 1,
      });
      if (!updated) {
        throw new Error('Не удалось создать запись сервера.');
      }
      factionServer = updated;
    }

    // 5. Найти или создать локальную фракцию на faction-сервере
    // Если фракция уже существует (повторная привязка) — обновляем её данные, не создаём дубликат.
    // Используем stub-роли "0" — лидер настроит их позже через панель настроек.
    const existingLocalFactions = await FactionModel.findByServerId(factionServer.id, false);
    let localFaction = existingLocalFactions[0];

    if (localFaction) {
      // Обновить имя и данные фракции из главного сервера
      localFaction = (await FactionModel.update(localFaction.id, {
        name: faction.name,
        description: faction.description || undefined,
        logo_url: faction.logo_url || undefined,
      }))!;
      logger.info('Reused existing local faction on re-link', {
        localFactionId: localFaction.id,
        factionServerId: factionServer.id,
      });
    } else {
      // Создаём без дефолтного подразделения — admin сам создаст нужные подразделения
      localFaction = await FactionModel.createForFactionServer({
        server_id: factionServer.id,
        name: faction.name,
        description: faction.description || undefined,
        logo_url: faction.logo_url || undefined,
        general_leader_role_id: '0',
        faction_role_id: '0',
        allow_create_subdivisions: true,
      });
    }

    logger.info('Faction server linked successfully', {
      factionServerId: factionServer.id,
      guildId,
      mainServerId: mainServer.id,
      factionId: faction.id,
      localFactionId: localFaction.id,
    });

    return { mainServer, faction, factionServer, localFaction };
  }

  /**
   * Отвязать faction-сервер от фракции (административное действие).
   * Данные сохраняются, сервер становится обычным.
   */
  static async unlinkFactionServer(factionServerId: number): Promise<void> {
    await ServerModel.update(factionServerId, {
      server_type: 'main',
      linked_faction_id: null,
      linked_main_server_id: null,
      faction_server_needs_setup: 1,
    });

    logger.info('Faction server unlinked', { factionServerId });
  }

  /**
   * Очистить просроченные токены
   */
  static async cleanupExpiredTokens(): Promise<number> {
    return await FactionLinkTokenModel.cleanupExpired();
  }

  /**
   * Очистить использованные токены старше указанного времени
   */
  static async cleanupUsedTokens(olderThanHours: number = 24): Promise<number> {
    return await FactionLinkTokenModel.cleanupUsed(olderThanHours);
  }
}
