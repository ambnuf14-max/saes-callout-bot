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
import DepartmentService from '../../services/department.service';
import { UpdateDepartmentDTO } from '../../types/database.types';
import { isLeader } from '../utils/permission-checker';
import { EMOJI, COLORS, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import {
  logAuditEvent,
  AuditEventType,
  DepartmentAddedData,
  DepartmentUpdatedData,
  DepartmentRemovedData,
} from '../utils/audit-logger';

const departmentCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('department')
    .setDescription('Управление департаментами')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Добавить новый департамент')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Название департамента (например: LSFD)')
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Discord роль департамента')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('vk_chat_id')
            .setDescription('ID VK беседы (peer_id)')
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
      subcommand.setName('list').setDescription('Список всех департаментов')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Удалить департамент')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Название департамента')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Изменить настройки департамента')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Название департамента')
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Новая Discord роль (опционально)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('vk_chat_id')
            .setDescription('Новый ID VK беседы (опционально)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Новое описание (опционально)')
            .setRequired(false)
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

    // Проверка прав лидера
    const hasPermission = await isLeader(member);
    if (!hasPermission) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Только лидеры могут управлять департаментами`,
        ephemeral: true,
      });
      return;
    }

    // Получить сервер из БД
    const server = await ServerModel.findByGuildId(interaction.guild.id);
    if (!server) {
      await interaction.reply({
        content: `${EMOJI.ERROR} Сервер не настроен. Используйте \`/setup\` сначала`,
        ephemeral: true,
      });
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'add':
          await handleAdd(interaction, server.id);
          break;
        case 'list':
          await handleList(interaction, server.id);
          break;
        case 'remove':
          await handleRemove(interaction, server.id);
          break;
        case 'edit':
          await handleEdit(interaction, server.id);
          break;
      }
    } catch (error) {
      logger.error('Error in department command', {
        error: error instanceof Error ? error.message : error,
        subcommand,
        guildId: interaction.guild.id,
      });
      throw error;
    }
  },
};

/**
 * Обработка /department add
 */
async function handleAdd(interaction: ChatInputCommandInteraction, serverId: number) {
  const name = interaction.options.getString('name', true);
  const role = interaction.options.getRole('role', true);
  const vkChatId = interaction.options.getString('vk_chat_id', true);
  const description = interaction.options.getString('description');

  await interaction.deferReply({ ephemeral: true });

  const department = await DepartmentService.createDepartment({
    server_id: serverId,
    name: name,
    discord_role_id: role.id,
    vk_chat_id: vkChatId,
    description: description || undefined,
  });

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.SUCCESS} Департамент добавлен`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'Название', value: department.name, inline: true },
      { name: 'Роль', value: `<@&${department.discord_role_id}>`, inline: true },
      { name: 'VK Беседа', value: department.vk_chat_id, inline: true },
    ])
    .setTimestamp();

  if (department.description) {
    embed.addFields([{ name: 'Описание', value: department.description }]);
  }

  await interaction.editReply({ embeds: [embed] });

  logger.info('Department added via command', {
    departmentId: department.id,
    name: department.name,
    userId: interaction.user.id,
  });

  // Логировать в audit log
  if (interaction.guild) {
    const auditData: DepartmentAddedData = {
      userId: interaction.user.id,
      userName: interaction.user.tag,
      departmentName: department.name,
      roleId: department.discord_role_id,
      vkChatId: department.vk_chat_id,
    };
    await logAuditEvent(interaction.guild, AuditEventType.DEPARTMENT_ADDED, auditData);
  }
}

/**
 * Обработка /department list
 */
async function handleList(interaction: ChatInputCommandInteraction, serverId: number) {
  await interaction.deferReply({ ephemeral: true });

  const departments = await DepartmentService.getDepartments(serverId);

  if (departments.length === 0) {
    await interaction.editReply({
      content: `${EMOJI.INFO} Департаменты не найдены. Добавьте первый департамент командой \`/department add\``,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.INFO} Департаменты сервера`)
    .setColor(COLORS.INFO)
    .setDescription(`Всего департаментов: **${departments.length}**`)
    .setTimestamp();

  departments.forEach((dept, index) => {
    const status = dept.is_active ? `${EMOJI.ACTIVE} Активен` : `${EMOJI.CLOSED} Неактивен`;
    embed.addFields([
      {
        name: `${index + 1}. ${dept.name}`,
        value:
          `**Роль:** <@&${dept.discord_role_id}>\n` +
          `**VK Беседа:** ${dept.vk_chat_id}\n` +
          `**Статус:** ${status}` +
          (dept.description ? `\n**Описание:** ${dept.description}` : ''),
        inline: false,
      },
    ]);
  });

  await interaction.editReply({ embeds: [embed] });

  logger.info('Department list displayed', {
    userId: interaction.user.id,
    count: departments.length,
  });
}

/**
 * Обработка /department remove
 */
async function handleRemove(interaction: ChatInputCommandInteraction, serverId: number) {
  const name = interaction.options.getString('name', true);

  await interaction.deferReply({ ephemeral: true });

  const department = await DepartmentService.getDepartmentByName(serverId, name);

  if (!department) {
    throw new CalloutError(
      MESSAGES.DEPARTMENT.ERROR_NOT_FOUND(name),
      'DEPARTMENT_NOT_FOUND',
      404
    );
  }

  await DepartmentService.deleteDepartment(department.id);

  await interaction.editReply({
    content: MESSAGES.DEPARTMENT.SUCCESS_REMOVED(department.name),
  });

  logger.info('Department removed via command', {
    departmentId: department.id,
    name: department.name,
    userId: interaction.user.id,
  });

  // Логировать в audit log
  if (interaction.guild) {
    const auditData: DepartmentRemovedData = {
      userId: interaction.user.id,
      userName: interaction.user.tag,
      departmentName: department.name,
    };
    await logAuditEvent(interaction.guild, AuditEventType.DEPARTMENT_REMOVED, auditData);
  }
}

/**
 * Обработка /department edit
 */
async function handleEdit(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const name = interaction.options.getString('name', true);
  const role = interaction.options.getRole('role');
  const vkChatId = interaction.options.getString('vk_chat_id');
  const description = interaction.options.getString('description');

  await interaction.deferReply({ ephemeral: true });

  // Проверить что хотя бы одно поле для изменения указано
  if (!role && !vkChatId && !description) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Укажите хотя бы одно поле для изменения (role, vk_chat_id или description)`,
    });
    return;
  }

  // Получить департамент
  const department = await DepartmentService.getDepartmentByName(serverId, name);

  if (!department) {
    throw new CalloutError(
      MESSAGES.DEPARTMENT.ERROR_NOT_FOUND(name),
      'DEPARTMENT_NOT_FOUND',
      404
    );
  }

  // Подготовить данные для обновления
  const updateData: UpdateDepartmentDTO = {};
  const changes: string[] = [];

  if (role) {
    updateData.discord_role_id = role.id;
    changes.push(`Роль: <@&${role.id}>`);
  }

  if (vkChatId) {
    updateData.vk_chat_id = vkChatId;
    changes.push(`VK Беседа: ${vkChatId}`);
  }

  if (description !== null) {
    updateData.description = description;
    changes.push(`Описание: ${description || 'удалено'}`);
  }

  // Обновить департамент
  const updatedDepartment = await DepartmentService.updateDepartment(
    department.id,
    updateData
  );

  if (!updatedDepartment) {
    throw new CalloutError(
      `${EMOJI.ERROR} Не удалось обновить департамент`,
      'UPDATE_FAILED',
      500
    );
  }

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.SUCCESS} Департамент обновлен`)
    .setColor(COLORS.ACTIVE)
    .addFields([
      { name: 'Департамент', value: updatedDepartment.name, inline: false },
      { name: 'Изменения', value: changes.join('\n'), inline: false },
    ])
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  logger.info('Department updated via command', {
    departmentId: department.id,
    name: department.name,
    changes: updateData,
    userId: interaction.user.id,
  });

  // Логировать в audit log
  if (interaction.guild) {
    const auditData: DepartmentUpdatedData = {
      userId: interaction.user.id,
      userName: interaction.user.tag,
      departmentName: updatedDepartment.name,
      changes,
    };
    await logAuditEvent(interaction.guild, AuditEventType.DEPARTMENT_UPDATED, auditData);
  }
}

export default departmentCommand;
