import TelegramBot from 'node-telegram-bot-api';
import logger from '../../utils/logger';
import { VerificationService } from '../../services/verification.service';
import { handleTelegramError } from '../../utils/error-handler';
import { EMOJI, MESSAGES } from '../../config/constants';

/**
 * Обработчик команды /verify <token> в Telegram группах
 */
export async function handleVerifyCommand(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  try {
    const text = msg.text?.trim();
    if (!text) return;

    // Проверить что команда выполнена в группе
    if (msg.chat.type === 'private') {
      await bot.sendMessage(
        msg.chat.id,
        `${EMOJI.ERROR} Эта команда доступна только в группах Telegram`
      );
      return;
    }

    // Парсинг команды /verify
    const verifyRegex = /^\/verify\s+([A-Z0-9]{6})$/i;
    const match = text.match(verifyRegex);

    if (!match) {
      // Если команда некорректна, показываем справку
      await bot.sendMessage(
        msg.chat.id,
        `${EMOJI.INFO} Использование: /verify <TOKEN>\n\n` +
          'Получите токен верификации у лидера вашей фракции в Discord.'
      );
      return;
    }

    const token = match[1].toUpperCase();

    logger.info('Received /verify command in Telegram', {
      token,
      chatId: msg.chat.id,
      chatTitle: msg.chat.title,
      userId: msg.from?.id,
    });

    // Получить chat_id группы
    const chatId = msg.chat.id.toString();

    // Верифицировать токен и привязать Telegram группу
    const result = await VerificationService.verifyToken(token, chatId, 'telegram');

    logger.info('Telegram chat linked successfully', {
      subdivisionId: result.subdivision.id,
      subdivisionName: result.subdivision.name,
      chatId,
      chatTitle: msg.chat.title,
      token,
    });

    // Отправить подтверждение в Telegram группу
    await bot.sendMessage(
      msg.chat.id,
      MESSAGES.VERIFICATION.SUCCESS_TELEGRAM(result.subdivision.name),
      { parse_mode: 'HTML' }
    );

    // Уведомить лидера в Discord и залогировать событие
    await notifyDiscordAboutVerification(
      result.subdivision,
      result.token,
      msg.chat.title || 'Telegram группа',
      chatId
    );

    logger.info('Verification notifications sent', {
      subdivisionId: result.subdivision.id,
      chatId,
    });
  } catch (error) {
    logger.error('Error handling /verify command', {
      error: error instanceof Error ? error.message : error,
      chatId: msg.chat.id,
      userId: msg.from?.id,
    });

    handleTelegramError(error as Error, {
      userId: msg.from?.id,
      chatId: msg.chat.id,
    });

    // Отправить ошибку в Telegram группу
    try {
      let errorMessage: string = MESSAGES.VERIFICATION.ERROR_INVALID;

      if (error instanceof Error) {
        if (error.message.includes('уже использован')) {
          errorMessage = MESSAGES.VERIFICATION.ERROR_USED;
        } else if (error.message.includes('истек')) {
          errorMessage = MESSAGES.VERIFICATION.ERROR_INVALID;
        }
      }

      await bot.sendMessage(msg.chat.id, errorMessage);
    } catch (sendError) {
      logger.error('Failed to send error message to Telegram', { error: sendError });
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
  telegramChatId: string
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
          .setTitle(`${EMOJI.SUCCESS} Telegram группа успешно привязана!`)
          .setDescription(
            `**Подразделение:** ${subdivision.name}\n` +
            `**Группа:** ${chatTitle}\n` +
            `**Telegram Chat ID:** \`${telegramChatId}\``
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
        MESSAGES.VERIFICATION.SUCCESS_LINKED_TELEGRAM(subdivision.name, chatTitle)
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
      const { FactionModel } = await import('../../database/models');
      const { logAuditEvent, AuditEventType } = await import(
        '../../discord/utils/audit-logger'
      );

      const faction = await FactionModel.findById(subdivision.faction_id);
      if (!faction) return;

      // Получить guild
      const guilds = discordBot.client.guilds.cache;
      const guild = guilds.find((g) => g.id === discordBot.client.guilds.cache.first()?.id);

      if (guild) {
        const { resolveLogoThumbnailUrl } = await import('../../discord/utils/audit-logger');
        await logAuditEvent(guild, AuditEventType.TELEGRAM_CHAT_LINKED, {
          userId: token.created_by,
          userName: 'Лидер фракции',
          subdivisionName: subdivision.name,
          factionName: faction.name,
          telegramChatId: telegramChatId,
          chatTitle: chatTitle,
          thumbnailUrl: resolveLogoThumbnailUrl(subdivision.logo_url),
        });
      }
    } catch (auditError) {
      logger.warn('Failed to log audit event for Telegram verification', {
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
