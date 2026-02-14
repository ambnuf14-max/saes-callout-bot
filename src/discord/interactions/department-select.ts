import {
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import logger from '../../utils/logger';
import { EMOJI, LIMITS } from '../../config/constants';

/**
 * Временное хранилище выбранного департамента (user_id → department_id)
 * В продакшене можно использовать Redis, но для простоты - Map
 */
const departmentSelections = new Map<string, number>();

/**
 * Обработчик выбора департамента из Select Menu
 */
export async function handleDepartmentSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      ephemeral: true,
    });
    return;
  }

  try {
    // Получить выбранный департамент ID
    const departmentId = parseInt(interaction.values[0], 10);

    logger.info('Department selected from menu', {
      userId: interaction.user.id,
      departmentId,
    });

    // Сохранить выбор в временное хранилище
    departmentSelections.set(interaction.user.id, departmentId);

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
      .setMinLength(3)
      .setMaxLength(100)
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

    logger.info('Callout modal shown after department selection', {
      userId: interaction.user.id,
      departmentId,
    });
  } catch (error) {
    logger.error('Error handling department selection', {
      error: error instanceof Error ? error.message : error,
      userId: interaction.user.id,
    });

    // Проверить, можно ли еще ответить на interaction
    // (showModal уже мог быть вызван)
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: `${EMOJI.ERROR} Не удалось открыть форму создания каллаута`,
          ephemeral: true,
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
 * Получить выбранный департамент для пользователя
 */
export function getDepartmentSelection(userId: string): number | undefined {
  return departmentSelections.get(userId);
}

/**
 * Удалить выбор департамента после создания каллаута
 */
export function clearDepartmentSelection(userId: string): void {
  departmentSelections.delete(userId);
}

export default handleDepartmentSelect;
