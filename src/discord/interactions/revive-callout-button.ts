import { ButtonInteraction, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { safeParseInt } from '../../utils/validators';
import CalloutService from '../../services/callout.service';
import { getUserRoleIds } from '../utils/permission-checker';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { SubdivisionModel } from '../../database/models';

/**
 * Обработчик нажатия кнопки "Возобновить реагирование"
 */
export async function handleReviveCalloutButton(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const calloutId = safeParseInt(interaction.customId.replace('revive_callout_', ''));
  if (isNaN(calloutId)) {
    await interaction.reply({ content: `${EMOJI.ERROR} Неверный ID каллаута`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const callout = await CalloutService.getCalloutByChannel(interaction.channelId);
    if (!callout) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_NOT_FOUND });
      return;
    }

    if (callout.status !== 'active') {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_ALREADY_CLOSED });
      return;
    }

    if (!callout.declined_at) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Каллаут не был отклонён` });
      return;
    }

    // Проверить роль подразделения
    const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
    if (!subdivision || !subdivision.discord_role_id) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_NO_RESPOND_PERMISSION });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const userRoles = getUserRoleIds(member);
    if (!userRoles.includes(subdivision.discord_role_id)) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_NO_RESPOND_PERMISSION });
      return;
    }

    const revivedByName = interaction.member && 'displayName' in interaction.member
      ? (interaction.member.displayName as string)
      : interaction.user.displayName || interaction.user.username;
    await CalloutService.cancelDecline(interaction.guild, calloutId, revivedByName);

    await interaction.editReply({
      content: `${EMOJI.SUCCESS} Реагирование возобновлено.`,
    });

    logger.info('Callout decline cancelled via Discord button', {
      calloutId,
      userId: interaction.user.id,
    });
  } catch (error) {
    logger.error('Error handling revive callout button', {
      error: error instanceof Error ? error.message : error,
      calloutId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось возобновить реагирование`;

    await interaction.editReply({ content });
  }
}
