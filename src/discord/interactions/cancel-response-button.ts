import {
  ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { safeParseInt } from '../../utils/validators';
import { CalloutModel, SubdivisionModel } from '../../database/models';
import SyncService from '../../services/sync.service';
import { EMOJI, MESSAGES, CALLOUT_STATUS } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { logAuditEvent, AuditEventType, UnauthorizedAccessData } from '../utils/audit-logger';

/**
 * Обработчик нажатия кнопки "Отменить реагирование" в Discord.
 */
export async function handleCancelResponseButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;

  const calloutId = safeParseInt(interaction.customId.replace('cancel_response_', ''));
  if (isNaN(calloutId)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Неверный ID каллаута`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const callout = await CalloutModel.findById(calloutId);
    if (!callout) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_NOT_FOUND });
      return;
    }

    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_ALREADY_CLOSED });
      return;
    }

    const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
    if (!subdivision) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Подразделение не найдено` });
      return;
    }

    // Проверка прав: только роль подразделения
    const member = interaction.guild.members.cache.get(interaction.user.id)
      ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Не удалось получить данные участника` });
      return;
    }
    const hasSubdivisionRole = subdivision.discord_role_id
      ? member.roles.cache.has(subdivision.discord_role_id)
      : false;

    if (!hasSubdivisionRole) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_NO_RESPOND_PERMISSION });
      const auditData: UnauthorizedAccessData = {
        userId: interaction.user.id,
        userName: interaction.user.username,
        calloutId: callout.id,
        action: 'cancel_response',
        subdivisionName: subdivision.name,
        thumbnailUrl: interaction.user.displayAvatarURL(),
      };
      await logAuditEvent(interaction.guild, AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, auditData);
      return;
    }

    const userName = interaction.member && 'displayName' in interaction.member
      ? (interaction.member.displayName as string)
      : interaction.user.username;

    await SyncService.handleCancelResponse(
      callout.id,
      callout.subdivision_id,
      'discord',
      `discord_${interaction.user.id}`,
      userName
    );

    await interaction.editReply({
      content: `${EMOJI.SUCCESS} Реагирование отменено для инцидента **#${calloutId}**`,
    });

    logger.info('Discord cancel response processed', {
      calloutId,
      subdivisionId: subdivision.id,
      userId: interaction.user.id,
    });
  } catch (error) {
    logger.error('Error handling cancel response button', {
      error: error instanceof Error ? error.message : error,
      calloutId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось отменить реагирование`;

    await interaction.editReply({ content });
  }
}
