import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { battlesApi, unitsApi } from '../../api/endpoints';
import type { Battle, BattleOutcome, BattleSize, CampaignRole, CrusadeForce, Unit, OutOfActionResult } from '../../types';
import { Badge, Button, Card, EmptyState, Field } from '../../components/ui';
import { ApiError } from '../../api/client';

const BATTLE_SIZES: BattleSize[] = ['Incursion', 'Strike Force', 'Onslaught'];

interface UnitChoice {
  unit: Unit;
  was_warlord: boolean;
  enemies_destroyed: number;
  was_destroyed: boolean;
  marked_for_greatness: boolean;
  ooa_result: OutOfActionResult | null;
}

export default function BattlesTab({ campaignId, forces, battles, defaultBattleSize, currentUserId, currentRole, campaignState }: {
  campaignId: string; forces: CrusadeForce[]; battles: Battle[]; defaultBattleSize: BattleSize;
  currentUserId: string; currentRole: CampaignRole;
  campaignState: 'setup' | 'active' | 'concluded';
}) {
  const [showRecord, setShowRecord] = useState(false);
  const activeForces = forces.filter(f => f.is_active);

  if (campaignState === 'setup') {
    return <EmptyState icon="◷" title="Campaign hasn't started yet" description="An admin must Start the campaign before battles can be recorded." />;
  }
  if (campaignState === 'concluded') {
    return <EmptyState icon="◇" title="Campaign concluded" description="No new battles can be recorded. Admins can reopen to allow more." />;
  }
  if (activeForces.length < 2) {
    return <EmptyState icon="◉" title="Need at least 2 active forces" description="Add or rejoin a force before recording battles." />;
  }

  const pending = battles.filter(b => b.status === 'pending' || b.status === 'disputed');
  const confirmed = battles.filter(b => b.status === 'confirmed');

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">{confirmed.length} Confirmed · {pending.length} Pending</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowRecord(s => !s)}>{showRecord ? 'Close' : 'Quick record'}</Button>
          <Link to={`/campaigns/${campaignId}/battles/new`}>
            <Button>＋ Inscribe Battle</Button>
          </Link>
        </div>
      </div>

      {showRecord && <RecordBattleForm campaignId={campaignId} forces={activeForces} defaultBattleSize={defaultBattleSize} onDone={() => setShowRecord(false)} />}

      {pending.length > 0 && (
        <div className="space-y-2 mb-6">
          <h3 className="text-xs font-semibold tracking-wider text-ink-fade uppercase">Awaiting Confirmation</h3>
          {pending.map(b => <BattleRow key={b.id} battle={b} forces={forces} campaignId={campaignId} currentUserId={currentUserId} currentRole={currentRole} />)}
        </div>
      )}

      {confirmed.length === 0 && pending.length === 0 ? (
        <EmptyState icon="⚔" title="No battles yet" description="Record your first battle to start awarding XP and Requisition Points." />
      ) : confirmed.length > 0 ? (
        <div className="space-y-2 mt-4">
          {pending.length > 0 && <h3 className="text-xs font-semibold tracking-wider text-ink-fade uppercase">Confirmed</h3>}
          {confirmed.map(b => <BattleRow key={b.id} battle={b} forces={forces} campaignId={campaignId} currentUserId={currentUserId} currentRole={currentRole} />)}
        </div>
      ) : null}
    </>
  );
}

function BattleRow({ battle, forces, campaignId, currentUserId, currentRole }: {
  battle: Battle; forces: CrusadeForce[]; campaignId: string;
  currentUserId: string; currentRole: CampaignRole;
}) {
  const qc = useQueryClient();
  const att = forces.find(f => f.id === battle.attacker_force_id);
  const def = forces.find(f => f.id === battle.defender_force_id);
  const winnerId = battle.outcome === 'Attacker Wins' ? battle.attacker_force_id : battle.outcome === 'Defender Wins' ? battle.defender_force_id : null;
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';
  const userOwnsForceInBattle = [att, def].some(f => f?.user_id === currentUserId);
  const canConfirm = battle.status === 'pending' && battle.submitted_by_user_id !== currentUserId && (isAdmin || userOwnsForceInBattle);
  const canCancel = (battle.status === 'pending' || battle.status === 'disputed') && (isAdmin || battle.submitted_by_user_id === currentUserId);

  const [error, setError] = useState<string | null>(null);
  const confirmM = useMutation({
    mutationFn: () => battlesApi.confirm(campaignId, battle.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaignId] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });
  const disputeM = useMutation({
    mutationFn: () => {
      const reason = prompt('Why are you disputing this result? (optional)') ?? '';
      return battlesApi.dispute(campaignId, battle.id, reason);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaignId] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });
  const cancelM = useMutation({
    mutationFn: () => battlesApi.remove(campaignId, battle.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaignId] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  const statusBadge = battle.status === 'confirmed'
    ? (battle.outcome === 'Draw' ? 'dim' : 'success')
    : battle.status === 'pending' ? 'warning'
    : battle.status === 'disputed' ? 'danger' : 'dim';

  return (
    <Card className={`p-4 ${battle.status === 'pending' ? 'border-warning/30' : battle.status === 'disputed' ? 'border-danger/40' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Badge color="dim">{battle.battle_size}</Badge>
            <span className={winnerId === battle.attacker_force_id ? 'font-semibold' : ''}>{att?.name ?? '?'}</span>
            <span className="text-ink-fade text-xs">vs</span>
            <span className={winnerId === battle.defender_force_id ? 'font-semibold' : ''}>{def?.name ?? '?'}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-ink-fade mt-1">
            {battle.mission_name && <span>{battle.mission_name}</span>}
            <span>· {new Date(battle.occurred_at).toLocaleDateString()}</span>
            {battle.status === 'pending' && <span>· awaiting opponent confirmation</span>}
            {battle.status === 'disputed' && battle.dispute_reason && <span className="text-danger">· "{battle.dispute_reason}"</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={statusBadge as any}>{battle.status === 'confirmed' ? battle.outcome : battle.status}</Badge>
          {battle.status === 'pending' && <Badge color="dim">{battle.outcome}</Badge>}
        </div>
      </div>
      {(canConfirm || canCancel || battle.status === 'disputed') && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
          {canConfirm && (
            <>
              <Button onClick={() => confirmM.mutate()} disabled={confirmM.isPending}>
                {confirmM.isPending ? '…' : '✓ Confirm Result'}
              </Button>
              <Button variant="secondary" onClick={() => disputeM.mutate()} disabled={disputeM.isPending}>
                {disputeM.isPending ? '…' : '⚑ Dispute'}
              </Button>
            </>
          )}
          {canCancel && (
            <Button variant="ghost"
              onClick={() => confirm('Cancel this battle submission?') && cancelM.mutate()}
              disabled={cancelM.isPending}
            >Cancel</Button>
          )}
          {battle.status === 'disputed' && isAdmin && (
            <Button onClick={() => confirmM.mutate()} disabled={confirmM.isPending}>
              {confirmM.isPending ? '…' : 'Admin Force-Confirm'}
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </Card>
  );
}

function RecordBattleForm({ campaignId, forces, defaultBattleSize, onDone }: {
  campaignId: string; forces: CrusadeForce[]; defaultBattleSize: BattleSize; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'setup' | 'attacker_army' | 'defender_army' | 'results'>('setup');
  const [battleSize, setBattleSize] = useState<BattleSize>(defaultBattleSize);
  const [missionName, setMissionName] = useState('');
  const [attackerId, setAttackerId] = useState('');
  const [defenderId, setDefenderId] = useState('');
  const [outcome, setOutcome] = useState<BattleOutcome>('Attacker Wins');
  const [notes, setNotes] = useState('');
  const [attackerUnits, setAttackerUnits] = useState<UnitChoice[]>([]);
  const [defenderUnits, setDefenderUnits] = useState<UnitChoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [unitsAttQ, unitsDefQ] = useQueries({
    queries: [
      { queryKey: ['campaign', campaignId, 'force', attackerId, 'units'], queryFn: () => unitsApi.list(campaignId, attackerId), enabled: !!attackerId },
      { queryKey: ['campaign', campaignId, 'force', defenderId, 'units'], queryFn: () => unitsApi.list(campaignId, defenderId), enabled: !!defenderId },
    ],
  });

  const m = useMutation({
    mutationFn: () => battlesApi.create(campaignId, {
      battle_size: battleSize, mission_name: missionName, attacker_force_id: attackerId, defender_force_id: defenderId,
      outcome, notes,
      attacker_units: attackerUnits.map(u => ({
        unit_id: u.unit.id, was_warlord: u.was_warlord, enemies_destroyed: u.enemies_destroyed,
        was_destroyed: u.was_destroyed, marked_for_greatness: u.marked_for_greatness, ooa_result: u.ooa_result,
      })),
      defender_units: defenderUnits.map(u => ({
        unit_id: u.unit.id, was_warlord: u.was_warlord, enemies_destroyed: u.enemies_destroyed,
        was_destroyed: u.was_destroyed, marked_for_greatness: u.marked_for_greatness, ooa_result: u.ooa_result,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      onDone();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  const goNext = () => {
    if (step === 'setup') {
      const attUnits = (unitsAttQ.data?.units ?? []).filter(u => u.is_active);
      setAttackerUnits(attUnits.map(emptyChoice));
      setStep('attacker_army');
    } else if (step === 'attacker_army') {
      const defUnits = (unitsDefQ.data?.units ?? []).filter(u => u.is_active);
      setDefenderUnits(defUnits.map(emptyChoice));
      setStep('defender_army');
    } else if (step === 'defender_army') {
      setStep('results');
    }
  };

  return (
    <Card className="p-5 mb-4">
      {step === 'setup' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {BATTLE_SIZES.map(bs => (
              <button key={bs} onClick={() => setBattleSize(bs)} className={`flex-1 py-2 rounded text-sm font-medium ${battleSize === bs ? 'bg-accent text-white' : 'bg-bg-elevated text-ink-dim'}`}>
                {bs}
              </button>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Attacker">
              <select value={attackerId} onChange={e => setAttackerId(e.target.value)}>
                <option value="">Select…</option>
                {forces.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Defender">
              <select value={defenderId} onChange={e => setDefenderId(e.target.value)}>
                <option value="">Select…</option>
                {forces.filter(f => f.id !== attackerId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Mission Name (optional)"><input value={missionName} onChange={e => setMissionName(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Button onClick={goNext} disabled={!attackerId || !defenderId}>Continue → Army Selection</Button>
            <Button variant="ghost" onClick={onDone}>Cancel</Button>
          </div>
        </div>
      )}

      {step === 'attacker_army' && (
        <ArmyStep title={`Attacker: ${forces.find(f => f.id === attackerId)?.name}`}
          choices={attackerUnits} onChange={setAttackerUnits}
          onNext={goNext} onBack={() => setStep('setup')} />
      )}
      {step === 'defender_army' && (
        <ArmyStep title={`Defender: ${forces.find(f => f.id === defenderId)?.name}`}
          choices={defenderUnits} onChange={setDefenderUnits}
          onNext={goNext} onBack={() => setStep('attacker_army')} />
      )}

      {step === 'results' && (
        <div className="space-y-4">
          <h3 className="font-semibold">Result</h3>
          <div className="flex gap-1 p-1 bg-bg-elevated rounded-lg">
            {(['Attacker Wins', 'Defender Wins', 'Draw'] as BattleOutcome[]).map(o => (
              <button key={o} onClick={() => setOutcome(o)}
                className={`flex-1 py-1.5 px-2 rounded text-xs font-medium ${outcome === o ? 'bg-accent text-white' : 'text-ink-dim'}`}>{o}</button>
            ))}
          </div>
          <Field label="Notes (optional)"><textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></Field>

          <Card className="p-4 bg-bg-elevated">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-fade mb-2">Automatic effects on save</h4>
            <ul className="text-xs text-ink-dim space-y-1">
              <li>• Each unit gains +1 XP (Battle Experience)</li>
              <li>• +1 XP per 3 kills threshold crossed</li>
              <li>• +3 XP to Marked-for-Greatness unit (one per side)</li>
              <li>• Both forces gain +1 RP (cap 10) and +1 battle tally</li>
              <li>• Winner gains +1 victory</li>
              <li>• Devastating Blow auto-removes the most recent honour</li>
              <li>• Battle Scars must be added afterwards via the unit's Crusade Card</li>
            </ul>
          </Card>

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep('defender_army')}>Back</Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? '…' : '⚔ Record Battle'}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function emptyChoice(unit: Unit): UnitChoice {
  return { unit, was_warlord: false, enemies_destroyed: 0, was_destroyed: false, marked_for_greatness: false, ooa_result: null };
}

function ArmyStep({ title, choices, onChange, onNext, onBack }: {
  title: string; choices: UnitChoice[]; onChange: (c: UnitChoice[]) => void; onNext: () => void; onBack: () => void;
}) {
  const totalPoints = choices.reduce((s, c) => s + c.unit.points_cost, 0);
  const markedCount = choices.filter(c => c.marked_for_greatness).length;
  const update = (idx: number, patch: Partial<UnitChoice>) =>
    onChange(choices.map((c, i) => i === idx ? { ...c, ...patch } : c));

  if (choices.length === 0) return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-ink-fade mb-4">This force has no units yet. Add units to its Order of Battle first.</p>
      <Button variant="ghost" onClick={onBack}>Back</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-xs text-ink-fade">Toggle which units fought, record kills, destruction, and Marked for Greatness. {totalPoints} points listed.</p>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {choices.map((c, i) => (
          <div key={c.unit.id} className="bg-bg-elevated p-3 rounded-lg">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-medium text-sm">{c.unit.name}</div>
                <div className="text-xs text-ink-fade">{c.unit.datasheet} · {c.unit.points_cost} pts</div>
              </div>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={c.was_warlord} onChange={e => update(i, { was_warlord: e.target.checked })} />
                Warlord
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <label>
                <span className="text-ink-fade">Enemy units destroyed</span>
                <input type="number" min={0} value={c.enemies_destroyed} onChange={e => update(i, { enemies_destroyed: +e.target.value })} className="mt-1" />
              </label>
              <div className="space-y-1">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={c.marked_for_greatness}
                    onChange={e => update(i, { marked_for_greatness: e.target.checked })}
                    disabled={!c.marked_for_greatness && markedCount >= 1} />
                  <span>Marked for Greatness <span className="text-ink-fade">(+3 XP)</span></span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={c.was_destroyed}
                    onChange={e => update(i, { was_destroyed: e.target.checked, ooa_result: e.target.checked ? c.ooa_result : null })} />
                  <span>Destroyed</span>
                </label>
              </div>
            </div>
            {c.was_destroyed && (
              <div className="mt-2">
                <span className="text-xs text-ink-fade">Out of Action test (roll D6, 1 = fail):</span>
                <div className="flex gap-1 mt-1">
                  {([
                    ['passed', 'Passed (2+)', 'success'],
                    ['battle_scar', 'Battle Scar', 'warning'],
                    ['devastating_blow', 'Devastating Blow', 'danger'],
                  ] as const).map(([val, label]) => (
                    <button key={val} onClick={() => update(i, { ooa_result: val })}
                      className={`text-[10px] px-2 py-1 rounded ${c.ooa_result === val ? 'bg-accent text-white' : 'bg-bg text-ink-dim'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Continue →</Button>
      </div>
    </div>
  );
}
