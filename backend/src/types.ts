// Domain types — aligned with Warhammer 40k Crusade rules.

export type UUID = string;

export type BattleSize = 'Incursion' | 'Strike Force' | 'Onslaught';
export const BATTLE_SIZE_POINTS: Record<BattleSize, number> = {
  'Incursion': 1000,
  'Strike Force': 2000,
  'Onslaught': 3000,
};

export type Rank = 'Battle-ready' | 'Blooded' | 'Battle-hardened' | 'Heroic' | 'Legendary';
export type HonourCategory = 'Battle Trait' | 'Weapon Modification' | 'Crusade Relic' | 'Enhancement';
export type RelicCategory = 'Artificer' | 'Antiquity' | 'Legendary';
export type BattleOutcome = 'Attacker Wins' | 'Defender Wins' | 'Draw';
export type BattleScarName = 'Crippling Damage' | 'Battle-weary' | 'Fatigued' | 'Disgraced' | 'Mark of Shame' | 'Deep Scars';
export type OutOfActionResult = 'passed' | 'devastating_blow' | 'battle_scar';

export interface User {
  id: UUID;
  email: string;
  display_name: string;
  created_at: string;
  is_site_admin: boolean;
}

export type CampaignState = 'setup' | 'active' | 'concluded';

export interface Campaign {
  id: UUID;
  owner_id: UUID;
  name: string;
  description: string;
  is_active: boolean; // legacy — derived from state !== 'concluded'
  state: CampaignState;
  started_at: string | null;
  concluded_at: string | null;
  current_phase: number;
  phase_label: string;
  default_battle_size: BattleSize;
  created_at: string;
  updated_at: string;
}

export interface CrusadeForce {
  id: UUID;
  campaign_id: UUID;
  user_id: UUID | null;
  name: string;
  player_name: string;
  faction: string;
  team: string;
  color_hex: string;
  supply_limit: number;
  requisition_points: number;
  battle_tally: number;
  victories: number;
  notes: string;
  is_active: boolean;
  dropped_at: string | null;
  created_at: string;
}

export interface Unit {
  id: UUID;
  force_id: UUID;
  name: string;
  datasheet: string;
  points_cost: number;
  equipment: string;
  is_character: boolean;
  is_titanic: boolean;
  is_epic_hero: boolean;
  is_fortification: boolean;
  is_swarm: boolean;
  xp: number;
  crusade_points: number;
  battles_played: number;
  battles_survived: number;
  units_destroyed: number;
  can_exceed_30_xp: boolean;
  is_active: boolean;
  notes: string;
  created_at: string;
}

export interface BattleHonour {
  id: UUID;
  unit_id: UUID;
  category: HonourCategory;
  name: string;
  description: string;
  weapon_name: string;
  relic_category: RelicCategory | null;
  crusade_points_value: number;
  earned_at: string;
}

export interface BattleScar {
  id: UUID;
  unit_id: UUID;
  name: BattleScarName;
  description: string;
  earned_at: string;
}

export type BattleStatus = 'pending' | 'confirmed' | 'disputed' | 'cancelled';

export interface Battle {
  id: UUID;
  campaign_id: UUID;
  battle_size: BattleSize;
  mission_name: string;
  attacker_force_id: UUID;
  defender_force_id: UUID;
  outcome: BattleOutcome;
  notes: string;
  campaign_phase: number;
  occurred_at: string;
  status: BattleStatus;
  submitted_by_user_id: UUID | null;
  confirmed_by_user_id: UUID | null;
  confirmed_at: string | null;
  dispute_reason: string;
}

export interface UnitBattleRecord {
  id: UUID;
  battle_id: UUID;
  unit_id: UUID;
  force_id: UUID;
  was_warlord: boolean;
  enemies_destroyed: number;
  was_destroyed: boolean;
  marked_for_greatness: boolean;
  xp_gained: number;
  ooa_result: OutOfActionResult | null;
  notes: string;
}

export interface RequisitionLogEntry {
  id: UUID;
  force_id: UUID;
  requisition_name: string;
  cost_paid: number;
  target_unit_id: UUID | null;
  notes: string;
  used_at: string;
}

/** Determines a unit's current rank from its XP and Character keyword (+ Legendary Veterans). */
export function rankForXP(xp: number, isCharacter: boolean, canExceed30: boolean): Rank {
  if (xp <= 5) return 'Battle-ready';
  if (xp <= 15) return 'Blooded';
  if (xp <= 30) return 'Battle-hardened';
  if (xp <= 50) return (isCharacter || canExceed30) ? 'Heroic' : 'Battle-hardened';
  return (isCharacter || canExceed30) ? 'Legendary' : 'Battle-hardened';
}

/** Per-rule XP cap (only Characters/Legendary-Veterans can go past 30). */
export function xpCap(isCharacter: boolean, canExceed30: boolean): number {
  return (isCharacter || canExceed30) ? Infinity : 30;
}

/** Maximum battle honours: 3 for normal units, 6 for Characters or LV-promoted units. */
export function maxBattleHonours(isCharacter: boolean, canExceed30: boolean): number {
  return (isCharacter || canExceed30) ? 6 : 3;
}

/** XP thresholds that trigger a rank-up (exclusive lower → inclusive upper). */
export const RANK_THRESHOLDS = [
  { rank: 'Battle-ready'    as Rank, min: 0,  max: 5 },
  { rank: 'Blooded'         as Rank, min: 6,  max: 15 },
  { rank: 'Battle-hardened' as Rank, min: 16, max: 30 },
  { rank: 'Heroic'          as Rank, min: 31, max: 50 },
  { rank: 'Legendary'       as Rank, min: 51, max: Infinity },
];

export const BATTLE_SCARS: BattleScarName[] = [
  'Crippling Damage', 'Battle-weary', 'Fatigued', 'Disgraced', 'Mark of Shame', 'Deep Scars',
];

export const BATTLE_SCAR_DESCRIPTIONS: Record<BattleScarName, string> = {
  'Crippling Damage': 'This unit cannot Advance; subtract 1" from the Move characteristic of models in this unit.',
  'Battle-weary': 'Subtract 1 from Battle-shock, Leadership, Desperate Escape and Out of Action tests.',
  'Fatigued': 'Subtract 1 from Objective Control; this unit never receives a Charge bonus.',
  'Disgraced': 'Cannot be affected by Stratagems; cannot be Marked for Greatness.',
  'Mark of Shame': 'Cannot form an Attached unit; unaffected by friendly Auras; cannot be Marked for Greatness.',
  'Deep Scars': 'Each Critical Hit scored against this unit automatically wounds.',
};
