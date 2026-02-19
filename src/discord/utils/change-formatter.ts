import {
  ChangeType,
  PendingChangeWithDetails,
  CreateSubdivisionChangeData,
  UpdateSubdivisionChangeData,
  DeleteSubdivisionChangeData,
  UpdateEmbedChangeData,
  UpdateFactionChangeData,
} from '../../types/database.types';

/**
 * Получить человекочитаемую метку для типа изменения
 */
export function getChangeTypeLabel(changeType: ChangeType): string {
  const labels: Record<ChangeType, string> = {
    create_subdivision: 'Создание подразделения',
    update_subdivision: 'Обновление подразделения',
    delete_subdivision: 'Удаление подразделения',
    update_embed: 'Настройка embed',
    update_faction: 'Обновление фракции',
  };

  return labels[changeType] || changeType;
}

/**
 * Получить краткое превью данных изменения
 */
export function getChangeDataPreview(change: PendingChangeWithDetails): string {
  switch (change.change_type) {
    case 'create_subdivision': {
      const data = change.parsed_data as CreateSubdivisionChangeData;
      return data.name;
    }

    case 'update_subdivision': {
      return change.subdivision_name || 'Unknown';
    }

    case 'delete_subdivision': {
      const data = change.parsed_data as DeleteSubdivisionChangeData;
      return data.subdivision_name;
    }

    case 'update_embed': {
      return change.subdivision_name || 'Unknown';
    }

    case 'update_faction': {
      return change.faction_name || 'Unknown';
    }

    default:
      return 'Unknown';
  }
}

/**
 * Форматировать детали изменения для отображения
 */
export function formatChangeDetails(change: PendingChangeWithDetails): string {
  switch (change.change_type) {
    case 'create_subdivision': {
      const data = change.parsed_data as CreateSubdivisionChangeData;
      let text = `**Название:** ${data.name}\n`;
      if (data.description) {
        text += `**Описание:** ${data.description}\n`;
      } else {
        text += `**Описание:** Не указано\n`;
      }
      return text;
    }

    case 'update_subdivision': {
      const data = change.parsed_data as UpdateSubdivisionChangeData;
      let text = '';
      if (data.name) text += `**Новое название:** ${data.name}\n`;
      if (data.description !== undefined) text += `**Новое описание:** ${data.description || 'Не указано'}\n`;
      if (data.short_description !== undefined) text += `**Краткое описание:** ${data.short_description || 'Не указано'}\n`;
      if (data.logo_url !== undefined) text += `**Эмодзи:** ${data.logo_url || 'Не указан'}\n`;
      if (data.discord_role_id !== undefined) text += `**Роль Discord:** ${data.discord_role_id ? `<@&${data.discord_role_id}>` : 'Не указана'}\n`;
      return text || 'Нет изменений';
    }

    case 'delete_subdivision': {
      const data = change.parsed_data as DeleteSubdivisionChangeData;
      return `**Удаляется:** ${data.subdivision_name}`;
    }

    case 'update_embed': {
      const data = change.parsed_data as UpdateEmbedChangeData;
      let text = '';
      if (data.embed_title) {
        text += `**Заголовок:** ${data.embed_title}\n`;
      }
      if (data.embed_color) {
        text += `**Цвет:** ${data.embed_color}\n`;
      }
      if (data.embed_description) {
        text += `**Описание:** ${data.embed_description}\n`;
      }
      if (data.embed_image_url) {
        text += `**URL изображения:** ${data.embed_image_url}\n`;
      }
      if (data.embed_thumbnail_url) {
        text += `**URL миниатюры:** ${data.embed_thumbnail_url}\n`;
      }
      return text || 'Настройки embed';
    }

    case 'update_faction': {
      const data = change.parsed_data as UpdateFactionChangeData;
      let text = '';
      if (data.name) text += `**Новое название:** ${data.name}\n`;
      if (data.logo_url !== undefined) text += `**Эмодзи:** ${data.logo_url || 'сброшен'}\n`;
      return text || 'Обновление фракции';
    }

    default:
      return 'Unknown change type';
  }
}

/**
 * Обрезать строку до максимальной длины
 */
function trunc(str: string, max = 80): string {
  return str.length > max ? str.substring(0, max - 3) + '...' : str;
}

/**
 * Форматировать сравнение "до → после" для изменения
 * Читает _before из parsed_data (сохраняется при создании pending change)
 */
export function formatBeforeAfter(change: PendingChangeWithDetails): string {
  const data = change.parsed_data as any;
  const before = data._before as Record<string, any> | undefined;

  switch (change.change_type) {
    case 'create_subdivision': {
      const d = change.parsed_data as CreateSubdivisionChangeData;
      let text = `**Название:** ${d.name}\n`;
      text += `**Описание:** ${d.description || 'Не указано'}`;
      return text;
    }

    case 'delete_subdivision': {
      const d = change.parsed_data as DeleteSubdivisionChangeData;
      return `**Удаляется:** ${d.subdivision_name}`;
    }

    case 'update_subdivision': {
      const d = change.parsed_data as UpdateSubdivisionChangeData;
      const lines: string[] = [];

      const diffStr = (label: string, newVal: string | null | undefined, key: string) => {
        if (newVal === undefined) return;
        const old = before ? (before[key] ?? null) : null;
        const nv = newVal ?? null;
        if (nv === old) return;
        const oldStr = trunc(old ?? 'Не указано');
        const newStr = trunc(nv ?? 'Не указано');
        lines.push(`**${label}:** ~~${oldStr}~~ → ${newStr}`);
      };

      diffStr('Название', d.name, 'name');
      diffStr('Описание', d.description, 'description');
      diffStr('Краткое описание', d.short_description, 'short_description');
      diffStr('Эмодзи', d.logo_url, 'logo_url');

      if (d.discord_role_id !== undefined) {
        const old = before?.discord_role_id ?? null;
        const nv = d.discord_role_id ?? null;
        if (nv !== old) {
          const oldStr = old ? `<@&${old}>` : 'Не указана';
          const newStr = nv ? `<@&${nv}>` : 'Не указана';
          lines.push(`**Роль Discord:** ~~${oldStr}~~ → ${newStr}`);
        }
      }

      return lines.join('\n') || 'Нет изменений';
    }

    case 'update_embed': {
      const d = change.parsed_data as UpdateEmbedChangeData;
      const lines: string[] = [];

      // Показываем поле только если значение реально изменилось
      const diff = (label: string, newVal: any, key: string) => {
        if (newVal === undefined) return;
        const oldVal = before ? (before[key] ?? null) : null;
        const newNorm = newVal ?? null;
        if (String(oldVal ?? '') === String(newNorm ?? '')) return; // не изменилось
        const oldStr = trunc(String(oldVal ?? 'Не указано'));
        const newStr = trunc(String(newNorm ?? 'Не указано'));
        lines.push(`**${label}:** ~~${oldStr}~~ → ${newStr}`);
      };

      diff('Заголовок', d.embed_title, 'embed_title');
      diff('Описание embed', d.embed_description, 'embed_description');
      diff('Цвет', d.embed_color, 'embed_color');
      diff('Автор', d.embed_author_name, 'embed_author_name');
      diff('Подвал', d.embed_footer_text, 'embed_footer_text');
      diff('Изображение', d.embed_image_url, 'embed_image_url');
      diff('Миниатюра', d.embed_thumbnail_url, 'embed_thumbnail_url');
      diff('Краткое описание', d.short_description, 'short_description');
      diff('Эмодзи', d.logo_url, 'logo_url');

      return lines.join('\n') || 'Нет изменённых полей';
    }

    case 'update_faction': {
      const d = change.parsed_data as UpdateFactionChangeData;
      const lines: string[] = [];

      if (d.name !== undefined && d.name !== (before?.name ?? null)) {
        const old = before?.name;
        lines.push(old ? `**Название:** ~~${trunc(old)}~~ → ${d.name}` : `**Название:** ${d.name}`);
      }
      if (d.logo_url !== undefined) {
        const old = before?.logo_url ?? null;
        const newVal = d.logo_url ?? null;
        if (newVal !== old) {
          lines.push(`**Эмодзи:** ~~${old ?? 'Не указан'}~~ → ${newVal ?? 'Не указан'}`);
        }
      }

      return lines.join('\n') || 'Нет изменений';
    }

    default:
      return formatChangeDetails(change);
  }
}

/**
 * Форматировать дату в Discord timestamp
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const timestamp = Math.floor(date.getTime() / 1000);
  return `<t:${timestamp}:R>`;
}

/**
 * Получить emoji для статуса изменения
 */
export function getStatusEmoji(status: string): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'approved':
      return '✅';
    case 'rejected':
      return '❌';
    case 'cancelled':
      return '🚫';
    default:
      return '❓';
  }
}
