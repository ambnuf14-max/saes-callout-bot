/**
 * Тесты для buildAuditEmbed — проверяем что каждый тип события
 * возвращает embed с правильным заголовком, цветом и полями.
 *
 * buildAuditEmbed — чистая функция, не требует БД или Discord подключения.
 */

// Мокаем зависимости, которые могут требовать БД / файловой системы при импорте
jest.mock('../src/database/models', () => ({}));
jest.mock('../src/utils/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  buildAuditEmbed,
  AuditEventType,
  CalloutCreatedData,
  CalloutClosedData,
  CalloutAutoClosedData,
  FactionAddedData,
  FactionUpdatedData,
  FactionRemovedData,
  SettingsUpdatedData,
  LeaderRoleAddedData,
  LeaderRoleRemovedData,
  AuditLogChannelSetData,
  VkResponseReceivedData,
  TelegramResponseReceivedData,
  DiscordResponseReceivedData,
  VkChatLinkedData,
  TelegramChatLinkedData,
  CalloutRoleData,
  FactionTypeCreatedData,
  FactionTypeUpdatedData,
  FactionTypeDeletedData,
  TemplateAddedData,
  ChangeRequestedData,
  ChangeApprovedData,
  ChangeRejectedData,
  ChangeCancelledData,
  SubdivisionToggleData,
  PresenceAssetSetData,
  ChatUnlinkedData,
  NotificationFailedData,
  UnauthorizedAccessData,
  HistoryViewedData,
  VerificationTokenCreatedData,
} from '../src/discord/utils/audit-logger';

// ─── Вспомогательные данные ────────────────────────────────────────────────

const BASE = { userId: 'u1', userName: 'TestUser' };

function getTitle(embed: ReturnType<typeof buildAuditEmbed>): string {
  return embed.toJSON().title ?? '';
}

function getColor(embed: ReturnType<typeof buildAuditEmbed>): number | null | undefined {
  return embed.toJSON().color;
}

function getFields(embed: ReturnType<typeof buildAuditEmbed>) {
  return embed.toJSON().fields ?? [];
}

function fieldNames(embed: ReturnType<typeof buildAuditEmbed>): string[] {
  return getFields(embed).map(f => f.name);
}

// ─── КАЛЛАУТЫ ─────────────────────────────────────────────────────────────

describe('CALLOUT_CREATED', () => {
  const data: CalloutCreatedData = {
    ...BASE,
    calloutId: 42,
    subdivisionName: 'LSPD Patrol',
    description: 'Test incident',
    channelId: '123456789',
    factionName: 'LSPD',
    vkStatus: '✅ Отправлено',
    telegramStatus: '✅ Отправлено',
  };

  it('имеет заголовок "Каллаут создан"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.CALLOUT_CREATED, data))).toBe('Каллаут создан');
  });

  it('содержит поля ID, подразделение, канал', () => {
    const names = fieldNames(buildAuditEmbed(AuditEventType.CALLOUT_CREATED, data));
    expect(names).toContain('ID Каллаута');
    expect(names).toContain('Подразделение');
    expect(names).toContain('Канал');
  });

  it('включает статусы уведомлений если переданы', () => {
    const names = fieldNames(buildAuditEmbed(AuditEventType.CALLOUT_CREATED, data));
    expect(names).toContain('Уведомления');
  });
});

describe('CALLOUT_CLOSED', () => {
  const data: CalloutClosedData = {
    ...BASE,
    calloutId: 7,
    subdivisionName: 'LSPD Patrol',
    closedByDiscordId: 'u1',
    duration: '15 мин',
    reason: 'Resolved',
  };

  it('заголовок содержит "Каллаут закрыт"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.CALLOUT_CLOSED, data))).toContain('Каллаут закрыт');
  });

  it('поле "Закрыл" — mention пользователя', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.CALLOUT_CLOSED, data));
    const closedBy = fields.find(f => f.name === 'Закрыл');
    expect(closedBy?.value).toBe('<@u1>');
  });

  it('когда closedByDiscordId не задан — "Система"', () => {
    const dataNoUser: CalloutClosedData = { ...data, closedByDiscordId: undefined };
    const fields = getFields(buildAuditEmbed(AuditEventType.CALLOUT_CLOSED, dataNoUser));
    const closedBy = fields.find(f => f.name === 'Закрыл');
    expect(closedBy?.value).toBe('Система');
  });

  it('показывает поле "Причина" если передано', () => {
    expect(fieldNames(buildAuditEmbed(AuditEventType.CALLOUT_CLOSED, data))).toContain('Причина');
  });

  it('показывает длительность', () => {
    expect(fieldNames(buildAuditEmbed(AuditEventType.CALLOUT_CLOSED, data))).toContain('Длительность');
  });
});

describe('CALLOUT_AUTO_CLOSED', () => {
  const data: CalloutAutoClosedData = {
    ...BASE,
    userId: 'system',
    userName: 'Система',
    calloutId: 99,
    subdivisionName: 'FIB Unit',
    duration: '1 ч 0 мин',
    channelId: '999',
  };

  it('заголовок содержит "таймаут"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.CALLOUT_AUTO_CLOSED, data))).toContain('таймаут');
  });

  it('поле "Закрыл" — "Система (автотаймаут)"', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.CALLOUT_AUTO_CLOSED, data));
    const closedBy = fields.find(f => f.name === 'Закрыл');
    expect(closedBy?.value).toContain('Система');
    expect(closedBy?.value).toContain('автотаймаут');
  });

  it('содержит ID каллаута и подразделение', () => {
    const names = fieldNames(buildAuditEmbed(AuditEventType.CALLOUT_AUTO_CLOSED, data));
    expect(names).toContain('ID Каллаута');
    expect(names).toContain('Подразделение');
  });

  it('показывает длительность и канал', () => {
    const names = fieldNames(buildAuditEmbed(AuditEventType.CALLOUT_AUTO_CLOSED, data));
    expect(names).toContain('Длительность');
    expect(names).toContain('Канал');
  });
});

// ─── РЕАГИРОВАНИЕ ─────────────────────────────────────────────────────────

describe('VK_RESPONSE_RECEIVED', () => {
  const data: VkResponseReceivedData = {
    ...BASE, calloutId: 1, factionName: 'LSPD', vkUserId: '100', vkUserName: 'Ivan',
  };

  it('заголовок содержит "VK"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.VK_RESPONSE_RECEIVED, data))).toContain('VK');
  });

  it('поля: ID каллаута, подразделение, пользователь VK', () => {
    const names = fieldNames(buildAuditEmbed(AuditEventType.VK_RESPONSE_RECEIVED, data));
    expect(names).toContain('ID Каллаута');
    expect(names).toContain('Пользователь VK');
  });
});

describe('TELEGRAM_RESPONSE_RECEIVED', () => {
  const data: TelegramResponseReceivedData = {
    ...BASE, calloutId: 2, factionName: 'FIB', telegramUserId: '200', telegramUserName: 'Petrov',
  };

  it('заголовок содержит "Telegram"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.TELEGRAM_RESPONSE_RECEIVED, data))).toContain('Telegram');
  });
});

describe('DISCORD_RESPONSE_RECEIVED', () => {
  const data: DiscordResponseReceivedData = {
    ...BASE, calloutId: 3, factionName: 'LSPD', discordUserId: 'u99', discordUserName: 'Sidorov',
  };

  it('заголовок содержит "Discord"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.DISCORD_RESPONSE_RECEIVED, data))).toContain('Discord');
  });

  it('поле пользователя — mention', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.DISCORD_RESPONSE_RECEIVED, data));
    const userField = fields.find(f => f.name === 'Пользователь Discord');
    expect(userField?.value).toBe('<@u99>');
  });
});

// ─── ФРАКЦИИ ──────────────────────────────────────────────────────────────

describe('FACTION_CREATED', () => {
  const data: FactionAddedData = { ...BASE, factionName: 'LSPD', roleId: 'r1', vkChatId: '1' };

  it('заголовок содержит "добавлена"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.FACTION_CREATED, data))).toContain('добавлена');
  });
});

describe('FACTION_UPDATED', () => {
  const data: FactionUpdatedData = { ...BASE, factionName: 'LSPD', changes: ['name: old → new'] };

  it('заголовок содержит "обновлена"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.FACTION_UPDATED, data))).toContain('обновлена');
  });

  it('показывает изменения', () => {
    expect(fieldNames(buildAuditEmbed(AuditEventType.FACTION_UPDATED, data))).toContain('Изменения');
  });
});

describe('FACTION_REMOVED', () => {
  const data: FactionRemovedData = { ...BASE, factionName: 'LSPD' };

  it('заголовок содержит "удалена"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.FACTION_REMOVED, data))).toContain('удалена');
  });
});

// ─── ПОДРАЗДЕЛЕНИЯ ────────────────────────────────────────────────────────

describe('SUBDIVISION_PAUSED / SUBDIVISION_UNPAUSED', () => {
  const data: SubdivisionToggleData = { ...BASE, subdivisionName: 'Patrol Unit', factionName: 'LSPD' };

  it('PAUSED: заголовок содержит "отключён"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.SUBDIVISION_PAUSED, data))).toContain('отключён');
  });

  it('UNPAUSED: заголовок содержит "включён"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.SUBDIVISION_UNPAUSED, data))).toContain('включён');
  });

  it('PAUSED и UNPAUSED содержат подразделение, фракцию, кто изменил', () => {
    for (const eventType of [AuditEventType.SUBDIVISION_PAUSED, AuditEventType.SUBDIVISION_UNPAUSED]) {
      const names = fieldNames(buildAuditEmbed(eventType, data));
      expect(names).toContain('Подразделение');
      expect(names).toContain('Фракция');
      expect(names).toContain('Изменил');
    }
  });
});

// ─── ИНТЕГРАЦИИ: ПРИВЯЗКА ─────────────────────────────────────────────────

describe('VK_CHAT_LINKED', () => {
  const data: VkChatLinkedData = {
    ...BASE, subdivisionName: 'Patrol', factionName: 'LSPD', vkChatId: '9999', chatTitle: 'Test chat',
  };

  it('заголовок содержит "VK" и "привязана"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.VK_CHAT_LINKED, data));
    expect(title).toContain('VK');
    expect(title).toContain('привязана');
  });

  it('показывает название беседы если передано', () => {
    expect(fieldNames(buildAuditEmbed(AuditEventType.VK_CHAT_LINKED, data))).toContain('Название беседы');
  });

  it('не показывает название беседы если не передано', () => {
    const dataNoTitle: VkChatLinkedData = { ...data, chatTitle: undefined };
    expect(fieldNames(buildAuditEmbed(AuditEventType.VK_CHAT_LINKED, dataNoTitle))).not.toContain('Название беседы');
  });
});

describe('TELEGRAM_CHAT_LINKED', () => {
  const data: TelegramChatLinkedData = {
    ...BASE, subdivisionName: 'Patrol', factionName: 'LSPD', telegramChatId: '-100', chatTitle: 'TG chat',
  };

  it('заголовок содержит "Telegram" и "привязана"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.TELEGRAM_CHAT_LINKED, data));
    expect(title).toContain('Telegram');
    expect(title).toContain('привязана');
  });
});

// ─── ИНТЕГРАЦИИ: ОТВЯЗКА ─────────────────────────────────────────────────

describe('VK_CHAT_UNLINKED', () => {
  const data: ChatUnlinkedData = {
    ...BASE, subdivisionName: 'Patrol', factionName: 'LSPD', chatId: '9999',
  };

  it('заголовок содержит "VK" и "отвязана"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.VK_CHAT_UNLINKED, data));
    expect(title).toContain('VK');
    expect(title).toContain('отвязана');
  });

  it('показывает кто отвязал — mention', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.VK_CHAT_UNLINKED, data));
    const who = fields.find(f => f.name === 'Отвязал');
    expect(who?.value).toBe('<@u1>');
  });
});

describe('TELEGRAM_CHAT_UNLINKED', () => {
  const data: ChatUnlinkedData = {
    ...BASE, subdivisionName: 'Patrol', factionName: 'LSPD', chatId: '-100',
  };

  it('заголовок содержит "Telegram" и "отвязана"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.TELEGRAM_CHAT_UNLINKED, data));
    expect(title).toContain('Telegram');
    expect(title).toContain('отвязана');
  });
});

// ─── ОШИБКИ УВЕДОМЛЕНИЙ ───────────────────────────────────────────────────

describe('VK_NOTIFICATION_FAILED', () => {
  const data: NotificationFailedData = {
    ...BASE, calloutId: 10, subdivisionName: 'FIB', errorMessage: 'Connection refused',
  };

  it('заголовок содержит "Ошибка" и "VK"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.VK_NOTIFICATION_FAILED, data));
    expect(title).toContain('Ошибка');
    expect(title).toContain('VK');
  });

  it('показывает текст ошибки', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.VK_NOTIFICATION_FAILED, data));
    const errField = fields.find(f => f.name === 'Ошибка');
    expect(errField?.value).toContain('Connection refused');
  });

  it('обрезает errorMessage до 512 символов', () => {
    const longErr = 'x'.repeat(600);
    const dataLong: NotificationFailedData = { ...data, errorMessage: longErr };
    const fields = getFields(buildAuditEmbed(AuditEventType.VK_NOTIFICATION_FAILED, dataLong));
    const errField = fields.find(f => f.name === 'Ошибка');
    expect(errField!.value.length).toBeLessThanOrEqual(512);
  });
});

describe('TELEGRAM_NOTIFICATION_FAILED', () => {
  const data: NotificationFailedData = {
    ...BASE, calloutId: 11, subdivisionName: 'SAMD', errorMessage: 'Timeout',
  };

  it('заголовок содержит "Ошибка" и "Telegram"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.TELEGRAM_NOTIFICATION_FAILED, data));
    expect(title).toContain('Ошибка');
    expect(title).toContain('Telegram');
  });
});

// ─── ВЕРИФИКАЦИЯ ──────────────────────────────────────────────────────────

describe('VERIFICATION_TOKEN_CREATED', () => {
  const data: VerificationTokenCreatedData = {
    ...BASE, subdivisionName: 'Patrol', factionName: 'LSPD', platform: 'VK',
  };

  it('заголовок содержит "Токен" и "создан"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.VERIFICATION_TOKEN_CREATED, data));
    expect(title).toContain('Токен');
    expect(title).toContain('создан');
  });

  it('показывает платформу', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.VERIFICATION_TOKEN_CREATED, data));
    const platformField = fields.find(f => f.name === 'Платформа');
    expect(platformField?.value).toBe('VK');
  });
});

// ─── БЕЗОПАСНОСТЬ ─────────────────────────────────────────────────────────

describe('UNAUTHORIZED_ACCESS_ATTEMPT', () => {
  it('заголовок содержит "несанкционированного"', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'respond' };
    expect(getTitle(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data))).toContain('несанкционированного');
  });

  it('action=respond → "Отреагировать на инцидент"', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'respond', calloutId: 5, subdivisionName: 'FIB' };
    const fields = getFields(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data));
    expect(fields.find(f => f.name === 'Действие')?.value).toContain('Отреагировать');
  });

  it('action=close → "Закрыть инцидент"', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'close', calloutId: 5, subdivisionName: 'FIB' };
    const fields = getFields(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data));
    expect(fields.find(f => f.name === 'Действие')?.value).toContain('Закрыть');
  });

  it('при наличии calloutId — ID попадает в заголовок', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'respond', calloutId: 42 };
    expect(getTitle(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data))).toContain('#42');
  });

  it('без calloutId — общий заголовок без номера', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'open_settings' };
    const title = getTitle(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data));
    expect(title).toContain('несанкционированного');
    expect(title).not.toContain('#');
  });

  it('action=create_callout — показывает подразделение и причину', () => {
    const data: UnauthorizedAccessData = {
      ...BASE, action: 'create_callout',
      subdivisionName: 'LSPD Patrol',
      reason: '❌ У вас нет фракционных ролей',
    };
    const names = fieldNames(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data));
    expect(names).toContain('Подразделение');
    expect(names).toContain('Причина');
  });

  it('action=open_faction → содержит "/faction"', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'open_faction' };
    expect(getFields(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data))
      .find(f => f.name === 'Действие')?.value).toContain('/faction');
  });

  it('action=open_settings → содержит "/settings"', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'open_settings' };
    expect(getFields(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data))
      .find(f => f.name === 'Действие')?.value).toContain('/settings');
  });

  it('action=open_admin_panel → содержит "admin"', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'open_admin_panel' };
    expect(getFields(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data))
      .find(f => f.name === 'Действие')?.value.toLowerCase()).toContain('admin');
  });

  it('action=open_history → содержит "/history"', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'open_history' };
    expect(getFields(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data))
      .find(f => f.name === 'Действие')?.value).toContain('/history');
  });

  it('неизвестный action выводится как есть', () => {
    const data: UnauthorizedAccessData = { ...BASE, action: 'some_unknown_action' };
    expect(getFields(buildAuditEmbed(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, data))
      .find(f => f.name === 'Действие')?.value).toBe('some_unknown_action');
  });
});

// ─── ИСТОРИЯ ──────────────────────────────────────────────────────────────

describe('HISTORY_VIEWED', () => {
  const data: HistoryViewedData = { ...BASE, filters: 'статус: closed' };

  it('заголовок содержит "История"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.HISTORY_VIEWED, data))).toContain('История');
  });

  it('показывает фильтры', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.HISTORY_VIEWED, data));
    const filtersField = fields.find(f => f.name === 'Фильтры');
    expect(filtersField?.value).toBe('статус: closed');
  });

  it('без фильтров — "Без фильтров"', () => {
    const dataNoFilter: HistoryViewedData = { ...BASE, filters: '' };
    const fields = getFields(buildAuditEmbed(AuditEventType.HISTORY_VIEWED, dataNoFilter));
    const filtersField = fields.find(f => f.name === 'Фильтры');
    expect(filtersField?.value).toBe('Без фильтров');
  });
});

// ─── НАСТРОЙКИ ────────────────────────────────────────────────────────────

describe('SETTINGS_UPDATED', () => {
  const data: SettingsUpdatedData = { ...BASE, changes: ['field: a → b'] };

  it('заголовок содержит "Настройки"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.SETTINGS_UPDATED, data))).toContain('Настройки');
  });
});

describe('LEADER_ROLE_ADDED / LEADER_ROLE_REMOVED', () => {
  const data: LeaderRoleAddedData = { ...BASE, roleId: 'r1' };

  it('ADDED: заголовок содержит "Лидерская роль" и "добавлена"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.LEADER_ROLE_ADDED, data));
    expect(title).toContain('Лидерская роль');
    expect(title).toContain('добавлена');
  });

  it('REMOVED: заголовок содержит "Лидерская роль" и "удалена"', () => {
    const dataRemoved: LeaderRoleRemovedData = { ...BASE, roleId: 'r1' };
    const title = getTitle(buildAuditEmbed(AuditEventType.LEADER_ROLE_REMOVED, dataRemoved));
    expect(title).toContain('Лидерская роль');
    expect(title).toContain('удалена');
  });
});

describe('CALLOUT_ROLE_ADDED / CALLOUT_ROLE_REMOVED', () => {
  const data: CalloutRoleData = { ...BASE, roleId: 'r2' };

  it('ADDED: заголовок содержит "каллаутов" и "добавлена"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.CALLOUT_ROLE_ADDED, data));
    expect(title).toContain('каллаутов');
    expect(title).toContain('добавлена');
  });

  it('REMOVED: заголовок содержит "каллаутов" и "удалена"', () => {
    const title = getTitle(buildAuditEmbed(AuditEventType.CALLOUT_ROLE_REMOVED, data));
    expect(title).toContain('каллаутов');
    expect(title).toContain('удалена');
  });
});

describe('AUDIT_LOG_CHANNEL_SET', () => {
  const data: AuditLogChannelSetData = { ...BASE, channelId: 'ch1' };

  it('заголовок содержит "Audit Log"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.AUDIT_LOG_CHANNEL_SET, data))).toContain('Audit Log');
  });

  it('поле канала — mention', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.AUDIT_LOG_CHANNEL_SET, data));
    const ch = fields.find(f => f.name === 'Канал');
    expect(ch?.value).toBe('<#ch1>');
  });
});

// ─── ТИПЫ ФРАКЦИЙ ─────────────────────────────────────────────────────────

describe('FACTION_TYPE_CREATED', () => {
  const data: FactionTypeCreatedData = { ...BASE, typeName: 'Emergency Services', description: 'ES dept' };

  it('заголовок содержит "создан"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.FACTION_TYPE_CREATED, data))).toContain('создан');
  });

  it('показывает описание если передано', () => {
    expect(fieldNames(buildAuditEmbed(AuditEventType.FACTION_TYPE_CREATED, data))).toContain('Описание');
  });

  it('не показывает описание если не передано', () => {
    const dataNoDesc: FactionTypeCreatedData = { ...data, description: undefined };
    expect(fieldNames(buildAuditEmbed(AuditEventType.FACTION_TYPE_CREATED, dataNoDesc))).not.toContain('Описание');
  });
});

describe('FACTION_TYPE_UPDATED', () => {
  const data: FactionTypeUpdatedData = { ...BASE, typeName: 'ES', changes: ['name: old → new'] };

  it('заголовок содержит "обновлен"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.FACTION_TYPE_UPDATED, data))).toContain('обновлен');
  });
});

describe('FACTION_TYPE_DELETED', () => {
  const data: FactionTypeDeletedData = { ...BASE, typeName: 'ES' };

  it('заголовок содержит "удален"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.FACTION_TYPE_DELETED, data))).toContain('удален');
  });
});

describe('TEMPLATE_ADDED', () => {
  const data: TemplateAddedData = { ...BASE, typeName: 'ES', templateName: 'Standard Unit' };

  it('заголовок содержит "Шаблон"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.TEMPLATE_ADDED, data))).toContain('Шаблон');
  });
});

// ─── СИСТЕМА ОДОБРЕНИЯ ────────────────────────────────────────────────────

describe('CHANGE_APPROVED', () => {
  const data: ChangeApprovedData = {
    ...BASE, changeType: 'create', factionName: 'LSPD', details: 'Add unit', reviewerName: 'Admin', reviewerId: 'admin1',
  };

  it('заголовок содержит "одобрено"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.CHANGE_APPROVED, data))).toContain('одобрено');
  });

  it('показывает кто одобрил — mention через reviewerId', () => {
    const fields = getFields(buildAuditEmbed(AuditEventType.CHANGE_APPROVED, data));
    const f = fields.find(f => f.name === 'Одобрил');
    expect(f?.value).toBe('<@admin1>');
  });

  it('показывает кто одобрил — имя если нет reviewerId', () => {
    const dataNoId: ChangeApprovedData = { ...data, reviewerId: undefined };
    const fields = getFields(buildAuditEmbed(AuditEventType.CHANGE_APPROVED, dataNoId));
    const f = fields.find(f => f.name === 'Одобрил');
    expect(f?.value).toBe('Admin');
  });
});

describe('CHANGE_REJECTED', () => {
  const data: ChangeRejectedData = {
    ...BASE, changeType: 'delete', factionName: 'FIB', details: 'Remove unit',
    reviewerName: 'Admin', reviewerId: 'admin1', reason: 'Not approved',
  };

  it('заголовок содержит "отклонено"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.CHANGE_REJECTED, data))).toContain('отклонено');
  });

  it('показывает причину отклонения', () => {
    expect(fieldNames(buildAuditEmbed(AuditEventType.CHANGE_REJECTED, data))).toContain('Причина отклонения');
  });
});

describe('CHANGE_CANCELLED', () => {
  const data: ChangeCancelledData = {
    ...BASE, changeType: 'update', factionName: 'LSPD', details: 'Update embed',
  };

  it('заголовок содержит "отменено"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.CHANGE_CANCELLED, data))).toContain('отменено');
  });
});

describe('SUBDIVISION_CREATE_REQUESTED / UPDATE_REQUESTED / DELETE_REQUESTED / EMBED_UPDATE_REQUESTED', () => {
  const data: ChangeRequestedData = {
    ...BASE, changeType: 'create', factionName: 'LSPD', details: 'Add unit', changeId: 1,
  };

  for (const eventType of [
    AuditEventType.SUBDIVISION_CREATE_REQUESTED,
    AuditEventType.SUBDIVISION_UPDATE_REQUESTED,
    AuditEventType.SUBDIVISION_DELETE_REQUESTED,
    AuditEventType.EMBED_UPDATE_REQUESTED,
  ]) {
    it(`${eventType}: заголовок содержит "Запрос"`, () => {
      expect(getTitle(buildAuditEmbed(eventType, data))).toContain('Запрос');
    });

    it(`${eventType}: показывает ID запроса`, () => {
      expect(fieldNames(buildAuditEmbed(eventType, data))).toContain('ID запроса');
    });
  }
});

// ─── PRESENCE ASSET ───────────────────────────────────────────────────────

describe('PRESENCE_ASSET_SET', () => {
  const data: PresenceAssetSetData = {
    ...BASE, subdivisionName: 'Patrol', factionName: 'LSPD', assetName: 'patrol_car',
  };

  it('заголовок содержит "Presence"', () => {
    expect(getTitle(buildAuditEmbed(AuditEventType.PRESENCE_ASSET_SET, data))).toContain('Presence');
  });

  it('null assetName → "(удалён)"', () => {
    const dataNull: PresenceAssetSetData = { ...data, assetName: null };
    const fields = getFields(buildAuditEmbed(AuditEventType.PRESENCE_ASSET_SET, dataNull));
    const assetField = fields.find(f => f.name === 'Asset Name');
    expect(assetField?.value).toBe('(удалён)');
  });
});

// ─── ОБЩЕЕ ────────────────────────────────────────────────────────────────

describe('Общие свойства embed', () => {
  it('footer содержит имя и ID пользователя', () => {
    const data: HistoryViewedData = { userId: 'uid123', userName: 'Alice', filters: '' };
    const embed = buildAuditEmbed(AuditEventType.HISTORY_VIEWED, data);
    const footer = embed.toJSON().footer?.text ?? '';
    expect(footer).toContain('Alice');
    expect(footer).toContain('uid123');
  });

  it('thumbnail устанавливается если передан', () => {
    const data: CalloutAutoClosedData = {
      userId: 'system', userName: 'Система',
      calloutId: 1, subdivisionName: 'Unit',
      thumbnailUrl: 'https://cdn.discordapp.com/emojis/123.png',
    };
    const embed = buildAuditEmbed(AuditEventType.CALLOUT_AUTO_CLOSED, data);
    expect(embed.toJSON().thumbnail?.url).toBe('https://cdn.discordapp.com/emojis/123.png');
  });

  it('thumbnail не устанавливается если не передан', () => {
    const data: HistoryViewedData = { ...BASE, filters: '' };
    const embed = buildAuditEmbed(AuditEventType.HISTORY_VIEWED, data);
    expect(embed.toJSON().thumbnail).toBeUndefined();
  });

  it('неизвестный event type → "Неизвестное событие"', () => {
    const data: HistoryViewedData = { ...BASE, filters: '' };
    const embed = buildAuditEmbed('totally_unknown' as AuditEventType, data);
    expect(getTitle(embed)).toContain('Неизвестное');
  });

  it('timestamp устанавливается (из data.timestamp или new Date)', () => {
    const fixedDate = new Date('2025-01-15T10:00:00Z');
    const data: HistoryViewedData = { ...BASE, filters: '', timestamp: fixedDate };
    const embed = buildAuditEmbed(AuditEventType.HISTORY_VIEWED, data);
    expect(embed.toJSON().timestamp).toBe(fixedDate.toISOString());
  });
});
