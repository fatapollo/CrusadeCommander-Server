// Pure helpers for the cosmetic Sector Map. No data fetching here; the
// primitives consume already-resolved owners/colours so they stay drop-in.

import type { CrusadeForce, NodeOwner, NodeType, SectorNode } from '../../types';

// Owners[] is parallel to campaign.phases (1-based phase index). Reading
// returns the most recent owner at-or-before `phase`, carrying forward.
export function ownerAtPhase(node: SectorNode, phase: number): NodeOwner {
  if (!node.owners || node.owners.length === 0) return 'NEUTRAL';
  const i = Math.max(0, Math.min(node.owners.length - 1, phase - 1));
  return node.owners[i];
}

// Resolve an owner sentinel/force-id to a display colour. Real forces come
// from `force.color_hex`; sentinels map to the Bunker palette.
export function ownerColor(owner: NodeOwner, forces: CrusadeForce[]): string {
  if (owner === 'NEUTRAL') return '#5c5346'; // bunk.boneMute
  if (owner === 'CONTESTED') return '#f4c14b'; // bunk.warning
  return forces.find(f => f.id === owner)?.color_hex ?? '#5c5346';
}

export function ownerLabel(owner: NodeOwner, forces: CrusadeForce[]): string {
  if (owner === 'NEUTRAL') return 'NEUTRAL';
  if (owner === 'CONTESTED') return 'CONTESTED';
  return forces.find(f => f.id === owner)?.name ?? 'UNKNOWN';
}

export interface NodeTypeMeta { label: string; glyph: string }

export const NODE_TYPE: Record<NodeType, NodeTypeMeta> = {
  HIVE:   { label: 'Hive World',  glyph: 'H' },
  FORGE:  { label: 'Forge World', glyph: 'F' },
  PORT:   { label: 'Spaceport',   glyph: 'P' },
  RELIC:  { label: 'Relic Site',  glyph: 'R' },
  STRONG: { label: 'Stronghold',  glyph: 'S' },
  WILD:   { label: 'Wilderness',  glyph: 'W' },
  OBJ:    { label: 'Objective',   glyph: 'Ω' },
};

// Logical map plane the Sector Map design is composed against.
export const MAP_W = 1000;
export const MAP_H = 700;
