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
}

export interface UpdateDepartmentDTO {
  name?: string;
  description?: string;
  general_leader_role_id?: string;
  department_role_id?: string;
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
  status?: 'active' | 'closed' | 'cancelled';
  closed_by?: string;
  closed_reason?: string;
  closed_at?: string;
}

export interface CalloutResponse {
  id: number;
  callout_id: number;
  subdivision_id: number;
  vk_user_id: string;
  vk_user_name: string;
  response_type: 'acknowledged' | 'on_way' | 'arrived';
  message: string | null;
  created_at: string;
}

export interface CreateCalloutResponseDTO {
  callout_id: number;
  subdivision_id: number;
  vk_user_id: string;
  vk_user_name: string;
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
  is_accepting_callouts: boolean;
  is_active: boolean;
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
  vk_chat_id?: string;
  is_accepting_callouts?: boolean;
  is_active?: boolean;
}

// ============ VK VERIFICATION ============

export interface VkVerificationToken {
  id: number;
  server_id: number;
  subdivision_id: number;
  token: string;
  created_by: string;              // Discord user ID лидера
  expires_at: string;
  is_used: boolean;
  used_at: string | null;
  vk_peer_id: string | null;       // Заполняется при успешной верификации
  created_at: string;
}

export interface CreateVerificationTokenDTO {
  server_id: number;
  subdivision_id: number;
  created_by: string;
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
