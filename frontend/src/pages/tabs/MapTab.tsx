import { useMemo, useState } from 'react';
import type { Battle, Campaign, CampaignPhase, CampaignRole, CrusadeForce, NodeOwner, SectorMap } from '../../types';
import {
  MapCanvas, MapLegend, PhaseScrubber, NodeDossier, ownerAtPhase, ownerColor, ownerLabel,
} from '../../components/map';
import { SigilHazard, SigilReticle, FACTION_CRESTS } from '../../components/sigils';
import { Button } from '../../components/ui';

const RUST = '#e2683c';

export default function MapTab({ campaign, forces, battles, role, campaignId }: {
  campaign: Campaign;
  forces: CrusadeForce[];
  battles: Battle[];
  role: CampaignRole;
  campaignId: string;
}) {
  const map = campaign.sector_map;
  const phases = campaign.phases ?? [];
  const phaseTotal = Math.max(1, phases.length || campaign.current_phase);
  const [viewingPhase, setViewingPhase] = useState<number>(
    Math.max(1, Math.min(phaseTotal, campaign.current_phase)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isAdmin = role === 'owner' || role === 'admin';

  if (!map || !map.nodes || map.nodes.length === 0) {
    return <MapEmpty isAdmin={isAdmin} campaignId={campaignId} />;
  }

  return (
    <MapBody
      map={map}
      forces={forces}
      battles={battles}
      phases={phases.length > 0 ? phases : [{ idx: 1, label: campaign.phase_label, date: null }]}
      viewingPhase={viewingPhase}
      setViewingPhase={setViewingPhase}
      currentPhase={campaign.current_phase}
      selectedId={selectedId}
      setSelectedId={setSelectedId}
      campaignId={campaignId}
    />
  );
}

function MapBody({
  map, forces, battles, phases, viewingPhase, setViewingPhase, currentPhase,
  selectedId, setSelectedId, campaignId,
}: {
  map: SectorMap;
  forces: CrusadeForce[];
  battles: Battle[];
  phases: CampaignPhase[];
  viewingPhase: number;
  setViewingPhase: (n: number) => void;
  currentPhase: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  campaignId: string;
}) {
  const selectedNode = selectedId ? map.nodes.find(n => n.id === selectedId) ?? null : null;
  // Holdings at the viewing phase, grouped by owner.
  const holdings = useMemo(() => {
    const counts = new Map<NodeOwner, number>();
    for (const n of map.nodes) {
      const o = ownerAtPhase(n, viewingPhase);
      counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([owner, count]) => ({
        owner, count,
        label: ownerLabel(owner, forces),
        color: ownerColor(owner, forces),
      }))
      .sort((a, b) => b.count - a.count);
  }, [map.nodes, forces, viewingPhase]);

  // Narrative events that occurred at the viewing phase.
  const events = useMemo(() => {
    const out: { node: string; event: string }[] = [];
    for (const n of map.nodes) {
      for (const h of n.history ?? []) {
        if (h.phase === viewingPhase) out.push({ node: n.name, event: h.event });
      }
    }
    return out;
  }, [map.nodes, viewingPhase]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div className="grid gap-3">
        <MapCanvas
          map={map}
          forces={forces}
          phase={viewingPhase}
          zoom={1}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
          height={620}
        />
        <PhaseScrubber
          phases={phases}
          current={viewingPhase}
          onChange={setViewingPhase}
          isCurrent={viewingPhase === currentPhase}
        />
      </div>

      <div className="grid gap-4">
        {selectedNode ? (
          <NodeDossier
            node={selectedNode}
            forces={forces}
            phases={phases}
            currentPhase={currentPhase}
            battles={battles}
            campaignId={campaignId}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
        <MapLegend forces={forces} />

        <div className="bg-bunk-surface border border-bunk-line">
          <div className="px-3.5 py-2 border-b border-dashed border-bunk-line font-mono text-[9px] tracking-mono-lg text-bunk-rust">
            // HOLDINGS · PHASE {String(viewingPhase).padStart(2, '0')}
          </div>
          <div className="p-3 grid gap-1.5">
            {holdings.map(h => (
              <div key={String(h.owner)} className="flex items-center gap-2">
                <span className="w-3 h-3 flex-shrink-0" style={{ background: h.color }} />
                <span className="flex-1 font-mono text-[10px] tracking-mono-sm text-bunk-bone uppercase truncate">{h.label}</span>
                <span className="font-display text-base font-bold tabular-nums text-bunk-bone">{h.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-bunk-surfaceLo border border-bunk-line">
          <div className="px-3.5 py-2 border-b border-dashed border-bunk-line font-mono text-[9px] tracking-mono-lg text-bunk-rust">
            // PHASE EVENTS
          </div>
          <div className="p-3 grid gap-2">
            {events.length === 0 ? (
              <p className="font-mono text-[10px] tracking-mono-sm text-bunk-boneMute uppercase">No engagements this phase.</p>
            ) : events.map((e, i) => (
              <div key={i} className="border-l-2 border-bunk-rust pl-2">
                <div className="font-mono text-[10px] tracking-mono-md text-bunk-bone uppercase truncate">{e.node}</div>
                <div className="font-mono text-[10px] text-bunk-boneDim">{e.event}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MapEmpty({ isAdmin, campaignId }: { isAdmin: boolean; campaignId: string }) {
  return (
    <div className="relative overflow-hidden border border-bunk-line bg-bunk-surface py-14">
      <div className="absolute -left-12 -top-10 opacity-[0.04]"><SigilReticle size={260} color={RUST} /></div>
      <div className="absolute -right-12 -bottom-10 opacity-[0.04]"><FACTION_CRESTS.IRON_LEGION size={300} color={RUST} /></div>
      <div className="relative max-w-[680px] mx-auto text-center px-6">
        <div className="flex justify-center mb-5"><SigilHazard width={80} height={12} color={RUST} bg="#161310" /></div>
        <div className="font-mono text-[11px] tracking-mono-lg text-bunk-rust mb-3 uppercase">
          Sector 14-Ω · Uncharted
        </div>
        <div className="font-display text-5xl sm:text-6xl font-bold uppercase tracking-tight text-bunk-bone leading-[0.95]">
          The Sector<br />
          <span className="text-bunk-rust">{isAdmin ? 'Awaits Charting' : 'Has No Chart'}</span>
        </div>
        <p className="font-narrative italic text-base text-bunk-boneDim mt-5 max-w-[460px] mx-auto leading-relaxed">
          {isAdmin
            ? 'Place worlds, draw supply lines, and let the sector record itself as the campaign unfolds. The map is purely narrative — no rules effects.'
            : 'No campaign cartographer has set the sector yet. Once your admin charts it, this view will track holdings and contested worlds.'}
        </p>
        {isAdmin && (
          <div className="flex flex-wrap gap-3 justify-center mt-7">
            <Button disabled title="Map Builder ships in slice 5">＋ Build Sector Map</Button>
            <Button variant="secondary" disabled>Use Template ▾</Button>
          </div>
        )}
      </div>
      {isAdmin && (
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-px max-w-3xl mx-auto" style={{ background: '#2e251e' }}>
          {[
            { n: '01', t: 'Place Nodes', d: 'Drop worlds onto the sector plane — Hive, Forge, Relic, Wilderness…' },
            { n: '02', t: 'Draw Lines', d: 'Connect approaches and supply routes. Pure visual; no isolation logic.' },
            { n: '03', t: 'Publish', d: 'Once active, battles can be tagged to nodes and (on a confirmed win) flip ownership.' },
          ].map(c => (
            <div key={c.n} className="bg-bunk-surface px-6 py-6" style={{ borderTop: `3px solid ${RUST}` }}>
              <div className="font-display text-3xl font-bold text-bunk-rust leading-none">{c.n}</div>
              <div className="font-display text-base font-bold uppercase tracking-wide text-bunk-bone mt-2">{c.t}</div>
              <div className="font-mono text-[11px] text-bunk-boneDim mt-1 leading-snug">{c.d}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
