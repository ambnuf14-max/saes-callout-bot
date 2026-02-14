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

    // Верифицировать токен и привязать VK беседу
    const result = await VerificationService.verifyToken(token, peerId);

    logger.info('VK chat linked successfully', {
      subdivisionId: result.subdivision.id,
      subdivisionName: result.subdivision.name,
      peerId,
      token,
    });

    // Получить информацию о беседе
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

    // Редактировать исходное сообщение с инструкциями (если есть)
    if (token.discord_channel_id && token.discord_message_id) {
      try {
        const channel = await discordBot.client.channels.fetch(token.discord_channel_id);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(token.discord_message_id);
          const { EmbedBuilder } = await import('discord.js');
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

          await message.edit({ embeds: [successEmbed], components: [] });

          logger.info('Updated Discord instructions message with success', {
            messageId: token.discord_message_id,
            channelId: token.discord_channel_id,
          });
        }
      } catch (editError) {
        logger.warn('Failed to edit instructions message', {
          error: editError,
          messageId: token.discord_message_id,
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
      const { DepartmentModel } = await import('../../database/models');
      const { logAuditEvent, AuditEventType } = await import('../../discord/utils/audit-logger');

      const department = await DepartmentModel.findById(subdivision.department_id);
      if (!department) return;

      // Получить guild
      const guilds = discordBot.client.guilds.cache;
      const guild = guilds.find(g => g.id === discordBot.client.guilds.cache.first()?.id);

      if (guild) {
        await logAuditEvent(guild, AuditEventType.VK_CHAT_LINKED, {
          userId: token.created_by,
          userName: 'Лидер департамента',
          subdivisionName: subdivision.name,
          factionName: department.name,
          vkChatId: vkChatId,
          chatTitle: chatTitle,
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
