import { StringSelectMenuInteraction, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { getLeaderFaction } from '../utils/faction-permission-checker';
import { buildSubdivisionDetailPanel } from '../utils/faction-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { handleInteractionError } from '../utils/subdivision-settings-helper';

/**
 * Обработчик select menu для выбора подразделения
 */
export async function handleFactionSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);

  // Получить фракцию лидера
  const faction = await getLeaderFaction(member);
  if (!faction) {
    await interaction.reply({
      content: MESSAGES.FACTION.NO_FACTION,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Выбор подразделения из списка
    if (customId === 'faction_select_subdivision') {
      await handleSelectSubdivision(interaction);
    }
  } catch (error) {
    await handleInteractionError(error, interaction, 'Error handling faction select menu', `${EMOJI.ERROR} Произошла ошибка при выборе подразделения`);
  }
}

/**
 * Обработка выбора подразделения из списка
 */
async function handleSelectSubdivision(interaction: StringSelectMenuInteraction) {
  await interaction.deferUpdate();

  const subdivisionId = parseInt(interaction.values[0]);

  // Получить подразделение
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  // Показать детальную панель подразделения
  const panel = await buildSubdivisionDetailPanel(subdivision);

  await interaction.editReply(panel);

  logger.info('Subdivision selected via select menu', {
    subdivisionId,
    name: subdivision.name,
    userId: interaction.user.id,
  });
}

export default handleFactionSelect;
