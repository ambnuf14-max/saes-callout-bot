import {
  ChangeType,
  PendingChangeWithDetails,
  CreateSubdivisionChangeData,
  UpdateSubdivisionChangeData,
  DeleteSubdivisionChangeData,
  UpdateEmbedChangeData,
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
      if (data.name) {
        text += `**Новое название:** ${data.name}\n`;
      }
      if (data.description !== undefined) {
        text += `**Новое описание:** ${data.description || 'Не указано'}\n`;
      }
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

    default:
      return 'Unknown change type';
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
