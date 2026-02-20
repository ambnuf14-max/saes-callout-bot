import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
} from 'discord.js';
import { Faction, Subdivision, PendingChangeWithDetails, Callout } from '../../types/database.types';
import { VerificationInstructions } from '../../types/department.types';
import { COLORS, EMOJI, MESSAGES, CALLOUT_STATUS } from '../../config/constants';
import { getChangeTypeLabel, getStatusEmoji } from './change-formatter';
import { CalloutModel, SubdivisionModel } from '../../database/models';
import { parseDiscordEmoji, getEmojiCdnUrl } from './subdivision-settings-helper';
import { buildSubdivisionEditorPanel, buildLinksPanelGeneric, buildSubdivisionSettingsPanelCore } from './subdivision-editor-builder';
import { buildSubdivisionsListPanel } from './subdivision-list-builder';

/**
 * Построить панель обязательной настройки при переходе в standalone режим
 */
export function buildStandaloneSetupRequiredPanel(faction: Faction, defaultSubdivision: Subdivision) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`⚠️ Требуется настройка: ${faction.name}`)
    .setDescription(
      `Ваша фракция перешла в **автономный режим** — все подразделения были удалены.\n\n` +
      `Теперь каллауты направляются напрямую вашей фракции. Чтобы игроки могли их отправлять, необходимо:\n\n` +
      `**1.** Настроить описание и внешний вид уведомления _(Embed)_\n` +
      `**2.** Проверить предпросмотр в редакторе\n` +
      `**3.** Отправить изменения на одобрение администратору\n\n` +
      `_До завершения настройки каллауты для вашей фракции недоступны._`
    )
    .setTimestamp();

  if (faction.logo_url) {
    const parsed = parseDiscordEmoji(faction.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbnailUrl = cdnUrl ?? (parsed === null && (faction.logo_url ?? '').includes('://') ? faction.logo_url! : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`faction_configure_embed_${defaultSubdivision.id}`)
      .setLabel('Настроить описание и Embed')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить standalone панель (фракция без подразделений)
 */
export function buildStandaloneMainPanel(faction: Faction, defaultSubdivision: Subdivision) {
  const vkStatus = defaultSubdivision.vk_chat_id ? '✅ Привязана' : '❌ Не привязана';
  const telegramStatus = defaultSubdivision.telegram_chat_id ? '✅ Привязана' : '❌ Не привязана';
  const calloutsStatus = defaultSubdivision.is_accepting_callouts ? '✅ Включен' : '⏸️ Отключен';

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(faction.name)
    .setDescription(
      `🚨 **Лидерская панель управления каллаутами**\n\n` +
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
    .setFooter({ text: `Используйте кнопки ниже для настройки` });

  if (faction.logo_url) {
    const parsed = parseDiscordEmoji(faction.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbnailUrl = cdnUrl ?? (parsed === null && (faction.logo_url ?? '').includes('://') ? faction.logo_url! : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

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
    new ButtonBuilder()
      .setCustomId(`faction_edit_faction_${faction.id}`)
      .setLabel('Изменить')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
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
export function buildMainPanel(faction: Faction, subdivisionCount: number, activeCount: number, missingRoleCount?: number) {
  const embed = new EmbedBuilder()
    .setColor(missingRoleCount ? COLORS.WARNING : COLORS.INFO)
    .setTitle(faction.name)
    .setDescription(
      `🚨 **Лидерская панель управления каллаутами**\n\n` +
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
    .setFooter({ text: `Используйте кнопки ниже для управления подразделениями` });

  if (missingRoleCount) {
    embed.addFields({
      name: '⚠️ Требуется настройка',
      value: `${missingRoleCount} подразделени${missingRoleCount === 1 ? 'е' : 'й'} без Discord роли — каллауты для ${missingRoleCount === 1 ? 'него' : 'них'} недоступны. Откройте список подразделений и назначьте роли.`,
      inline: false,
    });
  }

  if (faction.logo_url) {
    const parsed = parseDiscordEmoji(faction.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbnailUrl = cdnUrl ?? (parsed === null && (faction.logo_url ?? '').includes('://') ? faction.logo_url! : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_view_subdivisions')
      .setLabel('Список подразделений')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`faction_edit_faction_${faction.id}`)
      .setLabel('Изменить')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`faction_callout_history_${faction.id}`)
      .setLabel('История каллаутов')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary)
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
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const parsed = parseDiscordEmoji(faction.logo_url);
  const cdnUrl = getEmojiCdnUrl(parsed);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_add_subdivision')
      .setLabel('Добавить')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('faction_back_main')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  return buildSubdivisionsListPanel(subdivisions, {
    title: `📋 Подразделения фракции: ${faction.name}`,
    thumbnailUrl: cdnUrl,
    emptyText: 'Подразделения еще не созданы. Нажмите "Добавить" для создания.',
    selectMenuId: 'faction_select_subdivision',
    selectMenuPlaceholder: 'Выберите подразделение для управления',
    showCalloutStatus: true,
    showSocialLinks: true,
    actionRows: [actionRow],
  });
}

/**
 * Построить объединённую панель управления и настроек подразделения
 */
export async function buildSubdivisionDetailPanel(subdivision: Subdivision) {
  const PendingChangeModel = (await import('../../database/models/PendingChange')).default;
  const pendingChanges = await PendingChangeModel.findPendingForSubdivision(subdivision.id);

  return buildSubdivisionSettingsPanelCore(subdivision, {
    description: '_(Изменения будут отправлены на одобрение администратору)_',
    color: subdivision.is_active ? COLORS.ACTIVE : COLORS.ERROR,
    roleSelectId: `faction_settings_role_${subdivision.id}`,
    otherSettingsButtonId: `faction_sub_other_settings_${subdivision.id}`,
    configureEmbedButtonId: !subdivision.is_default ? `faction_configure_embed_${subdivision.id}` : null,
    toggleCalloutsButtonId: `faction_toggle_callouts_${subdivision.id}`,
    roleClearButtonId: `faction_settings_role_clear_${subdivision.id}`,
    linksButtonId: `faction_links_${subdivision.id}`,
    deleteButtonId: !subdivision.is_default ? `faction_delete_sub_${subdivision.id}` : null,
    backButtonId: subdivision.is_default ? 'faction_back_main' : 'faction_back_list',
    showRoleWarning: true,
    showDescription: true,
    pendingChanges: pendingChanges.map(c => ({ change_type: c.change_type })),
  });
}

/**
 * Построить панель привязок (VK/Telegram)
 */
export function buildLinksPanel(subdivision: Subdivision) {
  const backButtonId = subdivision.is_default
    ? 'faction_back_main'
    : `faction_back_detail_${subdivision.id}`;

  return buildLinksPanelGeneric(subdivision, { idPrefix: 'faction', backButtonId });
}

/**
 * Алиас для buildSubdivisionDetailPanel — панели объединены
 */
export async function buildSettingsPanel(subdivision: Subdivision) {
  return buildSubdivisionDetailPanel(subdivision);
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

  if (subdivision.logo_url) {
    const parsed = parseDiscordEmoji(subdivision.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbnailUrl = cdnUrl ?? (parsed === null && subdivision.logo_url.includes('://') ? subdivision.logo_url : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

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

  if (faction.logo_url) {
    const parsed = parseDiscordEmoji(faction.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbnailUrl = cdnUrl ?? (parsed === null && (faction.logo_url ?? '').includes('://') ? faction.logo_url! : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('faction_add_subdivision')
      .setLabel('Добавить подразделение')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('faction_back_main')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export default {
  buildStandaloneSetupRequiredPanel,
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

  if (subdivision.logo_url) {
    const parsed = parseDiscordEmoji(subdivision.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbnailUrl = cdnUrl ?? (parsed === null && subdivision.logo_url.includes('://') ? subdivision.logo_url : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`subdivision_role_${subdivisionId}`)
    .setPlaceholder('Выберите роль подразделения...');

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`role_manual_input_subdivision_role_${subdivisionId}`)
      .setLabel('Ввести ID')
      .setEmoji('⌨️')
      .setStyle(ButtonStyle.Secondary),
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

  const FactionModelImport = (await import('../../database/models/Faction')).default;
  const faction = await FactionModelImport.findById(subdivision.faction_id);

  const currentData = draftData ? { ...subdivision, ...draftData } : { ...subdivision };

  if (faction) {
    (currentData as any).faction_name = faction.name;
    (currentData as any).faction_logo_url = faction.logo_url;
  }

  return buildSubdivisionEditorPanel(currentData, {
    editorTitle: `✏️ Редактирование embed: ${subdivision.name}`,
    showInfoThumbnail: true,
    editorDescription:
      'Используйте кнопки ниже для редактирования полей embed каллаута.\n' +
      'Изменения отображаются в предпросмотре ниже.\n\n' +
      '**После завершения редактирования нажмите "Отправить на одобрение"**\n' +
      '_(Изменения будут применены после одобрения администратором)_',
    settingsSectionTitle: 'Настройки подразделения',
    selectMenuId: 'subdivision_list_preview',
    selectMenuPlaceholder: 'Предпросмотр в списке каллаутов',
    idPrefix: 'subdivision',
    idSuffix: `${subdivisionId}`,
    roleButtonId: `subdivision_edit_role_${subdivisionId}`,
    factionEditButtonId: faction ? `faction_edit_faction_${faction.id}` : undefined,
    actionButtons: [
      new ButtonBuilder()
        .setCustomId(`subdivision_submit_embed_${subdivisionId}`)
        .setLabel('Отправить на одобрение')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`faction_back_to_settings_${subdivisionId}`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary),
    ],
  });
}

const HISTORY_PAGE_SIZE = 5;

/**
 * Панель истории каллаутов фракции с пагинацией
 */
export async function buildFactionCalloutHistoryPanel(faction: Faction, page: number = 1) {
  const { callouts, total } = await CalloutModel.findByFactionIdPaginated(
    faction.id,
    page,
    HISTORY_PAGE_SIZE
  );
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`📜 История каллаутов: ${faction.name}`)
    .setTimestamp()
    .setFooter({ text: `Страница ${page}/${totalPages} · Всего: ${total}` });

  if (callouts.length === 0) {
    embed.setDescription('Каллауты ещё не поступали.');
  } else {
    const subdivisionIds = [...new Set(callouts.map(c => c.subdivision_id))];
    const subdivisionsMap = await SubdivisionModel.findByIds(subdivisionIds);

    const blocks = callouts.map((callout) => {
      const subdivision = subdivisionsMap.get(callout.subdivision_id);
      const subdivName = subdivision?.name ?? 'Неизвестно';

      const text = (callout as any).brief_description || callout.description;
      const truncated = text.length > 100 ? text.substring(0, 97) + '...' : text;

      const duration = calcDuration(callout.created_at, callout.closed_at ?? new Date().toISOString());

      let block = `**Incident #${callout.id} - ${subdivName}**\n`;
      block += `Кратко: ${truncated}\n`;
      if (callout.location) block += `Локация: ${callout.location}\n`;
      block += `Время: ${duration}`;

      return block;
    });

    embed.setDescription(blocks.join('\n\n──────────\n\n'));
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (totalPages > 1) {
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`faction_history_prev_${page}`)
        .setLabel('< Назад')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`faction_history_next_${page}`)
        .setLabel('Вперёд >')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages)
    );
    components.push(navRow);
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('faction_back_main')
        .setLabel('В меню')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components };
}

function formatShortDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calcDuration(createdAt: string, closedAt: string): string {
  const diffMs = new Date(closedAt).getTime() - new Date(createdAt).getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}
