// Цвета для Discord Embeds (hex)
export const COLORS = {
  ACTIVE: 0x00ff00, // Зеленый - активный каллаут
  SUCCESS: 0x00ff00, // Зеленый - успех
  CLOSED: 0xff0000, // Красный - закрытый каллаут
  INFO: 0xff0000,   // Красный - информационный
  WARNING: 0xffaa00, // Оранжевый - предупреждение
  ERROR: 0xff0000,  // Красный - ошибка
} as const;

// Эмодзи
export const EMOJI = {
  ALERT: '🚨',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  PHONE: '☎️',
  CLOSED: '🔴',
  ACTIVE: '🟢',
  INFO: 'ℹ️',
  CALLOUT: '🚨',
} as const;

// Лимиты
export const LIMITS = {
  DESCRIPTION_MIN: 10,
  DESCRIPTION_MAX: 500,
  DEPARTMENT_NAME_MIN: 2,
  DEPARTMENT_NAME_MAX: 10,
  LOCATION_MIN: 3,
  LOCATION_MAX: 100,
} as const;

// Текстовые константы
export const MESSAGES = {
  CALLOUT: {
    BUTTON_CREATE: `${EMOJI.PHONE} New Callout`,
    BUTTON_CLOSE: `${EMOJI.CLOSED} Закрыть инцидент`,
    BUTTON_RESPOND_VK: `${EMOJI.PHONE} Отреагировать на инцидент`,
    BUTTON_RESPOND_TELEGRAM: `✅ Отреагировать`,

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

  SETUP: {
    SUCCESS: (channelName: string) =>
      `${EMOJI.SUCCESS} Система настроена!\nКанал: ${channelName}\nТеперь добавьте департаменты через \`/settings\` → Департаменты`,
    ERROR_NO_PERMISSION: `${EMOJI.ERROR} Только администраторы могут выполнить начальную настройку`,
  },

  VALIDATION: {
    DESC_EMPTY: `${EMOJI.ERROR} Описание не может быть пустым`,
    DESC_TOO_SHORT: (min: number) =>
      `${EMOJI.ERROR} Описание слишком короткое (минимум ${min} символов)`,
    DESC_TOO_LONG: (max: number) =>
      `${EMOJI.ERROR} Описание слишком длинное (максимум ${max} символов)`,
    LOCATION_EMPTY: `${EMOJI.ERROR} Место не может быть пустым`,
    LOCATION_TOO_SHORT: (min: number) =>
      `${EMOJI.ERROR} Место слишком короткое (минимум ${min} символов)`,
    LOCATION_TOO_LONG: (max: number) =>
      `${EMOJI.ERROR} Место слишком длинное (максимум ${max} символов)`,
  },

  DEPARTMENT: {
    PANEL_TITLE: '🏛️ Панель управления департаментом',
    NO_DEPARTMENT: `${EMOJI.ERROR} Вы не являетесь лидером департамента`,
    MULTIPLE_DEPARTMENTS: `${EMOJI.WARNING} У вас роли нескольких департаментов. Обратитесь к администратору.`,

    SUCCESS_CREATED: (name: string) =>
      `${EMOJI.SUCCESS} Департамент "${name}" создан`,
    SUCCESS_UPDATED: (name: string) =>
      `${EMOJI.SUCCESS} Департамент "${name}" обновлен`,
    SUCCESS_REMOVED: (name: string) =>
      `${EMOJI.SUCCESS} Департамент "${name}" удален`,

    ERROR_NOT_FOUND: `${EMOJI.ERROR} Департамент не найден`,
    ERROR_ALREADY_EXISTS: (name: string) =>
      `${EMOJI.ERROR} Департамент "${name}" уже существует`,
    ERROR_ROLES_EXIST: `${EMOJI.ERROR} Департамент с такой комбинацией ролей уже существует`,
    ERROR_INVALID_NAME: `${EMOJI.ERROR} Название должно быть от 2 до 50 символов`,
  },

  SUBDIVISION: {
    SUCCESS_ADDED: (name: string) =>
      `${EMOJI.SUCCESS} Подразделение "${name}" создано`,
    SUCCESS_REMOVED: (name: string) =>
      `${EMOJI.SUCCESS} Подразделение "${name}" удалено`,
    SUCCESS_UPDATED: (name: string) =>
      `${EMOJI.SUCCESS} Подразделение "${name}" обновлено`,

    ERROR_NOT_FOUND: `${EMOJI.ERROR} Подразделение не найдено`,
    ERROR_ALREADY_EXISTS: (name: string) =>
      `${EMOJI.ERROR} Подразделение "${name}" уже существует`,

    CALLOUTS_ENABLED: (name: string) =>
      `${EMOJI.SUCCESS} Прием каллаутов включен для "${name}"`,
    CALLOUTS_DISABLED: (name: string) =>
      `⏸️ Прием каллаутов отключен для "${name}"`,
    CALLOUTS_PAUSED: `⏸️ Подразделение временно не принимает каллауты`,
  },

  VERIFICATION: {
    TITLE: '📱 Привязка VK беседы',
    TITLE_TELEGRAM: '📱 Привязка Telegram группы',
    INSTRUCTIONS: (token: string, minutes: number) =>
      `**Шаг 1: Добавьте бота в VK беседу**\n` +
      `• Откройте нужную VK беседу\n` +
      `• Нажмите на название беседы → "Участники" → "Пригласить"\n` +
      `• Найдите и добавьте сообщество **SAES Callout Bot**\n\n` +
      `**Шаг 2: Привяжите беседу**\n` +
      `• В беседе отправьте команду: \`/verify ${token}\`\n` +
      `• Токен действителен **${minutes} минут**`,
    INSTRUCTIONS_TELEGRAM: (token: string, minutes: number) =>
      `**Шаг 1: Добавьте бота в Telegram группу**\n` +
      `• Откройте нужную Telegram группу\n` +
      `• Нажмите на название группы → "Добавить участников"\n` +
      `• Найдите и добавьте бота **@saescalloutbot**\n\n` +
      `**Шаг 2: Привяжите группу**\n` +
      `• В группе отправьте команду: \`/verify ${token}\`\n` +
      `• Токен действителен **${minutes} минут**`,

    SUCCESS_LINKED: (subdivisionName: string, chatTitle?: string) =>
      chatTitle
        ? `${EMOJI.SUCCESS} VK беседа "${chatTitle}" привязана к "${subdivisionName}"`
        : `${EMOJI.SUCCESS} VK беседа привязана к "${subdivisionName}"`,
    SUCCESS_LINKED_TELEGRAM: (subdivisionName: string, chatTitle?: string) =>
      chatTitle
        ? `${EMOJI.SUCCESS} Telegram группа "${chatTitle}" привязана к "${subdivisionName}"`
        : `${EMOJI.SUCCESS} Telegram группа привязана к "${subdivisionName}"`,
    SUCCESS_VK: (subdivisionName: string) =>
      `${EMOJI.SUCCESS} Беседа успешно привязана к подразделению "${subdivisionName}"!\n` +
      `Теперь вы будете получать каллауты в этой беседе.`,
    SUCCESS_TELEGRAM: (subdivisionName: string) =>
      `${EMOJI.SUCCESS} Группа успешно привязана к подразделению "<b>${subdivisionName}</b>"!\n` +
      `Теперь вы будете получать каллауты в этой группе.`,

    ERROR_INVALID: `${EMOJI.ERROR} Неверный или истекший токен верификации`,
    ERROR_USED: `${EMOJI.ERROR} Этот токен уже использован`,
    ERROR_TOO_MANY: (limit: number) =>
      `${EMOJI.ERROR} Превышен лимит активных токенов (${limit}). Подождите истечения существующих.`,
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
