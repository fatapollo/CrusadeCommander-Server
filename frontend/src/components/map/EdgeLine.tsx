import type { SectorNode, NodeOwner } from '../../types';
import { MAP_W, MAP_H } from './utils';

export interface EdgeLineProps {
  a: SectorNode;
  b: SectorNode;
  /** Resolved owner at the viewing phase for each endpoint. */
  ownerA: NodeOwner;
  ownerB: NodeOwner;
  /** Stroke colour to use when both endpoints share the same real owner. */
  sharedOwnerColor?: string;
  dimmed?: boolean;
}

// Supply-line / approach visual. Same real owner on both ends → owner colour;
// otherwise the neutral `bunk.line`. Dashed when either endpoint is NEUTRAL.
// No logic (isolation/path-finding) lives here; this is purely visual.
export function EdgeLine({ a, b, ownerA, ownerB, sharedOwnerColor, dimmed = false }: EdgeLineProps) {
  const sameRealOwner =
    ownerA === ownerB && ownerA !== 'NEUTRAL' && ownerA !== 'CONTESTED';
  const stroke = sameRealOwner && sharedOwnerColor ? sharedOwnerColor : '#2e251e'; // bunk.line
  const dashed = ownerA === 'NEUTRAL' || ownerB === 'NEUTRAL';
  const opacity = dimmed ? 0.5 : 1;
  // Caller renders inside an <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`}> so a/b
  // positions translate directly without per-edge scaling.
  void MAP_W; void MAP_H;
  return (
    <line
      x1={a.pos.x} y1={a.pos.y} x2={b.pos.x} y2={b.pos.y}
      stroke={stroke}
      strokeWidth={1.5}
      strokeDasharray={dashed ? '4 3' : undefined}
      opacity={opacity}
    />
  );
}
