import {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { safeParseInt } from '../../utils/validators';
import { CalloutModel, SubdivisionModel } from '../../database/models';
import SyncService from '../../services/sync.service';
import { isLeader } from '../utils/permission-checker';
import { EMOJI, MESSAGES, CALLOUT_STATUS } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик нажатия кнопки "Отреагировать" на каллаут из Discord.
 * Показывает ephemeral с выбором "Принято" / "В пути".
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

  try {
    const callout = await CalloutModel.findById(calloutId);
    if (!callout) {
      await interaction.reply({
        content: MESSAGES.CALLOUT.ERROR_NOT_FOUND,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      await interaction.reply({
        content: MESSAGES.CALLOUT.ERROR_ALREADY_CLOSED,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
    if (!subdivision) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Подразделение не найдено`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Проверка прав: роль подразделения ИЛИ лидер/менеджмент
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasSubdivisionRole = subdivision.discord_role_id
      ? member.roles.cache.has(subdivision.discord_role_id)
      : false;
    const hasLeaderAccess = await isLeader(member);

    if (!hasSubdivisionRole && !hasLeaderAccess) {
      await interaction.reply({
        content: MESSAGES.CALLOUT.ERROR_NO_RESPOND_PERMISSION,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Показать выбор типа реакции
    const ackButton = new ButtonBuilder()
      .setCustomId(`respond_ack_${calloutId}`)
      .setLabel(MESSAGES.CALLOUT.BUTTON_RESPOND_ACK)
      .setStyle(ButtonStyle.Success);

    const onWayButton = new ButtonBuilder()
      .setCustomId(`respond_onway_${calloutId}`)
      .setLabel(MESSAGES.CALLOUT.BUTTON_RESPOND_ONWAY)
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(ackButton, onWayButton);

    await interaction.reply({
      content: `Выберите тип реагирования на инцидент **#${calloutId}** (${subdivision.name}):`,
      components: [row],
      flags: MessageFlags.Ephemeral,
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

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Обработчик выбора типа реагирования ("Принято" / "В пути")
 */
export async function handleRespondTypeButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;

  const isOnWay = interaction.customId.startsWith('respond_onway_');
  const calloutId = safeParseInt(
    interaction.customId.replace('respond_ack_', '').replace('respond_onway_', '')
  );

  if (isNaN(calloutId)) {
    // Кнопка внутри ephemeral — используем update() чтобы заменить содержимое
    await interaction.update({ content: `${EMOJI.ERROR} Неверный ID каллаута`, components: [] });
    return;
  }

  await interaction.deferUpdate();

  try {
    const callout = await CalloutModel.findById(calloutId);
    if (!callout) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_NOT_FOUND, components: [] });
      return;
    }

    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      await interaction.editReply({ content: MESSAGES.CALLOUT.ERROR_ALREADY_CLOSED, components: [] });
      return;
    }

    const subdivision = await SubdivisionModel.findById(callout.subdivision_id);
    if (!subdivision) {
      await interaction.editReply({
        content: `${EMOJI.ERROR} Подразделение не найдено`,
        components: [],
      });
      return;
    }

    const responseType = isOnWay ? 'on_way' : 'acknowledged';
    const userName = interaction.member && 'displayName' in interaction.member
      ? (interaction.member.displayName as string)
      : interaction.user.username;

    const { response, changed } = await SyncService.handleDiscordResponse(
      callout,
      subdivision,
      interaction.user.id,
      userName,
      responseType
    );

    let content: string;
    if (!changed) {
      // No-op: подразделение уже реагировало с тем же или более высоким статусом
      const existingLabel = response.response_type === 'on_way' ? '🚗 В пути' : '✅ Принято';
      content = `${EMOJI.WARNING} Подразделение уже отметило статус **${existingLabel}** для инцидента **#${calloutId}**`;
    } else {
      const typeLabel = responseType === 'on_way' ? '🚗 В пути' : '✅ Принято';
      content = `${EMOJI.SUCCESS} Реагирование **${typeLabel}** зафиксировано для инцидента **#${calloutId}**!`;
    }

    await interaction.editReply({ content, components: [] });

    logger.info('Discord respond recorded', {
      calloutId,
      subdivisionId: subdivision.id,
      userId: interaction.user.id,
      responseType,
    });
  } catch (error) {
    logger.error('Error handling respond type button', {
      error: error instanceof Error ? error.message : error,
      calloutId,
      userId: interaction.user.id,
    });

    const content = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось зафиксировать реагирование`;

    await interaction.editReply({ content, components: [] });
  }
}
