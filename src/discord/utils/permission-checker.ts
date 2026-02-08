import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { ServerModel } from '../../database/models';
import logger from '../../utils/logger';

/**
 * Утилиты для проверки прав доступа
 */

/**
 * Проверить, является ли пользователь администратором
 */
export function isAdministrator(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Проверить, является ли пользователь лидером
 */
export async function isLeader(member: GuildMember): Promise<boolean> {
  // Администраторы всегда лидеры
  if (isAdministrator(member)) {
    return true;
  }

  try {
    const server = await ServerModel.findByGuildId(member.guild.id);
    if (!server) {
      return false;
    }

    const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
    if (leaderRoleIds.length === 0) {
      // Если лидерские роли не настроены, только администраторы
      return false;
    }

    // Проверить, есть ли у пользователя хотя бы одна лидерская роль
    return member.roles.cache.some((role) => leaderRoleIds.includes(role.id));
  } catch (error) {
    logger.error('Error checking leader status', {
      error: error instanceof Error ? error.message : error,
      userId: member.id,
      guildId: member.guild.id,
    });
    return false;
  }
}

/**
 * Проверить, имеет ли пользователь определенную роль
 */
export function hasRole(member: GuildMember, roleId: string): boolean {
  return member.roles.cache.has(roleId);
}

/**
 * Проверить, имеет ли пользователь хотя бы одну из ролей
 */
export function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  return roleIds.some((roleId) => hasRole(member, roleId));
}

/**
 * Получить ID ролей пользователя
 */
export function getUserRoleIds(member: GuildMember): string[] {
  return member.roles.cache.map((role) => role.id);
}

/**
 * Проверить, имеет ли пользователь право управлять каналами
 */
export function canManageChannels(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/**
 * Проверить, имеет ли пользователь право управлять ролями
 */
export function canManageRoles(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageRoles);
}
