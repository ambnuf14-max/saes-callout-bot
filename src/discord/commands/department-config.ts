import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { DepartmentService } from '../../services/department.service';
import { isAdministrator } from '../utils/permission-checker';
import { EMOJI, COLORS, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

const departmentConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('department-config')
    .setDescription('Управление фракциями (только для администраторов)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Создать новую департамент')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Название департамента (например: LSPD)')
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('general-leader-role')
            .setDescription('Общая лидерская роль (например: State Department Leader)')
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('department-role')
            .setDescription('Роль конкретной департамента (например: LSPD)')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Описание департамента')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('Список всех департаментов сервера')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Изменить департамент')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Название департамента для изменения')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName('new-name')
            .setDescription('Новое название департамента')
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName('general-leader-role')
            .setDescription('Новая общая лидерская роль')
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName('department-role')
            .setDescription('Новая роль департамента')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Новое описание')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Удалить департамент (удалит все подразделения!)')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Название департамента для удаления')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Эта команда доступна только на сервере`,
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    // Проверка прав администратора
    if (!isAdministrator(member)) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Только администраторы могут управлять фракциями`,
        ephemeral: true,
      });
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    // Получить сервер из БД
    const server = await ServerModel.findByGuildId(interaction.guild.id);
    if (!server) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Сервер не настроен. Используйте \`/setup\` сначала`,
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'add':
          await handleAddDepartment(interaction, server.id);
          break;
        case 'list':
          await handleListDepartments(interaction, server.id);
          break;
        case 'edit':
          await handleEditDepartment(interaction, server.id);
          break;
        case 'remove':
          await handleRemoveDepartment(interaction, server.id);
          break;
      }
    } catch (error) {
      logger.error('Error in department-config command', {
        error: error instanceof Error ? error.message : error,
        subcommand,
        guildId: interaction.guild.id,
      });

      if (error instanceof CalloutError) {
        await interaction.editReply({
          content: error.message,
        });
      } else {
        await interaction.editReply({
          content: `${EMOJI.ERROR} Произошла ошибка при выполнении команды`,
        });
      }
    }
  },
};

/**
 * Обработка /department-config add
 */
async function handleAddDepartment(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const name = interaction.options.getString('name', true);
  const generalLeaderRole = interaction.options.getRole('general-leader-role', true);
  const departmentRole = interaction.options.getRole('department-role', true);
  const description = interaction.options.getString('description');

  await interaction.deferReply({ ephemeral: true });

  // Создать департамент
  const department = await DepartmentService.createDepartment({
    server_id: serverId,
    name: name,
    description: description || undefined,
    general_leader_role_id: generalLeaderRole.id,
    department_role_id: departmentRole.id,
  });

  // Создать embed с информацией о департамента
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJI.SUCCESS} Фракция создана`)
    .setDescription(`**${department.name}**`)
    .addFields(
      {
        name: 'Общая лидерская роль',
        value: `<@&${department.general_leader_role_id}>`,
        inline: true,
      },
      {
        name: 'Роль департамента',
        value: `<@&${department.department_role_id}>`,
        inline: true,
      }
    )
    .setTimestamp();

  if (department.description) {
    embed.addFields({ name: 'Описание', value: department.description });
  }

  await interaction.editReply({ embeds: [embed] });

  logger.info('Department created via command', {
    departmentId: department.id,
    name: department.name,
    serverId,
    userId: interaction.user.id,
  });
}

/**
 * Обработка /department-config list
 */
async function handleListDepartments(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  await interaction.deferReply({ ephemeral: true });

  const departments = await DepartmentService.getDepartments(serverId);

  if (departments.length === 0) {
    await interaction.editReply({
      content: `${EMOJI.INFO} Фракции еще не созданы. Используйте \`/department-config add\``,
    });
    return;
  }

  // Создать embed со списком департаментов
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('🏛️ Список департаментов')
    .setDescription(`Всего департаментов: ${departments.length}`)
    .setTimestamp();

  for (const department of departments) {
    const statusEmoji = department.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
    const fieldValue =
      `**Роли:**\n` +
      `Общая: <@&${department.general_leader_role_id}>\n` +
      `Фракция: <@&${department.department_role_id}>\n` +
      `**Статус:** ${statusEmoji} ${department.is_active ? 'Активна' : 'Неактивна'}`;

    embed.addFields({
      name: `${statusEmoji} ${department.name}`,
      value: fieldValue,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Обработка /department-config edit
 */
async function handleEditDepartment(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const name = interaction.options.getString('name', true);
  const newName = interaction.options.getString('new-name');
  const generalLeaderRole = interaction.options.getRole('general-leader-role');
  const departmentRole = interaction.options.getRole('department-role');
  const description = interaction.options.getString('description');

  await interaction.deferReply({ ephemeral: true });

  // Найти департамент
  const department = await DepartmentService.getDepartmentByName(serverId, name);
  if (!department) {
    await interaction.editReply({
      content: MESSAGES.DEPARTMENT.ERROR_NOT_FOUND,
    });
    return;
  }

  // Обновить департамент
  await DepartmentService.updateDepartment(department.id, {
    name: newName || undefined,
    general_leader_role_id: generalLeaderRole?.id,
    department_role_id: departmentRole?.id,
    description: description || undefined,
  });

  await interaction.editReply({
    content: MESSAGES.DEPARTMENT.SUCCESS_UPDATED(newName || department.name),
  });

  logger.info('Department updated via command', {
    departmentId: department.id,
    serverId,
    userId: interaction.user.id,
  });
}

/**
 * Обработка /department-config remove
 */
async function handleRemoveDepartment(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const name = interaction.options.getString('name', true);

  await interaction.deferReply({ ephemeral: true });

  // Найти департамент
  const department = await DepartmentService.getDepartmentByName(serverId, name);
  if (!department) {
    await interaction.editReply({
      content: MESSAGES.DEPARTMENT.ERROR_NOT_FOUND,
    });
    return;
  }

  // Удалить департамент (каскадно удалит все подразделения)
  await DepartmentService.deleteDepartment(department.id);

  await interaction.editReply({
    content: MESSAGES.DEPARTMENT.SUCCESS_REMOVED(department.name),
  });

  logger.info('Department removed via command', {
    departmentId: department.id,
    name: department.name,
    serverId,
    userId: interaction.user.id,
  });
}

export default departmentConfigCommand;
