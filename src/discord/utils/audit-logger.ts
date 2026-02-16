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

  // Типы фракций
  FACTION_TYPE_CREATED = 'faction_type_created',
  FACTION_TYPE_UPDATED = 'faction_type_updated',
  FACTION_TYPE_DELETED = 'faction_type_deleted',
  TEMPLATE_ADDED = 'template_added',

  // Настройки сервера
  SETTINGS_UPDATED = 'settings_updated',
  LEADER_ROLE_ADDED = 'leader_role_added',
  LEADER_ROLE_REMOVED = 'leader_role_removed',
  AUDIT_LOG_CHANNEL_SET = 'audit_log_channel_set',

  // VK интеграция
  VK_RESPONSE_RECEIVED = 'vk_response_received',
  VK_CHAT_LINKED = 'vk_chat_linked',

  // Telegram интеграция
  TELEGRAM_RESPONSE_RECEIVED = 'telegram_response_received',
  TELEGRAM_CHAT_LINKED = 'telegram_chat_linked',

  // Фракции и подразделения
  FACTION_CREATED = 'faction_created',
  FACTION_UPDATED = 'faction_updated',
  FACTION_REMOVED = 'faction_removed',
  SUBDIVISION_ADDED = 'subdivision_added',
  SUBDIVISION_UPDATED = 'subdivision_updated',
  SUBDIVISION_REMOVED = 'subdivision_removed',

  // Система одобрения изменений
  SUBDIVISION_CREATE_REQUESTED = 'subdivision_create_requested',
  SUBDIVISION_UPDATE_REQUESTED = 'subdivision_update_requested',
  SUBDIVISION_DELETE_REQUESTED = 'subdivision_delete_requested',
  EMBED_UPDATE_REQUESTED = 'embed_update_requested',
  CHANGE_APPROVED = 'change_approved',
  CHANGE_REJECTED = 'change_rejected',
  CHANGE_CANCELLED = 'change_cancelled',
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
 * Данные для события добавления фракции
 */
export interface FactionAddedData extends BaseAuditEventData {
  factionName: string;
  roleId: string;
  vkChatId: string;
}

/**
 * Данные для события обновления фракции
 */
export interface FactionUpdatedData extends BaseAuditEventData {
  factionName: string;
  changes: string[];
}

/**
 * Данные для события удаления фракции
 */
export interface FactionRemovedData extends BaseAuditEventData {
  factionName: string;
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
 * Данные для события привязки VK беседы
 */
export interface VkChatLinkedData extends BaseAuditEventData {
  subdivisionName: string;
  factionName: string;
  vkChatId: string;
  chatTitle?: string;
}

/**
 * Данные для события получения Telegram ответа
 */
export interface TelegramResponseReceivedData extends BaseAuditEventData {
  calloutId: number;
  departmentName: string;
  telegramUserId: string;
  telegramUserName: string;
}

/**
 * Данные для события привязки Telegram группы
 */
export interface TelegramChatLinkedData extends BaseAuditEventData {
  subdivisionName: string;
  factionName: string;
  telegramChatId: string;
  chatTitle?: string;
}

/**
 * Данные для событий фракций
 */
export interface FactionEventData extends BaseAuditEventData {
  factionName: string;
}

/**
 * Данные для событий подразделений
 */
export interface SubdivisionEventData extends BaseAuditEventData {
  subdivisionName: string;
  factionName: string;
}

/**
 * Данные для событий типов фракций
 */
export interface FactionTypeCreatedData extends BaseAuditEventData {
  typeName: string;
  description?: string;
}

export interface FactionTypeUpdatedData extends BaseAuditEventData {
  typeName: string;
  changes: string[];
}

export interface FactionTypeDeletedData extends BaseAuditEventData {
  typeName: string;
}

export interface TemplateAddedData extends BaseAuditEventData {
  typeName: string;
  templateName: string;
}

/**
 * Данные для событий approval системы
 */
export interface ChangeRequestedData extends BaseAuditEventData {
  changeType: string;
  departmentName: string;
  details: string;
  changeId: number;
}

export interface ChangeApprovedData extends BaseAuditEventData {
  changeType: string;
  departmentName: string;
  details: string;
  reviewerName: string;
}

export interface ChangeRejectedData extends BaseAuditEventData {
  changeType: string;
  departmentName: string;
  details: string;
  reviewerName: string;
  reason: string;
}

export interface ChangeCancelledData extends BaseAuditEventData {
  changeType: string;
  departmentName: string;
  details: string;
}

/**
 * Объединенный тип данных события
 */
export type AuditEventData =
  | CalloutCreatedData
  | CalloutClosedData
  | FactionAddedData
  | FactionUpdatedData
  | FactionRemovedData
  | SettingsUpdatedData
  | LeaderRoleAddedData
  | LeaderRoleRemovedData
  | TelegramResponseReceivedData
  | TelegramChatLinkedData
  | AuditLogChannelSetData
  | VkResponseReceivedData
  | VkChatLinkedData
  | FactionEventData
  | SubdivisionEventData
  | FactionTypeCreatedData
  | FactionTypeUpdatedData
  | FactionTypeDeletedData
  | TemplateAddedData
  | ChangeRequestedData
  | ChangeApprovedData
  | ChangeRejectedData
  | ChangeCancelledData;

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

    case AuditEventType.FACTION_CREATED:
      return buildFactionAddedEmbed(embed, data as FactionAddedData);

    case AuditEventType.FACTION_UPDATED:
      return buildFactionUpdatedEmbed(embed, data as FactionUpdatedData);

    case AuditEventType.FACTION_REMOVED:
      return buildFactionRemovedEmbed(embed, data as FactionRemovedData);

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

    // Типы фракций
    case AuditEventType.FACTION_TYPE_CREATED:
      return buildFactionTypeCreatedEmbed(embed, data as FactionTypeCreatedData);

    case AuditEventType.FACTION_TYPE_UPDATED:
      return buildFactionTypeUpdatedEmbed(embed, data as FactionTypeUpdatedData);

    case AuditEventType.FACTION_TYPE_DELETED:
      return buildFactionTypeDeletedEmbed(embed, data as FactionTypeDeletedData);

    case AuditEventType.TEMPLATE_ADDED:
      return buildTemplateAddedEmbed(embed, data as TemplateAddedData);

    // Система одобрения изменений
    case AuditEventType.SUBDIVISION_CREATE_REQUESTED:
    case AuditEventType.SUBDIVISION_UPDATE_REQUESTED:
    case AuditEventType.SUBDIVISION_DELETE_REQUESTED:
    case AuditEventType.EMBED_UPDATE_REQUESTED:
      return buildChangeRequestedEmbed(embed, data as ChangeRequestedData);

    case AuditEventType.CHANGE_APPROVED:
      return buildChangeApprovedEmbed(embed, data as ChangeApprovedData);

    case AuditEventType.CHANGE_REJECTED:
      return buildChangeRejectedEmbed(embed, data as ChangeRejectedData);

    case AuditEventType.CHANGE_CANCELLED:
      return buildChangeCancelledEmbed(embed, data as ChangeCancelledData);

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
      { name: 'Фракция', value: data.departmentName, inline: true },
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
    { name: 'Фракция', value: data.departmentName, inline: true },
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
 * Embed для добавления фракции
 */
function buildFactionAddedEmbed(
  embed: EmbedBuilder,
  data: FactionAddedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Фракция добавлена`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'Название', value: data.factionName, inline: true },
      { name: 'Роль', value: `<@&${data.roleId}>`, inline: true },
      { name: 'VK Беседа', value: data.vkChatId, inline: true },
    ]);
}

/**
 * Embed для обновления фракции
 */
function buildFactionUpdatedEmbed(
  embed: EmbedBuilder,
  data: FactionUpdatedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.INFO} Фракция обновлена`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'Фракция', value: data.factionName, inline: false },
      { name: 'Изменения', value: data.changes.join('\n'), inline: false },
    ]);
}

/**
 * Embed для удаления фракции
 */
function buildFactionRemovedEmbed(
  embed: EmbedBuilder,
  data: FactionRemovedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.WARNING} Фракция удалена`)
    .setColor(COLORS.WARNING)
    .addFields([{ name: 'Фракция', value: data.factionName, inline: false }]);
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
      { name: 'Фракция', value: data.departmentName, inline: true },
      {
        name: 'Пользователь VK',
        value: `${data.vkUserName} (${data.vkUserId})`,
        inline: false,
      },
    ]);
}

/**
 * Embed для создания типа фракции
 */
function buildFactionTypeCreatedEmbed(
  embed: EmbedBuilder,
  data: FactionTypeCreatedData
): EmbedBuilder {
  const fields = [
    { name: 'Название типа', value: data.typeName, inline: false },
  ];

  if (data.description) {
    fields.push({ name: 'Описание', value: data.description, inline: false });
  }

  return embed
    .setTitle(`${EMOJI.SUCCESS} Тип фракции создан`)
    .setColor(COLORS.SUCCESS)
    .addFields(fields);
}

/**
 * Embed для обновления типа фракции
 */
function buildFactionTypeUpdatedEmbed(
  embed: EmbedBuilder,
  data: FactionTypeUpdatedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.INFO} Тип фракции обновлен`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'Тип', value: data.typeName, inline: false },
      { name: 'Изменения', value: data.changes.join('\n'), inline: false },
    ]);
}

/**
 * Embed для удаления типа фракции
 */
function buildFactionTypeDeletedEmbed(
  embed: EmbedBuilder,
  data: FactionTypeDeletedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.WARNING} Тип фракции удален`)
    .setColor(COLORS.WARNING)
    .addFields([
      { name: 'Тип', value: data.typeName, inline: false },
    ]);
}

/**
 * Embed для добавления шаблона подразделения
 */
function buildTemplateAddedEmbed(
  embed: EmbedBuilder,
  data: TemplateAddedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Шаблон подразделения добавлен`)
    .setColor(COLORS.SUCCESS)
    .addFields([
      { name: 'Тип фракции', value: data.typeName, inline: true },
      { name: 'Название шаблона', value: data.templateName, inline: true },
    ]);
}

/**
 * Embed для запроса на изменение
 */
function buildChangeRequestedEmbed(
  embed: EmbedBuilder,
  data: ChangeRequestedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.PENDING} Запрос на изменение`)
    .setColor(COLORS.WARNING)
    .addFields([
      { name: 'ID запроса', value: `#${data.changeId}`, inline: true },
      { name: 'Тип', value: data.changeType, inline: true },
      { name: 'Фракция', value: data.departmentName, inline: true },
      { name: 'Запрос от', value: `<@${data.userId}>`, inline: true },
      { name: 'Детали', value: data.details, inline: false },
    ]);
}

/**
 * Embed для одобрения изменения
 */
function buildChangeApprovedEmbed(
  embed: EmbedBuilder,
  data: ChangeApprovedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.APPROVED} Изменение одобрено`)
    .setColor(COLORS.SUCCESS)
    .addFields([
      { name: 'Тип', value: data.changeType, inline: true },
      { name: 'Фракция', value: data.departmentName, inline: true },
      { name: 'Одобрил', value: data.reviewerName, inline: true },
      { name: 'Детали', value: data.details, inline: false },
    ]);
}

/**
 * Embed для отклонения изменения
 */
function buildChangeRejectedEmbed(
  embed: EmbedBuilder,
  data: ChangeRejectedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.REJECTED} Изменение отклонено`)
    .setColor(COLORS.ERROR)
    .addFields([
      { name: 'Тип', value: data.changeType, inline: true },
      { name: 'Фракция', value: data.departmentName, inline: true },
      { name: 'Отклонил', value: data.reviewerName, inline: true },
      { name: 'Детали', value: data.details, inline: false },
      { name: 'Причина отклонения', value: data.reason, inline: false },
    ]);
}

/**
 * Embed для отмены изменения
 */
function buildChangeCancelledEmbed(
  embed: EmbedBuilder,
  data: ChangeCancelledData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.CANCELLED} Изменение отменено`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'Тип', value: data.changeType, inline: true },
      { name: 'Фракция', value: data.departmentName, inline: true },
      { name: 'Детали', value: data.details, inline: false },
    ]);
}
