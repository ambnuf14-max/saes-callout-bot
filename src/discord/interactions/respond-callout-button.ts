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
 * Обработчик нажатия кнопки "Отреагировать" на каллаут из Discord.
 * Сразу фиксирует реагирование без выбора типа.
 */
export async function handleRespondCalloutButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;

  const calloutId = safeParseInt(interaction.customId.replace('respond_callout_', ''));
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
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasSubdivisionRole = subdivision.discord_role_id
      ? member.roles.cache.has(subdivision.discord_role_id)
      : false;

    if (!hasSubdivisionRole) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_NO_RESPOND_PERMISSION });
      if (interaction.guild) {
        const auditData: UnauthorizedAccessData = {
          userId: interaction.user.id,
          userName: interaction.user.username,
          calloutId: callout.id,
          action: 'respond',
          subdivisionName: subdivision.name,
          thumbnailUrl: interaction.user.displayAvatarURL(),
        };
        await logAuditEvent(interaction.guild, AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, auditData);
      }
      return;
    }

    const userName = interaction.member && 'displayName' in interaction.member
      ? (interaction.member.displayName as string)
      : interaction.user.username;

    const { response, changed } = await SyncService.handleDiscordResponse(
      callout,
      subdivision,
      interaction.user.id,
      userName
    );

    let content: string;
    if (!changed) {
      content = `${EMOJI.WARNING} Подразделение уже отреагировало на инцидент **#${calloutId}**`;
    } else {
      content = `${EMOJI.SUCCESS} Реагирование зафиксировано для инцидента **#${calloutId}**!`;
    }

    await interaction.editReply({ content });

    logger.info('Discord respond recorded', {
      calloutId,
      subdivisionId: subdivision.id,
      userId: interaction.user.id,
    });
  } catch (error) {
    logger.error('Error handling respond callout button', {
      error: error instanceof Error ? error.message : error,
      calloutId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось обработать реагирование`;

    await interaction.editReply({ content });
  }
}
