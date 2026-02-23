import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { safeParseInt } from '../../utils/validators';
import CalloutService from '../../services/callout.service';
import { getUserRoleIds } from '../utils/permission-checker';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { SubdivisionModel } from '../../database/models';

/**
 * Обработчик нажатия кнопки "Отклонить запрос поддержки"
 */
export async function handleDeclineCalloutButton(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const calloutId = safeParseInt(interaction.customId.replace('decline_callout_', ''));
  if (isNaN(calloutId)) {
    await interaction.reply({ content: `${EMOJI.ERROR} Неверный ID каллаута`, flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const callout = await CalloutService.getCalloutByChannel(interaction.channelId);
    if (!callout) {
      await interaction.reply({ content: MESSAGES.CALLOUT.ERROR_NOT_FOUND, flags: MessageFlags.Ephemeral });
      return;
    }

    if (callout.status !== 'active') {
      await interaction.reply({ content: MESSAGES.CALLOUT.ERROR_ALREADY_CLOSED, flags: MessageFlags.Ephemeral });
      return;
    }

    if (callout.declined_at) {
      await interaction.reply({ content: `${EMOJI.ERROR} Запрос поддержки уже отклонён`, flags: MessageFlags.Ephemeral });
      return;
    }

    // Проверить роль подразделения
    const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
    if (!subdivision || !subdivision.discord_role_id) {
      await interaction.reply({ content: MESSAGES.CALLOUT.ERROR_NO_RESPOND_PERMISSION, flags: MessageFlags.Ephemeral });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const userRoles = getUserRoleIds(member);
    if (!userRoles.includes(subdivision.discord_role_id)) {
      await interaction.reply({ content: MESSAGES.CALLOUT.ERROR_NO_RESPOND_PERMISSION, flags: MessageFlags.Ephemeral });
      return;
    }

    // Показать модальное окно с причиной
    const modal = new ModalBuilder()
      .setCustomId(`decline_callout_modal_${calloutId}`)
      .setTitle('Отклонение запроса поддержки');

    const reasonInput = new TextInputBuilder()
      .setCustomId('decline_reason')
      .setLabel('Причина отклонения')
      .setPlaceholder('Укажите причину...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(300);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (error) {
    logger.error('Error handling decline callout button', {
      error: error instanceof Error ? error.message : error,
      calloutId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось обработать отклонение`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Обработчик modal отклонения каллаута
 */
export async function handleDeclineCalloutModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  const calloutId = safeParseInt(interaction.customId.replace('decline_callout_modal_', ''));
  if (isNaN(calloutId)) {
    await interaction.reply({ content: `${EMOJI.ERROR} Неверный ID каллаута`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const reason = interaction.fields.getTextInputValue('decline_reason').trim();
    if (!reason) {
      await interaction.editReply({ content: `${EMOJI.ERROR} Причина не может быть пустой` });
      return;
    }

    const userName = interaction.member
      ? ((interaction.member as any).displayName || interaction.user.username)
      : interaction.user.username;

    await CalloutService.declineCallout(
      interaction.guild,
      calloutId,
      interaction.user.id,
      userName,
      reason
    );

    await interaction.editReply({
      content: `${EMOJI.SUCCESS} Запрос поддержки отклонён. Каллаут будет закрыт через 5 минут.`,
    });

    logger.info('Callout declined via Discord button', {
      calloutId,
      declinedBy: interaction.user.id,
      reason,
    });
  } catch (error) {
    logger.error('Error declining callout via modal', {
      error: error instanceof Error ? error.message : error,
      calloutId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось отклонить запрос`;

    await interaction.editReply({ content });
  }
}
