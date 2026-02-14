import {
  Guild,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  CategoryChannel,
} from 'discord.js';
import logger from '../../utils/logger';
import { Callout, Subdivision } from '../../types/database.types';
import { ServerModel } from '../../database/models';

/**
 * Утилиты для управления каналами
 */

/**
 * Создать канал для инцидента
 */
export async function createIncidentChannel(
  guild: Guild,
  callout: Callout,
  subdivision: Subdivision
): Promise<TextChannel> {
  try {
    // Получить настройки сервера для категории
    const server = await ServerModel.findByGuildId(guild.id);
    const categoryId = server?.category_id;

    let category: CategoryChannel | null = null;
    if (categoryId) {
      category = (await guild.channels.fetch(categoryId)) as CategoryChannel;
    }

    // Название канала: incident-{id}-{dept}
    const channelName = `incident-${callout.id}-${subdivision.name.toLowerCase()}`;

    // Получить роли для прав доступа
    const leaderRoleIds = server ? ServerModel.getLeaderRoleIds(server) : [];

    // Настройка прав доступа
    const permissionOverwrites = [
      {
        // @everyone - запретить доступ
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        // Автор каллаута - полный доступ
        id: callout.author_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    // Добавить роль подразделения если она есть
    if (subdivision.discord_role_id) {
      permissionOverwrites.push({
        id: subdivision.discord_role_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }

    // Добавить лидерские роли
    leaderRoleIds.forEach((roleId) => {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      });
    });

    // Создать канал
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id,
      topic: `Инцидент #${callout.id} - ${subdivision.name}`,
      permissionOverwrites,
    });

    logger.info('Incident channel created', {
      channelId: channel.id,
      calloutId: callout.id,
      subdivisionId: subdivision.id,
    });

    return channel;
  } catch (error) {
    logger.error('Failed to create incident channel', {
      error: error instanceof Error ? error.message : error,
      calloutId: callout.id,
    });
    throw error;
  }
}

/**
 * Удалить канал инцидента
 */
export async function deleteIncidentChannel(
  guild: Guild,
  channelId: string
): Promise<void> {
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
      logger.warn('Channel not found for deletion', { channelId });
      return;
    }

    await channel.delete();

    logger.info('Incident channel deleted', { channelId });
  } catch (error) {
    logger.error('Failed to delete incident channel', {
      error: error instanceof Error ? error.message : error,
      channelId,
    });
    throw error;
  }
}

/**
 * Архивировать канал (перенести в архивную категорию)
 */
export async function archiveIncidentChannel(
  guild: Guild,
  channelId: string,
  archiveCategoryId?: string
): Promise<void> {
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
      logger.warn('Channel not found', { channelId });
      return;
    }

    // Проверить что это текстовый канал
    if (channel.type !== ChannelType.GuildText) {
      logger.warn('Channel is not a text channel', { channelId });
      return;
    }

    const textChannel = channel as TextChannel;

    // Если указана архивная категория, переместить туда
    if (archiveCategoryId) {
      await textChannel.setParent(archiveCategoryId);
    }

    // Заблокировать отправку сообщений для всех кроме администраторов
    await textChannel.permissionOverwrites.edit(guild.id, {
      SendMessages: false,
    });

    logger.info('Incident channel archived', { channelId });
  } catch (error) {
    logger.error('Failed to archive incident channel', {
      error: error instanceof Error ? error.message : error,
      channelId,
    });
    throw error;
  }
}

/**
 * Обновить права доступа к каналу
 */
export async function updateChannelPermissions(
  guild: Guild,
  channelId: string,
  userId: string,
  allow: bigint[] = [],
  deny: bigint[] = []
): Promise<void> {
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
      logger.warn('Channel not found for permission update', { channelId });
      return;
    }

    // Проверить что это текстовый канал
    if (channel.type !== ChannelType.GuildText) {
      logger.warn('Channel is not a text channel', { channelId });
      return;
    }

    const textChannel = channel as TextChannel;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const permissions: any = {};
    if (allow.length > 0) {
      permissions.allow = allow;
    }
    if (deny.length > 0) {
      permissions.deny = deny;
    }

    await textChannel.permissionOverwrites.edit(userId, permissions);

    logger.info('Channel permissions updated', { channelId, userId });
  } catch (error) {
    logger.error('Failed to update channel permissions', {
      error: error instanceof Error ? error.message : error,
      channelId,
      userId,
    });
    throw error;
  }
}
