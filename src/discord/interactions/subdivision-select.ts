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
import { safeParseInt } from '../../utils/validators';
import { Subdivision } from '../../types/database.types';

/**
 * Временное хранилище выбранного подразделения (user_id → {subdivisionId, expiresAt})
 * Записи автоматически удаляются через 5 минут
 */
export const SELECTION_TTL_MS = 5 * 60 * 1000;
export const subdivisionSelections = new Map<string, { subdivisionId: number; expiresAt: number }>();

/**
 * Периодическая очистка просроченных записей (каждые 60 секунд)
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of subdivisionSelections) {
    if (now >= entry.expiresAt) {
      subdivisionSelections.delete(key);
    }
  }
}, 60_000);

/**
 * Создать модальное окно для запроса каллаута к подразделению
 */
export function createCalloutModal(subdivision: Subdivision): ModalBuilder {
  const modalTitle = `Запрос к ${subdivision.name}`.slice(0, 45);
  const modal = new ModalBuilder()
    .setCustomId('callout_modal')
    .setTitle(modalTitle);

  const briefDescriptionInput = new TextInputBuilder()
    .setCustomId('brief_description_input')
    .setLabel('Краткое описание инцидента')
    .setPlaceholder('Например: Пожар в многоэтажном здании')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(LIMITS.BRIEF_DESCRIPTION_MAX)
    .setRequired(true);

  const locationInput = new TextInputBuilder()
    .setCustomId('location_input')
    .setLabel('Место инцидента')
    .setPlaceholder('Например: Jefferson, Carson Street')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(LIMITS.LOCATION_MAX)
    .setRequired(true);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description_input')
    .setLabel('Подробности инцидента')
    .setPlaceholder('Опишите ситуацию подробно...')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(LIMITS.DESCRIPTION_MAX)
    .setRequired(true);

  const tacChannelInput = new TextInputBuilder()
    .setCustomId('tac_channel_input')
    .setLabel('TAC-канал (Опционально)')
    .setPlaceholder('Например: C-TAC-1, C-TAC-2')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(50)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(briefDescriptionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(tacChannelInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
  );

  return modal;
}

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
    const subdivisionId = safeParseInt(interaction.values[0], 10);

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

    // Сохранить выбор в временное хранилище с TTL (ключ: guildId:userId для мульти-серверности)
    const stateKey = `${interaction.guildId}:${interaction.user.id}`;
    subdivisionSelections.set(stateKey, {
      subdivisionId,
      expiresAt: Date.now() + SELECTION_TTL_MS,
    });

    const modal = createCalloutModal(subdivision);
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
export function getSubdivisionSelection(guildId: string, userId: string): number | undefined {
  const key = `${guildId}:${userId}`;
  const entry = subdivisionSelections.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    subdivisionSelections.delete(key);
    return undefined;
  }
  return entry.subdivisionId;
}

/**
 * Удалить выбор подразделения после создания каллаута
 */
export function clearSubdivisionSelection(guildId: string, userId: string): void {
  subdivisionSelections.delete(`${guildId}:${userId}`);
}

export default handleSubdivisionSelect;
