import {
  SlashCommandBuilder,
  CommandInteraction,
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
        try {
          const channel = await interaction.guild.channels.fetch(
            existingServer.callout_channel_id
          );
          if (channel) {
            // Показать предупреждение с кнопками
            const embed = new EmbedBuilder()
              .setTitle(`${EMOJI.WARNING} Система уже настроена`)
              .setDescription(`Текущий канал каллаутов: <#${channel.id}>`)
              .addFields([
                {
                  name: 'Текущие настройки',
                  value:
                    `Канал: <#${existingServer.callout_channel_id}>\n` +
                    (existingServer.category_id
                      ? `Категория: <#${existingServer.category_id}>`
                      : 'Категория: не задана'),
                },
              ])
              .setColor(COLORS.WARNING);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('setup_keep')
                .setLabel('Оставить как есть')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('setup_reconfigure')
                .setLabel('Перенастроить')
                .setStyle(ButtonStyle.Danger)
            );

            await interaction.editReply({
              embeds: [embed],
              components: [row],
            });
            return;
          }
        } catch (error) {
          logger.warn('Callout channel not found, proceeding with setup', {
            channelId: existingServer.callout_channel_id,
          });
        }
      }

      // Показать выбор режима настройки
      logger.info('Showing setup mode selection', {
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      });

      const embed = new EmbedBuilder()
        .setTitle('🔧 Настройка системы каллаутов')
        .setDescription('Выберите режим настройки:')
        .addFields([
          {
            name: '🆕 Создать новое',
            value: 'Бот создаст новую категорию "🚨 INCIDENTS" и канал "callouts"',
          },
          {
            name: '📁 Использовать категорию',
            value: 'Выберите существующую категорию, бот создаст канал в ней',
          },
          {
            name: '💬 Использовать канал',
            value: 'Выберите существующий канал для размещения кнопки каллаутов',
          },
        ])
        .setColor(COLORS.INFO)
        .setFooter({ text: 'SAES Callout System' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('setup_mode_auto')
          .setLabel('🆕 Создать новое')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setup_mode_category')
          .setLabel('📁 Категория')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('setup_mode_channel')
          .setLabel('💬 Канал')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
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
