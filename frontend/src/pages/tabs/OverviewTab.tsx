import type { Battle, Campaign, CrusadeForce } from '../../types';
import { BunkBar } from '../../components/bunker';
import { SigilHazard, crestFor } from '../../components/sigils';

const RUST = '#e2683c';

// Campaign Detail overview — faithful to the prototype's single-page
// battle-log + side-rail layout (BunkDetail).
export default function OverviewTab({ campaign, forces, battles }: {
  campaign: Campaign; forces: CrusadeForce[]; battles: Battle[];
}) {
  const log = battles
    .filter(b => b.status === 'confirmed')
    .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at));
  const sortedForces = [...forces].sort(
    (a, b) => (b.wins ?? b.victories) - (a.wins ?? a.victories) || b.battle_tally - a.battle_tally,
  );
  const total = log.length;

  const leftBorder = (o: Battle['outcome']) =>
    o === 'Attacker Wins' ? '#e2683c' : o === 'Defender Wins' ? '#7a1f12' : '#f4c14b';
  const nameOf = (id: string) => forces.find(f => f.id === id)?.name ?? '?';

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      {/* Battle log */}
      <div>
        <div className="flex items-baseline gap-3 mb-4">
          <div className="hidden sm:block self-center w-12">
            <SigilHazard width={48} height={10} color={RUST} bg="#0c0a08" />
          </div>
          <div className="font-display text-2xl font-bold tracking-wide text-bunk-bone uppercase">Battle Log</div>
          <div className="font-mono text-[10px] tracking-mono-md text-bunk-boneDim">· {total} ENGAGEMENTS</div>
        </div>

        {total === 0 ? (
          <div className="border border-bunk-line bg-bunk-surface px-5 py-10 text-center font-mono text-[11px] tracking-mono-md text-bunk-boneDim uppercase">
            No confirmed battles yet
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[48px_1fr_100px_90px_90px] gap-3 px-4 py-2 bg-bunk-surfaceLo border border-bunk-line font-mono text-[9px] tracking-mono-md text-bunk-boneDim">
              <div>#</div><div>ENGAGEMENT</div><div>MISSION</div><div>DATE</div>
              <div className="text-right">RESULT</div>
            </div>
            <div className="border border-bunk-line border-t-0">
              {log.map((b, i) => {
                const hasScore = (b.attacker_score ?? 0) + (b.defender_score ?? 0) > 0;
                return (
                  <div
                    key={b.id}
                    className="grid grid-cols-[48px_1fr_100px_90px_90px] gap-3 px-4 py-3 bg-bunk-surface border-b border-bunk-line last:border-b-0 items-center"
                    style={{ borderLeft: `4px solid ${leftBorder(b.outcome)}` }}
                  >
                    <div className="font-display text-2xl font-bold text-bunk-rust leading-none">
                      {String(total - i).padStart(2, '0')}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-base font-semibold uppercase tracking-wide text-bunk-bone truncate">
                        {b.mission_name || `${nameOf(b.attacker_force_id)} vs ${nameOf(b.defender_force_id)}`}
                      </div>
                      <div className="text-[11px] text-bunk-boneDim truncate">
                        {nameOf(b.attacker_force_id)} vs {nameOf(b.defender_force_id)}
                        {b.notes ? ` — ${b.notes}` : ''}
                      </div>
                    </div>
                    <div className="font-mono text-[10px] text-bunk-bone tracking-mono-sm truncate">{b.battle_size}</div>
                    <div className="font-mono text-[10px] text-bunk-boneDim tracking-mono-sm">
                      {new Date(b.occurred_at).toISOString().slice(0, 10)}
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-[10px] font-bold tracking-mono-md ${
                        b.outcome === 'Draw' ? 'text-bunk-warning' : 'text-bunk-green'}`}>
                        ● {b.outcome === 'Attacker Wins' ? 'ATK' : b.outcome === 'Defender Wins' ? 'DEF' : 'DRAW'}
                      </div>
                      {hasScore && (
                        <div className="font-display text-lg font-bold text-bunk-bone leading-none mt-0.5">
                          {b.attacker_score}–{b.defender_score}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Side rail */}
      <div className="grid gap-4">
        <div>
          <div className="flex items-baseline gap-3 mb-3">
            <div className="font-display text-xl font-bold tracking-wide text-bunk-bone uppercase">Forces</div>
            <div className="font-mono text-[10px] tracking-mono-md text-bunk-rust">× {forces.length}</div>
          </div>
          {sortedForces.length === 0 ? (
            <p className="font-mono text-[10px] text-bunk-boneMute uppercase">No forces yet.</p>
          ) : (
            <div className="grid gap-2">
              {sortedForces.map(f => {
                const Crest = crestFor(f.faction);
                const w = f.wins ?? f.victories;
                const l = f.losses ?? 0;
                const d = f.draws ?? 0;
                const pct = w + l > 0 ? (w / (w + l)) * 100 : 0;
                return (
                  <div key={f.id} className="bg-bunk-surface border border-bunk-line border-l-[3px]"
                    style={{ borderLeftColor: f.color_hex }}>
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 flex-shrink-0"><Crest size={24} color={f.color_hex} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="font-display font-bold uppercase tracking-wide text-bunk-bone truncate">{f.name}</div>
                          <div className="font-mono text-[9px] tracking-mono-sm text-bunk-boneDim uppercase truncate">
                            {f.commander || f.player_name || f.faction || '—'}
                          </div>
                        </div>
                        <div className="font-display text-lg font-bold text-bunk-rust">{f.power_rating ?? 0}</div>
                      </div>
                      <div className="mt-2"><BunkBar pct={pct} segments={16} /></div>
                      <div className="flex justify-between font-mono text-[9px] tracking-mono-sm text-bunk-boneDim mt-1">
                        <span><span className="text-bunk-green">{w}W</span> · <span className="text-bunk-red">{l}L</span> · <span className="text-bunk-warning">{d}D</span></span>
                        <span>{f.unit_count ?? 0} UNITS</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-bunk-surfaceLo border border-bunk-line">
          <div className="px-3.5 py-2 border-b border-dashed border-bunk-line font-mono text-[9px] tracking-mono-lg text-bunk-rust">// CAMPAIGN</div>
          <div className="p-3.5 font-mono text-[11px] tracking-mono-sm text-bunk-boneDim space-y-1.5">
            <Row k="PHASE" v={`${campaign.phase_label} ${campaign.current_phase}`} />
            <Row k="BATTLE SIZE" v={campaign.default_battle_size} />
            <Row k="BATTLES" v={String(campaign.battle_count ?? log.length)} />
            <Row k="FORCES" v={String(campaign.force_count ?? forces.length)} />
            <Row k="UNITS" v={String(campaign.unit_count ?? 0)} />
            <Row k="POINTS" v={String(campaign.power_rating ?? 0)} rust />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, rust = false }: { k: string; v: string; rust?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <span className={rust ? 'text-bunk-rust' : 'text-bunk-bone'}>{v}</span>
    </div>
  );
}
