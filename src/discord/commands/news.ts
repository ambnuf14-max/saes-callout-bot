import { SlashCommandBuilder, CommandInteraction, MessageFlags } from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import config from '../../config/config';
import { EMOJI } from '../../config/constants';

const newsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('Подписаться / отписаться от новостей каллаут системы'),

  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!config.discord.newsRoleId) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Роль для подписки не настроена. Обратитесь к администратору`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const hasRole = member.roles.cache.has(config.discord.newsRoleId);

      if (hasRole) {
        await member.roles.remove(config.discord.newsRoleId);
        await interaction.editReply({
          content: `🔕 Вы отписались от новостей каллаут системы`,
        });
        logger.info('User unsubscribed from news', { userId: interaction.user.id, guildId: interaction.guild.id });
      } else {
        await member.roles.add(config.discord.newsRoleId);
        await interaction.editReply({
          content: `🔔 Вы подписались на новости каллаут системы. Вам выдана соответствующая роль.`,
        });
        logger.info('User subscribed to news', { userId: interaction.user.id, guildId: interaction.guild.id });
      }
    } catch (error) {
      logger.error('Error in /news command', {
        error: error instanceof Error ? error.message : error,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
      });

      await interaction.editReply({
        content: `${EMOJI.ERROR} Не удалось изменить подписку. Проверьте права бота`,
      });
    }
  },
};

export default newsCommand;
