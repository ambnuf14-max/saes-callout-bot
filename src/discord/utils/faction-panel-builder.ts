import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Faction, Subdivision, PendingChangeWithDetails } from '../../types/database.types';
import { VerificationInstructions } from '../../types/department.types';
import { COLORS, EMOJI, MESSAGES } from '../../config/constants';
import { getChangeTypeLabel, getStatusEmoji } from './change-formatter';

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
    const calloutsEmoji = subdivision.is_accepting_callouts ? '✅' : '⏸️';
    const vkEmoji = subdivision.vk_chat_id ? '✅' : '❌';

    const fieldValue =
      `**Статус:** ${statusEmoji} ${subdivision.is_active ? 'Активно' : 'Неактивно'}\n` +
      `**Прием каллаутов:** ${calloutsEmoji} ${subdivision.is_accepting_callouts ? 'Включен' : 'Отключен'}\n` +
      `**VK беседа:** ${vkEmoji} ${subdivision.vk_chat_id ? 'Привязана' : 'Не привязана'}\n` +
      (subdivision.discord_role_id ? `**Роль:** <@&${subdivision.discord_role_id}>` : '');

    embed.addFields({
      name: `${statusEmoji} ${subdivision.name}`,
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
      const statusEmoji = sub.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
      return new StringSelectMenuOptionBuilder()
        .setLabel(sub.name)
        .setValue(sub.id.toString())
        .setDescription(
          sub.is_accepting_callouts ? 'Принимает каллауты' : 'Не принимает каллауты'
        )
        .setEmoji(statusEmoji);
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
  const calloutsStatus = subdivision.is_accepting_callouts ? 'Включен' : 'Отключен';
  const vkStatus = subdivision.vk_chat_id ? 'Привязана' : 'Не привязана';
  const telegramStatus = subdivision.telegram_chat_id ? 'Привязана' : 'Не привязана';

  // Проверить pending запросы для этого подразделения
  const PendingChangeModel = (await import('../../database/models/PendingChange')).default;
  const pendingChanges = await PendingChangeModel.findPendingForSubdivision(subdivision.id);

  const embed = new EmbedBuilder()
    .setColor(subdivision.is_active ? COLORS.ACTIVE : COLORS.ERROR)
    .setTitle(`${statusEmoji} Управление: ${subdivision.name}`)
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
  const calloutsStatus = subdivision.is_accepting_callouts ? '✅ Включен' : '⏸️ Отключен';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`⚙️ Настройки: ${subdivision.name}`)
    .addFields(
      {
        name: '🚨 Прием каллаутов',
        value: calloutsStatus,
        inline: true,
      }
    )
    .setTimestamp();

  if (subdivision.description) {
    embed.addFields({ name: 'Описание', value: subdivision.description });
  }
  if (subdivision.discord_role_id) {
    embed.addFields({ name: 'Discord роль', value: `<@&${subdivision.discord_role_id}>`, inline: true });
  }

  const buttons: ButtonBuilder[] = [];

  // Для обычных подразделений показывать все кнопки
  if (!subdivision.is_default) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`faction_edit_sub_${subdivision.id}`)
        .setLabel('Изменить')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`faction_configure_embed_${subdivision.id}`)
        .setLabel('Настроить Embed')
        .setEmoji('🎨')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`faction_preview_embed_${subdivision.id}`)
        .setLabel('Предпросмотр')
        .setEmoji('👁️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // Кнопка переключения каллаутов доступна для всех подразделений
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`faction_toggle_callouts_${subdivision.id}`)
      .setLabel(subdivision.is_accepting_callouts ? 'Отключить каллауты' : 'Включить каллауты')
      .setEmoji(subdivision.is_accepting_callouts ? '⏸️' : '▶️')
      .setStyle(subdivision.is_accepting_callouts ? ButtonStyle.Secondary : ButtonStyle.Success)
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

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
