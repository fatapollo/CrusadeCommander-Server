import type { Battle, CampaignPhase, CrusadeForce, NodeOwner, SectorMap } from '../../types';
import { MAP_W, MAP_H, NODE_TYPE, ownerAtPhase, ownerColor, ownerLabel } from './utils';

export interface MapMobileProps {
  map: SectorMap;
  forces: CrusadeForce[];
  phases: CampaignPhase[];
  currentPhase: number;
  battles: Battle[];
}

// Stacked read-only view: phase strip → static SVG → holdings grid →
// owner-grouped node list. No pan/zoom, no dossier, no scrubber.
export function MapMobile({ map, forces, phases, currentPhase, battles }: MapMobileProps) {
  const phaseTotal = Math.max(1, phases.length);
  const phaseMeta = phases.find(p => p.idx === currentPhase) ?? phases[phases.length - 1];

  // Group by owner at current phase.
  const byOwner = new Map<NodeOwner, typeof map.nodes>();
  for (const n of map.nodes) {
    const o = ownerAtPhase(n, currentPhase);
    const arr = byOwner.get(o);
    if (arr) arr.push(n);
    else byOwner.set(o, [n]);
  }

  // Order: real forces in their natural order, then CONTESTED, then NEUTRAL.
  const orderedOwners: NodeOwner[] = [
    ...forces.filter(f => byOwner.has(f.id)).map(f => f.id),
    ...(byOwner.has('CONTESTED') ? ['CONTESTED' as NodeOwner] : []),
    ...(byOwner.has('NEUTRAL') ? ['NEUTRAL' as NodeOwner] : []),
  ];

  // Holdings cells: real forces only that have at least one + the two sentinels.
  const holdings: { owner: NodeOwner; count: number }[] = orderedOwners.map(o => ({
    owner: o, count: byOwner.get(o)?.length ?? 0,
  }));

  const battleCountByNode = new Map<string, number>();
  for (const n of map.nodes) battleCountByNode.set(n.id, (n.battles ?? []).length);
  void battles; // reserved — slice 7 keeps the mobile read-only view simple

  return (
    <div className="grid gap-3">
      {/* Phase strip */}
      <div className="bg-bunk-surface border border-bunk-line p-3">
        <div className="font-mono text-[9px] tracking-mono-lg text-bunk-rust mb-2 uppercase">// Current Phase</div>
        <div className="flex gap-1 mb-2">
          {phases.map(p => (
            <div
              key={p.idx}
              className="flex-1 h-2 border border-bunk-line"
              style={{
                background: p.idx < currentPhase ? '#a44a25'
                  : p.idx === currentPhase ? '#e2683c'
                  : '#1a1614',
              }}
            />
          ))}
        </div>
        <div className="font-display text-base font-bold uppercase tracking-wide text-bunk-bone leading-none">
          {phaseMeta?.label ?? `Phase ${currentPhase}`}
        </div>
        <div className="font-mono text-[9px] tracking-mono-sm text-bunk-boneDim mt-1 uppercase">
          {String(currentPhase).padStart(2, '0')} / {String(phaseTotal).padStart(2, '0')}
          {phaseMeta?.date ? ` · ${phaseMeta.date}` : ''}
        </div>
      </div>

      {/* Static SVG */}
      <div className="bg-bunk-surface border border-bunk-line p-3">
        <div className="font-mono text-[9px] tracking-mono-lg text-bunk-rust mb-2 uppercase">// Sector · Static View</div>
        <div
          className="w-full bg-bunk-ink border border-bunk-line relative overflow-hidden"
          style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
        >
          <svg
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full"
            aria-label="Sector map (static)"
          >
            {/* Edges */}
            {map.edges.map(([aId, bId], i) => {
              const a = map.nodes.find(n => n.id === aId);
              const b = map.nodes.find(n => n.id === bId);
              if (!a || !b) return null;
              const oa = ownerAtPhase(a, currentPhase);
              const ob = ownerAtPhase(b, currentPhase);
              const sharedReal = oa === ob && oa !== 'NEUTRAL' && oa !== 'CONTESTED';
              const stroke = sharedReal ? ownerColor(oa, forces) : '#2e251e';
              const dashed = oa === 'NEUTRAL' || ob === 'NEUTRAL';
              return (
                <line
                  key={`${aId}-${bId}-${i}`}
                  x1={a.pos.x} y1={a.pos.y} x2={b.pos.x} y2={b.pos.y}
                  stroke={stroke} strokeWidth={1.5}
                  strokeDasharray={dashed ? '4 3' : undefined}
                  opacity={0.85}
                />
              );
            })}
            {/* Nodes */}
            {map.nodes.map(n => {
              const owner = ownerAtPhase(n, currentPhase);
              const c = ownerColor(owner, forces);
              const neutral = owner === 'NEUTRAL';
              return (
                <g key={n.id}>
                  <rect
                    x={n.pos.x - 14} y={n.pos.y - 14}
                    width={28} height={28}
                    fill={neutral ? '#161310' : c}
                    stroke="#06040a" strokeWidth={1.5}
                  />
                  {/* Owner border-left accent like the desktop chip */}
                  <rect
                    x={n.pos.x - 14} y={n.pos.y - 14}
                    width={4} height={28}
                    fill={c}
                  />
                  {n.isObjective && (
                    <circle
                      cx={n.pos.x} cy={n.pos.y} r={22}
                      fill="none" stroke="#f4c14b" strokeWidth={1.5} strokeDasharray="3 2"
                    />
                  )}
                  {owner === 'CONTESTED' && (
                    <rect
                      x={n.pos.x - 18} y={n.pos.y - 18}
                      width={36} height={36}
                      fill="none" stroke="#f4c14b" strokeWidth={1.5} strokeDasharray="4 3"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="font-mono text-[9px] tracking-mono-md text-bunk-boneMute mt-2 text-center uppercase">
          Static on mobile · open on desktop to explore
        </p>
      </div>

      {/* Holdings grid */}
      <div className="grid grid-cols-2 gap-px bg-bunk-line">
        {holdings.map(h => {
          const c = ownerColor(h.owner, forces);
          return (
            <div key={String(h.owner)} className="bg-bunk-surface p-3">
              <div className="flex items-center gap-2">
                <span className="block w-2.5 h-2.5" style={{ background: c, border: '1px solid #06040a' }} />
                <span className="font-mono text-[9px] tracking-mono-md text-bunk-boneDim uppercase truncate">
                  {ownerLabel(h.owner, forces)}
                </span>
              </div>
              <div className="font-display text-3xl font-bold tabular-nums text-bunk-bone leading-none mt-1">
                {String(h.count).padStart(2, '0')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Owner-grouped node list */}
      <div className="bg-bunk-surface border border-bunk-line p-3">
        <div className="font-mono text-[9px] tracking-mono-lg text-bunk-rust mb-2 uppercase">
          // Nodes · {map.nodes.length} total
        </div>
        <div className="grid gap-3">
          {orderedOwners.map(o => {
            const nodes = byOwner.get(o) ?? [];
            const c = ownerColor(o, forces);
            return (
              <div key={String(o)}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="block w-3.5 h-3.5" style={{ background: c, border: '1px solid #06040a' }} />
                  <span className="font-display text-[13px] font-bold tracking-wide text-bunk-bone uppercase">
                    {ownerLabel(o, forces)}
                  </span>
                  <span className="font-mono text-[9px] tracking-mono-sm text-bunk-boneDim">× {nodes.length}</span>
                </div>
                <div className="grid gap-1">
                  {nodes.map(n => {
                    const meta = NODE_TYPE[n.type];
                    const bc = battleCountByNode.get(n.id) ?? 0;
                    return (
                      <div
                        key={n.id}
                        className="bg-bunk-surfaceLo border border-bunk-line px-3 py-2 grid items-center gap-2.5"
                        style={{ gridTemplateColumns: '1fr auto auto', borderLeft: `3px solid ${c}` }}
                      >
                        <div className="min-w-0">
                          <div className="font-display text-[13px] font-semibold tracking-wide text-bunk-bone uppercase truncate">
                            {n.name}
                          </div>
                          <div className="font-mono text-[9px] tracking-mono-sm text-bunk-boneDim uppercase mt-0.5">
                            {meta.label}{bc > 0 ? ` · ${bc} battle${bc === 1 ? '' : 's'}` : ''}
                          </div>
                        </div>
                        {n.isObjective && (
                          <span className="px-1.5 py-0.5 border border-bunk-warning text-bunk-warning font-mono text-[9px] tracking-mono-sm uppercase">
                            OBJ
                          </span>
                        )}
                        <span className="font-display text-lg font-bold text-bunk-bone tabular-nums">{n.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
