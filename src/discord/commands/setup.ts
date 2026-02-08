import {
  SlashCommandBuilder,
  CommandInteraction,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { isAdministrator } from '../utils/permission-checker';
import { EMOJI, COLORS, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

const setupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Начальная настройка системы каллаутов')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    // Проверка прав администратора
    if (!isAdministrator(member)) {
      await interaction.reply({
        content: MESSAGES.SETUP.ERROR_NO_PERMISSION,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Проверить, не настроена ли уже система
      const existingServer = await ServerModel.findByGuildId(interaction.guild.id);
      if (existingServer && existingServer.callout_channel_id) {
        const channel = await interaction.guild.channels.fetch(
          existingServer.callout_channel_id
        );
        if (channel) {
          await interaction.editReply({
            content: `${EMOJI.WARNING} Система уже настроена! Канал: <#${channel.id}>`,
          });
          return;
        }
      }

      logger.info('Setting up callout system', {
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      });

      // 1. Создать категорию "🚨 INCIDENTS"
      const category = await interaction.guild.channels.create({
        name: '🚨 INCIDENTS',
        type: ChannelType.GuildCategory,
        position: 0,
      });

      logger.info('Category created', { categoryId: category.id });

      // 2. Создать канал "callouts" в категории
      const calloutsChannel = await interaction.guild.channels.create({
        name: 'callouts',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: 'Канал для создания каллаутов экстренных служб',
        permissionOverwrites: [
          {
            id: interaction.guild.id, // @everyone
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages], // Запретить отправку сообщений
          },
        ],
      });

      logger.info('Callouts channel created', { channelId: calloutsChannel.id });

      // 3. Создать Embed с кнопкой
      const embed = new EmbedBuilder()
        .setTitle(MESSAGES.CALLOUT.TITLE_PANEL)
        .setDescription(MESSAGES.CALLOUT.DESCRIPTION_PANEL)
        .setColor(COLORS.INFO)
        .addFields([
          {
            name: `${EMOJI.INFO} Инструкция`,
            value:
              '1. Нажмите кнопку ниже\n' +
              '2. Выберите департамент\n' +
              '3. Опишите инцидент\n' +
              '4. Система создаст канал и уведомит департамент',
          },
        ])
        .setFooter({ text: 'SAES Callout System' })
        .setTimestamp();

      const button = new ButtonBuilder()
        .setCustomId('create_callout')
        .setLabel(MESSAGES.CALLOUT.BUTTON_CREATE)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

      // Отправить сообщение с кнопкой
      const message = await calloutsChannel.send({
        embeds: [embed],
        components: [row],
      });

      logger.info('Callout panel message created', { messageId: message.id });

      // 4. Сохранить настройки в БД
      if (existingServer) {
        // Обновить существующий сервер
        await ServerModel.update(existingServer.id, {
          callout_channel_id: calloutsChannel.id,
          callout_message_id: message.id,
          category_id: category.id,
        });
      } else {
        // Создать новый сервер
        await ServerModel.create({
          guild_id: interaction.guild.id,
          callout_channel_id: calloutsChannel.id,
          callout_message_id: message.id,
          category_id: category.id,
        });
      }

      logger.info('Server settings saved to database', {
        guildId: interaction.guild.id,
      });

      // Успешный ответ
      await interaction.editReply({
        content: MESSAGES.SETUP.SUCCESS(calloutsChannel.toString()),
      });
    } catch (error) {
      logger.error('Failed to setup callout system', {
        error: error instanceof Error ? error.message : error,
        guildId: interaction.guild.id,
      });

      throw new CalloutError(
        `${EMOJI.ERROR} Не удалось настроить систему. Проверьте права бота.`,
        'SETUP_FAILED'
      );
    }
  },
};

export default setupCommand;
