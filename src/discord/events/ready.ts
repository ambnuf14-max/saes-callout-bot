import { Client, TextChannel } from 'discord.js';
import logger from '../../utils/logger';
import PresenceManager from '../utils/presence-manager';
import { ServerModel } from '../../database/models';
import { createCalloutPanel } from '../interactions/setup-mode-select';

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

  // Проверить наличие панели каллаута на всех серверах
  ensureCalloutPanels(client).catch(err =>
    logger.error('Error in ensureCalloutPanels', { error: err instanceof Error ? err.message : err })
  );
}

/**
 * Для каждого настроенного сервера проверяет, существует ли сообщение с кнопкой каллаута.
 * Если сообщение удалено — создаёт новое и обновляет ID в БД.
 */
async function ensureCalloutPanels(client: Client): Promise<void> {
  const servers = await ServerModel.findAll();

  for (const server of servers) {
    if (!server.callout_channel_id) continue;

    try {
      const guild = client.guilds.cache.get(server.guild_id);
      if (!guild) continue;

      const channel = await guild.channels.fetch(server.callout_channel_id).catch(() => null);
      if (!channel?.isTextBased()) continue;

      // Попытаться получить существующее сообщение
      if (server.callout_message_id) {
        const existing = await (channel as TextChannel).messages
          .fetch(server.callout_message_id)
          .catch(() => null);

        if (existing) continue; // Сообщение на месте — всё хорошо
      }

      // Сообщения нет — создаём новое
      logger.info('Callout panel message missing, recreating', {
        guildId: server.guild_id,
        channelId: server.callout_channel_id,
      });

      const message = await createCalloutPanel(channel as TextChannel);
      await ServerModel.update(server.id, { callout_message_id: message.id });

      logger.info('Callout panel recreated', {
        guildId: server.guild_id,
        messageId: message.id,
      });
    } catch (error) {
      logger.error('Failed to ensure callout panel', {
        guildId: server.guild_id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}
