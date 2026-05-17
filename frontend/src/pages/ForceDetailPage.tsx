import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { forcesApi, unitsApi, requisitionsApi } from '../api/endpoints';
import type { Unit, CrusadeForce } from '../types';
import { rankForXP } from '../types';
import { Badge, Button, Card, EmptyState, Field, Spinner } from '../components/ui';
import { BunkPage } from '../components/bunker';
import { ApiError } from '../api/client';

export default function ForceDetailPage() {
  const { campaignId, forceId } = useParams<{ campaignId: string; forceId: string }>();
  const qc = useQueryClient();

  const forceQ = useQuery({
    queryKey: ['campaign', campaignId, 'force', forceId],
    queryFn: () => forcesApi.get(campaignId!, forceId!),
    enabled: !!(campaignId && forceId),
  });
  const unitsQ = useQuery({
    queryKey: ['campaign', campaignId, 'force', forceId, 'units'],
    queryFn: () => unitsApi.list(campaignId!, forceId!),
    enabled: !!(campaignId && forceId),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReq, setShowReq] = useState(false);

  if (forceQ.isLoading || unitsQ.isLoading) return <BunkPage active="02"><Spinner /></BunkPage>;
  if (!forceQ.data) return <BunkPage active="02"><EmptyState icon="✕" title="Force not found" /></BunkPage>;

  const force = forceQ.data.force;
  const units = unitsQ.data?.units ?? [];
  const supplyUsed = units.filter(u => u.is_active).reduce((s, u) => s + u.points_cost, 0);

  return (
    <BunkPage active="02">
      <div className="mb-6">
        <Link to={`/campaigns/${campaignId}`} className="font-mono text-[10px] tracking-mono-lg text-bunk-rust hover:text-bunk-bone">‹ CAMPAIGN</Link>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-12 h-12 flex items-center justify-center font-display font-bold text-2xl text-bunk-ink" style={{ backgroundColor: force.color_hex }}>
            {force.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-bunk-bone leading-none">{force.name}</h1>
              {force.team && <Badge color="accent">{force.team}</Badge>}
            </div>
            <div className="font-mono text-[11px] tracking-mono-sm text-bunk-boneDim mt-1 uppercase">{force.faction || 'Unknown faction'}{force.player_name && ` · ${force.player_name}`}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px mb-6" style={{ background: '#2e251e' }}>
        <Stat label="Supply" value={`${supplyUsed} / ${force.supply_limit}`} sub={`${force.supply_limit - supplyUsed} free`} />
        <Stat label="Requisition Points" value={`${force.requisition_points} / 10`} accent />
        <Stat label="Battle Tally" value={force.battle_tally.toString()} />
        <Stat label="Victories" value={force.victories.toString()} color="text-success" />
      </div>

      <div className="flex justify-between items-center mb-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-bunk-bone">Requisitions</h2>
        <Button variant="secondary" onClick={() => setShowReq(s => !s)}>
          {showReq ? 'Close' : `Spend RP (${force.requisition_points})`}
        </Button>
      </div>
      {showReq && (
        <RequisitionsPanel
          campaignId={campaignId!}
          forceId={forceId!}
          force={force}
          units={units}
        />
      )}

      <div className="flex justify-between items-center mb-3 mt-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-bunk-bone">Order of Battle</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)}>Import from NewRecruit</Button>
          <Button onClick={() => setShowAdd(s => !s)}>{showAdd ? 'Close' : '+ Add Unit'}</Button>
        </div>
      </div>
      {showImport && (
        <NewRecruitImportModal
          campaignId={campaignId!} forceId={forceId!}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'force', forceId, 'units'] });
          }}
        />
      )}

      {showAdd && (
        <AddUnitForm campaignId={campaignId!} forceId={forceId!} onDone={() => setShowAdd(false)} />
      )}

      {units.length === 0 ? (
        <EmptyState icon="◐" title="No units yet" description="Add units to build the Order of Battle." />
      ) : (
        <div className="space-y-2">
          {units.map(u => (
            <Link key={u.id} to={`/campaigns/${campaignId}/units/${u.id}`} className="block">
              <UnitListRow unit={u} />
            </Link>
          ))}
        </div>
      )}
    </BunkPage>
  );
}

function Stat({ label, value, sub, color = '', accent = false }: { label: string; value: string; sub?: string; color?: string; accent?: boolean }) {
  return (
    <div className="bg-bunk-surface p-3 text-center">
      <div className={`font-display text-2xl font-bold tabular-nums ${color} ${accent ? 'text-bunk-rust' : 'text-bunk-bone'}`}>{value}</div>
      <div className="font-mono text-[9px] tracking-mono-md text-bunk-boneDim mt-1 uppercase">{label}</div>
      {sub && <div className="font-mono text-[9px] text-bunk-boneMute uppercase">{sub}</div>}
    </div>
  );
}

function UnitListRow({ unit }: { unit: Unit }) {
  const rank = rankForXP(unit.xp, unit.is_character, unit.can_exceed_30_xp);
  return (
    <Card className={`p-3 hover:border-accent/40 transition-colors ${!unit.is_active ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate">{unit.name}</span>
            {unit.is_character && <Badge color="accent">Character</Badge>}
            {unit.is_titanic && <Badge color="warning">Titanic</Badge>}
            {unit.is_epic_hero && <Badge color="warning">Epic Hero</Badge>}
            {!unit.is_active && <Badge color="danger">Permanently Destroyed</Badge>}
          </div>
          <div className="text-xs text-ink-fade truncate">
            {unit.datasheet || '—'} · {unit.points_cost} pts · <span className="text-accent">{rank}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-xs flex-shrink-0">
          <div><div className="font-bold text-accent">{unit.xp}</div><div className="text-ink-fade text-[10px]">XP</div></div>
          <div><div className={`font-bold ${unit.crusade_points < 0 ? 'text-danger' : ''}`}>{unit.crusade_points}</div><div className="text-ink-fade text-[10px]">CP</div></div>
          <div><div className="font-bold">{unit.units_destroyed}</div><div className="text-ink-fade text-[10px]">Kills</div></div>
        </div>
      </div>
    </Card>
  );
}

function AddUnitForm({ campaignId, forceId, onDone }: { campaignId: string; forceId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [datasheet, setDatasheet] = useState('');
  const [pointsCost, setPointsCost] = useState(100);
  const [equipment, setEquipment] = useState('');
  const [isCharacter, setIsCharacter] = useState(false);
  const [isTitanic, setIsTitanic] = useState(false);
  const [isEpicHero, setIsEpicHero] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => unitsApi.create(campaignId, forceId, {
      name: name.trim(), datasheet, points_cost: pointsCost, equipment,
      is_character: isCharacter, is_titanic: isTitanic, is_epic_hero: isEpicHero,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'force', forceId, 'units'] });
      onDone();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  return (
    <Card className="p-5 mb-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Unit Name (unique)"><input value={name} onChange={e => setName(e.target.value)} placeholder="Thekryst the Executioner" autoFocus /></Field>
        <Field label="Datasheet"><input value={datasheet} onChange={e => setDatasheet(e.target.value)} placeholder="Skorpekh Lord" /></Field>
        <Field label="Points Cost"><input type="number" min={0} value={pointsCost} onChange={e => setPointsCost(+e.target.value)} /></Field>
        <Field label="Equipment"><input value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="Hyperphase glaive, enmitic disintegrator pistol" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={isCharacter} onChange={e => setIsCharacter(e.target.checked)} />Character</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={isTitanic} onChange={e => setIsTitanic(e.target.checked)} />Titanic</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={isEpicHero} onChange={e => setIsEpicHero(e.target.checked)} />Epic Hero</label>
      </div>
      {error && <p className="text-sm text-danger mt-3">{error}</p>}
      <div className="flex gap-2 mt-4">
        <Button onClick={() => m.mutate()} disabled={!name.trim() || m.isPending}>{m.isPending ? '…' : 'Add Unit'}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}

// ──────── Requisitions ────────
function RequisitionsPanel({ campaignId, forceId, force, units }: {
  campaignId: string; forceId: string; force: CrusadeForce; units: Unit[];
}) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const active = units.filter(u => u.is_active);

  const logQ = useQuery({
    queryKey: ['campaign', campaignId, 'force', forceId, 'requisitions'],
    queryFn: () => requisitionsApi.log(campaignId, forceId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'force', forceId] });
    qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'force', forceId, 'units'] });
    qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'force', forceId, 'requisitions'] });
    qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'forces'] });
  };

  // Generic runner: each requisition resolves to { force, log } on success.
  function useReq(run: () => Promise<any>) {
    return useMutation({
      mutationFn: run,
      onSuccess: (r: any) => {
        invalidate();
        const paid = r?.log?.cost_paid;
        setMsg({ kind: 'ok', text: `Done${paid != null ? ` — spent ${paid} RP` : ''}.` });
      },
      onError: (e) => setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Requisition failed' }),
    });
  }

  const supplyM = useReq(() => requisitionsApi.increaseSupplyLimit(campaignId, forceId));

  const characters = active.filter(u => u.is_character);
  const veteranEligible = active.filter(u => !u.is_character && u.xp >= 30 && !u.can_exceed_30_xp);

  return (
    <Card className="p-5 mb-6">
      <p className="font-mono text-[10px] tracking-mono-sm text-bunk-boneDim mb-4 uppercase">
        {force.requisition_points} RP available · spending is logged · costs are charged server-side
      </p>
      {msg && (
        <p className={`font-mono text-[11px] mb-4 ${msg.kind === 'ok' ? 'text-bunk-green' : 'text-bunk-red'}`}>
          {msg.text}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {/* Increase Supply Limit */}
        <ReqCard title="Increase Supply Limit" cost="1 RP" desc="+200 pts to this force's Supply Limit.">
          <Button onClick={() => supplyM.mutate()} disabled={supplyM.isPending || force.requisition_points < 1}>
            {supplyM.isPending ? '…' : 'Purchase (1 RP)'}
          </Button>
        </ReqCard>

        {/* Renowned Heroes */}
        <ReqUnitForm
          title="Renowned Heroes" cost="1–3 RP"
          desc="Grant an Enhancement to a Character (cost scales with Enhancements already in the force; one per unit)."
          units={characters} emptyHint="No eligible Characters."
          extra={(unitId, set) => (
            <>
              <Field label="Enhancement Name">
                <input value={set.name} onChange={e => set.setName(e.target.value)} placeholder="Solar Inscriptions" />
              </Field>
              <Field label="Description (optional)">
                <input value={set.desc} onChange={e => set.setDesc(e.target.value)} />
              </Field>
            </>
          )}
          submit={(unitId, s) => requisitionsApi.renownedHeroes(campaignId, forceId, {
            unit_id: unitId, enhancement_name: s.name.trim(), description: s.desc || undefined,
          })}
          canSubmit={(_u, s) => !!s.name.trim()}
          run={useReq}
        />

        {/* Legendary Veterans */}
        <ReqUnitForm
          title="Legendary Veterans" cost="3 RP"
          desc="A non-Character unit at 30 XP may exceed the 30 XP cap and keep ranking up."
          units={veteranEligible} emptyHint="No non-Character unit has reached 30 XP."
          submit={(unitId) => requisitionsApi.legendaryVeterans(campaignId, forceId, unitId)}
          run={useReq}
        />

        {/* Rearm and Resupply */}
        <ReqUnitForm
          title="Rearm and Resupply" cost="1 RP"
          desc="Change a unit's wargear loadout (optionally adjust its points)."
          units={active} emptyHint="No active units."
          extra={(unitId, set) => (
            <>
              <Field label="New Equipment">
                <input value={set.name} onChange={e => set.setName(e.target.value)} placeholder="Gauss reaper, …" />
              </Field>
              <Field label="New Points Cost (optional)">
                <input type="number" min={0} value={set.num} onChange={e => set.setNum(e.target.value)} />
              </Field>
            </>
          )}
          submit={(unitId, s) => requisitionsApi.rearmAndResupply(campaignId, forceId, {
            unit_id: unitId, new_equipment: s.name.trim(),
            new_points_cost: s.num !== '' ? Number(s.num) : undefined,
          })}
          canSubmit={(_u, s) => !!s.name.trim()}
          run={useReq}
        />

        {/* Fresh Recruits */}
        <ReqUnitForm
          title="Fresh Recruits" cost="1–4 RP"
          desc="Add models to a unit (raises its points; cost scales with the unit's Battle Honours)."
          units={active} emptyHint="No active units."
          extra={(unitId, set) => (
            <Field label="Points to Add">
              <input type="number" min={1} value={set.num} onChange={e => set.setNum(e.target.value)} />
            </Field>
          )}
          submit={(unitId, s) => requisitionsApi.freshRecruits(campaignId, forceId, {
            unit_id: unitId, added_points: Number(s.num || 0),
          })}
          canSubmit={(_u, s) => Number(s.num) > 0}
          run={useReq}
        />

        {/* Repair & Recuperate pointer */}
        <ReqCard title="Repair and Recuperate" cost="1–5 RP" desc="Remove a Battle Scar — use the Repair action on the scar from that unit's dossier.">
          <span className="font-mono text-[10px] text-bunk-boneMute uppercase">Per-scar — on the Unit page</span>
        </ReqCard>
      </div>

      <div className="mt-6">
        <h3 className="font-mono text-[9px] tracking-mono-lg text-bunk-rust mb-2">// REQUISITION LOG</h3>
        {logQ.data && logQ.data.log.length > 0 ? (
          <div className="border border-bunk-line divide-y divide-bunk-line">
            {logQ.data.log.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2 font-mono text-[11px]">
                <span className="text-bunk-bone flex-1 truncate">{e.requisition_name}</span>
                {e.notes && <span className="text-bunk-boneDim truncate hidden sm:block">{e.notes}</span>}
                <span className="text-bunk-rust">−{e.cost_paid} RP</span>
                <span className="text-bunk-boneMute">{e.used_at ? new Date(e.used_at).toISOString().slice(0, 10) : ''}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-mono text-[10px] text-bunk-boneMute uppercase">No requisitions spent yet.</p>
        )}
      </div>
    </Card>
  );
}

function ReqCard({ title, cost, desc, children }: {
  title: string; cost: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-bunk-surfaceLo border border-bunk-line p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display font-bold uppercase tracking-wide text-bunk-bone">{title}</span>
        <span className="font-mono text-[10px] tracking-mono-md text-bunk-rust">{cost}</span>
      </div>
      <p className="text-xs text-bunk-boneDim flex-1">{desc}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ReqUnitForm({ title, cost, desc, units, emptyHint, extra, submit, canSubmit, run }: {
  title: string; cost: string; desc: string; units: Unit[]; emptyHint: string;
  extra?: (unitId: string, set: { name: string; setName: (v: string) => void; desc: string; setDesc: (v: string) => void; num: string; setNum: (v: string) => void }) => React.ReactNode;
  submit: (unitId: string, s: { name: string; desc: string; num: string }) => Promise<any>;
  canSubmit?: (unitId: string, s: { name: string; desc: string; num: string }) => boolean;
  run: (fn: () => Promise<any>) => { mutate: () => void; isPending: boolean };
}) {
  const [unitId, setUnitId] = useState('');
  const [name, setName] = useState('');
  const [dsc, setDsc] = useState('');
  const [num, setNum] = useState('');
  const m = run(() => submit(unitId, { name, desc: dsc, num }));
  const s = { name, desc: dsc, num };
  const ok = !!unitId && (!canSubmit || canSubmit(unitId, s));

  return (
    <ReqCard title={title} cost={cost} desc={desc}>
      {units.length === 0 ? (
        <span className="font-mono text-[10px] text-bunk-boneMute uppercase">{emptyHint}</span>
      ) : (
        <div className="grid gap-2">
          <Field label="Unit">
            <select value={unitId} onChange={e => setUnitId(e.target.value)}>
              <option value="">— select —</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {extra && unitId && extra(unitId, { name, setName, desc: dsc, setDesc: setDsc, num, setNum })}
          <Button onClick={() => m.mutate()} disabled={!ok || m.isPending}>
            {m.isPending ? '…' : `Purchase (${cost})`}
          </Button>
        </div>
      )}
    </ReqCard>
  );
}

// ──────── NewRecruit import modal ────────
function NewRecruitImportModal({ campaignId, forceId, onClose, onImported }: {
  campaignId: string; forceId: string; onClose: () => void; onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ faction: string | null; detachment: string | null; total_points: number | null; units: Array<{ name: string; points_cost: number; equipment: string; is_character: boolean; is_epic_hero: boolean }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dry_run: boolean) => {
    setError(null); setBusy(true);
    try {
      const r = await unitsApi.import(campaignId, forceId, { format: 'newrecruit_text', text, dry_run });
      if (dry_run) setPreview(r.parsed); else onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">Import from NewRecruit</h3>
            <p className="text-xs text-ink-fade mt-1">
              In NewRecruit, open your roster → Share → <span className="text-ink-dim">Text</span> → Copy. Paste below.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-fade hover:text-ink-dim text-xl leading-none">×</button>
        </div>

        <textarea value={text}
          onChange={e => { setText(e.target.value); setPreview(null); }}
          placeholder="+ Faction: Necrons +&#10;+ Detachment: Awakened Dynasty +&#10;..."
          rows={preview ? 4 : 12}
          className="w-full font-mono !text-xs" />

        {preview && (
          <Card className="p-4 mt-3 bg-bg-elevated">
            <div className="flex flex-wrap gap-2 mb-3 text-xs text-ink-dim">
              {preview.faction && <Badge color="accent">{preview.faction}</Badge>}
              {preview.detachment && <span>{preview.detachment}</span>}
              {preview.total_points != null && <span>· {preview.total_points} pts declared</span>}
              <span>· {preview.units.length} unit{preview.units.length === 1 ? '' : 's'} parsed</span>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {preview.units.map((u, i) => (
                <div key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium">{u.name}</span>
                  <span className="text-xs text-ink-fade">{u.points_cost} pts</span>
                  {u.is_character && <Badge color="accent">Character</Badge>}
                  {u.is_epic_hero && <Badge color="warning">Epic</Badge>}
                  {u.equipment && <span className="text-xs text-ink-fade truncate flex-1">· {u.equipment}</span>}
                </div>
              ))}
            </div>
            <div className="text-xs text-ink-fade mt-3">
              Total to import: <span className="text-ink">{preview.units.reduce((s, u) => s + u.points_cost, 0)} pts</span>
            </div>
          </Card>
        )}

        {error && <p className="text-sm text-danger mt-3">{error}</p>}

        <div className="flex gap-2 mt-4">
          {!preview ? (
            <Button onClick={() => run(true)} disabled={busy || !text.trim()}>
              {busy ? '…' : 'Preview'}
            </Button>
          ) : (
            <>
              <Button onClick={() => run(false)} disabled={busy}>
                {busy ? 'Importing…' : `Import ${preview.units.length} units`}
              </Button>
              <Button variant="secondary" onClick={() => setPreview(null)}>Edit</Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
