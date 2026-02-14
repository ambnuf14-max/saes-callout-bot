import { StringSelectMenuInteraction } from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { getLeaderDepartment } from '../utils/department-permission-checker';
import { buildSubdivisionDetailPanel } from '../utils/department-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик select menu для выбора подразделения
 */
export async function handleDepartmentSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);

  // Получить фракцию лидера
  const department = await getLeaderDepartment(member);
  if (!department) {
    await interaction.reply({
      content: MESSAGES.DEPARTMENT.NO_FACTION,
      ephemeral: true,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Выбор подразделения из списка
    if (customId === 'department_select_subdivision') {
      await handleSelectSubdivision(interaction);
    }
  } catch (error) {
    logger.error('Error handling department select menu', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content =
      error instanceof CalloutError
        ? error.message
        : `${EMOJI.ERROR} Произошла ошибка при выборе подразделения`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
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
  const panel = buildSubdivisionDetailPanel(subdivision);

  await interaction.editReply(panel);

  logger.info('Subdivision selected via select menu', {
    subdivisionId,
    name: subdivision.name,
    userId: interaction.user.id,
  });
}

export default handleDepartmentSelect;
