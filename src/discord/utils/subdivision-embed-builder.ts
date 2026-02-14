import { EmbedBuilder } from 'discord.js';
import { Subdivision } from '../../types/database.types';
import { COLORS } from '../../config/constants';

/**
 * Построить embed для подразделения на основе его настроек
 */
export function buildSubdivisionEmbed(subdivision: Subdivision): EmbedBuilder {
  const embed = new EmbedBuilder();

  // Автор (если заполнены поля)
  if (subdivision.embed_author_name) {
    embed.setAuthor({
      name: subdivision.embed_author_name,
      url: subdivision.embed_author_url || undefined,
      iconURL: subdivision.embed_author_icon_url || undefined,
    });
  }

  // Заголовок (используем embed_title или дефолтное имя)
  embed.setTitle(subdivision.embed_title || subdivision.name);

  // Описание (используем embed_description или дефолтное описание)
  if (subdivision.embed_description || subdivision.description) {
    embed.setDescription(subdivision.embed_description || subdivision.description || '');
  }

  // Цвет (парсим hex или используем дефолтный)
  if (subdivision.embed_color) {
    try {
      // Убираем # если есть и парсим как hex
      const colorHex = subdivision.embed_color.replace('#', '');
      const color = parseInt(colorHex, 16);
      if (!isNaN(color)) {
        embed.setColor(color);
      } else {
        embed.setColor(COLORS.INFO);
      }
    } catch {
      embed.setColor(COLORS.INFO);
    }
  } else {
    embed.setColor(COLORS.INFO);
  }

  // Изображение
  if (subdivision.embed_image_url) {
    try {
      embed.setImage(subdivision.embed_image_url);
    } catch (error) {
      // Игнорируем некорректные URL
    }
  }

  // Thumbnail (миниатюра)
  if (subdivision.embed_thumbnail_url) {
    try {
      embed.setThumbnail(subdivision.embed_thumbnail_url);
    } catch (error) {
      // Игнорируем некорректные URL
    }
  }

  // Footer
  if (subdivision.embed_footer_text) {
    embed.setFooter({
      text: subdivision.embed_footer_text,
      iconURL: subdivision.embed_footer_icon_url || undefined,
    });
  }

  // Добавить поле статуса приема каллаутов
  const statusEmoji = subdivision.is_accepting_callouts ? '🟢' : '⏸️';
  const statusText = subdivision.is_accepting_callouts
    ? 'Принимает каллауты'
    : 'Не принимает каллауты';

  embed.addFields({
    name: 'Статус',
    value: `${statusEmoji} ${statusText}`,
    inline: true,
  });

  return embed;
}

/**
 * Построить массив embeds для списка подразделений
 * Discord ограничивает максимум 10 embeds в одном сообщении
 */
export function buildSubdivisionEmbeds(subdivisions: Subdivision[]): EmbedBuilder[] {
  // Ограничиваем до 10 подразделений (лимит Discord)
  const limitedSubdivisions = subdivisions.slice(0, 10);

  return limitedSubdivisions.map(subdivision => buildSubdivisionEmbed(subdivision));
}

export default {
  buildSubdivisionEmbed,
  buildSubdivisionEmbeds,
};
