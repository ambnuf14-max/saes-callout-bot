import { ButtonInteraction } from 'discord.js';
import logger from '../../utils/logger';
import { safeParseInt } from '../../utils/validators';
import { ServerModel } from '../../database/models';
import { EMOJI } from '../../config/constants';
import { decodeFilterKey, buildHistoryResponse } from '../commands/history';

/**
 * Обработчик кнопок пагинации истории каллаутов
 */
export async function handleHistoryButton(interaction: ButtonInteraction): Promise<void> {
  try {
    // Формат customId: history_prev_{page}_{filterKey} или history_next_{page}_{filterKey}
    const parts = interaction.customId.split('_');
    const direction = parts[1]; // 'prev' или 'next'
    const currentPage = safeParseInt(parts[2], 10);
    const filterKey = parts.slice(3).join('_');

    const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

    if (newPage < 1) return;

    if (!interaction.guildId) {
      await interaction.update({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        embeds: [],
        components: [],
      });
      return;
    }

    const server = await ServerModel.findByGuildId(interaction.guildId);
    if (!server) {
      await interaction.update({
        content: `${EMOJI.ERROR} Сервер не найден`,
        embeds: [],
        components: [],
      });
      return;
    }

    const filters = decodeFilterKey(filterKey);
    const { embed, components } = await buildHistoryResponse(server.id, filters, newPage);

    await interaction.update({
      embeds: [embed],
      components,
    });
  } catch (error) {
    logger.error('Error handling history button', {
      error: error instanceof Error ? error.message : error,
      customId: interaction.customId,
    });
  }
}

export default handleHistoryButton;
