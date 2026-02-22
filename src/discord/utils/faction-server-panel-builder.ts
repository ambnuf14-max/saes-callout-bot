import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { Server, Faction, Subdivision } from '../../types/database.types';
import { ServerModel } from '../../database/models';
import { COLORS, EMOJI } from '../../config/constants';
import { parseDiscordEmoji, getEmojiCdnUrl } from './subdivision-settings-helper';

/**
 * Построить главную панель faction-сервера (нужна настройка)
 */
export function buildFactionServerSetupPanel(server: Server) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('⚠️ Требуется настройка')
    .setDescription(
      `Этот сервер привязан к фракции, но **калаут-система ещё не настроена**.\n\n` +
      `Нажмите кнопку ниже, чтобы создать канал и категорию для калаутов.\n\n` +
      `После настройки участники смогут создавать внутрифракционные калауты прямо здесь.`
    )
    .addFields({
      name: '📜 Audit Log',
      value: server.audit_log_channel_id
        ? `<#${server.audit_log_channel_id}>`
        : 'Не настроен',
      inline: true,
    })
    .setFooter({ text: 'SAES Callout System — Faction Server' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_server_setup')
      .setLabel('Настроить систему')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('faction_server_link_info')
      .setLabel('Информация о привязке')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить главную панель faction-сервера (система настроена)
 */
export async function buildFactionServerMainPanel(server: Server, localFaction: Faction, subdivisions: Subdivision[]) {
  const activeCount = subdivisions.filter(s => s.is_active).length;
  const acceptingCount = subdivisions.filter(s => s.is_active && s.is_accepting_callouts).length;

  const systemStatus = server.callout_channel_id
    ? `Канал: <#${server.callout_channel_id}>${server.category_id ? `\nКатегория: <#${server.category_id}>` : ''}`
    : `${EMOJI.ERROR} Канал не настроен`;

  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
  const leaderRolesValue = leaderRoleIds.length > 0
    ? leaderRoleIds.map(id => `<@&${id}>`).join('\n')
    : 'Не настроены';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJI.INFO} Фракционный сервер: ${localFaction.name}`)
    .setDescription('Управляйте внутрифракционными калаутами.')
    .addFields(
      {
        name: '📊 Статус системы',
        value: systemStatus,
        inline: true,
      },
      {
        name: '📂 Подразделения',
        value: `Активных: ${activeCount}\nПринимают калауты: ${acceptingCount}`,
        inline: true,
      },
      {
        name: '👥 Роли лидера',
        value: leaderRolesValue,
        inline: true,
      },
      {
        name: '📜 Audit Log',
        value: server.audit_log_channel_id
          ? `<#${server.audit_log_channel_id}>`
          : 'Не настроен',
        inline: true,
      },
    )
    .setFooter({ text: 'SAES Callout System — Faction Server' })
    .setTimestamp();

  if (localFaction.logo_url) {
    const parsed = parseDiscordEmoji(localFaction.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbnailUrl = cdnUrl ?? (parsed === null && (localFaction.logo_url ?? '').includes('://') ? localFaction.logo_url! : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_server_subdivisions')
      .setLabel('Подразделения')
      .setEmoji('📂')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('faction_server_settings')
      .setLabel('Настройки')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('faction_server_link_info')
      .setLabel('О привязке')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить панель информации о привязке faction-сервера
 */
export function buildFactionServerLinkInfoPanel(
  server: Server,
  linkedFactionName: string | null
) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('🔗 Информация о привязке')
    .addFields(
      {
        name: 'Статус',
        value: server.server_type === 'faction' ? '✅ Привязан' : '❌ Не привязан',
        inline: true,
      },
      {
        name: 'Фракция',
        value: linkedFactionName ?? (server.linked_faction_id ? `ID ${server.linked_faction_id}` : 'Неизвестна'),
        inline: true,
      },
    )
    .setDescription(
      server.server_type === 'faction'
        ? 'Этот сервер является фракционным сервером. Калауты, созданные здесь, видны в audit log главного сервера.'
        : 'Этот сервер не привязан к фракции. Используйте `/link <TOKEN>` для привязки.'
    )
    .setTimestamp();

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId('faction_server_main')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  ];

  if (server.server_type === 'faction') {
    buttons.unshift(
      new ButtonBuilder()
        .setCustomId('faction_server_unlink_confirm')
        .setLabel('Отвязать сервер')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Danger),
    );
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

  return { embeds: [embed], components: [row] };
}

/**
 * Построить панель настроек faction-сервера
 */
export function buildFactionServerSettingsPanel(server: Server) {
  const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(server);
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('⚙️ Настройки фракционного сервера')
    .addFields(
      {
        name: '👥 Роли лидера',
        value: leaderRoleIds.length > 0
          ? leaderRoleIds.map(id => `<@&${id}>`).join('\n')
          : 'Не настроены (только Administrator)',
        inline: true,
      },
      {
        name: '📞 Роли для создания калаутов',
        value: calloutRoleIds.length > 0
          ? calloutRoleIds.map(id => `<@&${id}>`).join('\n')
          : 'Любой может создавать',
        inline: true,
      },
      {
        name: '📜 Audit Log',
        value: server.audit_log_channel_id
          ? `<#${server.audit_log_channel_id}>`
          : 'Не настроен',
        inline: true,
      },
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_server_set_leader_roles')
      .setLabel('Роли лидера')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('faction_server_set_callout_roles')
      .setLabel('Роли калаутов')
      .setEmoji('📞')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('faction_server_set_audit_log')
      .setLabel('Audit Log')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('faction_server_main')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}
