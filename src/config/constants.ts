// Цвета для Discord Embeds (hex)
export const COLORS = {
  ACTIVE: 0x00ff00, // Зеленый - активный каллаут
  CLOSED: 0xff0000, // Красный - закрытый каллаут
  INFO: 0x3498db,   // Синий - информационный
  WARNING: 0xffaa00, // Оранжевый - предупреждение
  ERROR: 0xff0000,  // Красный - ошибка
} as const;

// Эмодзи
export const EMOJI = {
  ALERT: '🚨',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  PHONE: '📞',
  CLOSED: '🔴',
  ACTIVE: '🟢',
  INFO: 'ℹ️',
} as const;

// Лимиты
export const LIMITS = {
  DESCRIPTION_MIN: 10,
  DESCRIPTION_MAX: 500,
  DEPARTMENT_NAME_MIN: 2,
  DEPARTMENT_NAME_MAX: 10,
} as const;

// Текстовые константы
export const MESSAGES = {
  CALLOUT: {
    BUTTON_CREATE: `${EMOJI.PHONE} Создать каллаут`,
    BUTTON_CLOSE: `${EMOJI.CLOSED} Закрыть инцидент`,
    BUTTON_RESPOND_VK: `${EMOJI.PHONE} Отреагировать на инцидент`,

    TITLE_PANEL: `${EMOJI.ALERT} Система каллаутов`,
    DESCRIPTION_PANEL: 'Нажмите кнопку ниже для создания каллаута',

    MODAL_TITLE: 'Создание каллаута',
    MODAL_DEPT_LABEL: 'Департамент',
    MODAL_DEPT_PLACEHOLDER: 'Выберите департамент',
    MODAL_DESC_LABEL: 'Описание инцидента',
    MODAL_DESC_PLACEHOLDER: 'Опишите ситуацию подробно...',

    SUCCESS_CREATED: (channelName: string) =>
      `${EMOJI.SUCCESS} Каллаут создан! Канал: ${channelName}`,
    SUCCESS_CLOSED: (id: number) =>
      `${EMOJI.SUCCESS} Инцидент #${id} закрыт. Канал будет удален через 5 минут.`,

    ERROR_NO_PERMISSION: `${EMOJI.ERROR} У вас нет прав для закрытия этого каллаута`,
    ERROR_NOT_FOUND: `${EMOJI.ERROR} Каллаут не найден`,
    ERROR_ALREADY_CLOSED: `${EMOJI.ERROR} Этот каллаут уже закрыт`,
  },

  DEPARTMENT: {
    SUCCESS_ADDED: (name: string) =>
      `${EMOJI.SUCCESS} Департамент ${name} успешно добавлен`,
    SUCCESS_REMOVED: (name: string) =>
      `${EMOJI.SUCCESS} Департамент ${name} успешно удален`,

    ERROR_NOT_FOUND: (name: string) =>
      `${EMOJI.ERROR} Департамент ${name} не найден`,
    ERROR_ALREADY_EXISTS: (name: string) =>
      `${EMOJI.ERROR} Департамент ${name} уже существует`,
    ERROR_INVALID_NAME: `${EMOJI.ERROR} Название должно быть 2-10 символов, только заглавные буквы и цифры`,
  },

  SETUP: {
    SUCCESS: (channelName: string) =>
      `${EMOJI.SUCCESS} Система настроена!\nКанал: ${channelName}\nТеперь добавьте департаменты: \`/department add\``,
    ERROR_NO_PERMISSION: `${EMOJI.ERROR} Только администраторы могут выполнить начальную настройку`,
  },

  VALIDATION: {
    DESC_EMPTY: `${EMOJI.ERROR} Описание не может быть пустым`,
    DESC_TOO_SHORT: (min: number) =>
      `${EMOJI.ERROR} Описание слишком короткое (минимум ${min} символов)`,
    DESC_TOO_LONG: (max: number) =>
      `${EMOJI.ERROR} Описание слишком длинное (максимум ${max} символов)`,
  },
} as const;

// Статусы каллаутов
export const CALLOUT_STATUS = {
  ACTIVE: 'active',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const;

// Типы ответов департаментов
export const RESPONSE_TYPE = {
  ACKNOWLEDGED: 'acknowledged', // Принято к сведению
  ON_WAY: 'on_way',            // В пути
  ARRIVED: 'arrived',          // Прибыли
} as const;
