import { GuildMember, Guild } from 'discord.js';
import { FactionService } from '../../services/faction.service';
import { ServerModel } from '../../database/models';
import { Faction } from '../../types/database.types';
import logger from '../../utils/logger';

/**
 * Получить фракцию, лидером которой является пользователь
 *
 * @param member - Участник Discord сервера
 * @returns Фракция или null, если пользователь не является лидером
 * @throws Ошибка, если у пользователя роли нескольких фракций
 */
export async function getLeaderFaction(member: GuildMember): Promise<Faction | null> {
  try {
    // Получить сервер из БД
    const server = await ServerModel.findByGuildId(member.guild.id);
    if (!server) {
      logger.warn('Server not found in database', { guildId: member.guild.id });
      return null;
    }

    // Использовать FactionService для определения фракции
    const faction = await FactionService.getLeaderFaction(server.id, member);

    return faction;
  } catch (error) {
    logger.error('Error getting leader faction', {
      userId: member.id,
      guildId: member.guild.id,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Проверить, является ли пользователь лидером конкретной фракции
 *
 * @param member - Участник Discord сервера
 * @param factionId - ID фракции для проверки
 * @returns true, если пользователь является лидером данной фракции
 */
export async function isLeaderOfFaction(
  member: GuildMember,
  factionId: number
): Promise<boolean> {
  try {
    const faction = await getLeaderFaction(member);
    return faction?.id === factionId;
  } catch (error) {
    logger.error('Error checking if user is leader of faction', {
      userId: member.id,
      factionId,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * Проверить, имеет ли пользователь права лидера какой-либо фракции
 *
 * @param member - Участник Discord сервера
 * @returns true, если пользователь является лидером хотя бы одной фракции
 */
export async function isAnyFactionLeader(member: GuildMember): Promise<boolean> {
  try {
    const faction = await getLeaderFaction(member);
    return faction !== null;
  } catch (error) {
    // Если ошибка из-за нескольких фракций - технически пользователь является лидером
    if (error instanceof Error && error.message.includes('нескольких фракций')) {
      return true;
    }
    logger.error('Error checking if user is any faction leader', {
      userId: member.id,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * Получить ID фракции пользователя (если он лидер)
 *
 * @param member - Участник Discord сервера
 * @returns ID фракции или null
 */
export async function getLeaderFactionId(member: GuildMember): Promise<number | null> {
  try {
    const faction = await getLeaderFaction(member);
    return faction?.id || null;
  } catch (error) {
    logger.error('Error getting leader faction ID', {
      userId: member.id,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/**
 * Проверить права доступа к управлению подразделением
 *
 * @param member - Участник Discord сервера
 * @param subdivisionFactionId - ID фракции, которой принадлежит подразделение
 * @returns true, если пользователь может управлять подразделением
 */
export async function canManageSubdivision(
  member: GuildMember,
  subdivisionFactionId: number
): Promise<boolean> {
  return await isLeaderOfFaction(member, subdivisionFactionId);
}

export default {
  getLeaderFaction,
  isLeaderOfFaction,
  isAnyFactionLeader,
  getLeaderFactionId,
  canManageSubdivision,
};
