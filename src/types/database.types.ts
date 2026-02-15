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
}

export interface Department {
  id: number;
  server_id: number;
  name: string;
  description: string | null;
  general_leader_role_id: string;  // Общая лидерская роль (State Faction Leader)
  department_role_id: string;       // Роль конкретного департамента (LSPD, Sheriff, etc)
  allow_create_subdivisions: boolean; // Может ли лидер создавать подразделения (контроль администратора)
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDepartmentDTO {
  server_id: number;
  name: string;
  description?: string;
  general_leader_role_id: string;
  department_role_id: string;
  allow_create_subdivisions?: boolean;
}

export interface UpdateDepartmentDTO {
  name?: string;
  description?: string;
  general_leader_role_id?: string;
  department_role_id?: string;
  allow_create_subdivisions?: boolean;
  is_active?: boolean;
}

export interface Callout {
  id: number;
  server_id: number;
  subdivision_id: number;
  author_id: string;
  author_name: string;
  description: string;
  location: string | null;
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
  department_id: number;
  server_id: number;
  name: string;
  description: string | null;
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
  department_id: number;
  server_id: number;
  name: string;
  description?: string;
  discord_role_id?: string;
}

export interface UpdateSubdivisionDTO {
  name?: string;
  description?: string;
  discord_role_id?: string;
  vk_chat_id?: string | null;
  telegram_chat_id?: string | null;
  is_accepting_callouts?: boolean;
  is_active?: boolean;
  // Embed настройки
  embed_author_name?: string;
  embed_author_url?: string;
  embed_author_icon_url?: string;
  embed_title?: string;
  embed_description?: string;
  embed_color?: string;
  embed_image_url?: string;
  embed_thumbnail_url?: string;
  embed_footer_text?: string;
  embed_footer_icon_url?: string;
}

// ============ VERIFICATION TOKENS ============

export type Platform = 'vk' | 'telegram';

export interface VerificationToken {
  id: number;
  server_id: number;
  subdivision_id: number;
  token: string;
  platform: Platform;
  created_by: string;              // Discord user ID лидера
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

// Расширенная информация о департаменте с подразделениями
export interface DepartmentWithSubdivisions extends Department {
  subdivisions: Subdivision[];
}

// Расширенная информация о подразделении с департаментом
export interface SubdivisionWithDepartment extends Subdivision {
  department: Department;
}
