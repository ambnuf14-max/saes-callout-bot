import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
} from 'discord.js';
import { COLORS, EMOJI } from '../../config/constants';
import { parseDiscordEmoji, getEmojiCdnUrl } from './subdivision-settings-helper';

/**
 * Общие поля данных для редактора подразделения / шаблона подразделения.
 * Оба типа (Subdivision и SubdivisionTemplate) совместимы с этим интерфейсом.
 */
export interface SubdivisionEmbedData {
  name: string;
  description?: string | null;
  short_description?: string | null;
  logo_url?: string | null;
  discord_role_id?: string | null;
  embed_title?: string | null;
  embed_title_url?: string | null;
  embed_description?: string | null;
  embed_color?: string | null;
  embed_author_name?: string | null;
  embed_author_url?: string | null;
  embed_author_icon_url?: string | null;
  embed_image_url?: string | null;
  embed_thumbnail_url?: string | null;
  embed_footer_text?: string | null;
  embed_footer_icon_url?: string | null;
  /** Название фракции — используется как автор по умолчанию */
  faction_name?: string | null;
  /** Эмодзи фракции — используется как thumbnail по умолчанию */
  faction_logo_url?: string | null;
}

/**
 * Конфигурация редактора — всё, чем отличаются три реализации друг от друга.
 */
export interface SubdivisionEditorConfig {
  /** Заголовок info-embed (например "✏️ Редактирование шаблона: Название") */
  editorTitle: string;
  /** Описание info-embed */
  editorDescription: string;
  /** Показывать ли thumbnail (logo) в info-embed */
  showInfoThumbnail?: boolean;
  /** Название секции настроек в info-embed */
  settingsSectionTitle?: string;

  /** Custom ID для select-menu предпросмотра списка */
  selectMenuId: string;
  /** Placeholder для select-menu */
  selectMenuPlaceholder?: string;

  /**
   * Префикс и суффикс для кнопок рядов 1-3.
   * Кнопки строятся как: `{prefix}_edit_{field}_{suffix}`
   * Исключение — кнопка роли, которая задаётся отдельно через roleButtonId.
   */
  idPrefix: string;
  idSuffix: string;

  /**
   * Custom ID кнопки выбора роли (ряд 1, кнопка 4).
   * Передаётся явно, потому что у каждого редактора свой формат.
   */
  roleButtonId: string;

  /**
   * Custom ID кнопки "Изменить фракцию" (ряд 2, кнопка 4).
   * Если не указан — кнопка не добавляется.
   */
  factionEditButtonId?: string;

  /**
   * Кнопки действий (ряд 4 — Сохранить / Отправить / Удалить / Назад).
   * Передаются готовыми ButtonBuilder-ами.
   */
  actionButtons: ButtonBuilder[];
}

export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Строит preview-embed из данных подразделения / шаблона.
 */
function buildPreviewEmbed(data: SubdivisionEmbedData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(data.embed_title || data.name)
    .setDescription(data.embed_description || data.description || 'Нет описания');

  if (isValidUrl(data.embed_title_url)) {
    try { embed.setURL(data.embed_title_url!); } catch {}
  }

  if (data.embed_color) {
    try { embed.setColor(data.embed_color as any); } catch {}
  }

  if (data.embed_author_name) {
    try {
      embed.setAuthor({
        name: data.embed_author_name,
        url: isValidUrl(data.embed_author_url) ? data.embed_author_url! : undefined,
        iconURL: isValidUrl(data.embed_author_icon_url) ? data.embed_author_icon_url! : undefined,
      });
    } catch {}
  } else if (data.faction_name) {
    try { embed.setAuthor({ name: data.faction_name }); } catch {}
  }

  if (data.embed_image_url && isValidUrl(data.embed_image_url)) {
    try { embed.setImage(data.embed_image_url); } catch {}
  }

  if (data.embed_thumbnail_url && isValidUrl(data.embed_thumbnail_url)) {
    try { embed.setThumbnail(data.embed_thumbnail_url); } catch {}
  } else if (data.logo_url) {
    const parsed = parseDiscordEmoji(data.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    if (cdnUrl) try { embed.setThumbnail(cdnUrl); } catch {}
  } else if (data.faction_logo_url) {
    const parsed = parseDiscordEmoji(data.faction_logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    if (cdnUrl) try { embed.setThumbnail(cdnUrl); } catch {}
  }

  if (data.embed_footer_text) {
    try {
      embed.setFooter({
        text: data.embed_footer_text,
        iconURL: isValidUrl(data.embed_footer_icon_url) ? data.embed_footer_icon_url! : undefined,
      });
    } catch {}
  }

  return embed;
}

/**
 * Строит info-embed с текущими значениями полей.
 */
function buildInfoEmbed(data: SubdivisionEmbedData, config: SubdivisionEditorConfig): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(config.editorTitle)
    .setDescription(config.editorDescription)
    .addFields(
      { name: 'Название', value: data.name, inline: true },
      { name: 'Описание', value: data.description || 'Не указано', inline: true },
    );

  if (config.showInfoThumbnail && data.logo_url) {
    const parsed = parseDiscordEmoji(data.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbUrl = cdnUrl ?? (data.logo_url.includes('://') ? data.logo_url : null);
    if (thumbUrl) embed.setThumbnail(thumbUrl);
  }

  if (data.faction_name) {
    const factionDisplay = data.faction_logo_url
      ? `${data.faction_logo_url} ${data.faction_name}`
      : data.faction_name;
    embed.addFields({
      name: '🏛️ Фракция (автор по умолчанию)',
      value: factionDisplay,
      inline: false,
    });
  }

  const fieldValues: string[] = [];
  if (data.embed_title) fieldValues.push(`📝 Заголовок: ${data.embed_title.substring(0, 50)}`);
  if (data.embed_title_url) fieldValues.push(`🔗 URL заголовка: установлен`);
  if (data.embed_color) fieldValues.push(`🎨 Цвет: ${data.embed_color}`);
  if (data.embed_author_name) fieldValues.push(`👤 Автор: ${data.embed_author_name}`);
  if (data.embed_image_url) fieldValues.push(`🖼️ Изображение: установлено`);
  if (data.embed_footer_text) fieldValues.push(`📌 Футер: ${data.embed_footer_text.substring(0, 50)}`);
  if (fieldValues.length > 0) {
    embed.addFields({ name: 'Настроенные поля Embed', value: fieldValues.join('\n'), inline: false });
  }

  const settingsValues: string[] = [];
  if (data.short_description) settingsValues.push(`📋 Краткое описание: ${data.short_description.substring(0, 50)}`);
  if (data.logo_url) settingsValues.push(`🖼️ Логотип: установлен`);
  if (data.discord_role_id) settingsValues.push(`🔰 Роль: <@&${data.discord_role_id}>`);
  if (settingsValues.length > 0) {
    embed.addFields({
      name: config.settingsSectionTitle ?? 'Настройки',
      value: settingsValues.join('\n'),
      inline: false,
    });
  }

  return embed;
}

/**
 * Строит предпросмотр select-menu (как выглядит подразделение в списке каллаутов).
 */
function buildSelectPreviewRow(
  data: SubdivisionEmbedData,
  selectMenuId: string,
  placeholder: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const label = (data.name || 'Название').substring(0, 100);
  const description = (data.short_description || data.description || 'Нет описания').substring(0, 100);
  const parsed = parseDiscordEmoji(data.logo_url);

  const option = new StringSelectMenuOptionBuilder()
    .setLabel(label)
    .setDescription(description)
    .setValue('preview');

  if (parsed) {
    option.setEmoji(
      parsed.id
        ? { id: parsed.id, name: parsed.name, animated: parsed.animated ?? false }
        : parsed.name,
    );
  } else {
    option.setEmoji('🏢');
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(selectMenuId)
      .setPlaceholder(placeholder)
      .addOptions(option),
  );
}

/**
 * Единый строитель панели редактирования подразделения / шаблона подразделения.
 *
 * Используется как общая основа для:
 * - buildTemplateEditorPanel (шаблон подразделения, admin)
 * - buildAdminSubdivisionEditorPanel (прямое редактирование, admin)
 * - buildSubdivisionEmbedEditorPanel (редактирование с одобрением, лидер)
 */
export function buildSubdivisionEditorPanel(
  data: SubdivisionEmbedData,
  config: SubdivisionEditorConfig,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const { idPrefix: p, idSuffix: s, roleButtonId } = config;

  const previewEmbed = buildPreviewEmbed(data);
  const infoEmbed = buildInfoEmbed(data, config);

  // Ряд 0: предпросмотр в списке каллаутов
  const rowPreview = buildSelectPreviewRow(
    data,
    config.selectMenuId,
    config.selectMenuPlaceholder ?? 'Предпросмотр в списке каллаутов',
  );

  // Ряд 1: Название, Эмодзи, Краткое описание, Роль
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${p}_edit_name_${s}`)
      .setLabel('Название')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${p}_edit_logo_${s}`)
      .setLabel('Эмодзи')
      .setEmoji('🏷️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${p}_edit_short_desc_${s}`)
      .setLabel('Краткое описание')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(roleButtonId)
      .setLabel('Роль')
      .setEmoji('🔰')
      .setStyle(data.discord_role_id ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  // Ряд 2: Автор, Заголовок (+ URL) [, Изменить фракцию]
  const row2Buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`${p}_edit_author_${s}`)
      .setLabel('Автор')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${p}_edit_title_${s}`)
      .setLabel('Заголовок')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Secondary),
  ];
  if (config.factionEditButtonId) {
    row2Buttons.push(
      new ButtonBuilder()
        .setCustomId(config.factionEditButtonId)
        .setLabel('Изменить фракцию')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Primary),
    );
  }
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(...row2Buttons);

  // Ряд 3: Основной текст, Изображение, Цвет, Футер
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${p}_edit_description_${s}`)
      .setLabel('Основной текст')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${p}_edit_image_${s}`)
      .setLabel('Изображение')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${p}_edit_color_${s}`)
      .setLabel('Цвет')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${p}_edit_footer_${s}`)
      .setLabel('Футер')
      .setEmoji('📌')
      .setStyle(ButtonStyle.Secondary),
  );

  // Ряд 4: действия (Сохранить / Отправить / Удалить / Назад — специфичны для каждого редактора)
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(...config.actionButtons);

  return {
    embeds: [infoEmbed, previewEmbed],
    components: [rowPreview, row1, row2, row3, row4],
  };
}

/**
 * Минимальный набор данных для панели привязок.
 * Совместим с Subdivision и SubdivisionTemplate.
 */
export interface SubdivisionLinkData {
  id: number;
  name: string;
  logo_url?: string | null;
  vk_chat_id?: string | null;
  telegram_chat_id?: string | null;
}

export interface LinksPanelConfig {
  /**
   * Префикс для ID кнопок.
   * Итоговые ID: `{idPrefix}_link_vk_{id}`, `{idPrefix}_unlink_telegram_{id}` и т.д.
   */
  idPrefix: string;
  /** Custom ID кнопки «Назад» */
  backButtonId: string;
}

/**
 * Общий строитель панели привязок VK/Telegram.
 *
 * Используется в двух контекстах:
 * - Лидерская панель: idPrefix='faction', backButtonId зависит от is_default
 * - Админ-панель: idPrefix='admin', backButtonId='admin_sub_settings_{id}'
 */
export function buildLinksPanelGeneric(
  subdivision: SubdivisionLinkData,
  config: LinksPanelConfig,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const { idPrefix, backButtonId } = config;

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`🔗 Привязки: ${subdivision.name}`)
    .addFields(
      { name: '💬 VK беседа', value: subdivision.vk_chat_id ? '✅ Привязана' : '❌ Не привязана', inline: true },
      { name: '📨 Telegram беседа', value: subdivision.telegram_chat_id ? '✅ Привязана' : '❌ Не привязана', inline: true },
    )
    .setTimestamp();

  if (subdivision.logo_url) {
    const parsed = parseDiscordEmoji(subdivision.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    if (cdnUrl) embed.setThumbnail(cdnUrl);
  }

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(subdivision.vk_chat_id ? `${idPrefix}_unlink_vk_${subdivision.id}` : `${idPrefix}_link_vk_${subdivision.id}`)
      .setLabel(subdivision.vk_chat_id ? 'Отвязать VK' : 'Привязать VK')
      .setEmoji(subdivision.vk_chat_id ? '🔓' : '🔗')
      .setStyle(subdivision.vk_chat_id ? ButtonStyle.Secondary : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(subdivision.telegram_chat_id ? `${idPrefix}_unlink_telegram_${subdivision.id}` : `${idPrefix}_link_telegram_${subdivision.id}`)
      .setLabel(subdivision.telegram_chat_id ? 'Отвязать TG' : 'Привязать TG')
      .setEmoji(subdivision.telegram_chat_id ? '🔓' : '✈️')
      .setStyle(subdivision.telegram_chat_id ? ButtonStyle.Secondary : ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(backButtonId)
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Минимальный набор данных для панели настроек подразделения.
 * Совместим с Subdivision.
 */
export interface SubdivisionSettingsPanelData {
  id: number;
  name: string;
  is_accepting_callouts: boolean;
  vk_chat_id?: string | null;
  telegram_chat_id?: string | null;
  discord_role_id?: string | null;
  short_description?: string | null;
  logo_url?: string | null;
  description?: string | null;
  presence_asset_name?: string | null;
}

export interface SubdivisionSettingsPanelConfig {
  /** Описание под заголовком embed */
  description: string;
  /** Цвет embed */
  color: number;
  /** Custom ID RoleSelectMenu */
  roleSelectId: string;
  /** Custom ID кнопки «Описание / Эмодзи» */
  otherSettingsButtonId: string;
  /**
   * Custom ID кнопки «Настроить Embed».
   * null/undefined → кнопка не отображается.
   */
  configureEmbedButtonId?: string | null;
  /** Custom ID кнопки «Отключить/Включить каллауты» */
  toggleCalloutsButtonId: string;
  /** Custom ID кнопки «Очистить роль» */
  roleClearButtonId: string;
  /** Custom ID кнопки «Привязки» */
  linksButtonId: string;
  /**
   * Custom ID кнопки «Presence Asset» (только админ).
   * null/undefined → кнопка не отображается.
   */
  presenceAssetButtonId?: string | null;
  /**
   * Custom ID кнопки «Удалить».
   * null/undefined → кнопка не отображается.
   */
  deleteButtonId?: string | null;
  /** Custom ID кнопки «Назад» */
  backButtonId: string;
  /** Показывать ли предупреждение об отсутствии Discord роли */
  showRoleWarning?: boolean;
  /** Показывать ли поле description (полное описание) если оно задано */
  showDescription?: boolean;
  /** Pending изменения для отображения в embed */
  pendingChanges?: Array<{ change_type: string }>;
}

/**
 * Общий строитель панели настроек / управления подразделением.
 *
 * Используется в двух контекстах:
 * - Лидерская панель (pending changes, role warning, showDescription)
 * - Админ-панель (прямое редактирование, без pending)
 */
export function buildSubdivisionSettingsPanelCore(
  subdivision: SubdivisionSettingsPanelData,
  config: SubdivisionSettingsPanelConfig,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const embed = new EmbedBuilder()
    .setColor(config.color as any)
    .setTitle(`Управление: ${subdivision.name}`)
    .setDescription(config.description);

  if (config.showRoleWarning && !subdivision.discord_role_id) {
    embed.addFields({
      name: '⚠️ Каллауты недоступны',
      value: 'Discord роль не назначена. Используйте меню выбора роли ниже, чтобы подразделение начало принимать каллауты.',
      inline: false,
    });
  }

  embed.addFields(
    { name: '🚨 Прием каллаутов', value: subdivision.is_accepting_callouts ? '✅ Включен' : '⏸️ Отключен', inline: true },
    { name: '💬 VK беседа', value: subdivision.vk_chat_id ? 'Привязана' : 'Не привязана', inline: true },
    { name: '📨 Telegram беседа', value: subdivision.telegram_chat_id ? 'Привязана' : 'Не привязана', inline: true },
    { name: '🔰 Discord роль', value: subdivision.discord_role_id ? `<@&${subdivision.discord_role_id}>` : 'Не задана', inline: true },
    { name: '📋 Краткое описание', value: subdivision.short_description || 'Не задано', inline: true },
    { name: '🏷️ Эмодзи', value: subdivision.logo_url || 'Не задан', inline: true },
  );

  if (config.presenceAssetButtonId) {
    embed.addFields(
      { name: '🎮 Presence Asset', value: subdivision.presence_asset_name || 'Не задан', inline: true },
    );
  }

  if (config.pendingChanges && config.pendingChanges.length > 0) {
    const pendingTexts = config.pendingChanges.map(change => {
      if (change.change_type === 'delete_subdivision') return `${EMOJI.PENDING} **Ожидает одобрения для удаления**`;
      if (change.change_type === 'update_subdivision') return `${EMOJI.PENDING} **Обновление ожидает одобрения**`;
      if (change.change_type === 'update_embed') return `${EMOJI.PENDING} **Настройка embed ожидает одобрения**`;
      return '';
    }).filter(t => t);
    if (pendingTexts.length > 0) {
      embed.addFields({ name: 'Pending изменения', value: pendingTexts.join('\n'), inline: false });
    }
  }

  if (config.showDescription && subdivision.description) {
    embed.addFields({ name: 'Описание', value: subdivision.description });
  }

  embed.setTimestamp();

  if (subdivision.logo_url) {
    const parsed = parseDiscordEmoji(subdivision.logo_url);
    const cdnUrl = getEmojiCdnUrl(parsed);
    const thumbnailUrl = cdnUrl ?? (subdivision.logo_url.includes('://') ? subdivision.logo_url : null);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  }

  // Ряд 1: Выбор роли
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(config.roleSelectId)
    .setPlaceholder('Выберите роль подразделения...');

  // Ряд 2: Кнопки настроек
  const settingsButtons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(config.otherSettingsButtonId)
      .setLabel('Описание / Эмодзи')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
  ];

  if (config.configureEmbedButtonId) {
    settingsButtons.push(
      new ButtonBuilder()
        .setCustomId(config.configureEmbedButtonId)
        .setLabel('Настроить Embed')
        .setEmoji('🎨')
        .setStyle(ButtonStyle.Primary),
    );
  }

  settingsButtons.push(
    new ButtonBuilder()
      .setCustomId(config.toggleCalloutsButtonId)
      .setLabel(subdivision.is_accepting_callouts ? 'Отключить каллауты' : 'Включить каллауты')
      .setEmoji(subdivision.is_accepting_callouts ? '⏸️' : '▶️')
      .setStyle(subdivision.is_accepting_callouts ? ButtonStyle.Secondary : ButtonStyle.Success),
  );

  if (subdivision.discord_role_id) {
    settingsButtons.push(
      new ButtonBuilder()
        .setCustomId(config.roleClearButtonId)
        .setLabel('Очистить роль')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    );
  }

  // Ряд 3: Навигация
  const navButtons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(config.linksButtonId)
      .setLabel('Привязки')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`role_manual_input_${config.roleSelectId}`)
      .setLabel('Ввести ID')
      .setEmoji('⌨️')
      .setStyle(ButtonStyle.Secondary),
  ];

  if (config.presenceAssetButtonId) {
    navButtons.push(
      new ButtonBuilder()
        .setCustomId(config.presenceAssetButtonId)
        .setLabel('Presence Asset')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (config.deleteButtonId) {
    navButtons.push(
      new ButtonBuilder()
        .setCustomId(config.deleteButtonId)
        .setLabel('Удалить')
        .setStyle(ButtonStyle.Danger),
    );
  }

  navButtons.push(
    new ButtonBuilder()
      .setCustomId(config.backButtonId)
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...settingsButtons),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...navButtons),
    ],
  };
}
