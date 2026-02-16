import { SlashCommandBuilder, CommandInteraction, MessageFlags } from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { ServerModel, SubdivisionModel } from '../../database/models';
import { SubdivisionService } from '../../services/subdivision.service';
import { getLeaderDepartment } from '../utils/department-permission-checker';
import { buildMainPanel, buildStandaloneMainPanel } from '../utils/department-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

const factionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('faction')
    .setDescription('Панель управления вашей фракцией'),

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

      // Получить сервер из БД
      const server = await ServerModel.findByGuildId(interaction.guild.id);
      if (!server) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Сервер не настроен. Обратитесь к администратору.`,
        });
        return;
      }

      // Проверить, является ли пользователь лидером фракции
      let faction;
      try {
        faction = await getLeaderDepartment(member);
      } catch (error) {
        // Если ошибка о множественных фракциях
        if (error instanceof CalloutError && error.code === 'MULTIPLE_DEPARTMENTS') {
          await interaction.editReply({
            content: MESSAGES.FACTION.MULTIPLE_FACTIONS,
          });
          return;
        }
        throw error;
      }

      if (!faction) {
        await interaction.editReply({
          content: MESSAGES.FACTION.NO_FACTION,
        });
        return;
      }

      let panel;

      // Получить дефолтное подразделение
      const defaultSubdivision = await SubdivisionModel.findDefaultByDepartmentId(faction.id);
      if (!defaultSubdivision) {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Ошибка конфигурации: дефолтное подразделение не найдено. Обратитесь к администратору.`,
        });
        return;
      }

      // Подсчитать активные НЕ дефолтные подразделения
      const activeNonDefaultCount = await SubdivisionModel.countActiveNonDefault(faction.id);

      // Выбрать режим панели автоматически
      if (activeNonDefaultCount === 0) {
        // Нет активных обычных подразделений - показать standalone панель
        panel = buildStandaloneMainPanel(faction, defaultSubdivision);
      } else {
        // Есть активные обычные подразделения - показать обычную панель
        const allSubdivisions = await SubdivisionService.getSubdivisionsByDepartmentId(faction.id, true);
        // Отфильтровать дефолтное подразделение
        const subdivisions = allSubdivisions.filter(sub => !sub.is_default);
        panel = buildMainPanel(faction, subdivisions.length, subdivisions.length);
      }

      await interaction.editReply(panel);

      logger.info('Faction panel opened', {
        factionId: faction.id,
        factionName: faction.name,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
      });
    } catch (error) {
      logger.error('Error in faction command', {
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

export default factionCommand;
