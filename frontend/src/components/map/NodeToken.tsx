import type { SectorNode, NodeOwner } from '../../types';
import { NODE_TYPE } from './utils';
import type { CrestComponent } from '../sigils';

// Zoom tiers from the handoff:
//   0 = Far   18px chip, owner colour only, no glyphs or text
//   1 = Mid   32px chip + crest + type glyph + value numeral
//   2 = Close 32px chip same as Mid + the node name label below
const TIER_SIZE = { 0: 18, 1: 32, 2: 44 } as const;

export interface NodeTokenProps {
  node: SectorNode;
  /** Resolved owner colour (hex) — already mapped by ownerColor() upstream. */
  ownerColor: string;
  /** Optional faction crest component (e.g. from `crestFor(force.faction)`). */
  crest?: CrestComponent;
  /** True if `owner === 'CONTESTED'`. Draws the hazard ring. */
  contested?: boolean;
  zoom: 0 | 1 | 2;
  state?: 'default' | 'hover' | 'selected';
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function NodeToken({
  node, ownerColor, crest, contested = false,
  zoom, state = 'default', onClick, onMouseEnter, onMouseLeave,
}: NodeTokenProps) {
  const size = TIER_SIZE[zoom];
  const Crest = crest;
  const showCrest = zoom >= 1;
  const showText = zoom >= 1;
  const showLabel = zoom >= 2;
  const ring = state === 'selected' ? '#e2683c' : null;
  const typeMeta = NODE_TYPE[node.type];

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="absolute -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
      style={{ left: `${(node.pos.x / 1000) * 100}%`, top: `${(node.pos.y / 700) * 100}%` }}
      aria-label={node.name}
    >
      {/* Objective ring — dashed warning, sits just outside the chip */}
      {node.isObjective && (
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            width: size + 10,
            height: size + 10,
            borderRadius: 999,
            border: '1.5px dashed #f4c14b',
          }}
        />
      )}

      {/* Contested hazard ring — solid warning */}
      {contested && (
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            width: size + 6,
            height: size + 6,
            border: '2px dashed #f4c14b',
          }}
        />
      )}

      {/* Selection ring */}
      {ring && (
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            width: size + 12,
            height: size + 12,
            boxShadow: `0 0 0 2px ${ring}`,
          }}
        />
      )}

      {/* The chip itself */}
      <div
        className={`relative bg-bunk-ink border border-bunk-line transition-transform ${
          state === 'hover' ? 'brightness-125' : ''
        } ${state === 'selected' ? 'scale-[1.06]' : 'group-hover:scale-[1.04]'}`}
        style={{
          width: size, height: size,
          borderLeft: `4px solid ${ownerColor}`,
        }}
      >
        {showCrest && Crest && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Crest size={Math.round(size * 0.62)} color={ownerColor} />
          </span>
        )}
        {showText && (
          <>
            <span className="absolute top-0 left-1 font-mono text-[8px] leading-none text-bunk-boneDim tracking-mono-sm">
              {typeMeta.glyph}
            </span>
            <span className="absolute top-0 right-1 font-display text-[11px] font-bold leading-none text-bunk-rust">
              {node.value}
            </span>
          </>
        )}
      </div>

      {/* Close-zoom name label */}
      {showLabel && (
        <span
          className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap bg-bunk-ink border border-bunk-line px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wide text-bunk-bone"
        >
          {node.name}
        </span>
      )}
    </button>
  );
}
