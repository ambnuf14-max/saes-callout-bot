import {
  ModalSubmitInteraction,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel, SubdivisionModel, FactionModel } from '../../database/models';
import CalloutService from '../../services/callout.service';
import CalloutGatewayService from '../../services/callout-gateway.service';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { isAdministrator } from '../utils/permission-checker';
import {
  getSubdivisionSelection,
  clearSubdivisionSelection,
} from './subdivision-select';
import { logAuditEvent, AuditEventType, UnauthorizedAccessData } from '../utils/audit-logger';

/**
 * Обработчик submit модального окна создания каллаута
 */
export async function handleCalloutModalSubmit(
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Отложить обновление оригинального ephemeral сообщения (с select menu),
  // чтобы после успеха оно заменилось на embed с кнопкой и исчезло по нажатию
  if (interaction.isFromMessage()) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  try {
    // Получить данные из модального окна
    const briefDescription = interaction.fields.getTextInputValue('brief_description_input');
    const location = interaction.fields.getTextInputValue('location_input');
    const tacChannel = interaction.fields.getTextInputValue('tac_channel_input');
    const description = interaction.fields.getTextInputValue('description_input');

    // Получить подразделение из временного хранилища
    const subdivisionId = getSubdivisionSelection(interaction.guild.id, interaction.user.id);

    if (!subdivisionId) {
      throw new CalloutError(
        `${EMOJI.ERROR} Выбор подразделения истек. Попробуйте снова.`,
        'SUBDIVISION_SELECTION_EXPIRED',
        400
      );
    }

    logger.info('Processing callout modal submit', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      subdivisionId,
      location,
      descriptionLength: description.length,
    });

    // Получить сервер из БД
    const server = await ServerModel.findByGuildId(interaction.guild.id);
    if (!server) {
      throw new CalloutError(
        `${EMOJI.ERROR} Сервер не настроен`,
        'SERVER_NOT_CONFIGURED',
        400
      );
    }

    // Получить подразделение по ID
    const subdivision = await SubdivisionModel.findById(subdivisionId);

    if (!subdivision) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение не найдено`,
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    if (!subdivision.is_active) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение ${subdivision.name} временно неактивно`,
        'SUBDIVISION_INACTIVE',
        400
      );
    }

    // Получить роли пользователя
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const userRoles = member.roles.cache.map((role) => role.id);
    const isAdmin = isAdministrator(member);

    // Проверить права на создание каллаута (администраторы игнорируют проверки)
    const permissionCheck = await CalloutGatewayService.canUserCreateCallout(
      interaction.user.id,
      userRoles,
      server.id,
      isAdmin
    );

    if (!permissionCheck.allowed) {
      // Очистить временное хранилище перед выходом
      clearSubdivisionSelection(interaction.guild.id, interaction.user.id);
      await interaction.editReply({
        content: permissionCheck.reason || `${EMOJI.ERROR} Недостаточно прав`,
      });
      const auditData: UnauthorizedAccessData = {
        userId: interaction.user.id,
        userName: interaction.user.username,
        action: 'create_callout',
        subdivisionName: subdivision.name,
        reason: permissionCheck.reason,
        thumbnailUrl: interaction.user.displayAvatarURL(),
      };
      logAuditEvent(interaction.guild, AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, auditData).catch(() => {});
      return;
    }

    // Найти фракцию автора по его ролям на сервере
    let authorFactionName: string | undefined;
    for (const roleId of userRoles) {
      const faction = await FactionModel.findByFactionRole(server.id, roleId);
      if (faction) {
        authorFactionName = faction.name;
        break;
      }
    }

    // Создать каллаут через сервис (с location!)
    const { callout, channel } = await CalloutService.createCallout(
      interaction.guild,
      {
        server_id: server.id,
        subdivision_id: subdivision.id,
        author_id: interaction.user.id,
        author_name: member.displayName,
        description: description.trim(),
        location: location.trim(),
        tac_channel: tacChannel.trim() || undefined,
        brief_description: briefDescription.trim(),
        author_faction_name: authorFactionName,
      }
    );

    logger.info('Callout created successfully', {
      calloutId: callout.id,
      channelId: channel.id,
      userId: interaction.user.id,
      subdivisionId: subdivision.id,
      location,
    });

    // Очистить временное хранилище
    clearSubdivisionSelection(interaction.guild.id, interaction.user.id);

    // Записать время создания каллаута для rate limiting (администраторы не учитываются)
    await CalloutGatewayService.recordCalloutCreation(interaction.user.id, server.id, isAdmin);

    // Отправить подтверждение пользователю
    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`${EMOJI.SUCCESS} Каллаут создан`)
      .setDescription(`Ваш запрос к **${subdivision.name}** был успешно отправлен.`);

    const goToChannelButton = new ButtonBuilder()
      .setLabel('Перейти к инциденту')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${interaction.guild.id}/${channel.id}`);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(goToChannelButton);

    await interaction.editReply({
      embeds: [successEmbed],
      components: [buttonRow],
    });
  } catch (error) {
    logger.error('Error processing callout modal', {
      error: error instanceof Error ? error.message : error,
      userId: interaction.user.id,
      guildId: interaction.guild.id,
    });

    const errorMessage =
      error instanceof CalloutError
        ? error.message
        : `${EMOJI.ERROR} Не удалось создать каллаут. Попробуйте позже.`;

    await interaction.editReply({
      content: errorMessage,
      embeds: [],
      components: [],
    });

    // Очистить временное хранилище даже при ошибке
    clearSubdivisionSelection(interaction.guild.id, interaction.user.id);
  }
}

export default handleCalloutModalSubmit;
