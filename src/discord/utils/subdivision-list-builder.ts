import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { COLORS } from '../../config/constants';
import { parseDiscordEmoji } from './subdivision-settings-helper';

/**
 * Общий тип данных для отображения подразделения / шаблона подразделения в списке.
 * Совместим как с Subdivision, так и с SubdivisionTemplate.
 */
export interface SubdivisionListItem {
  id: number;
  name: string;
  logo_url?: string | null;
  discord_role_id?: string | null;
  short_description?: string | null;
  description?: string | null;
  /** Только для Subdivision */
  is_accepting_callouts?: boolean;
  /** Только для Subdivision */
  vk_chat_id?: string | null;
  /** Только для Subdivision */
  telegram_chat_id?: string | null;
}

/**
 * Конфигурация панели списка подразделений.
 */
export interface SubdivisionListConfig {
  /** Заголовок embed */
  title: string;
  /** CDN URL для thumbnail (обычно из faction.logo_url) */
  thumbnailUrl?: string | null;
  /** Текст когда список пуст */
  emptyText: string;
  /** Custom ID select menu */
  selectMenuId: string;
  /** Placeholder select menu */
  selectMenuPlaceholder: string;
  /** Показывать ли статус приёма каллаутов (false для шаблонов) */
  showCalloutStatus: boolean;
  /** Показывать ли VK/Telegram беседы (false для шаблонов) */
  showSocialLinks: boolean;
  /** Ряды кнопок (Добавить, Назад, и т.д.) — специфичны для каждого контекста */
  actionRows: ActionRowBuilder<ButtonBuilder>[];
}

/**
 * Вернуть текстовое представление эмодзи для отображения в embed полях.
 */
function getDisplayEmoji(item: SubdivisionListItem): string {
  if (item.logo_url) {
    const parsed = parseDiscordEmoji(item.logo_url);
    if (parsed) {
      // Голый Snowflake ID — оборачиваем в синтаксис кастомного эмодзи
      if (parsed.id && !item.logo_url.startsWith('<')) {
        return `<:e:${parsed.id}>`;
      }
      return item.logo_url;
    }
  }
  return '🏢';
}

/**
 * Вернуть эмодзи для компонентов Discord (select menu).
 */
function getComponentEmoji(
  item: SubdivisionListItem,
): string | { id?: string; name?: string; animated?: boolean } {
  if (item.logo_url) {
    const parsed = parseDiscordEmoji(item.logo_url);
    if (parsed) {
      if (parsed.id) return { id: parsed.id, name: parsed.name, animated: parsed.animated ?? false };
      return parsed.name;
    }
  }
  return '🏢';
}

/**
 * Строит унифицированную панель списка подразделений / шаблонов подразделений.
 *
 * Используется во всех трёх контекстах:
 * - Лидерская панель (showCalloutStatus: true, showSocialLinks: true)
 * - Админ-панель управления подразделениями (showCalloutStatus: true, showSocialLinks: true)
 * - Админ-панель шаблонов типов фракций (showCalloutStatus: false, showSocialLinks: false)
 */
export function buildSubdivisionsListPanel(
  items: SubdivisionListItem[],
  config: SubdivisionListConfig,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(config.title)
    .setTimestamp();

  if (config.thumbnailUrl) {
    embed.setThumbnail(config.thumbnailUrl);
  }

  const components: ActionRowBuilder<any>[] = [];

  if (items.length === 0) {
    embed.setDescription(config.emptyText);
    components.push(...config.actionRows);
    return { embeds: [embed], components };
  }

  embed.setDescription(`Всего: ${items.length}`);

  for (const item of items) {
    const displayEmoji = getDisplayEmoji(item);
    const lines: string[] = [];

    if (config.showCalloutStatus && item.is_accepting_callouts !== undefined) {
      const icon = item.is_accepting_callouts ? '✅' : '⏸️';
      lines.push(`**Прием каллаутов:** ${icon} ${item.is_accepting_callouts ? 'Включен' : 'Отключен'}`);
    }

    if (config.showSocialLinks) {
      lines.push(`**VK беседа:** ${item.vk_chat_id ? '✅ Привязана' : '❌ Не привязана'}`);
      lines.push(`**Telegram беседа:** ${item.telegram_chat_id ? '✅ Привязана' : '❌ Не привязана'}`);
    }

    lines.push(`**Роль:** ${item.discord_role_id ? `<@&${item.discord_role_id}>` : '⚠️ Не задана'}`);

    embed.addFields({
      name: `${displayEmoji} ${item.name}`,
      value: lines.join('\n'),
      inline: false,
    });
  }

  // Select menu (максимум 25 опций)
  const selectOptions = items.slice(0, 25).map(item =>
    new StringSelectMenuOptionBuilder()
      .setLabel(item.name.substring(0, 100))
      .setValue(item.id.toString())
      .setDescription((item.short_description || item.description || 'Нет описания').substring(0, 100))
      .setEmoji(getComponentEmoji(item)),
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(config.selectMenuId)
    .setPlaceholder(config.selectMenuPlaceholder)
    .addOptions(selectOptions);

  components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
  components.push(...config.actionRows);

  return { embeds: [embed], components };
}
