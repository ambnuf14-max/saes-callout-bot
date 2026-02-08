import { Guild, EmbedBuilder, TextChannel, ChannelType } from 'discord.js';
import { ServerModel } from '../../database/models';
import logger from '../../utils/logger';
import { COLORS, EMOJI } from '../../config/constants';

/**
 * Типы событий для audit log
 */
export enum AuditEventType {
  // Каллауты
  CALLOUT_CREATED = 'callout_created',
  CALLOUT_CLOSED = 'callout_closed',

  // Департаменты
  DEPARTMENT_ADDED = 'department_added',
  DEPARTMENT_UPDATED = 'department_updated',
  DEPARTMENT_REMOVED = 'department_removed',

  // Настройки сервера
  SETTINGS_UPDATED = 'settings_updated',
  LEADER_ROLE_ADDED = 'leader_role_added',
  LEADER_ROLE_REMOVED = 'leader_role_removed',
  AUDIT_LOG_CHANNEL_SET = 'audit_log_channel_set',

  // VK интеграция
  VK_RESPONSE_RECEIVED = 'vk_response_received',
}

/**
 * Базовый интерфейс данных события
 */
interface BaseAuditEventData {
  userId: string;
  userName: string;
  timestamp?: Date;
}

/**
 * Данные для события создания каллаута
 */
export interface CalloutCreatedData extends BaseAuditEventData {
  calloutId: number;
  departmentName: string;
  description: string;
  channelId: string;
}

/**
 * Данные для события закрытия каллаута
 */
export interface CalloutClosedData extends BaseAuditEventData {
  calloutId: number;
  departmentName: string;
  reason?: string;
  channelId?: string;
}

/**
 * Данные для события добавления департамента
 */
export interface DepartmentAddedData extends BaseAuditEventData {
  departmentName: string;
  roleId: string;
  vkChatId: string;
}

/**
 * Данные для события обновления департамента
 */
export interface DepartmentUpdatedData extends BaseAuditEventData {
  departmentName: string;
  changes: string[];
}

/**
 * Данные для события удаления департамента
 */
export interface DepartmentRemovedData extends BaseAuditEventData {
  departmentName: string;
}

/**
 * Данные для события изменения настроек
 */
export interface SettingsUpdatedData extends BaseAuditEventData {
  changes: string[];
}

/**
 * Данные для события добавления лидерской роли
 */
export interface LeaderRoleAddedData extends BaseAuditEventData {
  roleId: string;
}

/**
 * Данные для события удаления лидерской роли
 */
export interface LeaderRoleRemovedData extends BaseAuditEventData {
  roleId: string;
}

/**
 * Данные для события установки audit log канала
 */
export interface AuditLogChannelSetData extends BaseAuditEventData {
  channelId: string;
}

/**
 * Данные для события получения VK ответа
 */
export interface VkResponseReceivedData extends BaseAuditEventData {
  calloutId: number;
  departmentName: string;
  vkUserId: string;
  vkUserName: string;
}

/**
 * Объединенный тип данных события
 */
export type AuditEventData =
  | CalloutCreatedData
  | CalloutClosedData
  | DepartmentAddedData
  | DepartmentUpdatedData
  | DepartmentRemovedData
  | SettingsUpdatedData
  | LeaderRoleAddedData
  | LeaderRoleRemovedData
  | AuditLogChannelSetData
  | VkResponseReceivedData;

/**
 * Главная функция для логирования события в audit log канал
 */
export async function logAuditEvent(
  guild: Guild,
  eventType: AuditEventType,
  data: AuditEventData
): Promise<void> {
  try {
    // Получить настройки сервера
    const server = await ServerModel.findByGuildId(guild.id);
    if (!server || !server.audit_log_channel_id) {
      // Audit log не настроен, пропускаем
      return;
    }

    // Получить канал
    const channel = await guild.channels.fetch(server.audit_log_channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn('Audit log channel not found or is not a text channel', {
        guildId: guild.id,
        channelId: server.audit_log_channel_id,
      });
      return;
    }

    // Создать embed в зависимости от типа события
    const embed = buildAuditEmbed(eventType, data);

    // Отправить сообщение
    await (channel as TextChannel).send({ embeds: [embed] });

    logger.debug('Audit event logged', {
      guildId: guild.id,
      eventType,
      userId: data.userId,
    });
  } catch (error) {
    logger.error('Failed to log audit event', {
      error: error instanceof Error ? error.message : error,
      eventType,
      guildId: guild.id,
    });
    // Не бросаем ошибку, audit log не должен ломать основной функционал
  }
}

/**
 * Создать embed для audit события
 */
function buildAuditEmbed(eventType: AuditEventType, data: AuditEventData): EmbedBuilder {
  const timestamp = data.timestamp || new Date();
  const embed = new EmbedBuilder().setTimestamp(timestamp).setFooter({
    text: `Пользователь: ${data.userName} (${data.userId})`,
  });

  switch (eventType) {
    case AuditEventType.CALLOUT_CREATED:
      return buildCalloutCreatedEmbed(embed, data as CalloutCreatedData);

    case AuditEventType.CALLOUT_CLOSED:
      return buildCalloutClosedEmbed(embed, data as CalloutClosedData);

    case AuditEventType.DEPARTMENT_ADDED:
      return buildDepartmentAddedEmbed(embed, data as DepartmentAddedData);

    case AuditEventType.DEPARTMENT_UPDATED:
      return buildDepartmentUpdatedEmbed(embed, data as DepartmentUpdatedData);

    case AuditEventType.DEPARTMENT_REMOVED:
      return buildDepartmentRemovedEmbed(embed, data as DepartmentRemovedData);

    case AuditEventType.SETTINGS_UPDATED:
      return buildSettingsUpdatedEmbed(embed, data as SettingsUpdatedData);

    case AuditEventType.LEADER_ROLE_ADDED:
      return buildLeaderRoleAddedEmbed(embed, data as LeaderRoleAddedData);

    case AuditEventType.LEADER_ROLE_REMOVED:
      return buildLeaderRoleRemovedEmbed(embed, data as LeaderRoleRemovedData);

    case AuditEventType.AUDIT_LOG_CHANNEL_SET:
      return buildAuditLogChannelSetEmbed(embed, data as AuditLogChannelSetData);

    case AuditEventType.VK_RESPONSE_RECEIVED:
      return buildVkResponseReceivedEmbed(embed, data as VkResponseReceivedData);

    default:
      return embed.setTitle('❓ Неизвестное событие').setColor(COLORS.INFO);
  }
}

/**
 * Embed для создания каллаута
 */
function buildCalloutCreatedEmbed(
  embed: EmbedBuilder,
  data: CalloutCreatedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.ACTIVE} Каллаут создан`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Департамент', value: data.departmentName, inline: true },
      { name: 'Канал', value: `<#${data.channelId}>`, inline: true },
      { name: 'Описание', value: data.description.substring(0, 1024), inline: false },
    ]);
}

/**
 * Embed для закрытия каллаута
 */
function buildCalloutClosedEmbed(
  embed: EmbedBuilder,
  data: CalloutClosedData
): EmbedBuilder {
  const fields = [
    { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
    { name: 'Департамент', value: data.departmentName, inline: true },
  ];

  if (data.channelId) {
    fields.push({ name: 'Канал', value: `<#${data.channelId}>`, inline: true });
  }

  if (data.reason) {
    fields.push({ name: 'Причина', value: data.reason, inline: false });
  }

  return embed
    .setTitle(`${EMOJI.CLOSED} Каллаут закрыт`)
    .setColor(COLORS.CLOSED)
    .addFields(fields);
}

/**
 * Embed для добавления департамента
 */
function buildDepartmentAddedEmbed(
  embed: EmbedBuilder,
  data: DepartmentAddedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Департамент добавлен`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'Название', value: data.departmentName, inline: true },
      { name: 'Роль', value: `<@&${data.roleId}>`, inline: true },
      { name: 'VK Беседа', value: data.vkChatId, inline: true },
    ]);
}

/**
 * Embed для обновления департамента
 */
function buildDepartmentUpdatedEmbed(
  embed: EmbedBuilder,
  data: DepartmentUpdatedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.INFO} Департамент обновлен`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'Департамент', value: data.departmentName, inline: false },
      { name: 'Изменения', value: data.changes.join('\n'), inline: false },
    ]);
}

/**
 * Embed для удаления департамента
 */
function buildDepartmentRemovedEmbed(
  embed: EmbedBuilder,
  data: DepartmentRemovedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.WARNING} Департамент удален`)
    .setColor(COLORS.WARNING)
    .addFields([{ name: 'Департамент', value: data.departmentName, inline: false }]);
}

/**
 * Embed для изменения настроек
 */
function buildSettingsUpdatedEmbed(
  embed: EmbedBuilder,
  data: SettingsUpdatedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.INFO} Настройки сервера обновлены`)
    .setColor(COLORS.INFO)
    .addFields([{ name: 'Изменения', value: data.changes.join('\n'), inline: false }]);
}

/**
 * Embed для добавления лидерской роли
 */
function buildLeaderRoleAddedEmbed(
  embed: EmbedBuilder,
  data: LeaderRoleAddedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Лидерская роль добавлена`)
    .setColor(COLORS.ACTIVE)
    .addFields([{ name: 'Роль', value: `<@&${data.roleId}>`, inline: false }]);
}

/**
 * Embed для удаления лидерской роли
 */
function buildLeaderRoleRemovedEmbed(
  embed: EmbedBuilder,
  data: LeaderRoleRemovedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.WARNING} Лидерская роль удалена`)
    .setColor(COLORS.WARNING)
    .addFields([{ name: 'Роль', value: `<@&${data.roleId}>`, inline: false }]);
}

/**
 * Embed для установки audit log канала
 */
function buildAuditLogChannelSetEmbed(
  embed: EmbedBuilder,
  data: AuditLogChannelSetData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Audit Log канал настроен`)
    .setColor(COLORS.ACTIVE)
    .addFields([{ name: 'Канал', value: `<#${data.channelId}>`, inline: false }]);
}

/**
 * Embed для получения VK ответа
 */
function buildVkResponseReceivedEmbed(
  embed: EmbedBuilder,
  data: VkResponseReceivedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Получен ответ из VK`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Департамент', value: data.departmentName, inline: true },
      {
        name: 'Пользователь VK',
        value: `${data.vkUserName} (${data.vkUserId})`,
        inline: false,
      },
    ]);
}
