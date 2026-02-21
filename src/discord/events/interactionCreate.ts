import { Interaction, Collection, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { handleDiscordError } from '../../utils/error-handler';
import { Command } from '../types';
import handleCreateCalloutButton from '../interactions/callout-button';
import handleCalloutModalSubmit from '../interactions/callout-modal';
import handleSubdivisionSelect from '../interactions/subdivision-select';
import handleFactionPanelButton, { handleFactionRoleSelect, handleFactionSettingsRoleSelect, handleFactionSubdivisionSelect } from '../interactions/faction-panel-button';
import handleFactionPanelModal from '../interactions/faction-panel-modal';
import handleFactionSelect from '../interactions/faction-select';
import { handleSetupModeSelect } from '../interactions/setup-mode-select';
import { handleCloseCalloutButton, handleCloseCalloutModal } from '../interactions/close-callout-button';
import { handleRespondCalloutButton } from '../interactions/respond-callout-button';
import handleHistoryButton from '../interactions/history-button';
import {
  handleAdminPanelButton,
  handleAdminRoleSelect,
  handleAdminChannelSelect,
  handleAdminStringSelect,
  handleAuditLogButton,
} from '../interactions/admin-panel-button';
import { handleAdminPanelModal, handleAuditLogModal } from '../interactions/admin-panel-modal';
import { handleRoleManualButton, handleRoleManualModal } from '../interactions/role-manual-input';

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

      if (interaction.customId.startsWith('role_manual_input_')) {
        await handleRoleManualButton(interaction);
      } else if (interaction.customId === 'create_callout') {
        await handleCreateCalloutButton(interaction);
      } else if (
        interaction.customId.startsWith('setup_mode_') ||
        interaction.customId.startsWith('setup_confirm_') ||
        interaction.customId === 'setup_keep' ||
        interaction.customId === 'setup_reconfigure'
      ) {
        await handleSetupModeSelect(interaction);
      } else if (interaction.customId.startsWith('close_callout_')) {
        await handleCloseCalloutButton(interaction);
      } else if (interaction.customId.startsWith('respond_callout_')) {
        await handleRespondCalloutButton(interaction);
      } else if (interaction.customId.startsWith('audit_approve_change_') || interaction.customId.startsWith('audit_reject_change_')) {
        await handleAuditLogButton(interaction);
      } else if (interaction.customId.startsWith('admin_') || interaction.customId.startsWith('template_')) {
        await handleAdminPanelButton(interaction);
      } else if (interaction.customId.startsWith('department_') || interaction.customId.startsWith('subdivision_') || interaction.customId.startsWith('faction_')) {
        await handleFactionPanelButton(interaction);
      } else if (interaction.customId.startsWith('history_')) {
        await handleHistoryButton(interaction);
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

      if (interaction.customId.startsWith('role_modal_')) {
        await handleRoleManualModal(interaction);
      } else if (interaction.customId === 'callout_modal') {
        await handleCalloutModalSubmit(interaction);
      } else if (interaction.customId.startsWith('close_callout_modal_')) {
        await handleCloseCalloutModal(interaction);
      } else if (interaction.customId.startsWith('audit_modal_')) {
        await handleAuditLogModal(interaction);
      } else if (interaction.customId.startsWith('admin_modal_') || interaction.customId.startsWith('template_modal_')) {
        await handleAdminPanelModal(interaction);
      } else if (interaction.customId.startsWith('department_modal_') || interaction.customId.startsWith('subdivision_modal_') || interaction.customId.startsWith('faction_modal_')) {
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

      if (interaction.customId === 'subdivision_list_preview' || interaction.customId === 'template_list_preview') {
        await interaction.deferUpdate();
      } else if (interaction.customId === 'subdivision_select') {
        await handleSubdivisionSelect(interaction);
      } else if (interaction.customId.startsWith('setup_select_')) {
        await handleSetupModeSelect(interaction);
      } else if (interaction.customId.startsWith('admin_')) {
        await handleAdminStringSelect(interaction);
      } else if (interaction.customId.startsWith('department_')) {
        await handleFactionSelect(interaction);
      } else if (interaction.customId === 'faction_select_subdivision') {
        await handleFactionSubdivisionSelect(interaction);
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
      } else if (interaction.customId.startsWith('subdivision_role_')) {
        await handleFactionRoleSelect(interaction);
      } else if (interaction.customId.startsWith('faction_settings_role_')) {
        await handleFactionSettingsRoleSelect(interaction);
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
