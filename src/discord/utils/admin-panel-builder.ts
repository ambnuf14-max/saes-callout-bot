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
import { Server, Faction, FactionType, PendingChangeWithDetails, SubdivisionTemplate, Subdivision } from '../../types/database.types';
import { ServerModel } from '../../database/models';
import { FactionService } from '../../services/faction.service';
import { FactionTypeService } from '../../services/faction-type.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { COLORS, EMOJI } from '../../config/constants';
import CalloutService from '../../services/callout.service';
import { getChangeTypeLabel, formatChangeDetails, formatDate } from './change-formatter';
import { parseDiscordEmoji, getEmojiCdnUrl } from './subdivision-settings-helper';

/**
 * Построить главный экран админ-панели
 */
export async function buildAdminMainPanel(server: Server) {
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
  const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(server);
  const factions = await FactionService.getFactions(server.id);

  // Форматирование списков
  const leaderRolesList = leaderRoleIds.length > 0
    ? leaderRoleIds.map(id => `<@&${id}>`).join('\n')
    : 'Не настроены';

  const factionsList = factions.length > 0
    ? factions.map(f => `<@&${f.faction_role_id}>`).join('\n')
    : 'Не созданы';

  const calloutRolesList = calloutRoleIds.length > 0
    ? calloutRoleIds.map(id => `<@&${id}>`).join('\n')
    : 'Любой может создавать';

  // Форматирование статуса системы
  const systemStatus = server.callout_channel_id
    ? `Канал каллаутов: <#${server.callout_channel_id}>${server.category_id ? `\nКатегория инцидентов: <#${server.category_id}>` : ''}`
    : `${EMOJI.ERROR} Система не настроена`;

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJI.INFO} Панель администрирования`)
    .setDescription('Используйте кнопки ниже для управления настройками системы каллаутов.')
    .addFields(
      {
        name: '📊 Статус системы',
        value: systemStatus,
        inline: true,
      },
      {
        name: 'Роли менеджмента',
        value: leaderRolesList,
        inline: true,
      },
      {
        name: '🏛️ Фракции',
        value: factionsList,
        inline: true,
      },
      {
        name: '📞 Необходимые роли для подачи каллаута',
        value: calloutRolesList,
        inline: true,
      },
      {
        name: '📜 Audit Log',
        value: server.audit_log_channel_id
          ? `<#${server.audit_log_channel_id}>`
          : 'Не настроен',
        inline: true,
      }
    )
    .setFooter({ text: 'SAES Callout System — Admin Panel' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_factions')
      .setLabel('Фракции')
      .setEmoji('🏛️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_settings')
      .setLabel('Настройки')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить секцию "Настройки" с подменю
 */
export function buildSettingsSection(server: Server) {
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
  const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(server);

  // Форматирование ролей для компактного отображения
  const leaderRolesMention = leaderRoleIds.length > 0
    ? leaderRoleIds.map(id => `<@&${id}>`).join(' ')
    : 'Не настроено';

  const calloutRolesMention = calloutRoleIds.length > 0
    ? calloutRoleIds.map(id => `<@&${id}>`).join(' ')
    : 'Любой';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('⚙️ Настройки системы')
    .setDescription('Выберите раздел для настройки.')
    .addFields(
      {
        name: '🔧 Основные настройки',
        value: server.callout_channel_id
          ? `Канал: <#${server.callout_channel_id}>`
          : 'Каналы не настроены',
        inline: true,
      },
      {
        name: '👤 Настройки ролей',
        value: `Менеджмент: ${leaderRolesMention}\nКаллауты: ${calloutRolesMention}`,
        inline: true,
      },
      {
        name: '📜 Audit Log',
        value: server.audit_log_channel_id
          ? `<#${server.audit_log_channel_id}>`
          : 'Не настроен',
        inline: true,
      }
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_setup')
      .setLabel('Основные настройки')
      .setEmoji('🔧')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_role_settings')
      .setLabel('Настройки ролей')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_audit_log')
      .setLabel('Audit Log')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_back')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Построить секцию "Настройки ролей"
 */
export function buildRoleSettingsSection(server: Server) {
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);
  const calloutRoleIds = ServerModel.getCalloutAllowedRoleIds(server);

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('👤 Настройки ролей')
    .setDescription('Управление ролями для доступа к функциям системы.')
    .addFields(
      {
        name: 'Роли менеджмента SAES',
        value: leaderRoleIds.length > 0
          ? `Настроено ролей: ${leaderRoleIds.length}\n${leaderRoleIds.map(id => `<@&${id}>`).join(', ')}`
          : 'Не настроено',
        inline: false,
      },
      {
        name: '📞 Роли для подачи каллаутов',
        value: calloutRoleIds.length > 0
          ? `Настроено ролей: ${calloutRoleIds.length}\n${calloutRoleIds.map(id => `<@&${id}>`).join(', ')}`
          : 'Любой может создавать каллауты',
        inline: false,
      }
    )
    .setFooter({ text: 'Роли менеджмента SAES могут управлять всеми фракциями и закрывать любые каллауты' })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_leader_roles')
      .setLabel('Менеджмент SAES')
      .setEmoji('🕵️‍♂️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_callout_roles')
      .setLabel('Роли каллаутов')
      .setEmoji('📞')
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_settings')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Построить секцию "Настройка" (setup)
 */
export function buildSetupSection(server: Server) {
  const isConfigured = !!server.callout_channel_id;

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('🔧 Настройка системы каллаутов')
    .setDescription(
      'Выберите режим настройки каналов для системы каллаутов.\n\n' +
      '**📁 Выбрать категорию**\n' +
      'Бот создаст новый канал `callouts` в выбранной категории. Инциденты будут создаваться в этой же категории.\n\n' +
      '**💬 Выбрать канал**\n' +
      'Используется существующий канал для кнопки каллаутов. Инциденты будут создаваться в категории этого канала (если есть).'
    )
    .addFields(
      {
        name: 'Текущий статус',
        value: isConfigured
          ? `${EMOJI.ACTIVE} Система настроена`
          : `${EMOJI.ERROR} Система не настроена`,
        inline: false,
      },
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
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_mode_category')
      .setLabel('Выбрать категорию')
      .setEmoji('📁')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_mode_channel')
      .setLabel('Выбрать канал')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_settings')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить секцию "Роли менеджмента SAES"
 */
export function buildLeaderRolesSection(server: Server) {
  const leaderRoleIds = ServerModel.getLeaderRoleIds(server);

  const description = leaderRoleIds.length > 0
    ? leaderRoleIds.map((id, i) => `${i + 1}. <@&${id}>`).join('\n')
    : 'Роли менеджмента не настроены.';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('Роли менеджмента SAES')
    .setDescription(description)
    .addFields({
      name: 'Всего',
      value: leaderRoleIds.length.toString(),
      inline: true,
    })
    .setFooter({ text: 'Роли менеджмента SAES могут управлять всеми фракциями и закрывать любые каллауты' })
    .setTimestamp();

  const components: ActionRowBuilder<any>[] = [];

  // RoleSelectMenu для добавления роли
  const addRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId('admin_add_leader_role')
    .setPlaceholder('Добавить роль менеджмента...');

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
      .setPlaceholder('Удалить роль менеджмента...')
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
      .setCustomId('admin_settings')
      .setLabel('Назад')
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

  // Форматирование списка фракций для поля
  const factionsList = factions.length > 0
    ? factions.map(f => f.name).join(', ')
    : 'Не созданы';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('🏛️ Фракции')
    .setDescription(description)
    .addFields({
      name: 'Фракции',
      value: factionsList,
      inline: false,
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
    )
    .setTimestamp();

  if (faction.description) {
    embed.addFields({ name: 'Описание', value: faction.description });
  }

  // Показать эмодзи как thumbnail
  if (faction.logo_url) {
    const parsedLogo = parseDiscordEmoji(faction.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsedLogo);
    const thumbnailUrl = cdnUrl ?? (faction.logo_url.includes('://') ? faction.logo_url : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_edit_faction_${faction.id}`)
      .setLabel('Изменить')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`admin_faction_subdivisions_${faction.id}`)
      .setLabel('Подразделения')
      .setEmoji('📂')
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_delete_faction_${faction.id}`)
      .setLabel('Удалить')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin_factions')
      .setLabel('Назад')
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

  if (types.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('admin_select_fact_type')
      .setPlaceholder('Выберите тип фракции...')
      .addOptions(
        types.slice(0, 25).map(type =>
          new StringSelectMenuOptionBuilder()
            .setLabel(type.name.substring(0, 100))
            .setValue(type.id.toString())
            .setDescription(type.description ? type.description.substring(0, 100) : `Типов: ${type.id}`)
        )
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_create_fact_type')
      .setLabel('Создать тип')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('admin_back_to_factions')
      .setLabel('Назад к фракциям')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(buttonRow);

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

  const components: ActionRowBuilder<any>[] = [];

  // Выпадающий список шаблонов
  if (typeWithTemplates.templates.length > 0) {
    const sortedTemplates = typeWithTemplates.templates
      .sort((a, b) => a.display_order - b.display_order)
      .slice(0, 25);
    const templateSelect = new StringSelectMenuBuilder()
      .setCustomId(`admin_select_template_${typeId}`)
      .setPlaceholder('Выберите шаблон для редактирования...')
      .addOptions(
        sortedTemplates.map(t =>
          new StringSelectMenuOptionBuilder()
            .setLabel(t.name.substring(0, 100))
            .setValue(t.id.toString())
            .setDescription(t.description ? t.description.substring(0, 100) : 'Нет описания')
        )
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(templateSelect));
  }

  // Основные кнопки управления
  const mainButtons = [
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
  ];

  const secondRow = [
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

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...mainButtons));
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...secondRow));

  return {
    embeds: [embed],
    components,
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
      .setStyle(ButtonStyle.Secondary),
  ];

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
  };
}
/**
 * Интерактивная панель редактирования шаблона подразделения
 * Показывает предпросмотр embed и кнопки для редактирования полей
 */
export async function buildTemplateEditorPanel(
  typeId: number,
  templateId: number,
  draftData?: Partial<SubdivisionTemplate>
) {
  const SubdivisionTemplateModel = (await import('../../database/models/SubdivisionTemplate')).default;
  const template = await SubdivisionTemplateModel.findById(templateId);

  if (!template) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle(`${EMOJI.ERROR} Шаблон не найден`)
      .setDescription('Шаблон подразделения не найден или был удален.');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`admin_view_fact_type_${typeId}`)
        .setLabel('Назад к типу')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  // Применить draft изменения если есть
  const currentData = draftData ? { ...template, ...draftData } : template;

  // Построить предпросмотр embed
  const previewEmbed = new EmbedBuilder()
    .setTitle(currentData.embed_title || currentData.name)
    .setDescription(currentData.embed_description || currentData.description || 'Нет описания');

  if (isValidUrl(currentData.embed_title_url)) {
    try {
      previewEmbed.setURL(currentData.embed_title_url!);
    } catch {
      // Невалидный URL заголовка
    }
  }

  if (currentData.embed_color) {
    try {
      previewEmbed.setColor(currentData.embed_color as any);
    } catch {
      // Игнорировать некорректные цвета
    }
  }

  if (currentData.embed_author_name) {
    try {
      previewEmbed.setAuthor({
        name: currentData.embed_author_name,
        url: isValidUrl(currentData.embed_author_url) ? currentData.embed_author_url! : undefined,
        iconURL: isValidUrl(currentData.embed_author_icon_url) ? currentData.embed_author_icon_url! : undefined,
      });
    } catch {
      // Невалидные данные автора — пропускаем
    }
  }

  if (currentData.embed_image_url) {
    try {
      if (isValidUrl(currentData.embed_image_url)) {
        previewEmbed.setImage(currentData.embed_image_url);
      }
    } catch {
      // Невалидный URL изображения
    }
  }

  if (currentData.embed_thumbnail_url) {
    try {
      if (isValidUrl(currentData.embed_thumbnail_url)) {
        previewEmbed.setThumbnail(currentData.embed_thumbnail_url);
      }
    } catch {
      // Невалидный URL миниатюры
    }
  }

  if (currentData.embed_footer_text) {
    try {
      previewEmbed.setFooter({
        text: currentData.embed_footer_text,
        iconURL: isValidUrl(currentData.embed_footer_icon_url) ? currentData.embed_footer_icon_url! : undefined,
      });
    } catch {
      // Невалидные данные футера
    }
  }

  // Embed с информацией о редактировании
  const infoEmbed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`✏️ Редактирование шаблона: ${template.name}`)
    .setDescription(
      'Используйте кнопки ниже для редактирования полей embed.\n' +
      'Изменения отображаются в предпросмотре ниже.\n\n' +
      '**После завершения редактирования нажмите "Сохранить"**'
    )
    .addFields(
      { name: 'Название', value: currentData.name, inline: true },
      { name: 'Описание', value: currentData.description || 'Не указано', inline: true }
    );

  // Показать текущие значения полей embed
  const fieldValues = [];
  if (currentData.embed_title) fieldValues.push(`📝 Заголовок: ${currentData.embed_title.substring(0, 50)}`);
  if (currentData.embed_title_url) fieldValues.push(`🔗 URL заголовка: установлен`);
  if (currentData.embed_color) fieldValues.push(`🎨 Цвет: ${currentData.embed_color}`);
  if (currentData.embed_author_name) fieldValues.push(`👤 Автор: ${currentData.embed_author_name}`);
  if (currentData.embed_image_url) fieldValues.push(`🖼️ Изображение: установлено`);
  if (currentData.embed_thumbnail_url) fieldValues.push(`🖼️ Миниатюра: установлена`);
  if (currentData.embed_footer_text) fieldValues.push(`📌 Футер: ${currentData.embed_footer_text.substring(0, 50)}`);

  if (fieldValues.length > 0) {
    infoEmbed.addFields({
      name: 'Настроенные поля Embed',
      value: fieldValues.join('\n'),
      inline: false,
    });
  }

  // Показать настройки шаблона (short_description, logo_url, discord_role_id)
  const settingsValues = [];
  if (currentData.short_description) settingsValues.push(`📋 Краткое описание: ${currentData.short_description.substring(0, 50)}`);
  if (currentData.logo_url) settingsValues.push(`🖼️ Логотип: установлен`);
  if (currentData.discord_role_id) settingsValues.push(`🔰 Роль: <@&${currentData.discord_role_id}>`);

  if (settingsValues.length > 0) {
    infoEmbed.addFields({
      name: 'Настройки шаблона',
      value: settingsValues.join('\n'),
      inline: false,
    });
  }

  // Показать эмодзи как thumbnail через CDN (только для кастомных Discord-эмодзи)
  if (currentData.logo_url && !currentData.embed_thumbnail_url) {
    const parsedLogoEmoji = parseDiscordEmoji(currentData.logo_url);
    const logoCdnUrl = getEmojiCdnUrl(parsedLogoEmoji);
    if (logoCdnUrl) {
      try {
        previewEmbed.setThumbnail(logoCdnUrl);
      } catch {
        // Невалидный URL
      }
    }
  }

  const components: ActionRowBuilder<any>[] = [];

  // Ряд 1: настройки подразделения (название, эмодзи, краткое описание, роль)
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`template_edit_name_${typeId}_${templateId}`)
      .setLabel('Название')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`template_edit_logo_${typeId}_${templateId}`)
      .setLabel('Эмодзи')
      .setEmoji('🏷️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`template_edit_short_desc_${typeId}_${templateId}`)
      .setLabel('Краткое описание')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`template_set_role_${typeId}_${templateId}`)
      .setLabel('Роль')
      .setEmoji('🔰')
      .setStyle(currentData.discord_role_id ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  // Ряд 2: embed — автор, заголовок (+ URL), миниатюра
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`template_edit_author_${typeId}_${templateId}`)
      .setLabel('Автор')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`template_edit_title_${typeId}_${templateId}`)
      .setLabel('Заголовок')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`template_edit_thumbnail_${typeId}_${templateId}`)
      .setLabel('Миниатюра')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
  );

  // Ряд 3: основной текст, изображение, цвет, футер (объединены для освобождения места под предпросмотр)
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`template_edit_description_${typeId}_${templateId}`)
      .setLabel('Основной текст')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`template_edit_image_${typeId}_${templateId}`)
      .setLabel('Изображение')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`template_edit_color_${typeId}_${templateId}`)
      .setLabel('Цвет')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`template_edit_footer_${typeId}_${templateId}`)
      .setLabel('Футер')
      .setEmoji('📌')
      .setStyle(ButtonStyle.Secondary),
  );

  // Ряд 4: действия (без эмодзи)
  const row4buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`template_save_${typeId}_${templateId}`)
      .setLabel('Сохранить')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`admin_delete_template_${typeId}_${templateId}`)
      .setLabel('Удалить')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`admin_view_fact_type_${typeId}`)
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  // Предпросмотр в выпадающем списке каллаутов (первая строка)
  const previewSelectLabel = (currentData.name || 'Название').substring(0, 100);
  const previewSelectDesc = (currentData.short_description || currentData.description || 'Нет описания').substring(0, 100);
  const parsedLogoForSelect = parseDiscordEmoji(currentData.logo_url);
  const selectOption = new StringSelectMenuOptionBuilder()
    .setLabel(previewSelectLabel)
    .setDescription(previewSelectDesc)
    .setValue('preview');
  if (parsedLogoForSelect) {
    selectOption.setEmoji(parsedLogoForSelect.id
      ? { id: parsedLogoForSelect.id, name: parsedLogoForSelect.name, animated: parsedLogoForSelect.animated ?? false }
      : parsedLogoForSelect.name);
  } else {
    selectOption.setEmoji('🏢');
  }
  const rowPreview = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('template_list_preview')
      .setPlaceholder('Предпросмотр списка подразделений')
      .addOptions(selectOption)
  );

  components.push(rowPreview, row1, row2, row3, row4buttons);

  return {
    embeds: [infoEmbed, previewEmbed],
    components,
  };
}

/**
 * Панель управления подразделениями фракции (для администратора)
 * Использует StringSelectMenu для выбора подразделения
 */
export function buildFactionSubdivisionsPanel(faction: Faction, subdivisions: Subdivision[]) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`📂 Подразделения: ${faction.name}`)
    .setTimestamp();

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_faction_${faction.id}`)
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary)
  );

  if (subdivisions.length === 0) {
    embed.setDescription('Нет подразделений (только дефолтное).');
    return { embeds: [embed], components: [backRow] };
  }

  const lines = subdivisions.map(sub => {
    const role = sub.discord_role_id ? `<@&${sub.discord_role_id}>` : '—';
    const calloutsIcon = sub.is_accepting_callouts ? '✅' : '⏸️';
    return `${calloutsIcon} **${sub.name}** | Роль: ${role}`;
  });
  embed.setDescription(lines.join('\n') + '\n\n_Выберите подразделение из списка для редактирования_');

  const options = subdivisions.map(sub => {
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(sub.name.substring(0, 100))
      .setValue(sub.id.toString())
      .setDescription(
        (sub.short_description || sub.description || (sub.discord_role_id ? `Роль: <@&${sub.discord_role_id}>` : 'Нет описания')).substring(0, 100)
      );
    const parsedEmoji = parseDiscordEmoji(sub.logo_url);
    if (parsedEmoji) {
      option.setEmoji(parsedEmoji.id
        ? { id: parsedEmoji.id, name: parsedEmoji.name, animated: parsedEmoji.animated ?? false }
        : parsedEmoji.name);
    } else {
      option.setEmoji('⚙️');
    }
    return option;
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`admin_sub_select_${faction.id}`)
    .setPlaceholder('Выберите подразделение для редактирования...')
    .addOptions(options);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
      backRow,
    ],
  };
}

/**
 * Проверка валидности URL для embed полей
 */
function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Панель выбора роли для шаблона подразделения
 */
export async function buildTemplateRolePanel(typeId: number, templateId: number, draftRoleId?: string | null) {
  const SubdivisionTemplateModel = (await import('../../database/models/SubdivisionTemplate')).default;
  const template = await SubdivisionTemplateModel.findById(templateId);

  const currentRoleId = draftRoleId !== undefined ? draftRoleId : template?.discord_role_id;

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`🔰 Роль шаблона: ${template?.name || 'Шаблон'}`)
    .setDescription(
      'Выберите роль Discord, которая будет назначена подразделениям, созданным из этого шаблона.\n\n' +
      'Роль будет скопирована в подразделение при создании фракции с данным типом.'
    )
    .addFields({
      name: 'Текущая роль',
      value: currentRoleId ? `<@&${currentRoleId}>` : 'Не задана',
      inline: true,
    })
    .setTimestamp();

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`admin_template_role_${typeId}_${templateId}`)
    .setPlaceholder('Выберите роль подразделения...');

  const components: ActionRowBuilder<any>[] = [
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
  ];

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`admin_template_role_back_${typeId}_${templateId}`)
      .setLabel('Назад к шаблону')
      .setStyle(ButtonStyle.Secondary),
  ];

  if (currentRoleId) {
    buttons.unshift(
      new ButtonBuilder()
        .setCustomId(`admin_template_role_clear_${typeId}_${templateId}`)
        .setLabel('Очистить роль')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  }

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));

  return { embeds: [embed], components };
}

/**
 * Панель настроек подразделения для администратора (прямое редактирование, без pending)
 */
export function buildAdminSubdivisionSettingsPanel(subdivision: Subdivision, factionId: number) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`⚙️ Настройки подразделения: ${subdivision.name}`)
    .setDescription('Выберите роль через меню ниже или нажмите кнопку для редактирования других настроек.')
    .addFields(
      {
        name: '🔰 Discord роль',
        value: subdivision.discord_role_id ? `<@&${subdivision.discord_role_id}>` : 'Не задана',
        inline: true,
      },
      {
        name: '📋 Краткое описание',
        value: subdivision.short_description || 'Не задано',
        inline: true,
      },
      {
        name: '🏷️ Эмодзи',
        value: subdivision.logo_url || 'Не задан',
        inline: true,
      }
    )
    .setTimestamp();

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`admin_sub_role_${subdivision.id}`)
    .setPlaceholder('Выберите роль подразделения...');

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`admin_sub_other_settings_${subdivision.id}`)
      .setLabel('Описание / Эмодзи')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`admin_faction_subdivisions_${factionId}`)
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  ];

  if (subdivision.discord_role_id) {
    buttons.splice(1, 0,
      new ButtonBuilder()
        .setCustomId(`admin_sub_role_clear_${subdivision.id}`)
        .setLabel('Очистить роль')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    ],
  };
}

/**
 * Полный интерактивный редактор Embed для подразделения (администратор, прямое сохранение)
 * Аналог buildTemplateEditorPanel, но для объектов Subdivision
 */
export async function buildAdminSubdivisionEditorPanel(
  factionId: number,
  subdivision: Subdivision,
  draftData?: Partial<Subdivision>
) {
  const currentData = draftData ? { ...subdivision, ...draftData } : subdivision;

  // Построить предпросмотр embed с валидацией всех полей
  const previewEmbed = new EmbedBuilder()
    .setTitle(currentData.embed_title || currentData.name)
    .setDescription(currentData.embed_description || currentData.description || 'Нет описания');

  if (isValidUrl(currentData.embed_title_url)) {
    try { previewEmbed.setURL(currentData.embed_title_url!); } catch {}
  }
  if (currentData.embed_color) {
    try { previewEmbed.setColor(currentData.embed_color as any); } catch {}
  }
  if (currentData.embed_author_name) {
    try {
      previewEmbed.setAuthor({
        name: currentData.embed_author_name,
        url: isValidUrl(currentData.embed_author_url) ? currentData.embed_author_url! : undefined,
        iconURL: isValidUrl(currentData.embed_author_icon_url) ? currentData.embed_author_icon_url! : undefined,
      });
    } catch {}
  }
  if (currentData.embed_image_url && isValidUrl(currentData.embed_image_url)) {
    try { previewEmbed.setImage(currentData.embed_image_url); } catch {}
  }
  if (currentData.embed_thumbnail_url && isValidUrl(currentData.embed_thumbnail_url)) {
    try { previewEmbed.setThumbnail(currentData.embed_thumbnail_url); } catch {}
  } else if (currentData.logo_url) {
    const parsedLogo = parseDiscordEmoji(currentData.logo_url);
    const logoCdnUrl = getEmojiCdnUrl(parsedLogo);
    if (logoCdnUrl) try { previewEmbed.setThumbnail(logoCdnUrl); } catch {}
  }
  if (currentData.embed_footer_text) {
    try {
      previewEmbed.setFooter({
        text: currentData.embed_footer_text,
        iconURL: isValidUrl(currentData.embed_footer_icon_url) ? currentData.embed_footer_icon_url! : undefined,
      });
    } catch {}
  }

  // Инфо-embed
  const infoEmbed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`✏️ Редактирование подразделения: ${subdivision.name}`)
    .setDescription(
      'Используйте кнопки ниже для редактирования полей embed.\n' +
      'Изменения отображаются в предпросмотре ниже.\n\n' +
      '**После завершения нажмите "Сохранить"** (изменения применятся сразу)'
    )
    .addFields(
      { name: 'Название', value: currentData.name, inline: true },
      { name: 'Описание', value: currentData.description || 'Не указано', inline: true },
    );

  const fieldValues: string[] = [];
  if (currentData.embed_title) fieldValues.push(`📝 Заголовок: ${currentData.embed_title.substring(0, 50)}`);
  if (currentData.embed_title_url) fieldValues.push(`🔗 URL заголовка: установлен`);
  if (currentData.embed_color) fieldValues.push(`🎨 Цвет: ${currentData.embed_color}`);
  if (currentData.embed_author_name) fieldValues.push(`👤 Автор: ${currentData.embed_author_name}`);
  if (currentData.embed_image_url) fieldValues.push(`🖼️ Изображение: установлено`);
  if (currentData.embed_thumbnail_url) fieldValues.push(`🖼️ Миниатюра: установлена`);
  if (currentData.embed_footer_text) fieldValues.push(`📌 Футер: ${currentData.embed_footer_text.substring(0, 50)}`);
  if (fieldValues.length > 0) {
    infoEmbed.addFields({ name: 'Настроенные поля Embed', value: fieldValues.join('\n'), inline: false });
  }

  const settingsValues: string[] = [];
  if (currentData.short_description) settingsValues.push(`📋 Краткое описание: ${currentData.short_description.substring(0, 50)}`);
  if (currentData.logo_url) settingsValues.push(`🏷️ Эмодзи: ${currentData.logo_url}`);
  if (currentData.discord_role_id) settingsValues.push(`🔰 Роль: <@&${currentData.discord_role_id}>`);
  if (settingsValues.length > 0) {
    infoEmbed.addFields({ name: 'Настройки подразделения', value: settingsValues.join('\n'), inline: false });
  }

  const subId = subdivision.id;
  const components: ActionRowBuilder<any>[] = [];

  // Предпросмотр в выпадающем списке каллаутов
  const previewSelectLabel = (currentData.name || 'Название').substring(0, 100);
  const previewSelectDesc = (currentData.short_description || currentData.description || 'Нет описания').substring(0, 100);
  const parsedLogoForSelect = parseDiscordEmoji(currentData.logo_url);
  const selectOption = new StringSelectMenuOptionBuilder()
    .setLabel(previewSelectLabel)
    .setDescription(previewSelectDesc)
    .setValue('preview');
  if (parsedLogoForSelect) {
    selectOption.setEmoji(parsedLogoForSelect.id
      ? { id: parsedLogoForSelect.id, name: parsedLogoForSelect.name, animated: parsedLogoForSelect.animated ?? false }
      : parsedLogoForSelect.name);
  } else {
    selectOption.setEmoji('🏢');
  }
  const rowPreview = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('subdivision_list_preview')
      .setPlaceholder('Предпросмотр в списке каллаутов')
      .addOptions(selectOption)
  );

  // Ряд 1: Название, Эмодзи, Краткое описание, Роль
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_name_${subId}`)
      .setLabel('Название')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_logo_${subId}`)
      .setLabel('Эмодзи')
      .setEmoji('🏷️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_short_desc_${subId}`)
      .setLabel('Краткое описание')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_role_${factionId}_${subId}`)
      .setLabel('Роль')
      .setEmoji('🔰')
      .setStyle(currentData.discord_role_id ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  // Ряд 2: Автор, Заголовок (+ URL), Миниатюра
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_author_${subId}`)
      .setLabel('Автор')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_title_${subId}`)
      .setLabel('Заголовок')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_thumbnail_${subId}`)
      .setLabel('Миниатюра')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
  );

  // Ряд 3: Основной текст, Изображение, Цвет, Футер
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_description_${subId}`)
      .setLabel('Основной текст')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_image_${subId}`)
      .setLabel('Изображение')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_color_${subId}`)
      .setLabel('Цвет')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`admin_sub_edit_footer_${subId}`)
      .setLabel('Футер')
      .setEmoji('📌')
      .setStyle(ButtonStyle.Secondary),
  );

  // Ряд 4: Действия
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_sub_editor_save_${factionId}_${subId}`)
      .setLabel('Сохранить')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`admin_faction_subdivisions_${factionId}`)
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  components.push(rowPreview, row1, row2, row3, row4);

  return { embeds: [infoEmbed, previewEmbed], components };
}

/**
 * Панель выбора роли для подразделения в редакторе администратора (draft-based)
 */
export async function buildAdminSubEditorRolePanel(
  factionId: number,
  subdivisionId: number,
  draftRoleId?: string | null
) {
  const subdivision = await (await import('../../database/models/Subdivision')).default.findById(subdivisionId);

  const currentRoleId = draftRoleId !== undefined ? draftRoleId : subdivision?.discord_role_id;

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`🔰 Роль подразделения: ${subdivision?.name || 'Подразделение'}`)
    .setDescription(
      'Выберите роль Discord для этого подразделения.\n\n' +
      'Роль будет упоминаться в каллаутах. Нажмите "Назад к редактору" и "Сохранить" для применения.'
    )
    .addFields({
      name: 'Текущая роль',
      value: currentRoleId ? `<@&${currentRoleId}>` : 'Не задана',
      inline: true,
    })
    .setTimestamp();

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`admin_sub_editor_role_${factionId}_${subdivisionId}`)
    .setPlaceholder('Выберите роль подразделения...');

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`admin_sub_editor_role_back_${factionId}_${subdivisionId}`)
      .setLabel('Назад к редактору')
      .setStyle(ButtonStyle.Secondary),
  ];

  if (currentRoleId) {
    buttons.unshift(
      new ButtonBuilder()
        .setCustomId(`admin_sub_editor_role_clear_${factionId}_${subdivisionId}`)
        .setLabel('Очистить роль')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    ],
  };
}
