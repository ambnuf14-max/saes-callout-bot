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
  CALLOUT_AUTO_CLOSED = 'callout_auto_closed',

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

  // Управление приёмом каллаутов
  SUBDIVISION_PAUSED = 'subdivision_paused',
  SUBDIVISION_UNPAUSED = 'subdivision_unpaused',

  // Настройки подразделения
  PRESENCE_ASSET_SET = 'presence_asset_set',

  // Интеграции — отвязка
  VK_CHAT_UNLINKED = 'vk_chat_unlinked',
  TELEGRAM_CHAT_UNLINKED = 'telegram_chat_unlinked',

  // Ошибки уведомлений
  VK_NOTIFICATION_FAILED = 'vk_notification_failed',
  TELEGRAM_NOTIFICATION_FAILED = 'telegram_notification_failed',

  // Безопасность
  UNAUTHORIZED_ACCESS_ATTEMPT = 'unauthorized_access_attempt',

  // История
  HISTORY_VIEWED = 'history_viewed',

  // Верификация
  VERIFICATION_TOKEN_CREATED = 'verification_token_created',

  // Статус внешних ботов
  BOT_CONNECTED = 'bot_connected',
  BOT_CONNECTION_FAILED = 'bot_connection_failed',
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
 * Данные для события автоматического закрытия каллаута по таймауту
 */
export interface CalloutAutoClosedData extends BaseAuditEventData {
  calloutId: number;
  subdivisionName: string;
  duration?: string;
  channelId?: string;
}

/**
 * Данные для события добавления фракции
 */
export interface FactionAddedData extends BaseAuditEventData {
  factionName: string;
  roleId: string;
  vkChatId?: string;
  description?: string;
  logoUrl?: string;
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
  chatId?: string;
  chatTitle?: string;
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
  chatId?: string;
  chatTitle?: string;
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
  changes?: string[];
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

export interface SubdivisionToggleData extends BaseAuditEventData {
  subdivisionName: string;
  factionName: string;
}

export interface PresenceAssetSetData extends BaseAuditEventData {
  subdivisionName: string;
  factionName: string;
  assetName: string | null;
}

export interface ChatUnlinkedData extends BaseAuditEventData {
  subdivisionName: string;
  factionName: string;
  chatId: string;
  chatTitle?: string;
}

export interface NotificationFailedData extends BaseAuditEventData {
  calloutId: number;
  subdivisionName: string;
  errorMessage: string;
  chatId?: string;
  chatTitle?: string;
}

export interface UnauthorizedAccessData extends BaseAuditEventData {
  action: string;
  calloutId?: number;
  subdivisionName?: string;
  reason?: string;
}

export interface HistoryViewedData extends BaseAuditEventData {
  filters: string;
}

export interface VerificationTokenCreatedData extends BaseAuditEventData {
  subdivisionName: string;
  factionName: string;
  platform: string;
}

export interface BotStatusData extends BaseAuditEventData {
  platform: 'VK' | 'Telegram';
  mode?: string;
  errorMessage?: string;
}

/**
 * Объединенный тип данных события
 */
export type AuditEventData =
  | CalloutCreatedData
  | CalloutClosedData
  | CalloutAutoClosedData
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
  | CalloutRoleData
  | SubdivisionToggleData
  | PresenceAssetSetData
  | ChatUnlinkedData
  | NotificationFailedData
  | UnauthorizedAccessData
  | HistoryViewedData
  | VerificationTokenCreatedData
  | BotStatusData;

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
 * Создать embed для audit события (экспортируется для тестов)
 */
export function buildAuditEmbed(eventType: AuditEventType, data: AuditEventData): EmbedBuilder {
  const timestamp = data.timestamp || new Date();
  const footerText = data.userId === 'system'
    ? `Пользователь: ${data.userName}`
    : `Пользователь: ${data.userName} (${data.userId})`;
  const embed = new EmbedBuilder().setTimestamp(timestamp).setFooter({ text: footerText });

  if (data.thumbnailUrl) {
    embed.setThumbnail(data.thumbnailUrl);
  }

  switch (eventType) {
    case AuditEventType.CALLOUT_CREATED:
      return buildCalloutCreatedEmbed(embed, data as CalloutCreatedData);

    case AuditEventType.CALLOUT_CLOSED:
      return buildCalloutClosedEmbed(embed, data as CalloutClosedData);

    case AuditEventType.CALLOUT_AUTO_CLOSED:
      return buildCalloutAutoClosedEmbed(embed, data as CalloutAutoClosedData);

    case AuditEventType.FACTION_CREATED:
      return buildFactionAddedEmbed(embed, data as FactionAddedData);

    case AuditEventType.FACTION_UPDATED:
      return buildFactionUpdatedEmbed(embed, data as FactionUpdatedData);

    case AuditEventType.FACTION_REMOVED:
      return buildFactionRemovedEmbed(embed, data as FactionRemovedData);

    case AuditEventType.SUBDIVISION_ADDED:
      return buildSubdivisionAddedEmbed(embed, data as SubdivisionEventData);

    case AuditEventType.SUBDIVISION_UPDATED:
      return buildSubdivisionUpdatedEmbed(embed, data as SubdivisionEventData);

    case AuditEventType.SUBDIVISION_REMOVED:
      return buildSubdivisionRemovedEmbed(embed, data as SubdivisionEventData);

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

    case AuditEventType.SUBDIVISION_PAUSED:
      return buildSubdivisionPausedEmbed(embed, data as SubdivisionToggleData);

    case AuditEventType.SUBDIVISION_UNPAUSED:
      return buildSubdivisionUnpausedEmbed(embed, data as SubdivisionToggleData);

    case AuditEventType.PRESENCE_ASSET_SET:
      return buildPresenceAssetSetEmbed(embed, data as PresenceAssetSetData);

    case AuditEventType.VK_CHAT_UNLINKED:
      return buildChatUnlinkedEmbed(embed, data as ChatUnlinkedData, 'VK');

    case AuditEventType.TELEGRAM_CHAT_UNLINKED:
      return buildChatUnlinkedEmbed(embed, data as ChatUnlinkedData, 'Telegram');

    case AuditEventType.VK_NOTIFICATION_FAILED:
      return buildNotificationFailedEmbed(embed, data as NotificationFailedData, 'VK');

    case AuditEventType.TELEGRAM_NOTIFICATION_FAILED:
      return buildNotificationFailedEmbed(embed, data as NotificationFailedData, 'Telegram');

    case AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT:
      return buildUnauthorizedAccessEmbed(embed, data as UnauthorizedAccessData);

    case AuditEventType.HISTORY_VIEWED:
      return buildHistoryViewedEmbed(embed, data as HistoryViewedData);

    case AuditEventType.VERIFICATION_TOKEN_CREATED:
      return buildVerificationTokenCreatedEmbed(embed, data as VerificationTokenCreatedData);

    case AuditEventType.BOT_CONNECTED:
      return buildBotConnectedEmbed(embed, data as BotStatusData);

    case AuditEventType.BOT_CONNECTION_FAILED:
      return buildBotConnectionFailedEmbed(embed, data as BotStatusData);

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

  if (data.location) {
    embed.addFields({ name: 'Место', value: data.location, inline: true });
  }

  if (data.briefDescription) {
    embed.addFields({ name: 'Кратко', value: data.briefDescription.substring(0, 512), inline: false });
  }

  if (data.tacChannel) {
    embed.addFields({ name: 'Такт. канал', value: data.tacChannel, inline: true });
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
 * Embed для автоматического закрытия каллаута по таймауту
 */
function buildCalloutAutoClosedEmbed(
  embed: EmbedBuilder,
  data: CalloutAutoClosedData
): EmbedBuilder {
  embed
    .setTitle('⏰ Каллаут закрыт по таймауту')
    .setColor(COLORS.CLOSED)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Закрыл', value: 'Система (автотаймаут)', inline: true },
    ]);

  if (data.channelId) {
    embed.addFields({ name: 'Канал', value: `<#${data.channelId}>`, inline: true });
  }

  if (data.duration) {
    embed.addFields({ name: 'Длительность', value: data.duration, inline: true });
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
  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: 'Название', value: data.factionName, inline: true },
    { name: 'Роль', value: `<@&${data.roleId}>`, inline: true },
    { name: 'Добавил', value: `<@${data.userId}>`, inline: true },
  ];
  if (data.description) {
    fields.push({ name: 'Описание', value: data.description, inline: false });
  }
  if (data.logoUrl) {
    fields.push({ name: 'Логотип', value: data.logoUrl, inline: true });
  }
  if (data.vkChatId) {
    fields.push({ name: 'VK Беседа', value: data.vkChatId, inline: true });
  }
  return embed
    .setTitle(`${EMOJI.SUCCESS} Фракция добавлена`)
    .setColor(COLORS.ACTIVE)
    .addFields(fields);
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
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Изменил', value: `<@${data.userId}>`, inline: true },
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
    .addFields([
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Удалил', value: `<@${data.userId}>`, inline: true },
    ]);
}

/**
 * Embed для добавления подразделения
 */
function buildSubdivisionAddedEmbed(
  embed: EmbedBuilder,
  data: SubdivisionEventData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Подразделение добавлено`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Добавил', value: `<@${data.userId}>`, inline: true },
    ]);
}

/**
 * Embed для обновления подразделения
 */
function buildSubdivisionUpdatedEmbed(
  embed: EmbedBuilder,
  data: SubdivisionEventData
): EmbedBuilder {
  embed
    .setTitle(`${EMOJI.INFO} Подразделение обновлено`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Изменил', value: `<@${data.userId}>`, inline: true },
    ]);
  if (data.changes && data.changes.length > 0) {
    embed.addFields({ name: 'Изменения', value: data.changes.join('\n'), inline: false });
  }
  return embed;
}

/**
 * Embed для удаления подразделения
 */
function buildSubdivisionRemovedEmbed(
  embed: EmbedBuilder,
  data: SubdivisionEventData
): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.WARNING} Подразделение удалено`)
    .setColor(COLORS.WARNING)
    .addFields([
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Удалил', value: `<@${data.userId}>`, inline: true },
    ]);
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
    .addFields([
      { name: 'Изменил', value: `<@${data.userId}>`, inline: true },
      { name: 'Изменения', value: data.changes.join('\n'), inline: false },
    ]);
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
    .addFields([
      { name: 'Роль', value: `<@&${data.roleId}>`, inline: true },
      { name: 'Добавил', value: `<@${data.userId}>`, inline: true },
    ]);
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
    .addFields([
      { name: 'Роль', value: `<@&${data.roleId}>`, inline: true },
      { name: 'Удалил', value: `<@${data.userId}>`, inline: true },
    ]);
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
    .addFields([
      { name: 'Канал', value: `<#${data.channelId}>`, inline: true },
      { name: 'Установил', value: `<@${data.userId}>`, inline: true },
    ]);
}

/**
 * Embed для получения VK ответа
 */
function buildVkResponseReceivedEmbed(
  embed: EmbedBuilder,
  data: VkResponseReceivedData
): EmbedBuilder {
  embed
    .setTitle(`${EMOJI.SUCCESS} Получен ответ из VK`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Подразделение', value: data.factionName, inline: true },
    ]);

  if (data.chatId) {
    const chatLabel = data.chatTitle ? `${data.chatTitle} (${data.chatId})` : data.chatId;
    embed.addFields({ name: 'VK Беседа', value: chatLabel, inline: true });
  }

  embed.addFields({ name: 'Пользователь VK', value: `${data.vkUserName} (${data.vkUserId})`, inline: false });

  return embed;
}

/**
 * Embed для получения Telegram ответа
 */
function buildTelegramResponseReceivedEmbed(
  embed: EmbedBuilder,
  data: TelegramResponseReceivedData
): EmbedBuilder {
  embed
    .setTitle(`${EMOJI.SUCCESS} Получен ответ из Telegram`)
    .setColor(COLORS.INFO)
    .addFields([
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Подразделение', value: data.factionName, inline: true },
    ]);

  if (data.chatId) {
    const chatLabel = data.chatTitle ? `${data.chatTitle} (${data.chatId})` : data.chatId;
    embed.addFields({ name: 'Telegram Группа', value: chatLabel, inline: true });
  }

  embed.addFields({ name: 'Пользователь Telegram', value: `${data.telegramUserName} (${data.telegramUserId})`, inline: false });

  return embed;
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
  embed.setThumbnail(PLATFORM_THUMBNAIL['VK']);
  const chatLabel = data.chatTitle ? `${data.chatTitle} (${data.vkChatId})` : data.vkChatId;
  return embed
    .setTitle(`${EMOJI.SUCCESS} VK беседа привязана`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'VK Беседа', value: chatLabel, inline: true },
      { name: 'Привязал', value: `<@${data.userId}>`, inline: true },
    ]);
}

/**
 * Embed для привязки Telegram группы
 */
function buildTelegramChatLinkedEmbed(
  embed: EmbedBuilder,
  data: TelegramChatLinkedData
): EmbedBuilder {
  embed.setThumbnail(PLATFORM_THUMBNAIL['Telegram']);
  const chatLabel = data.chatTitle ? `${data.chatTitle} (${data.telegramChatId})` : data.telegramChatId;
  return embed
    .setTitle(`${EMOJI.SUCCESS} Telegram группа привязана`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Telegram Группа', value: chatLabel, inline: true },
      { name: 'Привязал', value: `<@${data.userId}>`, inline: true },
    ]);
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
    .addFields([
      { name: 'Роль', value: `<@&${data.roleId}>`, inline: true },
      { name: 'Добавил', value: `<@${data.userId}>`, inline: true },
    ]);
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
    .addFields([
      { name: 'Роль', value: `<@&${data.roleId}>`, inline: true },
      { name: 'Удалил', value: `<@${data.userId}>`, inline: true },
    ]);
}

/**
 * Embed для создания типа фракции
 */
function buildFactionTypeCreatedEmbed(
  embed: EmbedBuilder,
  data: FactionTypeCreatedData
): EmbedBuilder {
  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: 'Название типа', value: data.typeName, inline: true },
    { name: 'Создал', value: `<@${data.userId}>`, inline: true },
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
      { name: 'Тип', value: data.typeName, inline: true },
      { name: 'Изменил', value: `<@${data.userId}>`, inline: true },
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
      { name: 'Тип', value: data.typeName, inline: true },
      { name: 'Удалил', value: `<@${data.userId}>`, inline: true },
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
      { name: 'Добавил', value: `<@${data.userId}>`, inline: true },
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
      { name: 'Отменил', value: `<@${data.userId}>`, inline: true },
      { name: 'Детали', value: data.details, inline: false },
    ]);
}

function buildSubdivisionPausedEmbed(embed: EmbedBuilder, data: SubdivisionToggleData): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.WARNING} Приём каллаутов отключён`)
    .setColor(COLORS.WARNING)
    .addFields(
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Изменил', value: `<@${data.userId}>`, inline: true },
    );
}

function buildSubdivisionUnpausedEmbed(embed: EmbedBuilder, data: SubdivisionToggleData): EmbedBuilder {
  return embed
    .setTitle(`${EMOJI.SUCCESS} Приём каллаутов включён`)
    .setColor(COLORS.ACTIVE)
    .addFields(
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Изменил', value: `<@${data.userId}>`, inline: true },
    );
}

function buildPresenceAssetSetEmbed(embed: EmbedBuilder, data: PresenceAssetSetData): EmbedBuilder {
  return embed
    .setTitle(`🎮 Presence Asset установлен`)
    .setColor(COLORS.INFO)
    .addFields(
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Asset Name', value: data.assetName ?? '(удалён)', inline: true },
      { name: 'Изменил', value: `<@${data.userId}>`, inline: true },
    );
}

function buildChatUnlinkedEmbed(embed: EmbedBuilder, data: ChatUnlinkedData, platform: string): EmbedBuilder {
  const thumbnail = PLATFORM_THUMBNAIL[platform];
  if (thumbnail) embed.setThumbnail(thumbnail);
  const chatLabel = data.chatTitle ? `${data.chatTitle} (${data.chatId})` : data.chatId;
  return embed
    .setTitle(`${EMOJI.WARNING} ${platform} беседа отвязана`)
    .setColor(COLORS.WARNING)
    .addFields(
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: `${platform} Чат`, value: chatLabel, inline: true },
      { name: 'Отвязал', value: `<@${data.userId}>`, inline: true },
    );
}

const PLATFORM_EMOJI: Record<string, string> = {
  VK:       '<:vk:899963354993532960>',
  Telegram: '<:telegram:1232769336754704444>',
};

const PLATFORM_THUMBNAIL: Record<string, string> = {
  VK:       'https://cdn.discordapp.com/emojis/899963354993532960.png',
  Telegram: 'https://cdn.discordapp.com/emojis/1232769336754704444.png',
};

function buildNotificationFailedEmbed(embed: EmbedBuilder, data: NotificationFailedData, platform: string): EmbedBuilder {
  const thumbnail = PLATFORM_THUMBNAIL[platform];
  if (thumbnail) embed.setThumbnail(thumbnail);
  embed
    .setTitle(`${EMOJI.ERROR} Ошибка отправки уведомления ${platform}`)
    .setColor(COLORS.ERROR)
    .addFields(
      { name: 'ID Каллаута', value: `#${data.calloutId}`, inline: true },
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
    );

  if (data.chatId) {
    const chatLabel = data.chatTitle ? `${data.chatTitle} (${data.chatId})` : data.chatId;
    embed.addFields({ name: `${platform} Чат`, value: chatLabel, inline: true });
  }

  embed.addFields({ name: 'Ошибка', value: data.errorMessage.substring(0, 512), inline: false });

  return embed;
}

const UNAUTHORIZED_ACTION_LABELS: Record<string, string> = {
  respond:          'Отреагировать на инцидент',
  close:            'Закрыть инцидент',
  create_callout:   'Создать каллаут',
  open_faction:     '/faction — лидерская панель',
  open_settings:    '/settings — панель администратора',
  open_admin_panel: 'Кнопки admin-панели',
  open_history:     '/history — история каллаутов',
};

function buildUnauthorizedAccessEmbed(embed: EmbedBuilder, data: UnauthorizedAccessData): EmbedBuilder {
  const actionLabel = UNAUTHORIZED_ACTION_LABELS[data.action] ?? data.action;

  const title = data.calloutId !== undefined
    ? `🚫 Несанкционированный доступ к каллауту #${data.calloutId}`
    : `🚫 Попытка несанкционированного доступа`;

  embed
    .setTitle(title)
    .setColor(COLORS.ERROR)
    .addFields(
      { name: 'Действие', value: actionLabel, inline: true },
      { name: 'Пользователь', value: `<@${data.userId}>`, inline: true },
    );

  if (data.subdivisionName) {
    embed.addFields({ name: 'Подразделение', value: data.subdivisionName, inline: true });
  }
  if (data.reason) {
    embed.addFields({ name: 'Причина', value: data.reason.substring(0, 512), inline: false });
  }

  return embed;
}

function buildHistoryViewedEmbed(embed: EmbedBuilder, data: HistoryViewedData): EmbedBuilder {
  return embed
    .setTitle(`📋 История каллаутов просмотрена`)
    .setColor(COLORS.INFO)
    .addFields(
      { name: 'Просмотрел', value: `<@${data.userId}>`, inline: true },
      { name: 'Фильтры', value: data.filters || 'Без фильтров', inline: true },
    );
}

function buildVerificationTokenCreatedEmbed(embed: EmbedBuilder, data: VerificationTokenCreatedData): EmbedBuilder {
  return embed
    .setTitle(`🔑 Токен верификации создан`)
    .setColor(COLORS.INFO)
    .addFields(
      { name: 'Подразделение', value: data.subdivisionName, inline: true },
      { name: 'Фракция', value: data.factionName, inline: true },
      { name: 'Платформа', value: data.platform, inline: true },
      { name: 'Создал', value: `<@${data.userId}>`, inline: true },
    );
}

function buildBotConnectedEmbed(embed: EmbedBuilder, data: BotStatusData): EmbedBuilder {
  const thumbnail = PLATFORM_THUMBNAIL[data.platform];
  if (thumbnail) embed.setThumbnail(thumbnail);
  embed
    .setTitle(`${EMOJI.SUCCESS} ${data.platform} бот подключён`)
    .setColor(COLORS.ACTIVE)
    .addFields({ name: 'Платформа', value: data.platform, inline: true });
  if (data.mode) {
    embed.addFields({ name: 'Режим', value: data.mode, inline: true });
  }
  return embed;
}

function buildBotConnectionFailedEmbed(embed: EmbedBuilder, data: BotStatusData): EmbedBuilder {
  const thumbnail = PLATFORM_THUMBNAIL[data.platform];
  if (thumbnail) embed.setThumbnail(thumbnail);
  embed
    .setTitle(`${EMOJI.ERROR} ${data.platform} бот: ошибка подключения`)
    .setColor(COLORS.ERROR)
    .addFields({ name: 'Платформа', value: data.platform, inline: true });
  if (data.errorMessage) {
    embed.addFields({ name: 'Ошибка', value: data.errorMessage.substring(0, 512), inline: false });
  }
  return embed;
}

/**
 * Отправить audit событие во все guilds, у которых настроен audit log канал.
 * Используется для системных событий без привязки к конкретному серверу (старт ботов и т.п.)
 */
export async function logAuditEventToAllGuilds(
  eventType: AuditEventType,
  data: AuditEventData
): Promise<void> {
  try {
    const servers = await ServerModel.findAll();
    const serversWithAuditLog = servers.filter(s => s.audit_log_channel_id);
    if (serversWithAuditLog.length === 0) return;

    // Lazy import чтобы избежать циклических зависимостей
    const { default: discordBot } = await import('../bot');

    for (const server of serversWithAuditLog) {
      const guild = discordBot.client.guilds.cache.get(server.guild_id);
      if (!guild) continue;
      logAuditEvent(guild, eventType, data).catch(() => {});
    }
  } catch (error) {
    logger.error('Failed to broadcast audit event to all guilds', {
      error: error instanceof Error ? error.message : error,
      eventType,
    });
  }
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
