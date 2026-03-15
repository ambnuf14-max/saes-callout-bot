import { ServerModel } from '../../database/models';
import config from '../../config/config';

/**
 * Проверить, авторизован ли сервер для работы с ботом.
 * Авторизованы: главный сервер и привязанные faction-серверы.
 */
export async function isAuthorizedGuild(guildId: string): Promise<boolean> {
  if (guildId === config.discord.mainGuildId) return true;

  const server = await ServerModel.findByGuildId(guildId);
  return server?.server_type === 'faction';
}
