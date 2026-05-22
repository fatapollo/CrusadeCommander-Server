import { Link } from 'react-router-dom';
import type {
  Battle, BattleOutcome, CampaignPhase, CrusadeForce, SectorNode,
} from '../../types';
import { crestFor, SigilHazard } from '../sigils';
import { BunkPill } from '../bunker';
import { Badge } from '../ui';
import { NODE_TYPE, ownerAtPhase, ownerColor, ownerLabel } from './utils';

const RUST = '#e2683c';

export interface NodeDossierProps {
  node: SectorNode;
  forces: CrusadeForce[];
  phases: CampaignPhase[];
  currentPhase: number;
  battles: Battle[];
  campaignId: string;
  onClose: () => void;
}

export function NodeDossier({
  node, forces, phases, currentPhase, battles, campaignId, onClose,
}: NodeDossierProps) {
  const ownerNow = ownerAtPhase(node, currentPhase);
  const colorNow = ownerColor(ownerNow, forces);
  const labelNow = ownerLabel(ownerNow, forces);
  const ownerForce = forces.find(f => f.id === ownerNow);
  const Crest = ownerForce ? crestFor(ownerForce.faction) : undefined;
  const typeMeta = NODE_TYPE[node.type];

  // Resolve referenced battles. Order: most recent first.
  const battleMap = new Map(battles.map(b => [b.id, b]));
  const nodeBattles: Battle[] = (node.battles ?? [])
    .map(id => battleMap.get(id))
    .filter((b): b is Battle => !!b)
    .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at));

  // Per-phase ownership history rows (carry-forward; dim no-change rows).
  let prev: string | null = null;
  const ownershipRows = phases.map(p => {
    const o = ownerAtPhase(node, p.idx);
    const changed = o !== prev;
    prev = o;
    return {
      phase: p.idx,
      label: ownerLabel(o, forces),
      color: ownerColor(o, forces),
      changed,
      isCurrent: p.idx === currentPhase,
    };
  });

  return (
    <div className="bg-bunk-surface border border-bunk-line">
      {/* Header strip — owner-coloured */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: `${colorNow}22`, borderBottom: `2px solid ${colorNow}` }}
      >
        <span className="font-mono text-[10px] tracking-mono-lg text-bunk-bone uppercase">
          // NODE · {node.id}
        </span>
        <button
          onClick={onClose}
          className="font-mono text-[14px] leading-none text-bunk-boneDim hover:text-bunk-bone"
          aria-label="Close dossier"
        >✕</button>
      </div>

      {/* Title block */}
      <div className="p-4 border-b border-bunk-line">
        <div className="flex items-start gap-3">
          <div
            className="relative flex-shrink-0 bg-bunk-ink border border-bunk-line flex items-center justify-center"
            style={{ width: 56, height: 56, borderLeft: `4px solid ${colorNow}` }}
          >
            {Crest && <Crest size={32} color={colorNow} />}
            <span className="absolute top-0 left-1 font-mono text-[9px] leading-none text-bunk-boneDim">
              {typeMeta.glyph}
            </span>
            <span className="absolute top-0 right-1 font-display text-[12px] font-bold leading-none text-bunk-rust">
              {node.value}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] tracking-mono-md text-bunk-boneDim uppercase">
              {typeMeta.label} · Strategic Value {node.value}
            </div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-bunk-bone leading-none mt-1">
              {node.name}
            </h2>
            <div className="flex flex-wrap gap-1.5 items-center mt-2">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-[2px] border font-mono text-[10px] tracking-mono-md uppercase"
                style={{ borderColor: colorNow, color: colorNow, background: 'rgba(0,0,0,0.4)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorNow }} />
                {labelNow}
              </span>
              {node.isObjective && <BunkPill status="NEW" /* warning */ />}
            </div>
            {node.traits && node.traits.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {node.traits.map((t, i) => (
                  <Badge key={i} color="dim">{t}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ownership history */}
      <div className="p-4 border-b border-bunk-line">
        <div className="flex items-baseline gap-3 mb-3">
          <div className="hidden sm:block w-10"><SigilHazard width={40} height={8} color={RUST} bg="#161310" /></div>
          <div className="font-display text-base font-bold tracking-wide text-bunk-bone uppercase">Ownership</div>
        </div>
        <div className="grid gap-1.5">
          {ownershipRows.map(r => (
            <div
              key={r.phase}
              className="flex items-center gap-2"
              style={{ opacity: r.changed || r.isCurrent ? 1 : 0.5 }}
            >
              <span className={`font-mono text-[10px] tracking-mono-sm w-8 ${r.isCurrent ? 'text-bunk-rust' : 'text-bunk-boneDim'}`}>
                {String(r.phase).padStart(2, '0')}
              </span>
              <span className="font-display text-[12px] font-bold uppercase tracking-wide text-bunk-bone truncate flex-1">
                {r.label}
              </span>
              <span className="w-3.5 h-3.5 flex-shrink-0" style={{ background: r.color }} />
            </div>
          ))}
        </div>
      </div>

      {/* Battles fought here */}
      <div className="p-4">
        <div className="flex items-baseline gap-3 mb-3">
          <div className="hidden sm:block w-10"><SigilHazard width={40} height={8} color={RUST} bg="#161310" /></div>
          <div className="font-display text-base font-bold tracking-wide text-bunk-bone uppercase">
            Battles Fought Here
          </div>
          <div className="font-mono text-[10px] tracking-mono-md text-bunk-rust">× {nodeBattles.length}</div>
        </div>
        {nodeBattles.length === 0 ? (
          <p className="font-narrative italic text-[13px] text-bunk-boneDim">No engagements logged at this node.</p>
        ) : (
          <div className="grid gap-1.5">
            {nodeBattles.map((b, i) => (
              <Link
                key={b.id}
                to={`/campaigns/${campaignId}?tab=battles#battle-${b.id}`}
                className="bg-bunk-ink border border-bunk-line p-2 flex items-center gap-2 hover:border-bunk-lineHi"
              >
                <span className="font-display text-xl font-bold text-bunk-rust leading-none w-8">
                  {String(nodeBattles.length - i).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[12px] font-bold uppercase tracking-wide text-bunk-bone truncate">
                    {b.mission_name || 'Engagement'}
                  </div>
                  <div className="font-mono text-[9px] tracking-mono-sm text-bunk-boneDim truncate">
                    {new Date(b.occurred_at).toISOString().slice(0, 10)} · {b.battle_size}
                  </div>
                </div>
                <ResultPill outcome={b.outcome} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultPill({ outcome }: { outcome: BattleOutcome }) {
  const color = outcome === 'Draw' ? '#f4c14b' : '#6fb068';
  const label = outcome === 'Attacker Wins' ? 'ATK' : outcome === 'Defender Wins' ? 'DEF' : 'DRAW';
  return (
    <span
      className="font-mono text-[10px] tracking-mono-md uppercase px-1.5 py-0.5 border"
      style={{ borderColor: color, color }}
    >
      ● {label}
    </span>
  );
}
