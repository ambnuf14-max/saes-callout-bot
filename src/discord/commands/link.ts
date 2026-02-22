import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { EMOJI, COLORS } from '../../config/constants';
import { FactionLinkService } from '../../services/faction-link.service';

const linkCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Привязать этот сервер к фракции на главном сервере')
    .addStringOption(option =>
      option
        .setName('token')
        .setDescription('Токен привязки (6 символов), полученный на главном сервере')
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(6)
    ) as SlashCommandBuilder,

  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = interaction.guild.members.cache.get(interaction.user.id)
      ?? await interaction.guild.members.fetch(interaction.user.id);

    if (!member.permissions.has('Administrator')) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только администраторам сервера`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const token = (interaction as ChatInputCommandInteraction).options.getString('token', true);

    try {
      const { faction } = await FactionLinkService.linkFactionServer(
        token,
        interaction.guildId!
      );

      const embed = new EmbedBuilder()
        .setTitle(`${EMOJI.SUCCESS} Сервер успешно привязан`)
        .setColor(COLORS.SUCCESS)
        .setDescription(
          `Этот сервер теперь является фракционным сервером фракции **${faction.name}**.\n\n` +
          `Используйте \`/settings\` для настройки калаут-канала и управления подразделениями.`
        )
        .addFields(
          { name: 'Фракция', value: faction.name, inline: true },
          { name: 'Следующий шаг', value: 'Запустите `/settings`', inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info('Faction server linked via /link command', {
        guildId: interaction.guildId,
        factionId: faction.id,
        factionName: faction.name,
        userId: interaction.user.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      logger.warn('/link command failed', {
        error: message,
        token: token.substring(0, 3) + '***',
        guildId: interaction.guildId,
        userId: interaction.user.id,
      });

      await interaction.editReply({
        content: `${EMOJI.ERROR} ${message}`,
      });
    }
  },
};

export default linkCommand;
