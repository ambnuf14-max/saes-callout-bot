import { Guild, EmbedBuilder, TextChannel, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ServerModel, FactionModel, SubdivisionModel } from '../../database/models';
import logger from '../../utils/logger';
import { COLORS, EMOJI } from '../../config/constants';
import { PendingChangeWithDetails } from '../../types/database.types';

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
  CALLOUT_ROLE_ADDED = 'callout_role_added',
  CALLOUT_ROLE_REMOVED = 'callout_role_removed',
  AUDIT_LOG_CHANNEL_SET = 'audit_log_channel_set',

  // VK интеграция
  VK_RESPONSE_RECEIVED = 'vk_response_received',
  VK_CHAT_LINKED = 'vk_chat_linked',

  // Telegram интеграция
  TELEGRAM_RESPONSE_RECEIVED = 'telegram_response_received',
  TELEGRAM_CHAT_LINKED = 'telegram_chat_linked',

  // Discord реагирование
  DISCORD_RESPONSE_RECEIVED = 'discord_response_received',

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
 * Конвертирует logo_url (Discord-эмодзи строка) в CDN URL для использования как thumbnail.
 * Возвращает undefined для unicode-эмодзи (они не могут быть URL).
 */
export function resolveLogoThumbnailUrl(logoUrl: string | null | undefined): string | undefined {
  if (!logoUrl) return undefined;
  const match = logoUrl.match(/^<(a)?:(\w+):(\d+)>$/);
  if (match) {
    const animated = !!match[1];
    const id = match[3];
    return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;
  }
  // Голый Snowflake ID
  if (/^\d{17,20}$/.test(logoUrl)) {
    return `https://cdn.discordapp.com/emojis/${logoUrl}.png`;
  }
  return undefined;
}

/**
 * Базовый интерфейс данных события
 */
interface BaseAuditEventData {
  userId: string;
  userName: string;
  timestamp?: Date;
  thumbnailUrl?: string;
}

/**
 * Данные для события создания каллаута
 */
export interface CalloutCreatedData extends BaseAuditEventData {
  calloutId: number;
  subdivisionName: string;
  factionName?: string;
  description: string;
  channelId: string;
  location?: string;
  briefDescription?: string;
  tacChannel?: string;
  vkStatus?: string;
  telegramStatus?: string;
}

/**
 * Данные для события закрытия каллаута
 */
export interface CalloutClosedData extends BaseAuditEventData {
  calloutId: number;
  subdivisionName: string;
  reason?: string;
  channelId?: string;
  closedByDiscordId?: string;
  duration?: string;
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
  factionName: string;
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
  factionName: string;
  telegramUserId: string;
  telegramUserName: string;
}

/**
 * Данные для события реагирования из Discord
 */
export interface DiscordResponseReceivedData extends BaseAuditEventData {
  calloutId: number;
  factionName: string;
  discordUserId: string;
  discordUserName: string;
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
  factionName: string;
  details: string;
  changeId: number;
}

export interface ChangeApprovedData extends BaseAuditEventData {
  changeType: string;
  factionName: string;
  details: string;
  reviewerName: string;
  reviewerId?: string;
}

export interface ChangeRejectedData extends BaseAuditEventData {
  changeType: string;
  factionName: string;
  details: string;
  reviewerName: string;
  reviewerId?: string;
  reason: string;
}

export interface ChangeCancelledData extends BaseAuditEventData {
  changeType: string;
  factionName: string;
  details: string;
}

/**
 * Данные для событий управления callout ролями
 */
export interface CalloutRoleData extends BaseAuditEventData {
  roleId: string;
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
  | DiscordResponseReceivedData
  | FactionEventData
  | SubdivisionEventData
  | FactionTypeCreatedData
  | FactionTypeUpdatedData
  | FactionTypeDeletedData
  | TemplateAddedData
  | ChangeRequestedData
  | ChangeApprovedData
  | ChangeRejectedData
  | ChangeCancelledData
  | CalloutRoleData;

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

  if (data.thumbnailUrl) {
    embed.setThumbnail(data.thumbnailUrl);
  }

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

    case AuditEventType.TELEGRAM_RESPONSE_RECEIVED:
      return buildTelegramResponseReceivedEmbed(embed, data as TelegramResponseReceivedData);

    case AuditEventType.DISCORD_RESPONSE_RECEIVED:
      return buildDiscordResponseReceivedEmbed(embed, data as DiscordResponseReceivedData);

    case AuditEventType.VK_CHAT_LINKED:
      return buildVkChatLinkedEmbed(embed, data as VkChatLinkedData);

    case AuditEventType.TELEGRAM_CHAT_LINKED:
      return buildTelegramChatLinkedEmbed(embed, data as TelegramChatLinkedData);

    case AuditEventType.CALLOUT_ROLE_ADDED:
      return buildCalloutRoleAddedEmbed(embed, data as CalloutRoleData);

    case AuditEventType.CALLOUT_ROLE_REMOVED:
      return buildCalloutRoleRemovedEmbed(embed, data as CalloutRoleData);

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
  embed
    .setTitle('Каллаут создан')
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Канал', value: `<#${data.channelId}>`, inline: true },
    ]);

  if (data.factionName) {
    embed.addFields({ name: 'Фракция', value: data.factionName, inline: true });
  }

  embed.addFields({ name: 'Создатель', value: `<@${data.userId}>`, inline: true });

  if (data.briefDescription) {
    embed.addFields({ name: 'Кратко', value: data.briefDescription.substring(0, 512), inline: false });
  }

  const notificationLines: string[] = [];
  if (data.vkStatus !== undefined) notificationLines.push(`VK: ${data.vkStatus}`);
  if (data.telegramStatus !== undefined) notificationLines.push(`Telegram: ${data.telegramStatus}`);
  if (notificationLines.length > 0) {
    embed.addFields({ name: 'Уведомления', value: notificationLines.join('\n'), inline: false });
  }

  return embed;
}

/**
 * Embed для закрытия каллаута
 */
function buildCalloutClosedEmbed(
  embed: EmbedBuilder,
  data: CalloutClosedData
): EmbedBuilder {
  embed
    .setTitle(`${EMOJI.CLOSED} Каллаут закрыт`)
    .setColor(COLORS.CLOSED)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
    ]);

  const closedByValue = data.closedByDiscordId
    ? `<@${data.closedByDiscordId}>`
    : 'Система';
  embed.addFields({ name: 'Закрыл', value: closedByValue, inline: true });

  if (data.channelId) {
    embed.addFields({ name: 'Канал', value: `<#${data.channelId}>`, inline: true });
  }

  if (data.duration) {
    embed.addFields({ name: 'Длительность', value: data.duration, inline: true });
  }

  if (data.reason) {
    embed.addFields({ name: 'Причина', value: data.reason, inline: false });
  }

  return embed;
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
      { name: 'Подразделение', value: data.factionName, inline: true },
      { name: 'Пользователь VK', value: `${data.vkUserName} (${data.vkUserId})`, inline: false },
    ]);
}

/**
 * Embed для получения Telegram ответа
 */
function buildTelegramResponseReceivedEmbed(
  embed: EmbedBuilder,
  data: TelegramResponseReceivedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Получен ответ из Telegram`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Подразделение', value: data.factionName, inline: true },
      { name: 'Пользователь Telegram', value: `${data.telegramUserName} (${data.telegramUserId})`, inline: false },
    ]);
}

/**
 * Embed для реагирования из Discord
 */
function buildDiscordResponseReceivedEmbed(
  embed: EmbedBuilder,
  data: DiscordResponseReceivedData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Реагирование из Discord`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Подразделение', value: data.factionName, inline: true },
      { name: 'Пользователь Discord', value: `<@${data.discordUserId}>`, inline: false },
    ]);
}

/**
 * Embed для привязки VK беседы
 */
function buildVkChatLinkedEmbed(
  embed: EmbedBuilder,
  data: VkChatLinkedData
): EmbedBuilder {
  const fields = [
    { name: 'Фракция', value: data.factionName, inline: true },
    { name: 'Подразделение', value: data.subdivisionName, inline: true },
    { name: 'VK Chat ID', value: data.vkChatId, inline: true },
  ];
  if (data.chatTitle) fields.push({ name: 'Название беседы', value: data.chatTitle, inline: false });
  return embed
    .setTitle(`${EMOJI.SUCCESS} VK беседа привязана`)
    .setColor(COLORS.ACTIVE)
    .addFields(fields);
}

/**
 * Embed для привязки Telegram группы
 */
function buildTelegramChatLinkedEmbed(
  embed: EmbedBuilder,
  data: TelegramChatLinkedData
): EmbedBuilder {
  const fields = [
    { name: 'Фракция', value: data.factionName, inline: true },
    { name: 'Подразделение', value: data.subdivisionName, inline: true },
    { name: 'Telegram Chat ID', value: data.telegramChatId, inline: true },
  ];
  if (data.chatTitle) fields.push({ name: 'Название группы', value: data.chatTitle, inline: false });
  return embed
    .setTitle(`${EMOJI.SUCCESS} Telegram группа привязана`)
    .setColor(COLORS.ACTIVE)
    .addFields(fields);
}

/**
 * Embed для добавления callout роли
 */
function buildCalloutRoleAddedEmbed(
  embed: EmbedBuilder,
  data: CalloutRoleData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Роль каллаутов добавлена`)
    .setColor(COLORS.ACTIVE)
    .addFields([{ name: 'Роль', value: `<@&${data.roleId}>`, inline: false }]);
}

/**
 * Embed для удаления callout роли
 */
function buildCalloutRoleRemovedEmbed(
  embed: EmbedBuilder,
  data: CalloutRoleData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.WARNING} Роль каллаутов удалена`)
    .setColor(COLORS.WARNING)
    .addFields([{ name: 'Роль', value: `<@&${data.roleId}>`, inline: false }]);
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
      { name: 'Фракция', value: data.factionName, inline: true },
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
  const reviewerValue = data.reviewerId ? `<@${data.reviewerId}>` : data.reviewerName;
  return embed
    .setTitle(`${EMOJI.APPROVED} Изменение одобрено`)
    .setColor(COLORS.SUCCESS)
    .addFields([
      { name: 'Тип', value: data.changeType, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Одобрил', value: reviewerValue, inline: true },
      { name: 'Запросил', value: `<@${data.userId}>`, inline: true },
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
  const reviewerValue = data.reviewerId ? `<@${data.reviewerId}>` : data.reviewerName;
  return embed
    .setTitle(`${EMOJI.REJECTED} Изменение отклонено`)
    .setColor(COLORS.ERROR)
    .addFields([
      { name: 'Тип', value: data.changeType, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Отклонил', value: reviewerValue, inline: true },
      { name: 'Запросил', value: `<@${data.userId}>`, inline: true },
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
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Детали', value: data.details, inline: false },
    ]);
}

/**
 * Отправить pending change request в audit log с кнопками Одобрить/Отклонить
 */
export async function logPendingChangeWithButtons(
  guild: Guild,
  change: PendingChangeWithDetails
): Promise<void> {
  try {
    const server = await ServerModel.findByGuildId(guild.id);
    if (!server || !server.audit_log_channel_id) {
      return;
    }

    const channel = await guild.channels.fetch(server.audit_log_channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return;
    }

    // Динамический импорт для избежания циклических зависимостей
    const { getChangeTypeLabel, formatBeforeAfter } = await import('./change-formatter');

    const typeLabel = getChangeTypeLabel(change.change_type);
    const diffText = formatBeforeAfter(change);

    // Получить thumbnail: приоритет — подразделение, fallback — фракция
    let thumbnailUrl: string | undefined;
    try {
      if (change.subdivision_id) {
        const sub = await SubdivisionModel.findById(change.subdivision_id);
        thumbnailUrl = resolveLogoThumbnailUrl(sub?.logo_url);
      }
      if (!thumbnailUrl) {
        const faction = await FactionModel.findById(change.faction_id);
        thumbnailUrl = resolveLogoThumbnailUrl(faction?.logo_url);
      }
    } catch {
      // thumbnail не критичен
    }

    const embed = new EmbedBuilder()
      .setTitle(`${EMOJI.PENDING} Запрос на изменение #${change.id}`)
      .setColor(COLORS.WARNING)
      .addFields(
        { name: 'Тип', value: typeLabel, inline: true },
        { name: 'Фракция', value: change.faction_name, inline: true },
        { name: 'Запросил', value: `<@${change.requested_by}>`, inline: true },
      )
      .setTimestamp();

    if (change.subdivision_name) {
      embed.addFields({ name: 'Подразделение', value: change.subdivision_name, inline: true });
    }

    embed.addFields({
      name: 'Изменения (до → после)',
      value: diffText.substring(0, 1024) || 'Нет деталей',
      inline: false,
    });

    embed.setFooter({ text: `ID запроса: #${change.id}` });

    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`audit_approve_change_${change.id}`)
        .setLabel('Одобрить')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`audit_reject_change_${change.id}`)
        .setLabel('Отклонить')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
    );

    const sentMessage = await (channel as TextChannel).send({ embeds: [embed], components: [row] });

    // Сохранить ID сообщения для последующего редактирования (убрать кнопки после решения)
    try {
      const { PendingChangeModel: PCModel } = await import('../../database/models/PendingChange');
      await PCModel.setAuditLogMessageId(change.id, sentMessage.id);
    } catch (saveErr) {
      logger.warn('Failed to save audit_log_message_id', {
        changeId: change.id,
        error: saveErr instanceof Error ? saveErr.message : saveErr,
      });
    }

    logger.debug('Pending change request posted to audit log with buttons', {
      changeId: change.id,
      guildId: guild.id,
    });
  } catch (error) {
    logger.error('Failed to post pending change request to audit log', {
      error: error instanceof Error ? error.message : error,
      changeId: change.id,
      guildId: guild.id,
    });
  }
}

/**
 * Отредактировать сообщение pending change в audit log после принятия решения.
 * Меняет цвет/заголовок, добавляет информацию о решении, убирает кнопки.
 */
export async function editPendingChangeAuditMessage(
  guild: Guild,
  change: PendingChangeWithDetails,
  status: 'approved' | 'rejected' | 'cancelled',
  reviewerId?: string,
  reason?: string
): Promise<void> {
  if (!change.audit_log_message_id) return;

  try {
    const server = await ServerModel.findByGuildId(guild.id);
    if (!server?.audit_log_channel_id) return;

    const channel = await guild.channels.fetch(server.audit_log_channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const textChannel = channel as TextChannel;
    let message;
    try {
      message = await textChannel.messages.fetch(change.audit_log_message_id);
    } catch {
      return; // сообщение удалено — ничего не делаем
    }

    const { getChangeTypeLabel, formatBeforeAfter } = await import('./change-formatter');
    const typeLabel = getChangeTypeLabel(change.change_type);
    const diffText = formatBeforeAfter(change);

    let title: string;
    let color: number;
    let decisionField: { name: string; value: string; inline: boolean } | undefined;

    if (status === 'approved') {
      title = `${EMOJI.APPROVED} Запрос одобрен #${change.id}`;
      color = COLORS.SUCCESS;
      decisionField = {
        name: 'Одобрил',
        value: reviewerId ? `<@${reviewerId}>` : 'Неизвестно',
        inline: true,
      };
    } else if (status === 'rejected') {
      title = `${EMOJI.REJECTED} Запрос отклонён #${change.id}`;
      color = COLORS.ERROR;
      decisionField = {
        name: 'Отклонил',
        value: reviewerId ? `<@${reviewerId}>` : 'Неизвестно',
        inline: true,
      };
    } else {
      title = `${EMOJI.CANCELLED} Запрос отменён #${change.id}`;
      color = COLORS.INFO;
    }

    const updatedEmbed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .addFields(
        { name: 'Тип', value: typeLabel, inline: true },
        { name: 'Фракция', value: change.faction_name, inline: true },
        { name: 'Запросил', value: `<@${change.requested_by}>`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `ID запроса: #${change.id}` });

    if (change.subdivision_name) {
      updatedEmbed.addFields({ name: 'Подразделение', value: change.subdivision_name, inline: true });
    }

    if (decisionField) {
      updatedEmbed.addFields(decisionField);
    }

    updatedEmbed.addFields({
      name: 'Изменения',
      value: diffText.substring(0, 1024) || 'Нет деталей',
      inline: false,
    });

    if (reason) {
      updatedEmbed.addFields({ name: 'Причина отклонения', value: reason, inline: false });
    }

    const thumbnailUrl = message.embeds[0]?.thumbnail?.url;
    if (thumbnailUrl) {
      updatedEmbed.setThumbnail(thumbnailUrl);
    }

    await message.edit({ embeds: [updatedEmbed], components: [] });

    logger.debug('Pending change audit message edited', {
      changeId: change.id,
      status,
    });
  } catch (error) {
    logger.warn('Failed to edit pending change audit message', {
      error: error instanceof Error ? error.message : error,
      changeId: change.id,
    });
  }
}
