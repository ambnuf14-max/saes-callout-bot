import { Client, TextChannel } from 'discord.js';
import logger from '../../utils/logger';
import PresenceManager from '../utils/presence-manager';
import { ServerModel, CalloutModel } from '../../database/models';
import { createCalloutPanel } from '../interactions/setup-mode-select';
import { deleteIncidentChannel } from '../utils/channel-manager';
import config from '../../config/config';

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

  // Удалить каналы закрытых каллаутов, которые не успели удалиться до перезапуска
  cleanupOrphanedChannels(client).catch(err =>
    logger.error('Error in cleanupOrphanedChannels', { error: err instanceof Error ? err.message : err })
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

/**
 * Удаляет каналы закрытых каллаутов, которые не успели удалиться из-за перезапуска бота.
 */
async function cleanupOrphanedChannels(client: Client): Promise<void> {
  if (!config.features.autoDeleteChannels) return;

  const orphaned = await CalloutModel.findClosedWithChannelOlderThan(config.features.channelDeleteDelay);

  if (orphaned.length === 0) return;

  logger.info('Found orphaned incident channels after restart, cleaning up', {
    count: orphaned.length,
  });

  for (const callout of orphaned) {
    if (!callout.discord_channel_id) continue;

    try {
      const server = await ServerModel.findById(callout.server_id);
      if (!server) continue;

      const guild = client.guilds.cache.get(server.guild_id);
      if (!guild) continue;

      await deleteIncidentChannel(guild, callout.discord_channel_id);

      logger.info('Deleted orphaned incident channel', {
        calloutId: callout.id,
        channelId: callout.discord_channel_id,
      });
    } catch (error) {
      logger.error('Failed to delete orphaned incident channel', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
        channelId: callout.discord_channel_id,
      });
    }
  }
}
