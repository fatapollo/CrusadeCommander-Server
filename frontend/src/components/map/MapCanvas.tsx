import type { CrusadeForce, SectorMap } from '../../types';
import { crestFor } from '../sigils';
import { EdgeLine } from './EdgeLine';
import { NodeToken } from './NodeToken';
import { backdropById } from './sectorBackdrops';
import { MAP_W, MAP_H, ownerAtPhase, ownerColor } from './utils';

export interface MapCanvasProps {
  map: SectorMap;
  forces: CrusadeForce[];
  phase: number;
  zoom: 0 | 1 | 2;
  selectedId?: string | null;
  hoverId?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** Pixel height; width fills container, aspect locked to 1000×700. */
  height?: number;
  builder?: boolean;
}

// Static plane for slice 2. Slice 3 wires real pan/zoom on top via the
// design-canvas viewport pattern; this primitive is just the layout layer.
export function MapCanvas({
  map, forces, phase, zoom, selectedId, hoverId,
  onSelect, onHover, height = 620, builder = false,
}: MapCanvasProps) {
  const nodeById = (id: string) => map.nodes.find(n => n.id === id);

  const backdrop = backdropById(map.backdrop);
  return (
    <div
      className="relative w-full border border-bunk-line overflow-hidden"
      style={{
        height,
        ...backdrop.canvas,
      }}
    >
      {/* Sector coordinate label */}
      <div className="absolute top-2 left-2 font-mono text-[9px] tracking-mono-lg text-bunk-rust select-none pointer-events-none">
        // SECTOR PLANE · {MAP_W}×{MAP_H}
      </div>
      {builder && (
        <div className="absolute top-2 right-2 font-mono text-[9px] tracking-mono-md text-bunk-warning select-none pointer-events-none">
          BUILDER MODE
        </div>
      )}

      {/* Edges — SVG laid over the full plane */}
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      >
        {map.edges.map(([aId, bId], i) => {
          const a = nodeById(aId);
          const b = nodeById(bId);
          if (!a || !b) return null;
          const oa = ownerAtPhase(a, phase);
          const ob = ownerAtPhase(b, phase);
          const shared = oa === ob ? ownerColor(oa, forces) : undefined;
          return (
            <EdgeLine
              key={`${aId}-${bId}-${i}`}
              a={a} b={b}
              ownerA={oa} ownerB={ob}
              sharedOwnerColor={shared}
            />
          );
        })}
      </svg>

      {/* Tokens — absolutely positioned HTML for crisp typography */}
      <div className="absolute inset-0">
        {map.nodes.map((n) => {
          const owner = ownerAtPhase(n, phase);
          const color = ownerColor(owner, forces);
          const force = forces.find(f => f.id === owner);
          const crest = force ? crestFor(force.faction) : undefined;
          const state =
            selectedId === n.id ? 'selected'
            : hoverId === n.id ? 'hover'
            : 'default';
          return (
            <NodeToken
              key={n.id}
              node={n}
              ownerColor={color}
              crest={crest}
              contested={owner === 'CONTESTED'}
              zoom={zoom}
              state={state}
              onClick={() => onSelect?.(n.id)}
              onMouseEnter={() => onHover?.(n.id)}
              onMouseLeave={() => onHover?.(null)}
            />
          );
        })}
      </div>
    </div>
  );
}
