/**
 * In-memory хранилище состояния ожидания причины отклонения (VK/TG)
 * Ключ: `${platform}:${userId}`
 */
export interface PendingDeclineEntry {
  calloutId: number;
  subdivisionId: number;
  platform: 'vk' | 'telegram';
  chatId: string;
  timeout: NodeJS.Timeout;
  /** ID сообщения-запроса причины (для редактирования после ввода) */
  promptMessageId?: number;
}

export const pendingDeclineReasonState = new Map<string, PendingDeclineEntry>();
