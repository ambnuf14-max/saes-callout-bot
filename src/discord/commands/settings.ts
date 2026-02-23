import {
  SlashCommandBuilder,
  CommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { isAdministrator } from '../utils/permission-checker';
import { EMOJI } from '../../config/constants';
import { buildAdminMainPanel } from '../utils/admin-panel-builder';
import { logAuditEvent, AuditEventType, UnauthorizedAccessData } from '../utils/audit-logger';

const settingsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Панель администрирования сервера')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);

      // Проверка прав администратора
      if (!isAdministrator(member)) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Только администраторы могут использовать эту команду`,
        });
        const auditData: UnauthorizedAccessData = {
          userId: interaction.user.id,
          userName: interaction.user.username,
          action: 'open_settings',
          thumbnailUrl: interaction.user.displayAvatarURL(),
        };
        logAuditEvent(interaction.guild!, AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, auditData).catch(() => {});
        return;
      }

      // Получить или создать сервер в БД
      let server = await ServerModel.findByGuildId(interaction.guild.id);
      if (!server) {
        // Если сервер не настроен — создаём запись
        server = await ServerModel.create({
          guild_id: interaction.guild.id,
        });
      }

      // Показать главную админ-панель
      const panel = await buildAdminMainPanel(server, interaction.user.id);

      await interaction.editReply(panel);

      logger.info('Admin panel opened', {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
      });
    } catch (error) {
      logger.error('Error in settings command', {
        error: error instanceof Error ? error.message : error,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
      });

      await interaction.editReply({
        content: `${EMOJI.ERROR} Произошла ошибка при открытии панели администрирования`,
      });
    }
  },
};

export default settingsCommand;
