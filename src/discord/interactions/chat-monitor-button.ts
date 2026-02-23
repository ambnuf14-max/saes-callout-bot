import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel, SubdivisionModel } from '../../database/models';
import { PlatformChatMessageModel } from '../../database/models/PlatformChatMessage';
import { COLORS, EMOJI, CHAT_MONITOR, OWNER_DISCORD_ID } from '../../config/constants';
import { PlatformChatMessage } from '../../types/database.types';

function isOwner(interaction: ButtonInteraction): boolean {
  return !!OWNER_DISCORD_ID && interaction.user.id === OWNER_DISCORD_ID;
}

/**
 * Форматировать время для embed
 */
function fmtTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

/**
 * Построить embed со списком подразделений и кнопками мониторинга
 */
async function buildMonitoringListPanel(serverId: number) {
  const subdivisions = await SubdivisionModel.findByServerId(serverId, false);

  const lines: string[] = [];
  for (const sub of subdivisions) {
    const linked = sub.vk_chat_id || sub.telegram_chat_id
      ? `VK: ${sub.vk_chat_id ? '✅' : '❌'} | TG: ${sub.telegram_chat_id ? '✅' : '❌'}`
      : '(чат не привязан)';
    const monitor = sub.monitoring_enabled ? '🟢 Мониторинг ВКЛ' : '⚪ Мониторинг ВЫКЛ';
    const msgCount = await PlatformChatMessageModel.countBySubdivision(sub.id);
    lines.push(`**${sub.name}** — ${linked}\n${monitor} | 💬 ${msgCount} сообщений`);
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📊 Мониторинг чатов VK/TG')
    .setDescription(
      lines.length > 0
        ? lines.join('\n\n')
        : 'Подразделения не найдены'
    )
    .setFooter({ text: `CALLOUT_CAPTURE: следующие ${CHAT_MONITOR.CALLOUT_CAPTURE_COUNT} сообщений после каллаута | MONITORING: rolling ${CHAT_MONITOR.MONITORING_MAX_MESSAGES} сообщений` });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const chunks = chunkArray(subdivisions, 2);

  for (const chunk of chunks) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const sub of chunk) {
      const hasChat = !!(sub.vk_chat_id || sub.telegram_chat_id);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`chat_monitor_view_${sub.id}_1`)
          .setLabel(sub.name.substring(0, 15))
          .setEmoji('💬')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!hasChat),
        new ButtonBuilder()
          .setCustomId(`chat_monitor_toggle_${sub.id}`)
          .setLabel(sub.monitoring_enabled ? 'Выкл' : 'Мониторинг')
          .setStyle(sub.monitoring_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
          .setDisabled(!hasChat),
      );
    }
    rows.push(row);
    if (rows.length >= 4) break;
  }

  // Кнопка назад
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_settings')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(backRow);

  return { embeds: [embed], components: rows };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Построить embed с сообщениями подразделения
 */
async function buildMessagesPanel(
  subdivisionId: number,
  page: number,
  platform?: 'vk' | 'telegram'
) {
  const subdivision = await SubdivisionModel.findById(subdivisionId);
  const { messages, total } = await PlatformChatMessageModel.findBySubdivision(
    subdivisionId,
    platform,
    undefined,
    page,
    CHAT_MONITOR.PAGE_SIZE
  );

  const totalPages = Math.max(1, Math.ceil(total / CHAT_MONITOR.PAGE_SIZE));

  const lines = messages.map((m: PlatformChatMessage) => {
    const time = fmtTime(m.captured_at);
    const platEmoji = m.platform === 'vk' ? '🅰️' : '✈️';
    const tag = m.capture_type === 'callout' ? `[#${m.callout_id}]` : '[мониторинг]';
    const content = m.content.length > 120 ? m.content.substring(0, 117) + '...' : m.content;
    const namePrefix = m.user_id === 'bot' ? '🤖 ' : '';
    return `${platEmoji} ${tag} \`${time}\`\n**${namePrefix}${m.user_name}:** ${content}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`💬 Сообщения — ${subdivision?.name ?? `ID ${subdivisionId}`}`)
    .setDescription(lines.length > 0 ? lines.join('\n\n') : 'Нет сохранённых сообщений')
    .setFooter({ text: `Страница ${page}/${totalPages} • Всего: ${total}` });

  const navRow = new ActionRowBuilder<ButtonBuilder>();

  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`chat_monitor_view_${subdivisionId}_${page - 1}_${platform ?? 'all'}`)
      .setLabel('◀ Назад')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`chat_monitor_view_${subdivisionId}_${page + 1}_${platform ?? 'all'}`)
      .setLabel('Вперёд ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );

  // Фильтры по платформе
  if (!platform) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`chat_monitor_view_${subdivisionId}_1_vk`)
        .setLabel('Только VK')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`chat_monitor_view_${subdivisionId}_1_telegram`)
        .setLabel('Только TG')
        .setStyle(ButtonStyle.Primary),
    );
  } else {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`chat_monitor_view_${subdivisionId}_1_all`)
        .setLabel('Все платформы')
        .setStyle(ButtonStyle.Primary),
    );
  }

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('chat_monitor_main')
      .setLabel('← К списку')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [navRow, backRow] };
}

/**
 * Главный обработчик кнопок `chat_monitor_*`
 */
export async function handleChatMonitorButton(interaction: ButtonInteraction): Promise<void> {
  if (!isOwner(interaction)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Доступ запрещён`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  const customId = interaction.customId;

  try {
    // chat_monitor_main — главная страница со списком
    if (customId === 'chat_monitor_main') {
      if (!interaction.guild) return;
      const server = await ServerModel.findByGuildId(interaction.guild.id);
      if (!server) return;
      const panel = await buildMonitoringListPanel(server.id);
      await interaction.editReply(panel);
      return;
    }

    // chat_monitor_toggle_{subdivisionId}
    if (customId.startsWith('chat_monitor_toggle_')) {
      if (!interaction.guild) return;
      const server = await ServerModel.findByGuildId(interaction.guild.id);
      if (!server) return;

      const subdivisionId = parseInt(customId.replace('chat_monitor_toggle_', ''));
      const subdivision = await SubdivisionModel.findById(subdivisionId);
      if (!subdivision || subdivision.server_id !== server.id) return;

      await SubdivisionModel.toggleMonitoring(subdivisionId, !subdivision.monitoring_enabled);

      logger.info('Chat monitoring toggled', {
        subdivisionId,
        enabled: !subdivision.monitoring_enabled,
        by: interaction.user.username,
      });

      const panel = await buildMonitoringListPanel(server.id);
      await interaction.editReply(panel);
      return;
    }

    // chat_monitor_view_{subdivisionId}_{page} или chat_monitor_view_{subdivisionId}_{page}_{platform}
    if (customId.startsWith('chat_monitor_view_')) {
      if (!interaction.guild) return;
      const server = await ServerModel.findByGuildId(interaction.guild.id);
      if (!server) return;

      const parts = customId.replace('chat_monitor_view_', '').split('_');
      const subdivisionId = parseInt(parts[0]);
      const page = Math.min(Math.max(1, parseInt(parts[1]) || 1), 9999);
      const platformRaw = parts[2];
      const platform = platformRaw === 'vk' ? 'vk' : platformRaw === 'telegram' ? 'telegram' : undefined;

      const subdivision = await SubdivisionModel.findById(subdivisionId);
      if (!subdivision || subdivision.server_id !== server.id) return;

      const panel = await buildMessagesPanel(subdivisionId, page, platform);
      await interaction.editReply(panel);
      return;
    }
  } catch (error) {
    logger.error('Error in chat monitor button handler', {
      error: error instanceof Error ? error.message : error,
      customId,
    });
  }
}
