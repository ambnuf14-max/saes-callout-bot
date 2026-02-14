import { Interaction, Collection } from 'discord.js';
import logger from '../../utils/logger';
import { handleDiscordError } from '../../utils/error-handler';
import { Command } from '../types';
import handleCreateCalloutButton from '../interactions/callout-button';
import handleCalloutModalSubmit from '../interactions/callout-modal';
import handleSubdivisionSelect from '../interactions/subdivision-select';
import handleDepartmentPanelButton from '../interactions/department-panel-button';
import handleDepartmentPanelModal from '../interactions/department-panel-modal';
import handleDepartmentSelect from '../interactions/department-select';

/**
 * Обработчик всех взаимодействий (команды, кнопки, модальные окна)
 */
export default async function interactionCreateHandler(
  interaction: Interaction,
  commands: Collection<string, Command>
) {
  try {
    // Обработка slash команд
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);

      if (!command) {
        logger.warn('Unknown command', { commandName: interaction.commandName });
        await interaction.reply({
          content: '❌ Неизвестная команда',
          ephemeral: true,
        });
        return;
      }

      logger.info('Executing command', {
        commandName: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      await command.execute(interaction);
    }

    // Обработка нажатий кнопок
    if (interaction.isButton()) {
      logger.info('Button interaction', {
        customId: interaction.customId,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      if (interaction.customId === 'create_callout') {
        await handleCreateCalloutButton(interaction);
      } else if (interaction.customId.startsWith('department_')) {
        await handleDepartmentPanelButton(interaction);
      }
      return;
    }

    // Обработка модальных окон
    if (interaction.isModalSubmit()) {
      logger.info('Modal submit interaction', {
        customId: interaction.customId,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      if (interaction.customId === 'callout_modal') {
        await handleCalloutModalSubmit(interaction);
      } else if (interaction.customId.startsWith('department_modal_')) {
        await handleDepartmentPanelModal(interaction);
      }
      return;
    }

    // Обработка select menus
    if (interaction.isStringSelectMenu()) {
      logger.info('Select menu interaction', {
        customId: interaction.customId,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      if (interaction.customId === 'subdivision_select') {
        await handleSubdivisionSelect(interaction);
      } else if (interaction.customId.startsWith('department_')) {
        await handleDepartmentSelect(interaction);
      }
      return;
    }
  } catch (error) {
    logger.error('Error handling interaction', {
      error: error instanceof Error ? error.message : error,
      interactionType: interaction.type,
      interactionId: interaction.id,
    });

    await handleDiscordError(interaction, error as Error);
  }
}
