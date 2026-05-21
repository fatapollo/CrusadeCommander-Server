import { api } from './client';
import type {
  Battle, BattleHonour, BattleScar, Campaign, CampaignInvite, CampaignMember, CrusadeForce, Unit, UnitBattleRecord, User,
  BattleSize, BattleOutcome, OutOfActionResult, HonourCategory, RelicCategory, BattleScarName, CampaignRole,
} from '../types';

export const authApi = {
  me: () => api.get<{ user: User; config_meta?: { admin_passcode_enabled: boolean } }>('/api/auth/me'),
  config: () => api.get<{ admin_passcode_enabled: boolean }>('/api/auth/config'),
  login: (email: string, password: string) => api.post<{ user: User }>('/api/auth/login', { email, password }),
  register: (email: string, password: string, display_name: string, admin_passcode?: string) =>
    api.post<{ user: User }>('/api/auth/register', { email, password, display_name, ...(admin_passcode ? { admin_passcode } : {}) }),
  logout: () => api.post<void>('/api/auth/logout'),
};

export const campaignsApi = {
  list: () => api.get<{ campaigns: Campaign[] }>('/api/campaigns'),
  get: (id: string) => api.get<{ campaign: Campaign; role: CampaignRole }>(`/api/campaigns/${id}`),
  create: (input: { name: string; description?: string; phase_label?: string; default_battle_size?: BattleSize }) =>
    api.post<{ campaign: Campaign }>('/api/campaigns', input),
  update: (id: string, patch: Partial<Campaign>) => api.patch<{ campaign: Campaign }>(`/api/campaigns/${id}`, patch),
  remove: (id: string) => api.del<void>(`/api/campaigns/${id}`),
  members: (id: string) => api.get<{ members: CampaignMember[] }>(`/api/campaigns/${id}/members`),
  removeMember: (id: string, userId: string) => api.del<void>(`/api/campaigns/${id}/members/${userId}`),
  setMemberRole: (id: string, userId: string, role: 'admin' | 'participant') =>
    api.patch<{ role: string }>(`/api/campaigns/${id}/members/${userId}`, { role }),
  start: (id: string) => api.post<{ campaign: Campaign }>(`/api/campaigns/${id}/start`),
  conclude: (id: string) => api.post<{ campaign: Campaign }>(`/api/campaigns/${id}/conclude`),
  reopen: (id: string) => api.post<{ campaign: Campaign }>(`/api/campaigns/${id}/reopen`),
  setPhases: (id: string, phases: import('../types').CampaignPhase[]) =>
    api.put<{ campaign: Campaign }>(`/api/campaigns/${id}/phases`, { phases }),
  setSectorMap: (id: string, map: import('../types').SectorMap) =>
    api.put<{ campaign: Campaign }>(`/api/campaigns/${id}/map`, map),
};

export const invitesApi = {
  list: (campaignId: string) => api.get<{ invites: CampaignInvite[] }>(`/api/campaigns/${campaignId}/invites`),
  create: (campaignId: string, input: { role_on_accept?: 'admin' | 'participant'; label?: string; max_uses?: number; expires_in_hours?: number | null }) =>
    api.post<{ invite: CampaignInvite }>(`/api/campaigns/${campaignId}/invites`, input),
  remove: (campaignId: string, inviteId: string) => api.del<void>(`/api/campaigns/${campaignId}/invites/${inviteId}`),
  preview: (code: string) =>
    api.get<{ campaign: { id: string; name: string; description: string }; role: 'admin' | 'participant'; label: string; remaining_uses: number }>(`/api/invites/${code}`),
  accept: (code: string) =>
    api.post<{ campaign_id: string; role: string; already_member: boolean }>(`/api/invites/${code}/accept`),
};

export const forcesApi = {
  list: (campaignId: string) => api.get<{ forces: CrusadeForce[] }>(`/api/campaigns/${campaignId}/forces`),
  get: (campaignId: string, forceId: string) => api.get<{ force: CrusadeForce }>(`/api/campaigns/${campaignId}/forces/${forceId}`),
  create: (campaignId: string, input: Partial<CrusadeForce>) =>
    api.post<{ force: CrusadeForce }>(`/api/campaigns/${campaignId}/forces`, input),
  update: (campaignId: string, forceId: string, patch: Partial<CrusadeForce>) =>
    api.patch<{ force: CrusadeForce }>(`/api/campaigns/${campaignId}/forces/${forceId}`, patch),
  remove: (campaignId: string, forceId: string) =>
    api.del<void>(`/api/campaigns/${campaignId}/forces/${forceId}`),
  drop: (campaignId: string, forceId: string) =>
    api.post<{ force: CrusadeForce }>(`/api/campaigns/${campaignId}/forces/${forceId}/drop`),
  rejoin: (campaignId: string, forceId: string) =>
    api.post<{ force: CrusadeForce }>(`/api/campaigns/${campaignId}/forces/${forceId}/rejoin`),
};

export const unitsApi = {
  list: (campaignId: string, forceId: string) =>
    api.get<{ units: Unit[] }>(`/api/campaigns/${campaignId}/forces/${forceId}/units`),
  get: (campaignId: string, unitId: string) =>
    api.get<{ unit: Unit; honours: BattleHonour[]; scars: BattleScar[]; honour_available: number }>(`/api/campaigns/${campaignId}/units/${unitId}`),
  create: (campaignId: string, forceId: string, input: Partial<Unit>) =>
    api.post<{ unit: Unit }>(`/api/campaigns/${campaignId}/forces/${forceId}/units`, input),
  update: (campaignId: string, unitId: string, patch: Partial<Unit>) =>
    api.patch<{ unit: Unit }>(`/api/campaigns/${campaignId}/units/${unitId}`, patch),
  remove: (campaignId: string, unitId: string) =>
    api.del<void>(`/api/campaigns/${campaignId}/units/${unitId}`),
  import: (campaignId: string, forceId: string, input: { format: 'newrecruit_text'; text: string; dry_run?: boolean }) =>
    api.post<{ parsed: { faction: string | null; detachment: string | null; total_points: number | null; units: Array<{ name: string; datasheet: string; points_cost: number; equipment: string; is_character: boolean; is_epic_hero: boolean; is_titanic: boolean; notes: string }> }; created: Unit[] | null }>(
      `/api/campaigns/${campaignId}/forces/${forceId}/units/import`, input
    ),
  addHonour: (campaignId: string, unitId: string, input: {
    category: HonourCategory; name: string; description?: string; weapon_name?: string; relic_category?: RelicCategory | null;
  }) => api.post<{ honour: BattleHonour }>(`/api/campaigns/${campaignId}/units/${unitId}/honours`, input),
  removeHonour: (campaignId: string, unitId: string, honourId: string) =>
    api.del<void>(`/api/campaigns/${campaignId}/units/${unitId}/honours/${honourId}`),
  addScar: (campaignId: string, unitId: string, input: { name: BattleScarName; description?: string }) =>
    api.post<{ scar: BattleScar }>(`/api/campaigns/${campaignId}/units/${unitId}/scars`, input),
  removeScar: (campaignId: string, unitId: string, scarId: string) =>
    api.del<void>(`/api/campaigns/${campaignId}/units/${unitId}/scars/${scarId}`),
};

export interface UnitBattleInput {
  unit_id: string;
  was_warlord?: boolean;
  enemies_destroyed?: number;
  was_destroyed?: boolean;
  marked_for_greatness?: boolean;
  ooa_result?: OutOfActionResult | null;
  notes?: string;
  grant_honour?: {
    category: 'Battle Trait' | 'Weapon Modification' | 'Crusade Relic' | 'Enhancement';
    name: string;
    description?: string;
    weapon_name?: string;
    relic_category?: 'Artificer' | 'Antiquity' | 'Legendary' | null;
  };
  grant_scar?: string;
}

export const battlesApi = {
  list: (campaignId: string) => api.get<{ battles: Battle[] }>(`/api/campaigns/${campaignId}/battles`),
  get: (campaignId: string, battleId: string) =>
    api.get<{ battle: Battle; records: UnitBattleRecord[] }>(`/api/campaigns/${campaignId}/battles/${battleId}`),
  create: (campaignId: string, input: {
    battle_size: BattleSize; mission_name?: string;
    deployment?: string; duration_turns?: number; opposing_commander?: string;
    attacker_force_id: string; defender_force_id: string;
    outcome: BattleOutcome; attacker_score?: number; defender_score?: number;
    notes?: string;
    attacker_units?: UnitBattleInput[]; defender_units?: UnitBattleInput[];
    contesting_node_id?: string | null;
    claim_node_on_win?: boolean;
  }) => api.post<{ battle: Battle; records: UnitBattleRecord[]; needs_confirmation: boolean }>(`/api/campaigns/${campaignId}/battles`, input),
  confirm: (campaignId: string, battleId: string) =>
    api.post<{ battle: Battle; records: UnitBattleRecord[] }>(`/api/campaigns/${campaignId}/battles/${battleId}/confirm`),
  dispute: (campaignId: string, battleId: string, reason: string) =>
    api.post<{ battle: Battle }>(`/api/campaigns/${campaignId}/battles/${battleId}/dispute`, { reason }),
  remove: (campaignId: string, battleId: string) =>
    api.del<void>(`/api/campaigns/${campaignId}/battles/${battleId}`),
};

export const requisitionsApi = {
  log: (campaignId: string, forceId: string) =>
    api.get<{ log: any[] }>(`/api/campaigns/${campaignId}/requisitions/${forceId}/log`),
  increaseSupplyLimit: (campaignId: string, forceId: string) =>
    api.post(`/api/campaigns/${campaignId}/requisitions/${forceId}/increase-supply-limit`),
  renownedHeroes: (campaignId: string, forceId: string, input: { unit_id: string; enhancement_name: string; description?: string }) =>
    api.post(`/api/campaigns/${campaignId}/requisitions/${forceId}/renowned-heroes`, input),
  legendaryVeterans: (campaignId: string, forceId: string, unit_id: string) =>
    api.post(`/api/campaigns/${campaignId}/requisitions/${forceId}/legendary-veterans`, { unit_id }),
  rearmAndResupply: (campaignId: string, forceId: string, input: { unit_id: string; new_equipment: string; new_points_cost?: number }) =>
    api.post(`/api/campaigns/${campaignId}/requisitions/${forceId}/rearm-and-resupply`, input),
  repairAndRecuperate: (campaignId: string, forceId: string, input: { unit_id: string; scar_id: string }) =>
    api.post(`/api/campaigns/${campaignId}/requisitions/${forceId}/repair-and-recuperate`, input),
  freshRecruits: (campaignId: string, forceId: string, input: { unit_id: string; added_points: number }) =>
    api.post(`/api/campaigns/${campaignId}/requisitions/${forceId}/fresh-recruits`, input),
};

export interface AdminUser {
  id: string; email: string; display_name: string;
  is_site_admin: boolean; created_at: string;
  owned_campaigns: number; member_campaigns: number; force_count: number;
}
export interface AdminCampaign {
  id: string; name: string; state: string; default_battle_size: string;
  current_phase: number; created_at: string;
  owner_id: string; owner_email: string; owner_name: string;
  force_count: number; member_count: number; battle_count: number;
}

export const adminApi = {
  getSettings: () => api.get<{ settings: Record<string, any>; schema: Record<string, any> }>('/api/admin/settings'),
  updateSettings: (patch: Record<string, any>) => api.patch<{ settings: Record<string, any> }>('/api/admin/settings', patch),
  listUsers: () => api.get<{ users: AdminUser[] }>('/api/admin/users'),
  getUser: (id: string) => api.get<{ user: AdminUser; owned_campaigns: any[]; member_campaigns: any[] }>(`/api/admin/users/${id}`),
  updateUser: (id: string, patch: { display_name?: string; is_site_admin?: boolean }) =>
    api.patch<{ user: AdminUser }>(`/api/admin/users/${id}`, patch),
  resetPassword: (id: string, new_password?: string) =>
    api.post<{ ok: boolean; temporary_password: string | null }>(`/api/admin/users/${id}/reset-password`, new_password ? { new_password } : {}),
  deleteUser: (id: string) => api.del<void>(`/api/admin/users/${id}`),
  listCampaigns: () => api.get<{ campaigns: AdminCampaign[] }>('/api/admin/campaigns'),
  deleteCampaign: (id: string) => api.del<void>(`/api/admin/campaigns/${id}`),
  transferCampaign: (id: string, new_owner_id: string) =>
    api.post<{ campaign: any }>(`/api/admin/campaigns/${id}/transfer`, { new_owner_id }),
  createInvite: (campaignId: string, input: { role_on_accept?: 'admin' | 'participant'; label?: string; max_uses?: number; expires_in_hours?: number | null }) =>
    api.post<{ invite: any }>(`/api/admin/campaigns/${campaignId}/invites`, input),
};
