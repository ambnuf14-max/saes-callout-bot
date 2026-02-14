import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} from 'discord.js';
import { Server } from '../../types/database.types';
import { Department } from '../../types/database.types';
import { ServerModel } from '../../database/models';
import { DepartmentService } from '../../services/department.service';
import { COLORS, EMOJI } from '../../config/constants';
import CalloutService from '../../services/callout.service';

/**
 * Построить главный экран админ-панели
 */
export async function buildAdminMainPanel(server: Server) {
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
  const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(server);
  const departments = await DepartmentService.getDepartments(server.id);
  const stats = await CalloutService.getStats(server.id);

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJI.INFO} Панель администрирования`)
    .setDescription('Используйте кнопки ниже для управления настройками сервера.')
    .addFields(
      {
        name: '📊 Статус системы',
        value: server.callout_channel_id
          ? `${EMOJI.ACTIVE} Система настроена`
          : `${EMOJI.ERROR} Система не настроена`,
        inline: true,
      },
      {
        name: '👑 Лидерских ролей',
        value: leaderRoleIds.length.toString(),
        inline: true,
      },
      {
        name: '🏛️ Департаментов',
        value: departments.length.toString(),
        inline: true,
      },
      {
        name: '📞 Ролей каллаутов',
        value: calloutRoleIds.length > 0
          ? calloutRoleIds.length.toString()
          : 'Любой может создавать',
        inline: true,
      },
      {
        name: '📜 Audit Log',
        value: server.audit_log_channel_id
          ? `<#${server.audit_log_channel_id}>`
          : 'Не настроен',
        inline: true,
      },
      {
        name: '📊 Каллауты',
        value: `Активных: ${stats.active} | Всего: ${stats.total}`,
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({ text: 'SAES Callout System — Admin Panel' });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_setup')
      .setLabel('Настройка')
      .setEmoji('🔧')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_leader_roles')
      .setLabel('Лидерские роли')
      .setEmoji('👑')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_callout_roles')
      .setLabel('Роли каллаутов')
      .setEmoji('📞')
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_audit_log')
      .setLabel('Audit Log')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_departments')
      .setLabel('Департаменты')
      .setEmoji('🏛️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_info')
      .setLabel('Инфо')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Построить секцию "Настройка" (setup)
 */
export function buildSetupSection(server: Server) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('🔧 Настройка системы каллаутов')
    .addFields(
      {
        name: 'Канал каллаутов',
        value: server.callout_channel_id
          ? `<#${server.callout_channel_id}>`
          : 'Не настроен',
        inline: true,
      },
      {
        name: 'Категория инцидентов',
        value: server.category_id
          ? `<#${server.category_id}>`
          : 'Не настроена',
        inline: true,
      },
    )
    .setDescription('Выберите режим настройки каналов для системы каллаутов.')
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_mode_auto')
      .setLabel('Создать новое (auto)')
      .setEmoji('🆕')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_mode_category')
      .setLabel('Выбрать категорию')
      .setEmoji('📁')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup_mode_channel')
      .setLabel('Выбрать канал')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_back')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить секцию "Лидерские роли"
 */
export function buildLeaderRolesSection(server: Server) {
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);

  const description = leaderRoleIds.length > 0
    ? leaderRoleIds.map((id, i) => `${i + 1}. <@&${id}>`).join('\n')
    : 'Лидерские роли не настроены.';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('👑 Лидерские роли')
    .setDescription(description)
    .addFields({
      name: 'Всего',
      value: leaderRoleIds.length.toString(),
      inline: true,
    })
    .setFooter({ text: 'Лидеры могут управлять департаментами и закрывать каллауты' })
    .setTimestamp();

  const components: ActionRowBuilder<any>[] = [];

  // RoleSelectMenu для добавления роли
  const addRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId('admin_add_leader_role')
    .setPlaceholder('Добавить лидерскую роль...');

  components.push(
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(addRoleSelect)
  );

  // Если есть роли — показать select для удаления
  if (leaderRoleIds.length > 0) {
    const removeOptions = leaderRoleIds.map((id, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`Роль ${i + 1}`)
        .setValue(id)
        .setDescription(`ID: ${id}`)
    );

    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId('admin_remove_leader_role')
      .setPlaceholder('Удалить лидерскую роль...')
      .addOptions(removeOptions);

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(removeSelect)
    );
  }

  // Кнопки: назад
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_back')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(buttonRow);

  return { embeds: [embed], components };
}

/**
 * Построить секцию "Роли каллаутов"
 */
export function buildCalloutRolesSection(server: Server) {
  const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(server);

  const description = calloutRoleIds.length > 0
    ? calloutRoleIds.map((id, i) => `${i + 1}. <@&${id}>`).join('\n')
    : 'Разрешенные роли не настроены.\nЛюбой пользователь может создавать каллауты.';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📞 Роли для создания каллаутов')
    .setDescription(description)
    .addFields({
      name: 'Всего',
      value: calloutRoleIds.length > 0 ? calloutRoleIds.length.toString() : 'Нет ограничений',
      inline: true,
    })
    .setFooter({ text: 'Если список пуст — любой может создавать каллауты' })
    .setTimestamp();

  const components: ActionRowBuilder<any>[] = [];

  // RoleSelectMenu для добавления роли
  const addRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId('admin_add_callout_role')
    .setPlaceholder('Добавить роль каллаутов...');

  components.push(
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(addRoleSelect)
  );

  if (calloutRoleIds.length > 0) {
    const removeOptions = calloutRoleIds.map((id, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`Роль ${i + 1}`)
        .setValue(id)
        .setDescription(`ID: ${id}`)
    );

    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId('admin_remove_callout_role')
      .setPlaceholder('Удалить роль каллаутов...')
      .addOptions(removeOptions);

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(removeSelect)
    );
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_back')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(buttonRow);

  return { embeds: [embed], components };
}

/**
 * Построить секцию "Audit Log"
 */
export function buildAuditLogSection(server: Server) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📜 Настройка Audit Log')
    .setDescription(
      server.audit_log_channel_id
        ? `Текущий канал: <#${server.audit_log_channel_id}>`
        : 'Audit log канал не настроен.'
    )
    .setFooter({ text: 'Audit log записывает все действия администраторов и лидеров' })
    .setTimestamp();

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('admin_set_audit_channel')
    .setPlaceholder('Выберите канал для Audit Log')
    .setChannelTypes(ChannelType.GuildText);

  const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_back')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [channelRow, buttonRow] };
}

/**
 * Построить секцию "Департаменты"
 */
export async function buildDepartmentsSection(server: Server) {
  const departments = await DepartmentService.getDepartments(server.id);

  const description = departments.length > 0
    ? departments.map((d, i) => {
        const statusEmoji = d.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
        return `${statusEmoji} **${d.name}** — Общая: <@&${d.general_leader_role_id}>, Фракция: <@&${d.department_role_id}>`;
      }).join('\n')
    : 'Департаменты не созданы.';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('🏛️ Департаменты')
    .setDescription(description)
    .addFields({
      name: 'Всего',
      value: departments.length.toString(),
      inline: true,
    })
    .setTimestamp();

  const components: ActionRowBuilder<any>[] = [];

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_add_department')
      .setLabel('Добавить')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('admin_back')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(buttonRow);

  if (departments.length > 0) {
    const options = departments.map((d) => {
      const statusEmoji = d.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
      return new StringSelectMenuOptionBuilder()
        .setLabel(d.name)
        .setValue(d.id.toString())
        .setDescription(d.description || 'Без описания')
        .setEmoji(statusEmoji);
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('admin_select_department')
      .setPlaceholder('Выберите департамент для управления')
      .addOptions(options);

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
    );
  }

  return { embeds: [embed], components };
}

/**
 * Построить детальную панель департамента (для админа)
 */
export function buildDepartmentDetailPanel(department: Department) {
  const statusEmoji = department.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;

  const embed = new EmbedBuilder()
    .setColor(department.is_active ? COLORS.ACTIVE : COLORS.ERROR)
    .setTitle(`${statusEmoji} Департамент: ${department.name}`)
    .addFields(
      {
        name: 'Общая лидерская роль',
        value: `<@&${department.general_leader_role_id}>`,
        inline: true,
      },
      {
        name: 'Роль фракции',
        value: `<@&${department.department_role_id}>`,
        inline: true,
      },
      {
        name: 'Статус',
        value: department.is_active ? 'Активен' : 'Неактивен',
        inline: true,
      },
    )
    .setTimestamp();

  if (department.description) {
    embed.addFields({ name: 'Описание', value: department.description });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_edit_department_${department.id}`)
      .setLabel('Изменить')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`admin_delete_department_${department.id}`)
      .setLabel('Удалить')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin_departments')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить подтверждение удаления департамента
 */
export function buildDepartmentDeleteConfirmation(department: Department) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${EMOJI.WARNING} Подтверждение удаления`)
    .setDescription(
      `Вы действительно хотите удалить департамент **${department.name}**?\n\n` +
      `${EMOJI.WARNING} **Внимание:** Все подразделения этого департамента будут удалены!`
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_confirm_delete_dept_${department.id}`)
      .setLabel('Удалить')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin_departments')
      .setLabel('Отмена')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить секцию "Инфо"
 */
export async function buildInfoSection(server: Server) {
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
  const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(server);
  const departments = await DepartmentService.getDepartments(server.id);
  const stats = await CalloutService.getStats(server.id);

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJI.INFO} Полная информация о конфигурации`)
    .addFields(
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
        name: 'Audit Log',
        value: server.audit_log_channel_id
          ? `<#${server.audit_log_channel_id}>`
          : 'Не настроен',
        inline: true,
      },
      {
        name: '👑 Лидерские роли',
        value: leaderRoleIds.length > 0
          ? leaderRoleIds.map((id) => `<@&${id}>`).join(', ')
          : 'Не настроены',
        inline: false,
      },
      {
        name: '📞 Роли каллаутов',
        value: calloutRoleIds.length > 0
          ? calloutRoleIds.map((id) => `<@&${id}>`).join(', ')
          : 'Любой может создавать',
        inline: false,
      },
      {
        name: '🏛️ Департаменты',
        value: departments.length > 0
          ? departments.map((d) => `${d.is_active ? EMOJI.ACTIVE : EMOJI.ERROR} ${d.name}`).join(', ')
          : 'Не созданы',
        inline: false,
      },
      {
        name: '📊 Статистика каллаутов',
        value: `Активных: ${stats.active} | Закрытых: ${stats.closed} | Всего: ${stats.total}`,
        inline: false,
      },
    )
    .setTimestamp()
    .setFooter({ text: 'SAES Callout System' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_back')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}
