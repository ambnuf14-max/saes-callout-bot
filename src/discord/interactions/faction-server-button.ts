import {
  ButtonInteraction,
  RoleSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel, FactionModel, SubdivisionModel } from '../../database/models';
import { isAdministrator } from '../utils/permission-checker';
import { EMOJI, COLORS } from '../../config/constants';
import {
  buildFactionServerMainPanel,
  buildFactionServerSetupPanel,
  buildFactionServerLinkInfoPanel,
  buildFactionServerSettingsPanel,
} from '../utils/faction-server-panel-builder';
import { FactionLinkService } from '../../services/faction-link.service';
import { buildSetupSection } from '../utils/admin-panel-builder';
import { logAuditEvent, logAuditEventWithForwarding, AuditEventType, SettingsUpdatedData, FactionServerUnlinkedData } from '../utils/audit-logger';

/**
 * Проверить права администратора для faction-сервера
 */
async function checkFactionServerAdmin(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.guild) return false;
  const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id);
  return isAdministrator(member);
}

/**
 * Обработчик кнопок faction_server_*
 */
export async function handleFactionServerButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: `${EMOJI.ERROR} Только на сервере`, flags: MessageFlags.Ephemeral });
    return;
  }

  const hasAccess = await checkFactionServerAdmin(interaction);
  if (!hasAccess) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Только администраторы или лидеры могут управлять панелью`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  const { customId } = interaction;
  const server = await ServerModel.findByGuildId(interaction.guild.id);
  if (!server) {
    await interaction.editReply({ content: `${EMOJI.ERROR} Сервер не найден в базе данных.`, components: [], embeds: [] });
    return;
  }

  try {
    if (customId === 'faction_server_main') {
      // Главная панель faction-сервера
      if (server.faction_server_needs_setup) {
        await interaction.editReply(buildFactionServerSetupPanel(server));
        return;
      }
      const factions = await FactionModel.findByServerId(server.id, true);
      const localFaction = factions[0];
      if (!localFaction) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Локальная фракция не найдена. Переустановите сервер командой /link.`,
          embeds: [], components: [],
        });
        return;
      }
      const subdivisions = await SubdivisionModel.findByFactionId(localFaction.id, false);
      await interaction.editReply(await buildFactionServerMainPanel(server, localFaction, subdivisions));
    }

    else if (customId === 'faction_server_setup') {
      // Перенаправить на стандартную настройку канала/категории
      const panel = buildSetupSection(server);
      await interaction.editReply(panel);
    }

    else if (customId === 'faction_server_subdivisions') {
      // Управление подразделениями — переиспользуем admin-панель фракции
      const factions = await FactionModel.findByServerId(server.id, true);
      const localFaction = factions[0];
      if (!localFaction) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Локальная фракция не найдена.`,
          embeds: [], components: [],
        });
        return;
      }
      // Перенаправляем на стандартную панель подразделений
      const { buildFactionSubdivisionsPanel } = await import('../utils/admin-panel-builder');
      const subdivisions = await SubdivisionModel.findByFactionId(localFaction.id, false);
      const panel = buildFactionSubdivisionsPanel(localFaction, subdivisions);
      await interaction.editReply(panel);
    }

    else if (customId === 'faction_server_settings') {
      await interaction.editReply(buildFactionServerSettingsPanel(server));
    }

    else if (customId === 'faction_server_link_info') {
      // Получить имя фракции
      let linkedFactionName: string | null = null;
      if (server.linked_faction_id) {
        const linkedFaction = await FactionModel.findById(server.linked_faction_id);
        linkedFactionName = linkedFaction?.name ?? null;
      }
      await interaction.editReply(buildFactionServerLinkInfoPanel(server, linkedFactionName));
    }

    else if (customId === 'faction_server_unlink_confirm') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('⚠️ Подтвердите отвязку')
        .setDescription(
          'Вы уверены, что хотите отвязать этот сервер от фракции?\n\n' +
          'Все данные (подразделения, калауты) будут сохранены, но сервер станет обычным главным сервером.'
        );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('faction_server_unlink_execute')
          .setLabel('Отвязать')
          .setEmoji('⚠️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('faction_server_link_info')
          .setLabel('Отмена')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    }

    else if (customId === 'faction_server_unlink_execute') {
      // Получить имя фракции до отвязки (потом эта информация будет недоступна)
      let linkedFactionName: string | undefined;
      if (server.linked_faction_id) {
        const linkedFaction = await FactionModel.findById(server.linked_faction_id);
        linkedFactionName = linkedFaction?.name;
      }

      // Логируем до отвязки — иначе forwarding не сработает (linked_main_server_id будет очищен)
      await logAuditEventWithForwarding(interaction.guild, AuditEventType.FACTION_SERVER_UNLINKED, {
        userId: interaction.user.id,
        userName: interaction.user.username,
        guildName: interaction.guild.name,
        factionName: linkedFactionName,
      } as FactionServerUnlinkedData);

      await FactionLinkService.unlinkFactionServer(server.id);

      const embed = new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${EMOJI.SUCCESS} Сервер отвязан`)
        .setDescription('Этот сервер больше не является фракционным сервером. Бот покинет сервер через несколько секунд.');

      await interaction.editReply({ embeds: [embed], components: [] });

      setTimeout(() => {
        interaction.guild?.leave().catch((err) => {
          logger.error('Failed to leave guild after unlink', {
            guildId: interaction.guild?.id,
            error: err instanceof Error ? err.message : err,
          });
        });
      }, 5000);
    }

    else if (customId === 'faction_server_set_leader_roles') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle('👥 Роли лидера фракционного сервера')
        .setDescription('Выберите роли, которые будут иметь доступ к настройкам этого сервера.');

      const selectMenu = new RoleSelectMenuBuilder()
        .setCustomId('faction_server_role_leader')
        .setPlaceholder('Выберите роли лидеров')
        .setMinValues(0)
        .setMaxValues(5);

      const row1 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(selectMenu);
      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('faction_server_settings')
          .setLabel('Назад')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row1, row2] });
    }

    else if (customId === 'faction_server_set_callout_roles') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle('📞 Роли для создания калаутов')
        .setDescription('Выберите роли, которые могут создавать калауты. Оставьте пустым — могут все.');

      const selectMenu = new RoleSelectMenuBuilder()
        .setCustomId('faction_server_role_callout')
        .setPlaceholder('Выберите роли')
        .setMinValues(0)
        .setMaxValues(10);

      const row1 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(selectMenu);
      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('faction_server_settings')
          .setLabel('Назад')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row1, row2] });
    }

    else if (customId === 'faction_server_set_audit_log') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle('📜 Audit Log канал')
        .setDescription('Выберите текстовый канал для логирования событий.');

      const selectMenu = new ChannelSelectMenuBuilder()
        .setCustomId('faction_server_channel_audit')
        .setPlaceholder('Выберите канал')
        .addChannelTypes(ChannelType.GuildText);

      const row1 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(selectMenu);
      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('faction_server_settings')
          .setLabel('Назад')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row1, row2] });
    }

  } catch (error) {
    logger.error('Error handling faction_server button', {
      customId,
      error: error instanceof Error ? error.message : error,
      guildId: interaction.guild?.id,
    });
    await interaction.editReply({
      content: `${EMOJI.ERROR} Произошла ошибка`,
      embeds: [],
      components: [],
    });
  }
}

/**
 * Обработчик выбора ролей для faction_server_role_*
 */
export async function handleFactionServerRoleSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) return;

  const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id);
  if (!isAdministrator(member)) {
    await interaction.reply({ content: `${EMOJI.ERROR} Нет доступа`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const server = await ServerModel.findByGuildId(interaction.guild.id);
  if (!server) return;

  const selectedRoleIds = interaction.values;
  const { customId } = interaction;

  if (customId === 'faction_server_role_leader') {
    await ServerModel.update(server.id, { leader_role_ids: selectedRoleIds });
    const updatedServer = await ServerModel.findByGuildId(interaction.guild.id);
    if (!updatedServer) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Не удалось загрузить настройки`, embeds: [], components: [] });
      return;
    }
    await interaction.editReply(buildFactionServerSettingsPanel(updatedServer));

    logAuditEvent(interaction.guild, AuditEventType.SETTINGS_UPDATED, {
      userId: interaction.user.id,
      userName: interaction.user.username,
      changes: [`Роли лидера обновлены: ${selectedRoleIds.length > 0 ? selectedRoleIds.map(id => `<@&${id}>`).join(', ') : 'очищены'}`],
    } as SettingsUpdatedData).catch(() => {});
  }

  else if (customId === 'faction_server_role_callout') {
    await ServerModel.update(server.id, { callout_allowed_role_ids: selectedRoleIds });
    const updatedServer = await ServerModel.findByGuildId(interaction.guild.id);
    if (!updatedServer) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Не удалось загрузить настройки`, embeds: [], components: [] });
      return;
    }
    await interaction.editReply(buildFactionServerSettingsPanel(updatedServer));

    logAuditEvent(interaction.guild, AuditEventType.SETTINGS_UPDATED, {
      userId: interaction.user.id,
      userName: interaction.user.username,
      changes: [`Роли калаутов обновлены: ${selectedRoleIds.length > 0 ? selectedRoleIds.map(id => `<@&${id}>`).join(', ') : 'очищены'}`],
    } as SettingsUpdatedData).catch(() => {});
  }
}

/**
 * Обработчик выбора канала для faction_server_channel_*
 */
export async function handleFactionServerChannelSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) return;

  const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id);
  if (!isAdministrator(member)) {
    await interaction.reply({ content: `${EMOJI.ERROR} Нет доступа`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const server = await ServerModel.findByGuildId(interaction.guild.id);
  if (!server) return;

  const channelId = interaction.values[0];
  if (!channelId) return;

  if (interaction.customId === 'faction_server_channel_audit') {
    await ServerModel.update(server.id, { audit_log_channel_id: channelId });
    const updatedServer = await ServerModel.findByGuildId(interaction.guild.id);
    if (!updatedServer) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Не удалось загрузить настройки`, embeds: [], components: [] });
      return;
    }
    await interaction.editReply(buildFactionServerSettingsPanel(updatedServer));

    logAuditEvent(interaction.guild, AuditEventType.AUDIT_LOG_CHANNEL_SET, {
      userId: interaction.user.id,
      userName: interaction.user.username,
      channelId,
    }).catch(() => {});
  }
}
