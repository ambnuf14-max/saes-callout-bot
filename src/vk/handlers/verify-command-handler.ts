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
      result.token.created_by,
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
      let errorMessage = MESSAGES.VERIFICATION.ERROR_INVALID;

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
  leaderUserId: string,
  chatTitle: string,
  vkChatId: string
): Promise<void> {
  try {
    // Импортируем discordBot динамически чтобы избежать циклических зависимостей
    const { default: discordBot } = await import('../../discord/bot');

    // Попытаться отправить DM лидеру
    try {
      const user = await discordBot.client.users.fetch(leaderUserId);
      await user.send(
        MESSAGES.VERIFICATION.SUCCESS_LINKED(subdivision.name, chatTitle)
      );
    } catch (dmError) {
      logger.warn('Failed to send DM to leader', {
        userId: leaderUserId,
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
          userId: leaderUserId,
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
