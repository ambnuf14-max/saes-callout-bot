import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import CalloutService from '../../services/callout.service';
import { getUserRoleIds } from '../utils/permission-checker';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

const closeCalloutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Закрыть текущий инцидент')
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Причина закрытия (опционально)')
        .setRequired(false)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        ephemeral: true,
      });
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({ ephemeral: true });

    try {
      // Получить reason из опций
      const reason = interaction.options.getString('reason');

      // Получить каллаут по ID канала
      const callout = await CalloutService.getCalloutByChannel(
        interaction.channelId
      );

      if (!callout) {
        throw new CalloutError(
          MESSAGES.CALLOUT.ERROR_NOT_FOUND,
          'CALLOUT_NOT_FOUND',
          404
        );
      }

      // Проверка что каллаут активен
      if (callout.status !== 'active') {
        throw new CalloutError(
          MESSAGES.CALLOUT.ERROR_ALREADY_CLOSED,
          'CALLOUT_ALREADY_CLOSED',
          400
        );
      }

      // Получить роли пользователя
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const userRoles = getUserRoleIds(member);

      // Проверить права на закрытие
      const canClose = await CalloutService.canUserCloseCallout(
        callout,
        interaction.user.id,
        userRoles
      );

      if (!canClose) {
        throw new CalloutError(
          MESSAGES.CALLOUT.ERROR_NO_PERMISSION,
          'NO_PERMISSION',
          403
        );
      }

      logger.info('Closing callout via command', {
        calloutId: callout.id,
        userId: interaction.user.id,
        reason,
      });

      // Закрыть каллаут через сервис
      await CalloutService.closeCallout(
        interaction.guild,
        callout.id,
        interaction.user.id,
        reason || undefined
      );

      // Отправить подтверждение
      await interaction.editReply({
        content: MESSAGES.CALLOUT.SUCCESS_CLOSED(callout.id),
      });

      logger.info('Callout closed successfully', {
        calloutId: callout.id,
        closedBy: interaction.user.id,
      });
    } catch (error) {
      logger.error('Error closing callout', {
        error: error instanceof Error ? error.message : error,
        userId: interaction.user.id,
        channelId: interaction.channelId,
      });

      const errorMessage =
        error instanceof CalloutError
          ? error.message
          : `${EMOJI.ERROR} Не удалось закрыть каллаут`;

      await interaction.editReply({
        content: errorMessage,
      });
    }
  },
};

export default closeCalloutCommand;
