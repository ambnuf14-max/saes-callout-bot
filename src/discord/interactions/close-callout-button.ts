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
import CalloutService from '../../services/callout.service';
import { getUserRoleIds } from '../utils/permission-checker';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик нажатия кнопки "Закрыть инцидент"
 */
export async function handleCloseCalloutButton(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const customId = interaction.customId;
  // Формат: close_callout_{calloutId}
  const calloutId = parseInt(customId.replace('close_callout_', ''));

  if (isNaN(calloutId)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Неверный ID каллаута`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Получить каллаут
    const callout = await CalloutService.getCalloutByChannel(interaction.channelId);

    if (!callout) {
      await interaction.reply({
        content: MESSAGES.CALLOUT.ERROR_NOT_FOUND,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (callout.status !== 'active') {
      await interaction.reply({
        content: MESSAGES.CALLOUT.ERROR_ALREADY_CLOSED,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Проверить права на закрытие
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const userRoles = getUserRoleIds(member);
    const canClose = await CalloutService.canUserCloseCallout(
      callout,
      interaction.user.id,
      userRoles
    );

    if (!canClose) {
      await interaction.reply({
        content: MESSAGES.CALLOUT.ERROR_NO_PERMISSION,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Показать modal с причиной закрытия
    const modal = new ModalBuilder()
      .setCustomId(`close_callout_modal_${calloutId}`)
      .setTitle('Закрытие инцидента');

    const reasonInput = new TextInputBuilder()
      .setCustomId('close_reason')
      .setLabel('Причина закрытия (опционально)')
      .setPlaceholder('Укажите причину закрытия...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (error) {
    logger.error('Error handling close callout button', {
      error: error instanceof Error ? error.message : error,
      calloutId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось обработать закрытие каллаута`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Обработчик modal закрытия каллаута
 */
export async function handleCloseCalloutModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  const customId = interaction.customId;
  // Формат: close_callout_modal_{calloutId}
  const calloutId = parseInt(customId.replace('close_callout_modal_', ''));

  if (isNaN(calloutId)) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Неверный ID каллаута`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const reason = interaction.fields.getTextInputValue('close_reason').trim() || undefined;

    // Закрыть каллаут через сервис
    await CalloutService.closeCallout(
      interaction.guild,
      calloutId,
      interaction.user.id,
      reason
    );

    // Убрать кнопку из сообщения
    try {
      const message = interaction.message;
      if (message) {
        await message.edit({ components: [] });
      }
    } catch {
      // Не критично — сообщение могло быть удалено
    }

    await interaction.editReply({
      content: MESSAGES.CALLOUT.SUCCESS_CLOSED(calloutId),
    });

    logger.info('Callout closed via button', {
      calloutId,
      closedBy: interaction.user.id,
      reason,
    });
  } catch (error) {
    logger.error('Error closing callout via modal', {
      error: error instanceof Error ? error.message : error,
      calloutId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось закрыть каллаут`;

    await interaction.editReply({ content });
  }
}
