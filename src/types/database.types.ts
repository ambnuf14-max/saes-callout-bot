/**
 * Типы для базы данных
 */

export interface Server {
  id: number;
  guild_id: string;
  callout_channel_id: string | null;
  callout_message_id: string | null;
  category_id: string | null;
  leader_role_ids: string | null; // JSON string array
  audit_log_channel_id: string | null;
  callout_allowed_role_ids: string | null; // JSON string array
  bot_created_channel: number; // 0 или 1 (boolean в SQLite)
  bot_created_category: number; // 0 или 1 (boolean в SQLite)
  created_at: string;
  updated_at: string;
}

export interface CreateServerDTO {
  guild_id: string;
  callout_channel_id?: string;
  callout_message_id?: string;
  category_id?: string;
  leader_role_ids?: string[];
}

export interface UpdateServerDTO {
  callout_channel_id?: string;
  callout_message_id?: string;
  category_id?: string;
  leader_role_ids?: string[];
  audit_log_channel_id?: string;
  callout_allowed_role_ids?: string[];
  bot_created_channel?: number;
  bot_created_category?: number;
}

export interface Faction {
  id: number;
  server_id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  general_leader_role_id: string;  // Общая лидерская роль (State Faction Leader)
  faction_role_id: string;       // Роль конкретной фракции (LSPD, Sheriff, etc)
  allow_create_subdivisions: boolean; // Может ли лидер создавать подразделения (контроль администратора)
  faction_type_id: number | null; // Тип фракции (nullable)
  is_active: boolean;
  standalone_needs_setup: boolean; // Флаг: требуется настройка после перехода в standalone режим
  created_at: string;
  updated_at: string;
}

export interface CreateFactionDTO {
  server_id: number;
  name: string;
  description?: string;
  logo_url?: string;
  general_leader_role_id: string;
  faction_role_id: string;
  allow_create_subdivisions?: boolean;
}

export interface UpdateFactionDTO {
  name?: string;
  description?: string;
  logo_url?: string | null;
  general_leader_role_id?: string;
  faction_role_id?: string;
  allow_create_subdivisions?: boolean;
  is_active?: boolean;
  standalone_needs_setup?: boolean;
}

export interface Callout {
  id: number;
  server_id: number;
  subdivision_id: number;
  author_id: string;
  author_name: string;
  description: string;
  brief_description: string | null;
  location: string | null;
  tac_channel: string | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
  vk_message_id: string | null;
  telegram_message_id: string | null;
  status: 'active' | 'closed' | 'cancelled';
  closed_by: string | null;
  closed_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface CreateCalloutDTO {
  server_id: number;
  subdivision_id: number;
  author_id: string;
  author_name: string;
  description: string;
  location?: string;
  tac_channel?: string;
  brief_description?: string;
  author_faction_name?: string; // не хранится в БД, только для уведомлений
}

export interface UpdateCalloutDTO {
  discord_channel_id?: string;
  discord_message_id?: string;
  vk_message_id?: string;
  telegram_message_id?: string;
  status?: 'active' | 'closed' | 'cancelled';
  closed_by?: string;
  closed_reason?: string;
  closed_at?: string;
}

export interface CalloutResponse {
  id: number;
  callout_id: number;
  subdivision_id: number;
  vk_user_id: string;              // Сохраняем для обратной совместимости
  vk_user_name: string;            // Сохраняем для обратной совместимости
  response_type: 'acknowledged' | 'on_way' | 'arrived';
  message: string | null;
  created_at: string;
}

export interface CreateCalloutResponseDTO {
  callout_id: number;
  subdivision_id: number;
  vk_user_id: string;              // Используется как user_id для обеих платформ
  vk_user_name: string;            // Используется как user_name для обеих платформ
  response_type?: 'acknowledged' | 'on_way' | 'arrived';
  message?: string;
}

export interface CalloutRateLimit {
  id: number;
  user_id: string;
  server_id: number;
  last_callout_at: string;
  created_at: string;
  updated_at: string;
}

// ============ SUBDIVISIONS ============

export interface Subdivision {
  id: number;
  faction_id: number;
  server_id: number;
  name: string;
  description: string | null;
  short_description: string | null;
  logo_url: string | null;
  discord_role_id: string | null;
  vk_chat_id: string | null;
  telegram_chat_id: string | null;
  is_accepting_callouts: boolean;
  is_active: boolean;
  is_default: boolean;
  // Embed настройки
  embed_author_name: string | null;
  embed_author_url: string | null;
  embed_author_icon_url: string | null;
  embed_title: string | null;
  embed_title_url: string | null;
  embed_description: string | null;
  embed_color: string | null;
  embed_image_url: string | null;
  embed_thumbnail_url: string | null;
  embed_footer_text: string | null;
  embed_footer_icon_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSubdivisionDTO {
  faction_id: number;
  server_id: number;
  name: string;
  description?: string;
  discord_role_id?: string;
}

export interface UpdateSubdivisionDTO {
  name?: string;
  description?: string;
  short_description?: string | null;
  logo_url?: string | null;
  discord_role_id?: string | null;
  vk_chat_id?: string | null;
  telegram_chat_id?: string | null;
  is_accepting_callouts?: boolean;
  is_active?: boolean;
  // Embed настройки
  embed_author_name?: string | null;
  embed_author_url?: string | null;
  embed_author_icon_url?: string | null;
  embed_title?: string | null;
  embed_title_url?: string | null;
  embed_description?: string | null;
  embed_color?: string | null;
  embed_image_url?: string | null;
  embed_thumbnail_url?: string | null;
  embed_footer_text?: string | null;
  embed_footer_icon_url?: string | null;
}

// ============ VERIFICATION TOKENS ============

export type Platform = 'vk' | 'telegram';

export interface VerificationToken {
  id: number;
  server_id: number;
  subdivision_id: number;
  token: string;
  platform: Platform;
  created_by: string;              // Discord user ID лидера фракции
  expires_at: string;
  is_used: boolean;
  used_at: string | null;
  chat_id: string | null;          // VK peer_id или Telegram chat_id
  discord_channel_id: string | null;  // Discord канал для редактирования сообщения
  discord_message_id: string | null;  // Discord сообщение для редактирования
  discord_interaction_token: string | null;  // Interaction token для webhook edit
  discord_application_id: string | null;     // Application ID для webhook edit
  created_at: string;
}

// Для обратной совместимости с существующим кодом VK
export interface VkVerificationToken extends VerificationToken {
  vk_peer_id: string | null;
}

export interface CreateVerificationTokenDTO {
  server_id: number;
  subdivision_id: number;
  created_by: string;
  platform?: Platform;              // По умолчанию 'vk' для обратной совместимости
}

// ============ EXTENDED TYPES ============

// Расширенная информация о фракции с подразделениями
export interface FactionWithSubdivisions extends Faction {
  subdivisions: Subdivision[];
}

// Расширенная информация о подразделении с фракцией
export interface SubdivisionWithFaction extends Subdivision {
  faction: Faction;
}

// ============ FACTION TYPES ============

export interface FactionType {
  id: number;
  server_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFactionTypeDTO {
  server_id: number;
  name: string;
  description?: string;
}

export interface UpdateFactionTypeDTO {
  name?: string;
  description?: string;
  is_active?: boolean;
}

// ============ SUBDIVISION TEMPLATES ============

export interface SubdivisionTemplate {
  id: number;
  faction_type_id: number;
  name: string;
  description: string | null;
  short_description: string | null;
  logo_url: string | null;
  discord_role_id: string | null;
  embed_author_name: string | null;
  embed_author_url: string | null;
  embed_author_icon_url: string | null;
  embed_title: string | null;
  embed_title_url: string | null;
  embed_description: string | null;
  embed_color: string | null;
  embed_image_url: string | null;
  embed_thumbnail_url: string | null;
  embed_footer_text: string | null;
  embed_footer_icon_url: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSubdivisionTemplateDTO {
  faction_type_id?: number; // Опционально, может быть задан в методе
  name: string;
  description?: string;
  display_order?: number;
  discord_role_id?: string;
  // Все embed поля опциональны
  embed_author_name?: string;
  embed_author_url?: string;
  embed_author_icon_url?: string;
  embed_title?: string;
  embed_title_url?: string;
  embed_description?: string;
  embed_color?: string;
  embed_image_url?: string;
  embed_thumbnail_url?: string;
  embed_footer_text?: string;
  embed_footer_icon_url?: string;
}

export interface UpdateSubdivisionTemplateDTO {
  name?: string;
  description?: string;
  short_description?: string | null;
  logo_url?: string | null;
  discord_role_id?: string | null;
  display_order?: number;
  embed_author_name?: string;
  embed_author_url?: string;
  embed_author_icon_url?: string;
  embed_title?: string;
  embed_title_url?: string;
  embed_description?: string;
  embed_color?: string;
  embed_image_url?: string;
  embed_thumbnail_url?: string;
  embed_footer_text?: string;
  embed_footer_icon_url?: string;
}

// ============ PENDING CHANGES ============

export type ChangeType =
  | 'create_subdivision'
  | 'update_subdivision'
  | 'delete_subdivision'
  | 'update_embed'
  | 'update_faction';

export type ChangeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface PendingChange {
  id: number;
  server_id: number;
  faction_id: number;
  subdivision_id: number | null;
  change_type: ChangeType;
  requested_by: string;
  requested_at: string;
  status: ChangeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  change_data: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface CreatePendingChangeDTO {
  server_id: number;
  faction_id: number;
  subdivision_id?: number;
  change_type: ChangeType;
  requested_by: string;
  change_data: object; // Будет JSON.stringify
}

// Helper types для работы с change_data
export interface CreateSubdivisionChangeData {
  name: string;
  description?: string;
}

export interface UpdateSubdivisionChangeData {
  name?: string;
  description?: string;
  short_description?: string | null;
  logo_url?: string | null;
  discord_role_id?: string | null;
}

export interface DeleteSubdivisionChangeData {
  subdivision_name: string;
}

export interface UpdateFactionChangeData {
  name?: string;
  logo_url?: string | null;
}

export interface UpdateEmbedChangeData {
  name?: string;
  embed_author_name?: string | null;
  embed_author_url?: string | null;
  embed_author_icon_url?: string | null;
  embed_title?: string | null;
  embed_description?: string | null;
  embed_color?: string | null;
  embed_image_url?: string | null;
  embed_thumbnail_url?: string | null;
  embed_footer_text?: string | null;
  embed_footer_icon_url?: string | null;
  // Настройки подразделения (могут быть изменены вместе с embed)
  short_description?: string | null;
  logo_url?: string | null;
  discord_role_id?: string | null;
}

// ============ EXTENDED TYPES FOR NEW FEATURES ============

export interface FactionTypeWithTemplates extends FactionType {
  templates: SubdivisionTemplate[];
}

export interface PendingChangeWithDetails extends PendingChange {
  faction_name: string;
  subdivision_name?: string;
  requester_name?: string;
  parsed_data: CreateSubdivisionChangeData | UpdateSubdivisionChangeData | DeleteSubdivisionChangeData | UpdateEmbedChangeData;
}
