import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { Command } from '../types';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { isAdministrator } from '../utils/permission-checker';
import { EMOJI, COLORS } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import {
  logAuditEvent,
  AuditEventType,
  AuditLogChannelSetData,
  LeaderRoleAddedData,
  LeaderRoleRemovedData,
} from '../utils/audit-logger';

const settingsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Настройки сервера и лидерские роли')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-leader')
        .setDescription('Добавить лидерскую роль')
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Роль лидера департамента')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-leader')
        .setDescription('Удалить лидерскую роль')
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Роль для удаления')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list-leaders').setDescription('Список лидерских ролей')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('info').setDescription('Информация о настройках сервера')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-audit-log')
        .setDescription('Настроить канал для журнала действий')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Текстовый канал для audit log')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-callout-role')
        .setDescription('Добавить роль которая может создавать каллауты')
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Роль для разрешения создания каллаутов')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-callout-role')
        .setDescription('Удалить роль из разрешенных для создания каллаутов')
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Роль для удаления')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list-callout-roles')
        .setDescription('Список ролей которые могут создавать каллауты')
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
        content: `${EMOJI.ERROR} Только администраторы могут изменять настройки сервера`,
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
        case 'add-leader':
          await handleAddLeader(interaction, server.id);
          break;
        case 'remove-leader':
          await handleRemoveLeader(interaction, server.id);
          break;
        case 'list-leaders':
          await handleListLeaders(interaction, server.id);
          break;
        case 'info':
          await handleInfo(interaction, server);
          break;
        case 'set-audit-log':
          await handleSetAuditLog(interaction, server.id);
          break;
        case 'add-callout-role':
          await handleAddCalloutRole(interaction, server.id);
          break;
        case 'remove-callout-role':
          await handleRemoveCalloutRole(interaction, server.id);
          break;
        case 'list-callout-roles':
          await handleListCalloutRoles(interaction, server.id);
          break;
      }
    } catch (error) {
      logger.error('Error in settings command', {
        error: error instanceof Error ? error.message : error,
        subcommand,
        guildId: interaction.guild.id,
      });
      throw error;
    }
  },
};

/**
 * Обработка /settings add-leader
 */
async function handleAddLeader(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const role = interaction.options.getRole('role', true);

  await interaction.deferReply({ ephemeral: true });

  // Получить текущие лидерские роли
  const server = await ServerModel.findById(serverId);
  if (!server) {
    throw new CalloutError('Сервер не найден', 'SERVER_NOT_FOUND', 404);
  }

  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);

  // Проверить, не добавлена ли уже эта роль
  if (leaderRoleIds.includes(role.id)) {
    await interaction.editReply({
      content: `${EMOJI.WARNING} Роль <@&${role.id}> уже является лидерской`,
    });
    return;
  }

  // Добавить роль
  leaderRoleIds.push(role.id);

  await ServerModel.update(serverId, {
    leader_role_ids: leaderRoleIds,
  });

  await interaction.editReply({
    content: `${EMOJI.SUCCESS} Роль <@&${role.id}> добавлена как лидерская`,
  });

  logger.info('Leader role added', {
    serverId,
    roleId: role.id,
    userId: interaction.user.id,
  });

  // Логировать в audit log
  if (interaction.guild) {
    const auditData: LeaderRoleAddedData = {
      userId: interaction.user.id,
      userName: interaction.user.tag,
      roleId: role.id,
    };
    await logAuditEvent(interaction.guild, AuditEventType.LEADER_ROLE_ADDED, auditData);
  }
}

/**
 * Обработка /settings remove-leader
 */
async function handleRemoveLeader(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const role = interaction.options.getRole('role', true);

  await interaction.deferReply({ ephemeral: true });

  const server = await ServerModel.findById(serverId);
  if (!server) {
    throw new CalloutError('Сервер не найден', 'SERVER_NOT_FOUND', 404);
  }

  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);

  // Проверить, есть ли эта роль в списке
  if (!leaderRoleIds.includes(role.id)) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Роль <@&${role.id}> не является лидерской`,
    });
    return;
  }

  // Удалить роль
  const updatedRoleIds = leaderRoleIds.filter((id) => id !== role.id);

  await ServerModel.update(serverId, {
    leader_role_ids: updatedRoleIds,
  });

  await interaction.editReply({
    content: `${EMOJI.SUCCESS} Роль <@&${role.id}> удалена из лидерских`,
  });

  logger.info('Leader role removed', {
    serverId,
    roleId: role.id,
    userId: interaction.user.id,
  });

  // Логировать в audit log
  if (interaction.guild) {
    const auditData: LeaderRoleRemovedData = {
      userId: interaction.user.id,
      userName: interaction.user.tag,
      roleId: role.id,
    };
    await logAuditEvent(interaction.guild, AuditEventType.LEADER_ROLE_REMOVED, auditData);
  }
}

/**
 * Обработка /settings list-leaders
 */
async function handleListLeaders(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  await interaction.deferReply({ ephemeral: true });

  const server = await ServerModel.findById(serverId);
  if (!server) {
    throw new CalloutError('Сервер не найден', 'SERVER_NOT_FOUND', 404);
  }

  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);

  if (leaderRoleIds.length === 0) {
    await interaction.editReply({
      content: `${EMOJI.INFO} Лидерские роли не настроены. Используйте \`/settings add-leader\``,
    });
    return;
  }

  const rolesList = leaderRoleIds.map((id, index) => `${index + 1}. <@&${id}>`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.INFO} Лидерские роли сервера`)
    .setColor(COLORS.INFO)
    .setDescription(rolesList)
    .addFields([
      {
        name: 'Всего ролей',
        value: leaderRoleIds.length.toString(),
        inline: true,
      },
    ])
    .setFooter({
      text: 'Лидеры могут управлять департаментами и закрывать каллауты',
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Обработка /settings info
 */
async function handleInfo(interaction: ChatInputCommandInteraction, server: any) {
  await interaction.deferReply({ ephemeral: true });

  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
  const calloutRoleIds = getCalloutRoleIds(server);

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.INFO} Настройки сервера`)
    .setColor(COLORS.INFO)
    .addFields([
      {
        name: 'Канал каллаутов',
        value: server.callout_channel_id
          ? `<#${server.callout_channel_id}>`
          : 'Не настроен',
        inline: true,
      },
      {
        name: 'Категория инцидентов',
        value: server.category_id ? `<#${server.category_id}>` : 'Не настроена',
        inline: true,
      },
      {
        name: 'Лидерских ролей',
        value: leaderRoleIds.length.toString(),
        inline: true,
      },
      {
        name: 'Audit Log канал',
        value: server.audit_log_channel_id
          ? `<#${server.audit_log_channel_id}>`
          : 'Не настроен',
        inline: true,
      },
      {
        name: 'Ролей для каллаутов',
        value:
          calloutRoleIds.length > 0
            ? calloutRoleIds.length.toString()
            : 'Любой может создавать',
        inline: true,
      },
    ])
    .setFooter({ text: 'Используйте /settings для изменения настроек' })
    .setTimestamp();

  if (leaderRoleIds.length > 0) {
    const rolesList = leaderRoleIds
      .slice(0, 5)
      .map((id) => `<@&${id}>`)
      .join(', ');
    embed.addFields([
      {
        name: 'Лидерские роли',
        value: rolesList + (leaderRoleIds.length > 5 ? '...' : ''),
        inline: false,
      },
    ]);
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Обработка /settings set-audit-log
 */
async function handleSetAuditLog(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const channel = interaction.options.getChannel('channel', true);

  await interaction.deferReply({ ephemeral: true });

  // Проверить что это текстовый канал
  if (channel.type !== ChannelType.GuildText) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Audit log канал должен быть текстовым каналом`,
    });
    return;
  }

  // Обновить настройки сервера
  await ServerModel.update(serverId, {
    audit_log_channel_id: channel.id,
  });

  await interaction.editReply({
    content: `${EMOJI.SUCCESS} Audit log канал установлен: <#${channel.id}>`,
  });

  logger.info('Audit log channel set', {
    serverId,
    channelId: channel.id,
    userId: interaction.user.id,
  });

  // Отправить первое событие в audit log
  if (interaction.guild) {
    const auditData: AuditLogChannelSetData = {
      userId: interaction.user.id,
      userName: interaction.user.tag,
      channelId: channel.id,
    };

    await logAuditEvent(interaction.guild, AuditEventType.AUDIT_LOG_CHANNEL_SET, auditData);
  }
}

/**
 * Обработка /settings add-callout-role
 */
async function handleAddCalloutRole(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const role = interaction.options.getRole('role', true);

  await interaction.deferReply({ ephemeral: true });

  const server = await ServerModel.findById(serverId);
  if (!server) {
    throw new CalloutError('Сервер не найден', 'SERVER_NOT_FOUND', 404);
  }

  const calloutRoleIds = getCalloutRoleIds(server);

  // Проверить, не добавлена ли уже эта роль
  if (calloutRoleIds.includes(role.id)) {
    await interaction.editReply({
      content: `${EMOJI.WARNING} Роль <@&${role.id}> уже может создавать каллауты`,
    });
    return;
  }

  // Добавить роль
  calloutRoleIds.push(role.id);

  await ServerModel.update(serverId, {
    callout_allowed_role_ids: calloutRoleIds,
  });

  await interaction.editReply({
    content: `${EMOJI.SUCCESS} Роль <@&${role.id}> теперь может создавать каллауты`,
  });

  logger.info('Callout role added', {
    serverId,
    roleId: role.id,
    userId: interaction.user.id,
  });
}

/**
 * Обработка /settings remove-callout-role
 */
async function handleRemoveCalloutRole(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  const role = interaction.options.getRole('role', true);

  await interaction.deferReply({ ephemeral: true });

  const server = await ServerModel.findById(serverId);
  if (!server) {
    throw new CalloutError('Сервер не найден', 'SERVER_NOT_FOUND', 404);
  }

  const calloutRoleIds = getCalloutRoleIds(server);

  // Проверить, есть ли эта роль в списке
  if (!calloutRoleIds.includes(role.id)) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} Роль <@&${role.id}> не в списке разрешенных`,
    });
    return;
  }

  // Удалить роль
  const updatedRoleIds = calloutRoleIds.filter((id) => id !== role.id);

  await ServerModel.update(serverId, {
    callout_allowed_role_ids: updatedRoleIds,
  });

  await interaction.editReply({
    content: `${EMOJI.SUCCESS} Роль <@&${role.id}> удалена из разрешенных для каллаутов`,
  });

  logger.info('Callout role removed', {
    serverId,
    roleId: role.id,
    userId: interaction.user.id,
  });
}

/**
 * Обработка /settings list-callout-roles
 */
async function handleListCalloutRoles(
  interaction: ChatInputCommandInteraction,
  serverId: number
) {
  await interaction.deferReply({ ephemeral: true });

  const server = await ServerModel.findById(serverId);
  if (!server) {
    throw new CalloutError('Сервер не найден', 'SERVER_NOT_FOUND', 404);
  }

  const calloutRoleIds = getCalloutRoleIds(server);

  if (calloutRoleIds.length === 0) {
    await interaction.editReply({
      content: `${EMOJI.INFO} Разрешенные роли для каллаутов не настроены.\n\nПо умолчанию любой пользователь может создать каллаут.\n\nИспользуйте \`/settings add-callout-role\` для ограничения.`,
    });
    return;
  }

  const rolesList = calloutRoleIds.map((id, index) => `${index + 1}. <@&${id}>`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.INFO} Роли для создания каллаутов`)
    .setColor(COLORS.INFO)
    .setDescription(rolesList)
    .addFields([
      {
        name: 'Всего ролей',
        value: calloutRoleIds.length.toString(),
        inline: true,
      },
    ])
    .setFooter({
      text: 'Только пользователи с этими ролями могут создавать каллауты',
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Получить список ID ролей которые могут создавать каллауты
 */
function getCalloutRoleIds(server: any): string[] {
  if (!server.callout_allowed_role_ids) {
    return [];
  }

  try {
    return JSON.parse(server.callout_allowed_role_ids);
  } catch {
    return [];
  }
}

export default settingsCommand;
