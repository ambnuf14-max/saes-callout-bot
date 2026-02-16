import { Interaction, Collection, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { handleDiscordError } from '../../utils/error-handler';
import { Command } from '../types';
import handleCreateCalloutButton from '../interactions/callout-button';
import handleCalloutModalSubmit from '../interactions/callout-modal';
import handleSubdivisionSelect from '../interactions/subdivision-select';
import handleFactionPanelButton from '../interactions/faction-panel-button';
import handleFactionPanelModal from '../interactions/faction-panel-modal';
import handleFactionSelect from '../interactions/faction-select';
import { handleSetupModeSelect } from '../interactions/setup-mode-select';
import { handleCloseCalloutButton, handleCloseCalloutModal } from '../interactions/close-callout-button';
import {
  handleAdminPanelButton,
  handleAdminRoleSelect,
  handleAdminChannelSelect,
  handleAdminStringSelect,
} from '../interactions/admin-panel-button';
import { handleAdminPanelModal } from '../interactions/admin-panel-modal';

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
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      logger.info('Executing command', {
        commandName: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      await command.execute(interaction);
      return;
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
      } else if (
        interaction.customId.startsWith('setup_mode_') ||
        interaction.customId === 'setup_keep' ||
        interaction.customId === 'setup_reconfigure'
      ) {
        await handleSetupModeSelect(interaction);
      } else if (interaction.customId.startsWith('close_callout_')) {
        await handleCloseCalloutButton(interaction);
      } else if (interaction.customId.startsWith('admin_')) {
        await handleAdminPanelButton(interaction);
      } else if (interaction.customId.startsWith('department_')) {
        await handleFactionPanelButton(interaction);
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
      } else if (interaction.customId.startsWith('close_callout_modal_')) {
        await handleCloseCalloutModal(interaction);
      } else if (interaction.customId.startsWith('admin_modal_')) {
        await handleAdminPanelModal(interaction);
      } else if (interaction.customId.startsWith('department_modal_')) {
        await handleFactionPanelModal(interaction);
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
      } else if (interaction.customId.startsWith('setup_select_')) {
        await handleSetupModeSelect(interaction);
      } else if (interaction.customId.startsWith('admin_')) {
        await handleAdminStringSelect(interaction);
      } else if (interaction.customId.startsWith('department_')) {
        await handleFactionSelect(interaction);
      }
      return;
    }

    // Обработка RoleSelectMenu
    if (interaction.isRoleSelectMenu()) {
      logger.info('Role select menu interaction', {
        customId: interaction.customId,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      if (interaction.customId.startsWith('admin_')) {
        await handleAdminRoleSelect(interaction);
      }
      return;
    }

    // Обработка ChannelSelectMenu
    if (interaction.isChannelSelectMenu()) {
      logger.info('Channel select menu interaction', {
        customId: interaction.customId,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      if (interaction.customId.startsWith('admin_')) {
        await handleAdminChannelSelect(interaction);
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
