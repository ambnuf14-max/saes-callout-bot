/**
 * In-memory хранилище ожидания выдачи прав администратора перед верификацией VK беседы
 * Ключ: peerId (строка)
 */
export interface PendingVkVerifyEntry {
  token: string;
  chatTitle: string;
  promptMessageId?: number;
}

export const pendingVkVerifyState = new Map<string, PendingVkVerifyEntry>();
