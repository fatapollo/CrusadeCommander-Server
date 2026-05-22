import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { battlesApi, campaignsApi, forcesApi, unitsApi } from '../api/endpoints';
import type { UnitBattleInput } from '../api/endpoints';
import type { BattleOutcome, BattleSize, Unit } from '../types';
import { ApiError } from '../api/client';
import { BunkPage, BunkFormSection } from '../components/bunker';
import { Button, Field, Spinner } from '../components/ui';
import { MapCanvas, NODE_TYPE, ownerAtPhase, ownerColor, ownerLabel } from '../components/map';

const BATTLE_SIZES: BattleSize[] = ['Incursion', 'Strike Force', 'Onslaught'];
const SCARS = ['Crippling Damage', 'Battle-weary', 'Fatigued', 'Disgraced', 'Mark of Shame', 'Deep Scars'];

interface RowState {
  selected: boolean;
  was_warlord: boolean;
  enemies_destroyed: number;
  was_destroyed: boolean;
  marked_for_greatness: boolean;
  ooa_result: 'passed' | 'devastating_blow' | 'battle_scar' | null;
  grant_scar: string;
  grant_honour_name: string;
}

const emptyRow = (): RowState => ({
  selected: false, was_warlord: false, enemies_destroyed: 0, was_destroyed: false,
  marked_for_greatness: false, ooa_result: null, grant_scar: '', grant_honour_name: '',
});

export default function BattleEntryPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const draftKey = `inscribe-draft:${campaignId}`;

  const forcesQ = useQuery({
    queryKey: ['campaign', campaignId, 'forces'],
    queryFn: () => forcesApi.list(campaignId!),
    enabled: !!campaignId,
  });
  const campaignQ = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignsApi.get(campaignId!),
    enabled: !!campaignId,
  });

  const [battleSize, setBattleSize] = useState<BattleSize>('Strike Force');
  const [mission, setMission] = useState('');
  const [deployment, setDeployment] = useState('');
  const [duration, setDuration] = useState(5);
  const [attackerId, setAttackerId] = useState('');
  const [defenderId, setDefenderId] = useState('');
  const [attackerScore, setAttackerScore] = useState(0);
  const [defenderScore, setDefenderScore] = useState(0);
  const [outcomeOverride, setOutcomeOverride] = useState<BattleOutcome | null>(null);
  const [opposingCommander, setOpposingCommander] = useState('');
  const [notes, setNotes] = useState('');
  const [contestingNodeId, setContestingNodeId] = useState<string | null>(null);
  const [claimOnWin, setClaimOnWin] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If the picked node was removed/renamed since the draft, drop the stale id.
  useEffect(() => {
    if (!contestingNodeId || !campaignQ.data) return;
    const m = campaignQ.data.campaign.sector_map;
    if (m && !m.nodes.some(n => n.id === contestingNodeId)) {
      setContestingNodeId(null);
      setClaimOnWin(false);
    }
  }, [contestingNodeId, campaignQ.data]);

  // Restore draft.
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (d) {
        setBattleSize(d.battleSize ?? 'Strike Force'); setMission(d.mission ?? '');
        setDeployment(d.deployment ?? ''); setDuration(d.duration ?? 5);
        setAttackerId(d.attackerId ?? ''); setDefenderId(d.defenderId ?? '');
        setAttackerScore(d.attackerScore ?? 0); setDefenderScore(d.defenderScore ?? 0);
        setOutcomeOverride(d.outcomeOverride ?? null);
        setOpposingCommander(d.opposingCommander ?? ''); setNotes(d.notes ?? '');
        setContestingNodeId(d.contestingNodeId ?? null);
        setClaimOnWin(!!d.claimOnWin);
        setRows(d.rows ?? {});
      }
    } catch { /* ignore */ }
  }, [draftKey]);

  // Autosave draft.
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify({
        battleSize, mission, deployment, duration, attackerId, defenderId,
        attackerScore, defenderScore, outcomeOverride, opposingCommander, notes,
        contestingNodeId, claimOnWin, rows,
      }));
    }, 400);
    return () => clearTimeout(t);
  }, [draftKey, battleSize, mission, deployment, duration, attackerId, defenderId,
    attackerScore, defenderScore, outcomeOverride, opposingCommander, notes,
    contestingNodeId, claimOnWin, rows]);

  const attackerUnitsQ = useQuery({
    queryKey: ['campaign', campaignId, 'force', attackerId, 'units'],
    queryFn: () => unitsApi.list(campaignId!, attackerId),
    enabled: !!(campaignId && attackerId),
  });
  const defenderUnitsQ = useQuery({
    queryKey: ['campaign', campaignId, 'force', defenderId, 'units'],
    queryFn: () => unitsApi.list(campaignId!, defenderId),
    enabled: !!(campaignId && defenderId),
  });

  const inferredOutcome: BattleOutcome =
    attackerScore > defenderScore ? 'Attacker Wins'
      : defenderScore > attackerScore ? 'Defender Wins' : 'Draw';
  const outcome = outcomeOverride ?? inferredOutcome;

  if (forcesQ.isLoading) return <BunkPage active="03"><Spinner /></BunkPage>;
  const forces = (forcesQ.data?.forces ?? []).filter(f => f.is_active);
  const forceName = (id: string) => forces.find(f => f.id === id)?.name ?? '—';

  const campaign = campaignQ.data?.campaign;
  const sectorMap = campaign?.sector_map ?? null;
  const sectorPhase = campaign?.current_phase ?? 1;
  const contestingNode = sectorMap?.nodes.find(n => n.id === contestingNodeId) ?? null;
  const winnerForceId = outcome === 'Attacker Wins' ? attackerId
    : outcome === 'Defender Wins' ? defenderId : null;
  const claimEligible = !!contestingNodeId && outcome !== 'Draw' && !!winnerForceId;

  const row = (id: string) => rows[id] ?? emptyRow();
  const setRow = (id: string, patch: Partial<RowState>) =>
    setRows(r => ({ ...r, [id]: { ...emptyRow(), ...r[id], ...patch } }));

  const selectedInputs = (units: Unit[]): UnitBattleInput[] =>
    units.filter(u => row(u.id).selected).map(u => {
      const s = row(u.id);
      return {
        unit_id: u.id,
        was_warlord: s.was_warlord,
        enemies_destroyed: s.enemies_destroyed,
        was_destroyed: s.was_destroyed,
        marked_for_greatness: s.marked_for_greatness,
        ooa_result: s.ooa_result,
        grant_scar: s.grant_scar || undefined,
        grant_honour: s.grant_honour_name.trim()
          ? { category: 'Battle Trait' as const, name: s.grant_honour_name.trim() }
          : undefined,
      };
    });

  const aUnits = attackerUnitsQ.data?.units ?? [];
  const dUnits = defenderUnitsQ.data?.units ?? [];
  const aSel = selectedInputs(aUnits);
  const dSel = selectedInputs(dUnits);

  const validation = [
    { ok: !!attackerId && !!defenderId && attackerId !== defenderId, label: 'Two distinct forces selected' },
    { ok: attackerScore > 0 || defenderScore > 0, label: 'Scores recorded' },
    { ok: aSel.length + dSel.length > 0, label: 'At least one unit deployed' },
    { ok: aSel.filter(u => u.marked_for_greatness).length <= 1 && dSel.filter(u => u.marked_for_greatness).length <= 1, label: 'Max one Marked for Greatness per side' },
  ];
  const canCommit = validation.every(v => v.ok);

  const commit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await battlesApi.create(campaignId!, {
        battle_size: battleSize, mission_name: mission, deployment,
        duration_turns: duration, opposing_commander: opposingCommander,
        attacker_force_id: attackerId, defender_force_id: defenderId,
        outcome, attacker_score: attackerScore, defender_score: defenderScore,
        notes, attacker_units: aSel, defender_units: dSel,
        contesting_node_id: contestingNodeId,
        claim_node_on_win: !!contestingNodeId && claimOnWin,
      });
      localStorage.removeItem(draftKey);
      navigate(`/campaigns/${campaignId}?tab=battles`);
      void res;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to commit battle');
    } finally { setBusy(false); }
  };

  const unitRow = (u: Unit) => {
    const s = row(u.id);
    return (
      <div key={u.id} className="border border-bunk-line bg-bunk-surfaceLo p-3">
        <label className="flex items-center gap-2 font-display font-bold uppercase tracking-wide text-bunk-bone">
          <input type="checkbox" checked={s.selected} onChange={e => setRow(u.id, { selected: e.target.checked })} />
          {u.name}
          <span className="font-mono text-[10px] text-bunk-boneDim normal-case tracking-mono-sm">
            {u.unit_type || u.datasheet || '—'} · {u.xp} XP
          </span>
        </label>
        {s.selected && (
          <div className="grid sm:grid-cols-3 gap-2 mt-3">
            <Field label="Enemies Destroyed">
              <input type="number" min={0} value={s.enemies_destroyed}
                onChange={e => setRow(u.id, { enemies_destroyed: +e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm self-end pb-2">
              <input type="checkbox" checked={s.was_warlord} onChange={e => setRow(u.id, { was_warlord: e.target.checked })} /> Warlord
            </label>
            <label className="flex items-center gap-2 text-sm self-end pb-2">
              <input type="checkbox" checked={s.marked_for_greatness} onChange={e => setRow(u.id, { marked_for_greatness: e.target.checked })} /> Marked for Greatness
            </label>
            <label className="flex items-center gap-2 text-sm self-end pb-2">
              <input type="checkbox" checked={s.was_destroyed}
                onChange={e => setRow(u.id, { was_destroyed: e.target.checked, ooa_result: e.target.checked ? s.ooa_result : null, grant_scar: e.target.checked ? s.grant_scar : '' })} /> Destroyed
            </label>
            {s.was_destroyed && (
              <>
                <Field label="Out of Action">
                  <select value={s.ooa_result ?? ''} onChange={e => setRow(u.id, { ooa_result: (e.target.value || null) as RowState['ooa_result'] })}>
                    <option value="">— not tested —</option>
                    <option value="passed">Passed</option>
                    <option value="battle_scar">Battle Scar</option>
                    <option value="devastating_blow">Devastating Blow</option>
                  </select>
                </Field>
                {s.ooa_result === 'battle_scar' && (
                  <Field label="Scar to apply">
                    <select value={s.grant_scar} onChange={e => setRow(u.id, { grant_scar: e.target.value })}>
                      <option value="">— none —</option>
                      {SCARS.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                    </select>
                  </Field>
                )}
              </>
            )}
            <Field label="Grant Battle Honour (if earned)">
              <input value={s.grant_honour_name}
                placeholder="e.g. Duellist (only applied if a rank was gained)"
                onChange={e => setRow(u.id, { grant_honour_name: e.target.value })} />
            </Field>
          </div>
        )}
      </div>
    );
  };

  return (
    <BunkPage active="03">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <Link to={`/campaigns/${campaignId}?tab=battles`} className="font-mono text-[10px] tracking-mono-lg text-bunk-rust hover:text-bunk-bone">‹ BATTLES</Link>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-bunk-bone leading-none mt-2">
            Inscribe <span className="text-bunk-rust">Battle</span>
          </h1>
          <p className="font-mono text-[10px] tracking-mono-sm text-bunk-boneDim mt-2 uppercase">Draft autosaves locally</p>
        </div>
        <Button onClick={commit} disabled={!canCommit || busy}>{busy ? '…' : '＋ Commit Battle'}</Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="grid gap-5">
          <BunkFormSection num="01" title="Engagement">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Battle Size">
                <select value={battleSize} onChange={e => setBattleSize(e.target.value as BattleSize)}>
                  {BATTLE_SIZES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Mission (optional)"><input value={mission} onChange={e => setMission(e.target.value)} /></Field>
              <Field label="Deployment (optional)"><input value={deployment} onChange={e => setDeployment(e.target.value)} /></Field>
              <Field label="Duration (turns)"><input type="number" min={0} value={duration} onChange={e => setDuration(+e.target.value)} /></Field>
            </div>
          </BunkFormSection>

          <BunkFormSection num="02" title="Outcome">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Attacker Force">
                <select value={attackerId} onChange={e => setAttackerId(e.target.value)}>
                  <option value="">— select —</option>
                  {forces.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
              <Field label="Defender Force">
                <select value={defenderId} onChange={e => setDefenderId(e.target.value)}>
                  <option value="">— select —</option>
                  {forces.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-6 items-end mt-5">
              <div>
                <div className="font-mono text-[9px] tracking-mono-md text-bunk-rust mb-1 uppercase">Your Score</div>
                <input
                  type="number" min={0} value={attackerScore}
                  onChange={e => setAttackerScore(+e.target.value)}
                  className="!w-full !bg-transparent !border-0 !border-b-2 !border-b-bunk-rust !rounded-none !p-0 font-display !text-7xl sm:!text-8xl font-bold !text-bunk-rust !tracking-tight tabular-nums" />
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-mono-md text-bunk-boneDim mb-1 uppercase">Opposing Score</div>
                <input
                  type="number" min={0} value={defenderScore}
                  onChange={e => setDefenderScore(+e.target.value)}
                  className="!w-full !bg-transparent !border-0 !border-b-2 !border-b-bunk-line !rounded-none !p-0 font-display !text-7xl sm:!text-8xl font-bold !text-bunk-boneDim !tracking-tight tabular-nums" />
              </div>
            </div>
            <div className="mt-5">
              <div className="font-mono text-[9px] tracking-mono-md text-bunk-rust mb-1.5 uppercase">Result (auto from score — override if needed)</div>
              <div className="flex gap-px" style={{ background: '#2e251e' }}>
                {(['Attacker Wins', 'Draw', 'Defender Wins'] as BattleOutcome[]).map(o => (
                  <button key={o} type="button" onClick={() => setOutcomeOverride(o === inferredOutcome ? null : o)}
                    className={`flex-1 px-3 py-2 font-display text-[12px] font-bold tracking-[1px] uppercase ${
                      outcome === o ? 'bg-bunk-rust text-bunk-ink' : 'bg-bunk-ink text-bunk-bone hover:text-bunk-rust'}`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <Field label="Opposing Commander (optional)"><input value={opposingCommander} onChange={e => setOpposingCommander(e.target.value)} /></Field>
            </div>

            {sectorMap && sectorMap.nodes.length > 0 && (
              <div
                className="mt-5 p-4 bg-bunk-ink relative"
                style={{ border: '2px solid #f4c14b', borderLeftWidth: 4 }}
              >
                <div
                  className="absolute -top-2.5 left-3 px-1.5 font-mono text-[9px] tracking-mono-lg font-bold uppercase"
                  style={{ background: '#f4c14b', color: '#06040a' }}
                >
                  ◆ SECTOR · NEW
                </div>
                <div className="font-mono text-[9px] tracking-mono-lg text-bunk-rust mb-1.5 uppercase">Contesting Node</div>
                <select
                  value={contestingNodeId ?? ''}
                  onChange={(e) => setContestingNodeId(e.target.value || null)}
                  className="w-full"
                >
                  <option value="">— not contesting a node —</option>
                  {sectorMap.nodes.map(n => {
                    const meta = NODE_TYPE[n.type];
                    const owner = ownerAtPhase(n, sectorPhase);
                    return (
                      <option key={n.id} value={n.id}>
                        {meta.glyph} {n.name} · held by {ownerLabel(owner, forces)}
                      </option>
                    );
                  })}
                </select>

                {contestingNode && (() => {
                  const ownerNow = ownerAtPhase(contestingNode, sectorPhase);
                  const c = ownerColor(ownerNow, forces);
                  return (
                    <div className="mt-3 flex items-center gap-2.5">
                      <span className="w-3 h-3 flex-shrink-0" style={{ background: c }} />
                      <span className="font-display text-[13px] font-bold uppercase tracking-wide text-bunk-bone">
                        {contestingNode.name}
                      </span>
                      <span className="font-mono text-[10px] tracking-mono-md uppercase" style={{ color: c }}>
                        held by {ownerLabel(ownerNow, forces)}
                      </span>
                      {contestingNode.isObjective && (
                        <span className="ml-auto font-mono text-[9px] tracking-mono-md text-bunk-warning uppercase">◆ OBJECTIVE</span>
                      )}
                    </div>
                  );
                })()}

                <label
                  className={`mt-3 flex items-center gap-3 px-3 py-2.5 border ${
                    claimEligible ? 'border-bunk-warning bg-bunk-warning/10 cursor-pointer' : 'border-bunk-line opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={claimOnWin && claimEligible}
                    disabled={!claimEligible}
                    onChange={(e) => setClaimOnWin(e.target.checked)}
                  />
                  <span className="font-display text-[12px] font-bold uppercase tracking-wide text-bunk-bone">
                    Claim node if I win
                  </span>
                  <span className="ml-auto font-mono text-[9px] tracking-mono-md text-bunk-boneDim uppercase">
                    {!contestingNodeId
                      ? 'pick a node first'
                      : outcome === 'Draw'
                        ? 'no winner on draw'
                        : winnerForceId
                          ? `flips to ${forceName(winnerForceId)} on confirm`
                          : 'select both forces'}
                  </span>
                </label>
                <p className="mt-2 font-narrative italic text-[12px] text-bunk-boneDim leading-snug">
                  Tagging the battle records the engagement on this node. The node only flips owner on a
                  confirmed win with this toggle on — otherwise it's logged as contested.
                </p>
              </div>
            )}
          </BunkFormSection>

          <BunkFormSection num="03" title="Units Deployed" count={`${aSel.length + dSel.length} selected`}>
            {!attackerId || !defenderId ? (
              <p className="font-mono text-[11px] text-bunk-boneDim uppercase">Select both forces to choose units.</p>
            ) : (
              <div className="grid gap-4">
                <div>
                  <div className="font-mono text-[10px] tracking-mono-lg text-bunk-rust mb-2">// {forceName(attackerId)} (ATTACKER)</div>
                  <div className="grid gap-2">{aUnits.length ? aUnits.map(unitRow) : <p className="text-xs text-bunk-boneMute">No units.</p>}</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] tracking-mono-lg text-bunk-rust mb-2">// {forceName(defenderId)} (DEFENDER)</div>
                  <div className="grid gap-2">{dUnits.length ? dUnits.map(unitRow) : <p className="text-xs text-bunk-boneMute">No units.</p>}</div>
                </div>
              </div>
            )}
          </BunkFormSection>

          <BunkFormSection num="04" title="Battle Notes">
            <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} className="font-narrative !text-base" />
          </BunkFormSection>
        </div>

        <div className="grid gap-4 lg:sticky lg:top-4">
          <div className="bg-bunk-surface border border-bunk-lineHi">
            <div className="px-4 py-2 bg-bunk-rust text-bunk-ink font-mono text-[10px] tracking-mono-lg font-bold">// PREVIEW</div>
            <div className="p-4 font-mono text-[11px] tracking-mono-sm text-bunk-boneDim space-y-1.5">
              <div className="font-display text-lg font-bold text-bunk-bone uppercase">{mission || 'Engagement'}</div>
              <div>{forceName(attackerId)} <span className="text-bunk-rust">{attackerScore}</span> – <span className="text-bunk-bone">{defenderScore}</span> {forceName(defenderId)}</div>
              <div>RESULT <span className="float-right text-bunk-green">{outcome}</span></div>
              <div>UNITS <span className="float-right text-bunk-bone">{aSel.length + dSel.length}</span></div>
              <div>SIZE <span className="float-right text-bunk-bone">{battleSize}</span></div>
              {contestingNode && (
                <div>
                  NODE <span className="float-right text-bunk-bone uppercase">{contestingNode.name}</span>
                </div>
              )}
              {contestingNode && claimOnWin && claimEligible && (
                <div className="text-bunk-warning">
                  CLAIM <span className="float-right">on confirmed win</span>
                </div>
              )}
            </div>
          </div>

          {sectorMap && sectorMap.nodes.length > 0 && (
            <div className="bg-bunk-surfaceLo border border-bunk-line">
              <div className="px-4 py-2 border-b border-dashed border-bunk-line font-mono text-[9px] tracking-mono-lg text-bunk-rust uppercase flex items-center">
                // SECTOR
                {contestingNode && <span className="ml-auto text-bunk-warning">◆ TARGET LOCKED</span>}
              </div>
              <div className="p-2">
                <MapCanvas
                  map={sectorMap}
                  forces={forces}
                  phase={sectorPhase}
                  zoom={contestingNode ? 1 : 0}
                  selectedId={contestingNodeId}
                  onSelect={(id) => setContestingNodeId(id === contestingNodeId ? null : id)}
                  height={200}
                />
              </div>
              <p className="px-4 pb-3 font-narrative italic text-[12px] text-bunk-boneDim leading-snug">
                {contestingNode
                  ? `Tap another world to retarget, or tap "${contestingNode.name}" again to clear.`
                  : 'Tap a world here to tag the battle, or use the picker above.'}
              </p>
            </div>
          )}
          <div className="bg-bunk-surfaceLo border border-bunk-line">
            <div className="px-4 py-2 border-b border-dashed border-bunk-line font-mono text-[9px] tracking-mono-lg text-bunk-rust">// VALIDATION</div>
            <div className="p-4 font-mono text-[11px] space-y-1.5">
              {validation.map(v => (
                <div key={v.label} className={v.ok ? 'text-bunk-green' : 'text-bunk-warning'}>
                  {v.ok ? '●' : '○'} {v.label}
                </div>
              ))}
            </div>
          </div>
          {error && <p className="font-mono text-[11px] text-bunk-red">{error}</p>}
        </div>
      </div>
    </BunkPage>
  );
}
