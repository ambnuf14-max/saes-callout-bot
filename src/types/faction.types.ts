/**
 * Типы для работы с лидерской панелью
 */

export interface LeadershipCheck {
  isLeader: boolean;
  factionId: number | null;
  factionName: string | null;
}

export interface VerificationInstructions {
  token: string;
  subdivisionName: string;
  expiresAt: Date;
  commandText: string;  // Готовая строка для копирования: "/verify ABC123"
}

export enum LeaderPanelAction {
  VIEW_SUBDIVISIONS = 'view_subdivisions',
  ADD_SUBDIVISION = 'add_subdivision',
  EDIT_SUBDIVISION = 'edit_subdivision',
  DELETE_SUBDIVISION = 'delete_subdivision',
  LINK_VK_CHAT = 'link_vk_chat',
  TOGGLE_CALLOUTS = 'toggle_callouts',
  BACK_TO_MAIN = 'back_to_main',
}

export interface LeaderPanelState {
  userId: string;
  factionId: number;
  currentAction: LeaderPanelAction | null;
  selectedSubdivisionId: number | null;
}
