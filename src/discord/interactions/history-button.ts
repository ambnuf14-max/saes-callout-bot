import { ButtonInteraction } from 'discord.js';
import logger from '../../utils/logger';
import { safeParseInt } from '../../utils/validators';
import { ServerModel } from '../../database/models';
import { EMOJI } from '../../config/constants';
import { decodeFilterKey, buildHistoryResponse, buildCalloutDetailResponse } from '../commands/history';

/**
 * Обработчик кнопок истории каллаутов
 */
export async function handleHistoryButton(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferUpdate();

    const parts = interaction.customId.split('_');
    const action = parts[1]; // 'prev', 'next', 'view', 'back'

    // Просмотр конкретного каллаута: history_view_{calloutId}_{msgPage}_{listPage}_{filterKey}
    if (action === 'view') {
      const calloutId = safeParseInt(parts[2]);
      const msgPage = safeParseInt(parts[3]);
      const listPage = safeParseInt(parts[4]);
      const filterKey = parts.slice(5).join('_');
      const { embeds, components } = await buildCalloutDetailResponse(calloutId, msgPage, listPage, filterKey);
      await interaction.editReply({ embeds, components, content: '' });
      return;
    }

    // Назад к списку: history_back_{page}_{filterKey}
    if (action === 'back') {
      const page = safeParseInt(parts[2]);
      const filterKey = parts.slice(3).join('_');

      if (!interaction.guildId) return;
      const server = await ServerModel.findByGuildId(interaction.guildId);
      if (!server) return;

      const filters = decodeFilterKey(filterKey);
      const { embeds, components } = await buildHistoryResponse(server.id, filters, page);
      await interaction.editReply({ embeds, components, content: '' });
      return;
    }

    // Пагинация: history_prev_{page}_{filterKey} / history_next_{page}_{filterKey}
    const currentPage = safeParseInt(parts[2]);
    const filterKey = parts.slice(3).join('_');
    const newPage = action === 'next' ? currentPage + 1 : currentPage - 1;

    if (newPage < 1) return;

    if (!interaction.guildId) return;
    const server = await ServerModel.findByGuildId(interaction.guildId);
    if (!server) {
      await interaction.editReply({
        content: `${EMOJI.ERROR} Сервер не найден`,
        embeds: [],
        components: [],
      });
      return;
    }

    const filters = decodeFilterKey(filterKey);
    const { embeds, components } = await buildHistoryResponse(server.id, filters, newPage);
    await interaction.editReply({ embeds, components, content: '' });

  } catch (error) {
    logger.error('Error handling history button', {
      error: error instanceof Error ? error.message : error,
      customId: interaction.customId,
    });
  }
}

export default handleHistoryButton;
