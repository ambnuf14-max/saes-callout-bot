import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { SubdivisionService } from '../../services/subdivision.service';
import { getLeaderDepartment } from '../utils/department-permission-checker';
import { buildMainPanel } from '../utils/department-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

const departmentCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('department')
    .setDescription('Панель управления вашим департаментом (для лидеров)'),

  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);

      // Получить сервер из БД
      const server = await ServerModel.findByGuildId(interaction.guild.id);
      if (!server) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Сервер не настроен. Обратитесь к администратору.`,
        });
        return;
      }

      // Проверить, является ли пользователь лидером фракции
      let department;
      try {
        department = await getLeaderFaction(member);
      } catch (error) {
        // Если ошибка о множественных фракциях
        if (error instanceof CalloutError && error.code === 'MULTIPLE_FACTIONS') {
          await interaction.editReply({
            content: MESSAGES.FACTION.MULTIPLE_FACTIONS,
          });
          return;
        }
        throw error;
      }

      if (!department) {
        await interaction.editReply({
          content: MESSAGES.FACTION.NO_FACTION,
        });
        return;
      }

      // Получить статистику подразделений
      const subdivisions = await SubdivisionService.getSubdivisionsByFactionId(department.id);
      const activeCount = subdivisions.filter((sub) => sub.is_active).length;

      // Построить главную панель
      const panel = buildMainPanel(department, subdivisions.length, activeCount);

      await interaction.editReply(panel);

      logger.info('Faction panel opened', {
        departmentId: department.id,
        departmentName: department.name,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
      });
    } catch (error) {
      logger.error('Error in department command', {
        error: error instanceof Error ? error.message : error,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
      });

      if (error instanceof CalloutError) {
        await interaction.editReply({
          content: error.message,
        });
      } else {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Произошла ошибка при открытии панели`,
        });
      }
    }
  },
};

export default departmentCommand;
