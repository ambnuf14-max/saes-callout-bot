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
import { Server, Faction, FactionType, PendingChangeWithDetails } from '../../types/database.types';
import { ServerModel } from '../../database/models';
import { FactionService } from '../../services/faction.service';
import { FactionTypeService } from '../../services/faction-type.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { COLORS, EMOJI } from '../../config/constants';
import CalloutService from '../../services/callout.service';
import { getChangeTypeLabel, formatChangeDetails, formatDate } from './change-formatter';

/**
 * Построить главный экран админ-панели
 */
export async function buildAdminMainPanel(server: Server) {
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
  const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(server);
  const factions = await FactionService.getFactions(server.id);
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
        name: '🏛️ Фракций',
        value: factions.length.toString(),
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
      .setCustomId('admin_factions')
      .setLabel('Фракции')
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
    .setFooter({ text: 'Лидеры могут управлять фракциями и закрывать каллауты' })
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
 * Построить секцию "Фракции"
 */
export async function buildFactionsSection(server: Server) {
  const factions = await FactionService.getFactions(server.id);
  const pendingCount = await PendingChangeService.getPendingCount(server.id);

  let description = factions.length > 0
    ? factions.map((d, i) => {
        const statusEmoji = d.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
        return `${statusEmoji} **${d.name}** — Общая: <@&${d.general_leader_role_id}>, Фракция: <@&${d.faction_role_id}>`;
      }).join('\n')
    : 'Фракции не созданы.';

  // Добавить информацию о pending запросах
  if (pendingCount > 0) {
    description = `${EMOJI.PENDING} **${pendingCount}** запросов ожидают одобрения\n\n${description}`;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('🏛️ Фракции')
    .setDescription(description)
    .addFields({
      name: 'Всего',
      value: factions.length.toString(),
      inline: true,
    })
    .setTimestamp();

  const components: ActionRowBuilder<any>[] = [];

  const buttons = [
    new ButtonBuilder()
      .setCustomId('admin_add_faction')
      .setLabel('Добавить')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('admin_fact_types')
      .setLabel('Управление типами')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
  ];

  // Добавить кнопку просмотра pending если есть
  if (pendingCount > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('admin_view_pending_changes')
        .setLabel(`Запросы (${pendingCount})`)
        .setEmoji(EMOJI.PENDING)
        .setStyle(ButtonStyle.Danger)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId('admin_back')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5));
  components.push(buttonRow);

  if (factions.length > 0) {
    const options = factions.map((d) => {
      const statusEmoji = d.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
      return new StringSelectMenuOptionBuilder()
        .setLabel(d.name)
        .setValue(d.id.toString())
        .setDescription(d.description || 'Без описания')
        .setEmoji(statusEmoji);
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('admin_select_faction')
      .setPlaceholder('Выберите фракцию для управления')
      .addOptions(options);

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
    );
  }

  return { embeds: [embed], components };
}

/**
 * Построить детальную панель фракции (для админа)
 */
export function buildFactionDetailPanel(faction: Faction) {
  const statusEmoji = faction.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
  const allowCreateStatus = faction.allow_create_subdivisions ? '✅ Разрешено' : '🔒 Запрещено';

  const embed = new EmbedBuilder()
    .setColor(faction.is_active ? COLORS.ACTIVE : COLORS.ERROR)
    .setTitle(`${statusEmoji} Фракция: ${faction.name}`)
    .addFields(
      {
        name: 'Общая лидерская роль',
        value: `<@&${faction.general_leader_role_id}>`,
        inline: true,
      },
      {
        name: 'Роль фракции',
        value: `<@&${faction.faction_role_id}>`,
        inline: true,
      },
      {
        name: 'Статус',
        value: faction.is_active ? 'Активен' : 'Неактивен',
        inline: true,
      },
      {
        name: '🔒 Создание подразделений',
        value: allowCreateStatus,
        inline: true,
      },
    )
    .setTimestamp();

  if (faction.description) {
    embed.addFields({ name: 'Описание', value: faction.description });
  }

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_edit_faction_${faction.id}`)
      .setLabel('Изменить')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`admin_toggle_allow_create_${faction.id}`)
      .setLabel(faction.allow_create_subdivisions ? 'Запретить создание подразделений' : 'Разрешить создание подразделений')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_delete_faction_${faction.id}`)
      .setLabel('Удалить')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin_factions')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Построить подтверждение удаления фракции
 */
export function buildFactionDeleteConfirmation(faction: Faction) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${EMOJI.WARNING} Подтверждение удаления`)
    .setDescription(
      `Вы действительно хотите удалить фракцию **${faction.name}**?\n\n` +
      `${EMOJI.WARNING} **Внимание:** Все подразделения этой фракции будут удалены!`
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_confirm_delete_fact_${faction.id}`)
      .setLabel('Удалить')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin_factions')
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
  const factions = await FactionService.getFactions(server.id);
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
        name: '🏛️ Фракции',
        value: factions.length > 0
          ? factions.map((d) => `${d.is_active ? EMOJI.ACTIVE : EMOJI.ERROR} ${d.name}`).join(', ')
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

/**
 * Панель управления типами фракций
 */
export async function buildFactionTypesSection(server: Server) {
  const types = await FactionTypeService.getFactionTypes(server.id, true);

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJI.INFO} Типы фракций`)
    .setTimestamp();

  if (types.length === 0) {
    embed.setDescription(
      'Типы фракций не созданы.\n\n' +
      'Типы позволяют создавать фракции с предопределенными подразделениями и настройками.\n' +
      'Нажмите "Создать тип" для добавления нового типа.'
    );
  } else {
    let description = '**Доступные типы:**\n\n';
    for (const type of types) {
      const typeWithTemplates = await FactionTypeService.getTypeWithTemplates(type.id);
      const templateCount = typeWithTemplates?.templates.length || 0;
      description += `📋 **${type.name}**\n`;
      if (type.description) {
        description += `└ ${type.description}\n`;
      }
      description += `└ Шаблонов подразделений: ${templateCount}\n\n`;
    }
    embed.setDescription(description);
  }

  const components: ActionRowBuilder<any>[] = [];

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_create_fact_type')
      .setLabel('Создать тип')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('admin_back_to_factions')
      .setLabel('Назад к фракциям')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(buttonRow);

  // Кнопки для каждого типа (максимум 20)
  if (types.length > 0) {
    const typeButtons = types.slice(0, 20).map(type =>
      new ButtonBuilder()
        .setCustomId(`admin_view_fact_type_${type.id}`)
        .setLabel(type.name.substring(0, 80))
        .setStyle(ButtonStyle.Primary)
    );

    // Разбить по строкам (до 5 кнопок в строке)
    for (let i = 0; i < typeButtons.length; i += 5) {
      components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...typeButtons.slice(i, Math.min(i + 5, typeButtons.length))
        )
      );
    }
  }

  return { embeds: [embed], components };
}

/**
 * Детальная панель типа фракции
 */
export async function buildFactionTypeDetailPanel(typeId: number) {
  const typeWithTemplates = await FactionTypeService.getTypeWithTemplates(typeId);

  if (!typeWithTemplates) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle(`${EMOJI.ERROR} Тип не найден`)
      .setDescription('Тип фракции не найден или был удален.');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('admin_back_to_fact_types')
        .setLabel('Назад к типам')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJI.INFO} Тип: ${typeWithTemplates.name}`)
    .setTimestamp();

  if (typeWithTemplates.description) {
    embed.addFields({ name: 'Описание', value: typeWithTemplates.description, inline: false });
  }

  // Показать шаблоны
  if (typeWithTemplates.templates.length > 0) {
    let templatesText = '';
    typeWithTemplates.templates
      .sort((a, b) => a.display_order - b.display_order)
      .forEach((template, idx) => {
        templatesText += `${idx + 1}. **${template.name}**\n`;
        if (template.description) {
          templatesText += `   └ ${template.description}\n`;
        }
        if (template.embed_color) {
          templatesText += `   └ Цвет: ${template.embed_color}\n`;
        }
      });

    embed.addFields({
      name: `📋 Шаблоны подразделений (${typeWithTemplates.templates.length})`,
      value: templatesText,
      inline: false,
    });
  } else {
    embed.addFields({
      name: '📋 Шаблоны подразделений',
      value: 'Нет предопределенных подразделений.\nБудет создано только дефолтное подразделение.',
      inline: false,
    });
  }

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`admin_add_template_${typeId}`)
      .setLabel('Добавить шаблон')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`admin_edit_fact_type_${typeId}`)
      .setLabel('Редактировать тип')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`admin_delete_fact_type_${typeId}`)
      .setLabel('Удалить тип')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin_back_to_fact_types')
      .setLabel('Назад к типам')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  ];

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
  };
}

/**
 * Панель pending изменений
 */
export async function buildPendingChangesPanel(serverId: number) {
  const pendingChanges = await PendingChangeService.getPendingChangesForServer(serverId);

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${EMOJI.PENDING} Запросы на изменения`)
    .setTimestamp();

  if (pendingChanges.length === 0) {
    embed.setDescription('Нет ожидающих запросов');

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('admin_back_to_factions')
            .setLabel('Назад к фракциям')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  // Группировать по фракциям
  const byFaction = new Map<string, PendingChangeWithDetails[]>();
  pendingChanges.forEach(change => {
    if (!byFaction.has(change.faction_name)) {
      byFaction.set(change.faction_name, []);
    }
    byFaction.get(change.faction_name)!.push(change);
  });

  let description = `Всего запросов: **${pendingChanges.length}**\n\n`;
  byFaction.forEach((changes, factionName) => {
    description += `**${factionName}** (${changes.length}):\n`;
    changes.slice(0, 3).forEach(change => {
      const typeLabel = getChangeTypeLabel(change.change_type);
      const preview = change.subdivision_name || 'Новое';
      description += `• ${typeLabel}: ${preview}\n`;
    });
    if (changes.length > 3) {
      description += `  ... и еще ${changes.length - 3}\n`;
    }
    description += '\n';
  });

  embed.setDescription(description);

  const components: ActionRowBuilder<any>[] = [];

  // Кнопки для каждого pending change (максимум 20)
  const changeButtons = pendingChanges.slice(0, 20).map(change => {
    const label = `${getChangeTypeLabel(change.change_type).substring(0, 30)}`;
    return new ButtonBuilder()
      .setCustomId(`admin_review_change_${change.id}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);
  });

  // Разбить по строкам (до 5 кнопок)
  for (let i = 0; i < changeButtons.length; i += 5) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...changeButtons.slice(i, Math.min(i + 5, changeButtons.length))
      )
    );
  }

  // Кнопка назад
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('admin_back_to_factions')
        .setLabel('Назад к фракциям')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components };
}

/**
 * Панель рассмотрения конкретного изменения
 */
export async function buildReviewChangePanel(changeId: number) {
  // Получить change напрямую по ID с деталями
  const PendingChangeModel = (await import('../../database/models/PendingChange')).default;
  const change = await PendingChangeModel.findWithDetails(changeId);

  if (!change || change.status !== 'pending') {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle(`${EMOJI.ERROR} Запрос не найден`)
      .setDescription('Запрос не найден или уже обработан.');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('admin_view_pending_changes')
        .setLabel('Назад к списку')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  const typeLabel = getChangeTypeLabel(change.change_type);

  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${EMOJI.PENDING} Рассмотрение запроса`)
    .addFields(
      { name: 'Тип', value: typeLabel, inline: true },
      { name: 'Фракция', value: change.faction_name, inline: true },
      { name: 'Запрошено', value: `<@${change.requested_by}>`, inline: true },
      { name: 'Дата', value: formatDate(change.requested_at), inline: true }
    )
    .setTimestamp();

  // Детали изменения
  const detailsText = formatChangeDetails(change);
  embed.addFields({
    name: 'Детали изменения',
    value: detailsText,
    inline: false,
  });

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`admin_approve_change_${changeId}`)
      .setLabel('Одобрить')
      .setEmoji(EMOJI.APPROVED)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`admin_reject_change_${changeId}`)
      .setLabel('Отклонить')
      .setEmoji(EMOJI.REJECTED)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin_back_to_pending')
      .setLabel('Назад к списку')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
  ];

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
  };
}
