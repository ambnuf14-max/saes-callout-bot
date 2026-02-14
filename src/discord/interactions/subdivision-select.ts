import {
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { EMOJI, LIMITS, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Временное хранилище выбранного подразделения (user_id → {subdivisionId, expiresAt})
 * Записи автоматически удаляются через 5 минут
 */
const SELECTION_TTL_MS = 5 * 60 * 1000;
const subdivisionSelections = new Map<string, { subdivisionId: number; expiresAt: number }>();

/**
 * Периодическая очистка просроченных записей (каждые 60 секунд)
 */
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of subdivisionSelections) {
    if (now >= entry.expiresAt) {
      subdivisionSelections.delete(userId);
    }
  }
}, 60_000);

/**
 * Обработчик выбора подразделения из Select Menu
 */
export async function handleSubdivisionSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Получить выбранное подразделение ID
    const subdivisionId = parseInt(interaction.values[0], 10);

    logger.info('Subdivision selected from menu', {
      userId: interaction.user.id,
      subdivisionId,
    });

    // Получить подразделение из БД для проверки
    const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);

    if (!subdivision) {
      throw new CalloutError(
        MESSAGES.SUBDIVISION.ERROR_NOT_FOUND,
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    // Проверить, принимает ли подразделение каллауты
    if (!subdivision.is_accepting_callouts) {
      await interaction.reply({
        content: MESSAGES.SUBDIVISION.CALLOUTS_PAUSED,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Проверить, активно ли подразделение
    if (!subdivision.is_active) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Подразделение неактивно`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Сохранить выбор в временное хранилище с TTL
    subdivisionSelections.set(interaction.user.id, {
      subdivisionId,
      expiresAt: Date.now() + SELECTION_TTL_MS,
    });

    // Создать модальное окно с полями "Подробности" и "Место"
    const modal = new ModalBuilder()
      .setCustomId('callout_modal')
      .setTitle('Создание каллаута');

    // Поле "Место" (location)
    const locationInput = new TextInputBuilder()
      .setCustomId('location_input')
      .setLabel('Место инцидента')
      .setPlaceholder('Например: Grove Street, перекресток Main St.')
      .setStyle(TextInputStyle.Short)
      .setMinLength(LIMITS.LOCATION_MIN)
      .setMaxLength(LIMITS.LOCATION_MAX)
      .setRequired(true);

    // Поле "Подробности" (description)
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description_input')
      .setLabel('Подробности инцидента')
      .setPlaceholder('Опишите ситуацию подробно...')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(LIMITS.DESCRIPTION_MIN)
      .setMaxLength(LIMITS.DESCRIPTION_MAX)
      .setRequired(true);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(
      locationInput
    );
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(
      descriptionInput
    );

    modal.addComponents(row1, row2);

    // Показать модальное окно
    await interaction.showModal(modal);

    logger.info('Callout modal shown after subdivision selection', {
      userId: interaction.user.id,
      subdivisionId,
      subdivisionName: subdivision.name,
    });
  } catch (error) {
    logger.error('Error handling subdivision selection', {
      error: error instanceof Error ? error.message : error,
      userId: interaction.user.id,
    });

    // Проверить, можно ли еще ответить на interaction
    // (showModal уже мог быть вызван)
    if (!interaction.replied && !interaction.deferred) {
      try {
        const errorMessage =
          error instanceof CalloutError
            ? error.message
            : `${EMOJI.ERROR} Не удалось открыть форму создания каллаута`;

        await interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error message to user', {
          error: replyError instanceof Error ? replyError.message : replyError,
        });
      }
    }
  }
}

/**
 * Получить выбранное подразделение для пользователя
 */
export function getSubdivisionSelection(userId: string): number | undefined {
  const entry = subdivisionSelections.get(userId);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    subdivisionSelections.delete(userId);
    return undefined;
  }
  return entry.subdivisionId;
}

/**
 * Удалить выбор подразделения после создания каллаута
 */
export function clearSubdivisionSelection(userId: string): void {
  subdivisionSelections.delete(userId);
}

export default handleSubdivisionSelect;
