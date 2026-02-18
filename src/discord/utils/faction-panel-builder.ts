import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
} from 'discord.js';
import { Faction, Subdivision, PendingChangeWithDetails } from '../../types/database.types';
import { VerificationInstructions } from '../../types/department.types';
import { COLORS, EMOJI, MESSAGES } from '../../config/constants';
import { getChangeTypeLabel, getStatusEmoji } from './change-formatter';
import { parseDiscordEmoji, getEmojiCdnUrl } from './subdivision-settings-helper';

/**
 * Построить standalone панель (фракция без подразделений)
 */
export function buildStandaloneMainPanel(faction: Faction, defaultSubdivision: Subdivision) {
  const vkStatus = defaultSubdivision.vk_chat_id ? '✅ Привязана' : '❌ Не привязана';
  const telegramStatus = defaultSubdivision.telegram_chat_id ? '✅ Привязана' : '❌ Не привязана';
  const calloutsStatus = defaultSubdivision.is_accepting_callouts ? '✅ Включен' : '⏸️ Отключен';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`🚨 Лидерская панель управления каллаутами`)
    .setDescription(
      `**Состояние:** 📂 \`Подразделения\` не созданы\n\n` +
      `Сейчас каллауты приходят всей вашей фракции (при каллауте будет упомянута общая роль <@&${faction.faction_role_id}>). Это подходит для небольших фракций (например, Пожарный департамент), но абсолютно не подходит для крупных фракций со специализированными отделами, к которым в основном и будут направляться каллауты (\`Metropolitan Division\`, \`Special Enforcement Bureau\` и др.).\n\n` +
      `Создайте 📂 \`Подразделения\`, чтобы каллауты направлялись конкретным отделам. После создания подразделений пользователи смогут отправлять каллауты только им, отправить каллаут всей вашей фракции - будет нельзя.\n\n` +
      `Вы можете привязать ВК или Telegram конференцию к каждому подразделению, игроки смогут получать уведомления о каллаутах в том числе и там.`
    )
    .addFields(
      {
        name: '💬 VK беседа',
        value: vkStatus,
        inline: true,
      },
      {
        name: '📨 Telegram беседа',
        value: telegramStatus,
        inline: true,
      },
      {
        name: '🚨 Прием каллаутов',
        value: calloutsStatus,
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({ text: `${faction.name} • Используйте кнопки ниже для настройки` });

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`faction_standalone_links_${defaultSubdivision.id}`)
      .setLabel('Привязки')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`faction_standalone_settings_${defaultSubdivision.id}`)
      .setLabel('Настройки')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Primary),
  ];

  // Добавить кнопку "Подразделения" если админ разрешил их создание
  if (faction.allow_create_subdivisions) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`faction_subdivisions_${faction.id}`)
        .setLabel('Подразделения')
        .setEmoji('📂')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

  return { embeds: [embed], components: [row] };
}

/**
 * Построить главную панель управления фракцией
 */
export function buildMainPanel(faction: Faction, subdivisionCount: number, activeCount: number) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`🚨 Лидерская панель управления каллаутами`)
    .setDescription(
      `**Состояние:** Используются подразделения\n\n` +
      `**Пояснение:** Каллаут адресуется конкретному подразделению. Для каждого подразделения можно привязать свои VK/Telegram конференции, назначить Discord роль (будет упомянута в каллауте), настроить внешний вид уведомлений.\n\n` +
      `Управляйте подразделениями через кнопку ниже.`
    )
    .addFields(
      {
        name: '📊 Статистика',
        value: `Подразделений: ${subdivisionCount}\nАктивных: ${activeCount}`,
        inline: true,
      },
      {
        name: '👥 Роли лидера',
        value:
          `Общая: <@&${faction.general_leader_role_id}>\n` +
          `Фракция: <@&${faction.faction_role_id}>`,
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({ text: `${faction.name} • Используйте кнопки ниже для управления подразделениями` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_view_subdivisions')
      .setLabel('Список подразделений')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('faction_add_subdivision')
      .setLabel('Добавить подразделение')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success)
  );

  const rows = [row];

  return { embeds: [embed], components: rows };
}

/**
 * Вернуть эмодзи для текстового отображения рядом с названием подразделения.
 * Если установлен логотип — использует его, иначе статусный эмодзи (🟢/❌).
 */
function getSubdivisionDisplayEmoji(subdivision: Subdivision): string {
  if (subdivision.logo_url) {
    const parsed = parseDiscordEmoji(subdivision.logo_url);
    if (parsed) {
      // Голый Snowflake ID — нужно обернуть в синтаксис кастомного эмодзи для текста
      if (parsed.id && !subdivision.logo_url.startsWith('<')) {
        return `<:e:${parsed.id}>`;
      }
      return subdivision.logo_url;
    }
  }
  return subdivision.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
}

/**
 * Вернуть эмодзи для компонентов Discord (кнопки, select menu).
 */
function getSubdivisionEmojiForComponent(subdivision: Subdivision): string | { id?: string; name?: string; animated?: boolean } {
  if (subdivision.logo_url) {
    const parsed = parseDiscordEmoji(subdivision.logo_url);
    if (parsed) {
      if (parsed.id) return { id: parsed.id, name: parsed.name, animated: parsed.animated };
      return parsed.name; // unicode эмодзи
    }
  }
  return subdivision.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
}

/**
 * Построить список подразделений
 */
export function buildSubdivisionsList(
  faction: Faction,
  subdivisions: Subdivision[]
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`📋 Подразделения фракции: ${faction.name}`)
    .setDescription(
      subdivisions.length === 0
        ? 'Подразделения еще не созданы. Нажмите "Добавить" для создания.'
        : `Всего подразделений: ${subdivisions.length}`
    )
    .setTimestamp();

  if (subdivisions.length === 0) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('faction_add_subdivision')
        .setLabel('Добавить подразделение')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('faction_back_main')
        .setLabel('Назад')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  // Добавить поля для каждого подразделения
  for (const subdivision of subdivisions) {
    const statusEmoji = subdivision.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
    const displayEmoji = getSubdivisionDisplayEmoji(subdivision);
    const calloutsEmoji = subdivision.is_accepting_callouts ? '✅' : '⏸️';
    const vkEmoji = subdivision.vk_chat_id ? '✅' : '❌';
    const telegramEmoji = subdivision.telegram_chat_id ? '✅' : '❌';

    const fieldValue =
      `**Статус:** ${statusEmoji} ${subdivision.is_active ? 'Активно' : 'Неактивно'}\n` +
      `**Прием каллаутов:** ${calloutsEmoji} ${subdivision.is_accepting_callouts ? 'Включен' : 'Отключен'}\n` +
      `**VK беседа:** ${vkEmoji} ${subdivision.vk_chat_id ? 'Привязана' : 'Не привязана'}\n` +
      `**Telegram беседа:** ${telegramEmoji} ${subdivision.telegram_chat_id ? 'Привязана' : 'Не привязана'}\n` +
      `**Роль:** ${subdivision.discord_role_id ? `<@&${subdivision.discord_role_id}>` : 'Не задана'}`;

    embed.addFields({
      name: `${displayEmoji} ${subdivision.name}`,
      value: fieldValue,
      inline: false,
    });
  }

  // Кнопки управления
  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  // Первая строка - добавить и назад
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_add_subdivision')
      .setLabel('Добавить')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('faction_back_main')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );
  components.push(row1);

  // Вторая строка - select menu для выбора подразделения
  if (subdivisions.length > 0) {
    const options = subdivisions.map((sub) => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(sub.name)
        .setValue(sub.id.toString())
        .setDescription(
          sub.is_accepting_callouts ? 'Принимает каллауты' : 'Не принимает каллауты'
        )
        .setEmoji(getSubdivisionEmojiForComponent(sub));
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('faction_select_subdivision')
      .setPlaceholder('Выберите подразделение для управления')
      .addOptions(options);

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    components.push(row2 as any);
  }

  return { embeds: [embed], components };
}

/**
 * Построить детальную панель управления подразделением
 */
export async function buildSubdivisionDetailPanel(subdivision: Subdivision) {
  const statusEmoji = subdivision.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
  const displayEmoji = getSubdivisionDisplayEmoji(subdivision);
  const calloutsStatus = subdivision.is_accepting_callouts ? 'Включен' : 'Отключен';
  const vkStatus = subdivision.vk_chat_id ? 'Привязана' : 'Не привязана';
  const telegramStatus = subdivision.telegram_chat_id ? 'Привязана' : 'Не привязана';

  // Проверить pending запросы для этого подразделения
  const PendingChangeModel = (await import('../../database/models/PendingChange')).default;
  const pendingChanges = await PendingChangeModel.findPendingForSubdivision(subdivision.id);

  const embed = new EmbedBuilder()
    .setColor(subdivision.is_active ? COLORS.ACTIVE : COLORS.ERROR)
    .setTitle(`${displayEmoji} Управление: ${subdivision.name}`)
    .addFields(
      {
        name: '📊 Статус',
        value: subdivision.is_active ? 'Активно' : 'Неактивно',
        inline: true,
      },
      {
        name: '🚨 Прием каллаутов',
        value: calloutsStatus,
        inline: true,
      },
      {
        name: '💬 VK беседа',
        value: vkStatus,
        inline: true,
      },
      {
        name: '📨 Telegram беседа',
        value: telegramStatus,
        inline: true,
      }
    )
    .setTimestamp();

  // Показать pending изменения
  if (pendingChanges.length > 0) {
    const pendingTexts = pendingChanges.map(change => {
      if (change.change_type === 'delete_subdivision') {
        return `${EMOJI.PENDING} **Ожидает одобрения для удаления**`;
      } else if (change.change_type === 'update_subdivision') {
        return `${EMOJI.PENDING} **Обновление ожидает одобрения**`;
      } else if (change.change_type === 'update_embed') {
        return `${EMOJI.PENDING} **Настройка embed ожидает одобрения**`;
      }
      return '';
    }).filter(t => t);

    if (pendingTexts.length > 0) {
      embed.addFields({
        name: '⏳ Pending изменения',
        value: pendingTexts.join('\n'),
        inline: false,
      });
    }
  }

  if (subdivision.description) {
    embed.addFields({
      name: 'Описание',
      value: subdivision.description,
    });
  }

  if (subdivision.discord_role_id) {
    embed.addFields({
      name: 'Discord роль',
      value: `<@&${subdivision.discord_role_id}>`,
      inline: true,
    });
  }

  // Ряд 1: Привязки и Настройки
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`faction_links_${subdivision.id}`)
      .setLabel('Привязки')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`faction_settings_${subdivision.id}`)
      .setLabel('Настройки')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Primary)
  );

  // Ряд 2: Удалить и Назад (без эмодзи)
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`faction_delete_sub_${subdivision.id}`)
      .setLabel('Удалить')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('faction_back_list')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Построить панель привязок (VK/Telegram)
 */
export function buildLinksPanel(subdivision: Subdivision) {
  const vkStatus = subdivision.vk_chat_id ? '✅ Привязана' : '❌ Не привязана';
  const telegramStatus = subdivision.telegram_chat_id ? '✅ Привязана' : '❌ Не привязана';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`🔗 Привязки: ${subdivision.name}`)
    .addFields(
      {
        name: '💬 VK беседа',
        value: vkStatus,
        inline: true,
      },
      {
        name: '📨 Telegram беседа',
        value: telegramStatus,
        inline: true,
      }
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(subdivision.vk_chat_id ? `faction_unlink_vk_${subdivision.id}` : `faction_link_vk_${subdivision.id}`)
      .setLabel(subdivision.vk_chat_id ? 'Отвязать VK' : 'Привязать VK')
      .setEmoji(subdivision.vk_chat_id ? '🔓' : '🔗')
      .setStyle(subdivision.vk_chat_id ? ButtonStyle.Secondary : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(subdivision.telegram_chat_id ? `faction_unlink_telegram_${subdivision.id}` : `faction_link_telegram_${subdivision.id}`)
      .setLabel(subdivision.telegram_chat_id ? 'Отвязать TG' : 'Привязать TG')
      .setEmoji(subdivision.telegram_chat_id ? '🔓' : '✈️')
      .setStyle(subdivision.telegram_chat_id ? ButtonStyle.Secondary : ButtonStyle.Primary)
  );

  // Кнопка "Назад" - для дефолтного подразделения ведёт на главную панель
  const backButton = subdivision.is_default
    ? new ButtonBuilder()
        .setCustomId('faction_back_main')
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder()
        .setCustomId(`faction_back_detail_${subdivision.id}`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(backButton);

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Построить панель настроек подразделения
 */
export function buildSettingsPanel(subdivision: Subdivision) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`⚙️ Настройки: ${subdivision.name}`)
    .setDescription(
      'Выберите роль через меню ниже или нажмите кнопку для редактирования других настроек.\n\n' +
      '_(Изменения будут отправлены на одобрение администратору)_'
    )
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
      },
      {
        name: '🚨 Прием каллаутов',
        value: subdivision.is_accepting_callouts ? '✅ Включен' : '⏸️ Отключен',
        inline: true,
      }
    )
    .setTimestamp();

  if (subdivision.logo_url) {
    const parsedLogo = parseDiscordEmoji(subdivision.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsedLogo);
    const thumbnailUrl = cdnUrl ?? (subdivision.logo_url.includes('://') ? subdivision.logo_url : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`faction_settings_role_${subdivision.id}`)
    .setPlaceholder('Выберите роль подразделения...');

  const backButton = subdivision.is_default
    ? new ButtonBuilder()
        .setCustomId('faction_back_main')
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder()
        .setCustomId(`faction_back_detail_${subdivision.id}`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary);

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`faction_sub_other_settings_${subdivision.id}`)
      .setLabel('Описание / Эмодзи')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
  ];

  if (subdivision.discord_role_id) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`faction_settings_role_clear_${subdivision.id}`)
        .setLabel('Очистить роль')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  }

  if (!subdivision.is_default) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`faction_configure_embed_${subdivision.id}`)
        .setLabel('Настроить Embed')
        .setEmoji('🎨')
        .setStyle(ButtonStyle.Primary)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`faction_toggle_callouts_${subdivision.id}`)
      .setLabel(subdivision.is_accepting_callouts ? 'Отключить каллауты' : 'Включить каллауты')
      .setEmoji(subdivision.is_accepting_callouts ? '⏸️' : '▶️')
      .setStyle(subdivision.is_accepting_callouts ? ButtonStyle.Secondary : ButtonStyle.Success),
    backButton,
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    ],
  };
}

/**
 * Построить предпросмотр embed подразделения (как при New Callout)
 */
export function buildEmbedPreview(subdivision: Subdivision) {
  const { buildSubdivisionEmbed } = require('./subdivision-embed-builder');
  const previewEmbed: EmbedBuilder = buildSubdivisionEmbed(subdivision);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`faction_settings_${subdivision.id}`)
      .setLabel('Назад к настройкам')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [previewEmbed], components: [row] };
}

/**
 * Построить embed с инструкциями верификации VK или Telegram
 */
export function buildVerificationInstructions(instructions: VerificationInstructions) {
  const minutes = Math.ceil(
    (instructions.expiresAt.getTime() - Date.now()) / 60000
  );

  const platform = instructions.platform || 'vk';
  const isTelegram = platform === 'telegram';

  const title = isTelegram
    ? MESSAGES.VERIFICATION.TITLE_TELEGRAM
    : MESSAGES.VERIFICATION.TITLE;

  const instructionsText = isTelegram
    ? MESSAGES.VERIFICATION.INSTRUCTIONS_TELEGRAM(instructions.token, minutes)
    : MESSAGES.VERIFICATION.INSTRUCTIONS(instructions.token, minutes);

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${title}: ${instructions.subdivisionName}`)
    .setDescription(instructionsText)
    .addFields({
      name: '🔑 Токен',
      value: `\`\`\`${instructions.token}\`\`\``,
    })
    .setTimestamp()
    .setFooter({ text: `Токен действителен ${minutes} минут` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_back_subdivision')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить embed подтверждения удаления подразделения
 */
export function buildDeleteConfirmation(subdivision: Subdivision) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${EMOJI.WARNING} Подтверждение удаления`)
    .setDescription(
      `Вы действительно хотите удалить подразделение **${subdivision.name}**?\n\n` +
        `⚠️ **Внимание:** Это действие необратимо!`
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`faction_confirm_delete_${subdivision.id}`)
      .setLabel('Удалить')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('faction_cancel_delete')
      .setLabel('Отмена')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить пустой список (нет подразделений)
 */
export function buildEmptySubdivisionsList(faction: Faction) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`📋 Подразделения фракции: ${faction.name}`)
    .setDescription(
      'Подразделения еще не созданы.\n\n' +
        'Создайте первое подразделение нажав кнопку "Добавить подразделение"'
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_add_subdivision')
      .setLabel('Добавить подразделение')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('faction_back_main')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export default {
  buildStandaloneMainPanel,
  buildMainPanel,
  buildSubdivisionsList,
  buildSubdivisionDetailPanel,
  buildLinksPanel,
  buildSettingsPanel,
  buildEmbedPreview,
  buildVerificationInstructions,
  buildDeleteConfirmation,
  buildEmptySubdivisionsList,
};

/**
 * Панель выбора роли для подразделения (лидерская панель)
 * Выбранная роль попадает в draft и отправляется через pending change
 */
export async function buildSubdivisionRolePanel(subdivisionId: number, draftRoleId?: string | null) {
  const SubdivisionModel = (await import('../../database/models/Subdivision')).default;
  const subdivision = await SubdivisionModel.findById(subdivisionId);

  if (!subdivision) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle(`${EMOJI.ERROR} Подразделение не найдено`)
      .setDescription('Подразделение не найдено или было удалено.');

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('faction_back_list')
            .setLabel('Назад')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  // draftRoleId приоритетнее значения в БД (может быть null для сброса)
  const currentRoleId = draftRoleId !== undefined ? draftRoleId : subdivision.discord_role_id;

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`🔰 Роль подразделения: ${subdivision.name}`)
    .setDescription(
      'Выберите роль Discord, которая будет упоминаться в каллаутах этого подразделения.\n\n' +
      '_(Изменение роли будет отправлено на одобрение администратору)_'
    )
    .addFields({
      name: 'Текущая роль',
      value: currentRoleId ? `<@&${currentRoleId}>` : 'Не задана',
      inline: true,
    })
    .setTimestamp();

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`subdivision_role_${subdivisionId}`)
    .setPlaceholder('Выберите роль подразделения...');

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`faction_configure_embed_${subdivisionId}`)
      .setLabel('Назад к редактору')
      .setStyle(ButtonStyle.Secondary),
  ];

  if (currentRoleId) {
    buttons.unshift(
      new ButtonBuilder()
        .setCustomId(`subdivision_role_clear_${subdivisionId}`)
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
 * Интерактивная панель редактирования embed подразделения (для лидеров)
 * Показывает предпросмотр embed и кнопки для редактирования полей
 */
export async function buildSubdivisionEmbedEditorPanel(
  subdivisionId: number,
  draftData?: Partial<Subdivision>
) {
  const SubdivisionModel = (await import('../../database/models/Subdivision')).default;
  const subdivision = await SubdivisionModel.findById(subdivisionId);

  if (!subdivision) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle(`${EMOJI.ERROR} Подразделение не найдено`)
      .setDescription('Подразделение не найдено или было удалено.');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`faction_back_to_sub_${subdivisionId}`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  // Применить draft изменения если есть
  const currentData = draftData ? { ...subdivision, ...draftData } : subdivision;

  // Построить предпросмотр embed
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

  if (currentData.embed_image_url) {
    try {
      if (isValidUrl(currentData.embed_image_url)) previewEmbed.setImage(currentData.embed_image_url);
    } catch {}
  }

  if (currentData.embed_thumbnail_url) {
    try {
      if (isValidUrl(currentData.embed_thumbnail_url)) previewEmbed.setThumbnail(currentData.embed_thumbnail_url);
    } catch {}
  }

  if (currentData.embed_footer_text) {
    try {
      previewEmbed.setFooter({
        text: currentData.embed_footer_text,
        iconURL: isValidUrl(currentData.embed_footer_icon_url) ? currentData.embed_footer_icon_url! : undefined,
      });
    } catch {}
  }

  // Показать эмодзи как thumbnail через CDN (только для кастомных Discord-эмодзи)
  if (currentData.logo_url && !currentData.embed_thumbnail_url) {
    const parsedLogoEmoji = parseDiscordEmoji(currentData.logo_url);
    const logoCdnUrl = getEmojiCdnUrl(parsedLogoEmoji);
    if (logoCdnUrl) {
      try { previewEmbed.setThumbnail(logoCdnUrl); } catch {}
    }
  }

  // Embed с информацией о редактировании
  const infoEmbed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`✏️ Редактирование embed: ${subdivision.name}`)
    .setDescription(
      'Используйте кнопки ниже для редактирования полей embed каллаута.\n' +
      'Изменения отображаются в предпросмотре ниже.\n\n' +
      '**После завершения редактирования нажмите "Отправить на одобрение"**\n' +
      '_(Изменения будут применены после одобрения администратором)_'
    )
    .addFields(
      { name: 'Название', value: currentData.name, inline: true },
      { name: 'Описание', value: currentData.description || 'Не указано', inline: true },
    );

  const fieldValues = [];
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

  const settingsValues = [];
  if (currentData.short_description) settingsValues.push(`📋 Краткое описание: ${currentData.short_description.substring(0, 50)}`);
  if (currentData.logo_url) settingsValues.push(`🖼️ Логотип: установлен`);
  if (currentData.discord_role_id) settingsValues.push(`🔰 Роль: <@&${currentData.discord_role_id}>`);

  if (settingsValues.length > 0) {
    infoEmbed.addFields({ name: 'Настройки подразделения', value: settingsValues.join('\n'), inline: false });
  }

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

  // Ряд 1: название, эмодзи, краткое описание, роль
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_name_${subdivisionId}`)
      .setLabel('Название')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_logo_${subdivisionId}`)
      .setLabel('Эмодзи')
      .setEmoji('🏷️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_short_desc_${subdivisionId}`)
      .setLabel('Краткое описание')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_role_${subdivisionId}`)
      .setLabel('Роль')
      .setEmoji('🔰')
      .setStyle(currentData.discord_role_id ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  // Ряд 2: автор, заголовок (с URL), миниатюра
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_author_${subdivisionId}`)
      .setLabel('Автор')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_title_${subdivisionId}`)
      .setLabel('Заголовок')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_thumbnail_${subdivisionId}`)
      .setLabel('Миниатюра')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
  );

  // Ряд 3: основной текст, изображение, цвет, футер
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_description_${subdivisionId}`)
      .setLabel('Основной текст')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_image_${subdivisionId}`)
      .setLabel('Изображение')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_color_${subdivisionId}`)
      .setLabel('Цвет')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`subdivision_edit_footer_${subdivisionId}`)
      .setLabel('Футер')
      .setEmoji('📌')
      .setStyle(ButtonStyle.Secondary),
  );

  // Ряд 4: действия
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`subdivision_submit_embed_${subdivisionId}`)
      .setLabel('Отправить на одобрение')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`faction_back_to_settings_${subdivisionId}`)
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  components.push(rowPreview, row1, row2, row3, row4);

  return {
    embeds: [infoEmbed, previewEmbed],
    components,
  };
}

function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
