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
  discord_role_id: string;
  vk_chat_id: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDepartmentDTO {
  server_id: number;
  name: string;
  discord_role_id: string;
  vk_chat_id: string;
  description?: string;
}

export interface UpdateDepartmentDTO {
  name?: string;
  discord_role_id?: string;
  vk_chat_id?: string;
  description?: string;
  is_active?: boolean;
}

export interface Callout {
  id: number;
  server_id: number;
  department_id: number;
  author_id: string;
  author_name: string;
  description: string;
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
  department_id: number;
  author_id: string;
  author_name: string;
  description: string;
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
  department_id: number;
  vk_user_id: string;
  vk_user_name: string;
  response_type: 'acknowledged' | 'on_way' | 'arrived';
  message: string | null;
  created_at: string;
}

export interface CreateCalloutResponseDTO {
  callout_id: number;
  department_id: number;
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
