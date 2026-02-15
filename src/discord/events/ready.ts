import { Client } from 'discord.js';
import logger from '../../utils/logger';
import PresenceManager from '../utils/presence-manager';

/**
 * Обработчик события ready
 */
export default function readyHandler(client: Client) {
  if (!client.user) {
    logger.error('Client user is null');
    return;
  }

  logger.info('Discord bot is ready', {
    username: client.user.tag,
    id: client.user.id,
    guilds: client.guilds.cache.size,
  });

  // Инициализировать менеджер статуса бота
  PresenceManager.initialize(client);
}
