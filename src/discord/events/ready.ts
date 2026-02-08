import { Client } from 'discord.js';
import logger from '../../utils/logger';

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

  // Установка статуса бота
  client.user.setPresence({
    activities: [{ name: '🚨 Система каллаутов' }],
    status: 'online',
  });
}
