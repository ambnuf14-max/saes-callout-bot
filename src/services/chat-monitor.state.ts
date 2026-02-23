/**
 * Состояние активного захвата сообщений после каллаута.
 * Ключ: `"vk:{chatId}"` или `"telegram:{chatId}"`
 *
 * Хранится очередь: если пришёл новый каллаут пока предыдущий ещё захватывает —
 * он ставится в очередь и начнётся после завершения текущего.
 */
export interface ActiveCaptureEntry {
  calloutId: number;
  subdivisionId: number;
  remaining: number; // сколько ещё сообщений нужно захватить
}

export const activeCaptureState = new Map<string, ActiveCaptureEntry[]>();
