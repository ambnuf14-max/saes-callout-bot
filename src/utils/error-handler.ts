import { Interaction, MessageFlags } from 'discord.js';
import logger from './logger';
import { EMOJI } from '../config/constants';

/**
 * Кастомная ошибка для системы каллаутов
 */
export class CalloutError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'CalloutError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Обработка ошибок в Discord interactions
 */
export async function handleDiscordError(
  interaction: Interaction,
  error: Error
): Promise<void> {
  logger.error('Discord interaction error', {
    error: error.message,
    stack: error.stack,
    interactionId: interaction.id,
    interactionType: interaction.type,
  });

  if (!interaction.isRepliable()) return;

  const userMessage =
    error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Произошла ошибка при выполнении команды. Пожалуйста, попробуйте позже.`;

  try {
    if (interaction.deferred) {
      await interaction.editReply({
        content: userMessage,
      });
    } else if (interaction.replied) {
      await interaction.followUp({
        content: userMessage,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: userMessage,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (replyError: any) {
    // Если взаимодействие уже подтверждено, попробуем editReply
    if (replyError?.code === 40060 || replyError?.rawError?.code === 40060) {
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: userMessage });
        } else {
          logger.warn('Cannot send error message - interaction already acknowledged', {
            interactionId: interaction.id,
            originalError: error.message,
          });
        }
      } catch (editError) {
        logger.error('Failed to edit reply with error message', {
          error: editError,
          originalError: error.message,
        });
      }
    } else {
      logger.error('Failed to send error message to user', {
        error: replyError,
        originalError: error.message,
      });
    }
  }
}

/**
 * Обработка ошибок VK
 */
export function handleVkError(error: Error, context: any): void {
  logger.error('VK handler error', {
    error: error.message,
    stack: error.stack,
    context,
  });
}

/**
 * Обработка ошибок Telegram
 */
export function handleTelegramError(error: Error, context: any): void {
  logger.error('Telegram handler error', {
    error: error.message,
    stack: error.stack,
    context,
  });
}

/**
 * Обработка общих ошибок приложения
 */
export function handleGlobalError(error: Error, context?: string): void {
  logger.error('Global error', {
    error: error.message,
    stack: error.stack,
    context,
  });
}

/**
 * Обработчик необработанных промисов
 */
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise,
  });
});

/**
 * Обработчик необработанных исключений
 */
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  // В случае критической ошибки - перезапускаем приложение
  process.exit(1);
});
