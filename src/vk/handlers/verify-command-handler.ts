import { MessageContext } from 'vk-io';
import logger from '../../utils/logger';
import { VerificationService } from '../../services/verification.service';
import { handleVkError } from '../../utils/error-handler';
import { EMOJI, MESSAGES } from '../../config/constants';
import vkBot from '../bot';

/**
 * Обработчик команды /verify <token> в VK беседах
 */
export async function handleVerifyCommand(context: MessageContext): Promise<void> {
  try {
    const text = context.text?.trim();
    if (!text) return;

    // Парсинг команды /verify
    const verifyRegex = /^\/verify\s+([A-Z0-9]{6})$/i;
    const match = text.match(verifyRegex);

    if (!match) {
      // Если команда некорректна, не отвечаем
      return;
    }

    const token = match[1].toUpperCase();

    logger.info('Received /verify command in VK', {
      token,
      peerId: context.peerId,
      userId: context.senderId,
    });

    // Получить peer_id беседы
    const peerId = context.peerId.toString();

    // Получить информацию о беседе заранее, чтобы сохранить в БД при привязке
    let chatTitle = 'VK беседа';
    try {
      const conversation = await vkBot.getApi().api.messages.getConversationsById({
        peer_ids: [context.peerId],
      });

      if (conversation.items && conversation.items[0]) {
        chatTitle = conversation.items[0].chat_settings?.title || chatTitle;
      }
    } catch (error) {
      logger.warn('Failed to get conversation title', { error });
    }

    // Верифицировать токен и привязать VK беседу (с сохранением названия)
    const result = await VerificationService.verifyToken(token, peerId, 'vk', chatTitle);

    logger.info('VK chat linked successfully', {
      subdivisionId: result.subdivision.id,
      subdivisionName: result.subdivision.name,
      peerId,
      token,
    });

    // Отправить подтверждение в VK беседу
    await context.send(MESSAGES.VERIFICATION.SUCCESS_VK(result.subdivision.name));

    // Уведомить лидера в Discord и залогировать событие
    await notifyDiscordAboutVerification(
      result.subdivision,
      result.token,
      chatTitle,
      peerId
    );

    logger.info('Verification notifications sent', {
      subdivisionId: result.subdivision.id,
      peerId,
    });
  } catch (error) {
    logger.error('Error handling /verify command', {
      error: error instanceof Error ? error.message : error,
      peerId: context.peerId,
      userId: context.senderId,
    });

    handleVkError(error as Error, {
      userId: context.senderId,
      peerId: context.peerId,
    });

    // Отправить ошибку в VK беседу
    try {
      let errorMessage: string = MESSAGES.VERIFICATION.ERROR_INVALID;

      if (error instanceof Error) {
        if (error.message.includes('уже использован')) {
          errorMessage = MESSAGES.VERIFICATION.ERROR_USED;
        } else if (error.message.includes('истек')) {
          errorMessage = MESSAGES.VERIFICATION.ERROR_INVALID;
        }
      }

      await context.send(errorMessage);
    } catch (sendError) {
      logger.error('Failed to send error message to VK', { error: sendError });
    }
  }
}

/**
 * Отправить уведомление в Discord о успешной верификации
 */
async function notifyDiscordAboutVerification(
  subdivision: any,
  token: any,
  chatTitle: string,
  vkChatId: string
): Promise<void> {
  try {
    // Импортируем discordBot динамически чтобы избежать циклических зависимостей
    const { default: discordBot } = await import('../../discord/bot');

    // Редактировать исходное сообщение с инструкциями через webhook (если есть interaction token)
    if (token.discord_interaction_token && token.discord_application_id) {
      try {
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
        const { COLORS } = await import('../../config/constants');

        const successEmbed = new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle(`${EMOJI.SUCCESS} VK беседа успешно привязана!`)
          .setDescription(
            `**Подразделение:** ${subdivision.name}\n` +
            `**Беседа:** ${chatTitle}\n` +
            `**VK Chat ID:** \`${vkChatId}\``
          )
          .setTimestamp();

        const backButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('faction_back_list')
            .setLabel('Назад')
            .setStyle(ButtonStyle.Secondary)
        );

        // Используем webhook API для редактирования ephemeral сообщения
        await discordBot.client.rest.patch(
          `/webhooks/${token.discord_application_id}/${token.discord_interaction_token}/messages/@original`,
          { body: { embeds: [successEmbed.toJSON()], components: [backButton.toJSON()] } }
        );

        logger.info('Updated Discord instructions message with success via webhook', {
          applicationId: token.discord_application_id,
        });
      } catch (editError) {
        logger.warn('Failed to edit instructions message via webhook', {
          error: editError instanceof Error ? editError.message : editError,
        });
      }
    }

    // Попытаться отправить DM лидеру
    try {
      const user = await discordBot.client.users.fetch(token.created_by);
      await user.send(
        MESSAGES.VERIFICATION.SUCCESS_LINKED(subdivision.name, chatTitle)
      );
    } catch (dmError) {
      logger.warn('Failed to send DM to leader', {
        userId: token.created_by,
        error: dmError,
      });
      // Не критично, если не удалось отправить DM
    }

    // Залогировать событие в audit log
    try {
      const { FactionModel, ServerModel } = await import('../../database/models');
      const { logAuditEvent, AuditEventType } = await import('../../discord/utils/audit-logger');

      const faction = await FactionModel.findById(subdivision.faction_id);
      if (!faction) return;

      // Получить guild по server_id подразделения
      const server = await ServerModel.findById(subdivision.server_id);
      const guild = server ? discordBot.client.guilds.cache.get(server.guild_id) : undefined;

      if (guild) {
        const { resolveLogoThumbnailUrl } = await import('../../discord/utils/audit-logger');
        await logAuditEvent(guild, AuditEventType.VK_CHAT_LINKED, {
          userId: token.created_by,
          userName: 'Лидер фракции',
          subdivisionName: subdivision.name,
          factionName: faction.name,
          vkChatId: vkChatId,
          chatTitle: chatTitle,
          thumbnailUrl: resolveLogoThumbnailUrl(subdivision.logo_url),
        });
      }
    } catch (auditError) {
      logger.warn('Failed to log audit event for VK verification', {
        error: auditError,
      });
    }
  } catch (error) {
    logger.error('Failed to notify Discord about verification', {
      error: error instanceof Error ? error.message : error,
      subdivisionId: subdivision.id,
    });
  }
}

export default handleVerifyCommand;
