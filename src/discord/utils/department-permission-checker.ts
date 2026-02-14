import { GuildMember, Guild } from 'discord.js';
import { DepartmentService } from '../../services/department.service';
import { ServerModel } from '../../database/models';
import { Department } from '../../types/database.types';
import logger from '../../utils/logger';

/**
 * Получить департамент, лидером которой является пользователь
 *
 * @param member - Участник Discord сервера
 * @returns Фракция или null, если пользователь не является лидером
 * @throws Ошибка, если у пользователя роли нескольких департаментов
 */
export async function getLeaderDepartment(member: GuildMember): Promise<Department | null> {
  try {
    // Получить сервер из БД
    const server = await ServerModel.findByGuildId(member.guild.id);
    if (!server) {
      logger.warn('Server not found in database', { guildId: member.guild.id });
      return null;
    }

    // Использовать DepartmentService для определения департамента
    const department = await DepartmentService.getLeaderDepartment(server.id, member);

    return department;
  } catch (error) {
    logger.error('Error getting leader department', {
      userId: member.id,
      guildId: member.guild.id,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Проверить, является ли пользователь лидером конкретной департамента
 *
 * @param member - Участник Discord сервера
 * @param departmentId - ID департамента для проверки
 * @returns true, если пользователь является лидером данной департамента
 */
export async function isLeaderOfDepartment(
  member: GuildMember,
  departmentId: number
): Promise<boolean> {
  try {
    const department = await getLeaderDepartment(member);
    return department?.id === departmentId;
  } catch (error) {
    logger.error('Error checking if user is leader of department', {
      userId: member.id,
      departmentId,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * Проверить, имеет ли пользователь права лидера какой-либо департамента
 *
 * @param member - Участник Discord сервера
 * @returns true, если пользователь является лидером хотя бы одной департамента
 */
export async function isAnyDepartmentLeader(member: GuildMember): Promise<boolean> {
  try {
    const department = await getLeaderDepartment(member);
    return department !== null;
  } catch (error) {
    // Если ошибка из-за нескольких департаментов - технически пользователь является лидером
    if (error instanceof Error && error.message.includes('нескольких департаментов')) {
      return true;
    }
    logger.error('Error checking if user is any department leader', {
      userId: member.id,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * Получить ID департамента пользователя (если он лидер)
 *
 * @param member - Участник Discord сервера
 * @returns ID департамента или null
 */
export async function getLeaderDepartmentId(member: GuildMember): Promise<number | null> {
  try {
    const department = await getLeaderDepartment(member);
    return department?.id || null;
  } catch (error) {
    logger.error('Error getting leader department ID', {
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
 * @param subdivisionDepartmentId - ID департамента, которой принадлежит подразделение
 * @returns true, если пользователь может управлять подразделением
 */
export async function canManageSubdivision(
  member: GuildMember,
  subdivisionDepartmentId: number
): Promise<boolean> {
  return await isLeaderOfDepartment(member, subdivisionDepartmentId);
}

export default {
  getLeaderDepartment,
  isLeaderOfDepartment,
  isAnyDepartmentLeader,
  getLeaderDepartmentId,
  canManageSubdivision,
};
