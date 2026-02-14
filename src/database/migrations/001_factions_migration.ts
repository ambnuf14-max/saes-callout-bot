import database from '../db';
import logger from '../../utils/logger';
import { Server } from '../../types/database.types';

/**
 * Миграция старой системы departments в новую систему factions/subdivisions
 *
 * Стратегия:
 * 1. Для каждого сервера создается дефолтная фракция "Default Faction"
 * 2. Все departments мигрируются в subdivisions с привязкой к дефолтной фракции
 * 3. Обновляются ссылки в callouts: department_id → subdivision_id
 */
export async function migrateDepartmentsToSubdivisions(): Promise<void> {
  const db = database;

  logger.info('Starting departments → subdivisions migration...');

  try {
    // Проверить, есть ли старые departments
    const departmentsCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM departments'
    );

    if (!departmentsCount || departmentsCount.count === 0) {
      logger.info('No departments found, skipping migration');
      return;
    }

    logger.info(`Found ${departmentsCount.count} departments to migrate`);

    // Получить все серверы
    const servers = await db.all<Server>('SELECT * FROM servers');

    for (const server of servers) {
      logger.info(`Migrating server ${server.guild_id}...`);

      // Получить все департаменты этого сервера
      const oldDepartments = await db.all<any>(
        'SELECT * FROM departments WHERE server_id = ?',
        [server.id]
      );

      if (oldDepartments.length === 0) {
        logger.info(`Server ${server.guild_id} has no departments, skipping`);
        continue;
      }

      // Создать дефолтную фракцию для каждого сервера
      const leaderRoleIds = server.leader_role_ids
        ? JSON.parse(server.leader_role_ids)
        : [];

      // Используем первую лидерскую роль как general_leader_role_id
      // И создаем "синтетическую" faction_role_id для миграции
      const generalLeaderRole = leaderRoleIds[0] || `MIGRATION_LEADER_${server.guild_id}`;
      const factionRoleId = `MIGRATION_FACTION_${server.guild_id}`;

      const factionResult = await db.run(
        `INSERT INTO factions (server_id, name, description, general_leader_role_id, faction_role_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          server.id,
          'Default Faction',
          'Автоматически созданная фракция при миграции из старой системы departments',
          generalLeaderRole,
          factionRoleId,
        ]
      );

      const factionId = factionResult.lastID;

      logger.info(`Created default faction for server ${server.guild_id}, faction_id: ${factionId}`);

      // Мигрировать каждый департамент в подразделение
      for (const dept of oldDepartments) {
        const subdivisionResult = await db.run(
          `INSERT INTO subdivisions
           (faction_id, server_id, name, description, discord_role_id, vk_chat_id, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            factionId,
            server.id,
            dept.name,
            dept.description,
            dept.discord_role_id,
            dept.vk_chat_id,
            dept.is_active ? 1 : 0,
          ]
        );

        const subdivisionId = subdivisionResult.lastID;

        logger.info(`Migrated department "${dept.name}" → subdivision ${subdivisionId}`);

        // Обновить все каллауты: department_id → subdivision_id
        const updateResult = await db.run(
          `UPDATE callouts SET subdivision_id = ? WHERE department_id = ?`,
          [subdivisionId, dept.id]
        );

        logger.info(`Updated ${updateResult.changes} callouts for subdivision ${subdivisionId}`);
      }
    }

    // Верификация миграции
    const oldDeptsCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM departments'
    );
    const newSubsCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM subdivisions'
    );

    if (oldDeptsCount?.count !== newSubsCount?.count) {
      throw new Error(
        `Migration verification failed: ${oldDeptsCount?.count} departments ≠ ${newSubsCount?.count} subdivisions`
      );
    }

    logger.info(`Migration completed successfully: ${newSubsCount?.count} departments → subdivisions`);
  } catch (error) {
    logger.error('Failed to migrate departments', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Проверить, была ли выполнена миграция
 */
export async function isMigrationCompleted(): Promise<boolean> {
  try {
    // Проверяем наличие данных в subdivisions
    const subdivisionCount = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM subdivisions'
    );

    return (subdivisionCount?.count ?? 0) > 0;
  } catch (error) {
    return false;
  }
}
