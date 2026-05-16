import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unitsApi, requisitionsApi } from '../api/endpoints';
import { BATTLE_SCARS, BATTLE_SCAR_DESCRIPTIONS, rankForXP, maxBattleHonours } from '../types';
import type { HonourCategory, RelicCategory, BattleScarName } from '../types';
import { Badge, Button, Card, Field, Spinner } from '../components/ui';
import { ApiError } from '../api/client';

const RANK_THRESHOLDS = [
  { rank: 'Battle-ready', max: 5 },
  { rank: 'Blooded', max: 15 },
  { rank: 'Battle-hardened', max: 30 },
  { rank: 'Heroic', max: 50 },
  { rank: 'Legendary', max: 100 },
];

export default function UnitDetailPage() {
  const { campaignId, unitId } = useParams<{ campaignId: string; unitId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const deleteM = useMutation({
    mutationFn: () => unitsApi.remove(campaignId!, unitId!),
    onSuccess: (_data, _vars, _ctx) => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'force'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to delete unit'),
  });

  const q = useQuery({
    queryKey: ['campaign', campaignId, 'unit', unitId],
    queryFn: () => unitsApi.get(campaignId!, unitId!),
    enabled: !!(campaignId && unitId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'unit', unitId] });
    qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'force'] });
  };

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <div>Unit not found</div>;

  const { unit, honours, scars } = q.data;
  const rank = rankForXP(unit.xp, unit.is_character, unit.can_exceed_30_xp);
  const maxHonours = maxBattleHonours(unit.is_character, unit.can_exceed_30_xp);
  const xpCap = (unit.is_character || unit.can_exceed_30_xp) ? 100 : 30;
  const xpPct = Math.min(100, (unit.xp / xpCap) * 100);

  return (
    <>
      <Link to={`/campaigns/${campaignId}/forces/${unit.force_id}`} className="text-xs text-ink-fade hover:text-ink-dim">← Order of Battle</Link>

      <Card className="p-6 mt-2 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{unit.name}</h1>
              {unit.is_character && <Badge color="accent">Character</Badge>}
              {unit.is_titanic && <Badge color="warning">Titanic</Badge>}
              {!unit.is_active && <Badge color="danger">Permanently Destroyed</Badge>}
            </div>
            <div className="text-sm text-ink-dim mt-1">{unit.datasheet} · {unit.points_cost} pts</div>
            {unit.equipment && <div className="text-xs text-ink-fade mt-1">{unit.equipment}</div>}
          </div>
          <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
            <Badge color="accent">{rank}</Badge>
            <button
              onClick={async () => {
                if (!confirm(`Permanently delete "${unit.name}" from the Order of Battle? This cannot be undone.`)) return;
                try {
                  await deleteM.mutateAsync();
                  navigate(`/campaigns/${campaignId}/forces/${unit.force_id}`);
                } catch { /* error surfaced via mutation onError */ }
              }}
              disabled={deleteM.isPending}
              className="text-xs text-ink-fade hover:text-danger disabled:opacity-50"
            >
              {deleteM.isPending ? 'Deleting…' : 'Delete unit'}
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex justify-between items-end mb-1">
            <span className="text-xs text-ink-fade uppercase tracking-wider">Experience</span>
            <span className="text-sm font-mono">{unit.xp} XP {!unit.is_character && !unit.can_exceed_30_xp && unit.xp >= 30 && '(capped)'}</span>
          </div>
          <div className="h-2 bg-bg-elevated rounded overflow-hidden relative">
            <div className="h-full bg-accent transition-all" style={{ width: `${xpPct}%` }} />
            {RANK_THRESHOLDS.map(rt => (
              <div key={rt.rank} className="absolute top-0 bottom-0 border-l border-white/20" style={{ left: `${(rt.max / xpCap) * 100}%` }} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-ink-fade mt-1">
            <span>0</span><span>5</span><span>15</span><span>30</span>{xpCap > 30 && <><span>50</span><span>{xpCap}</span></>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <Stat label="Crusade Points" value={unit.crusade_points.toString()} color={unit.crusade_points < 0 ? 'text-danger' : 'text-accent'} />
          <Stat label="Battles Played" value={unit.battles_played.toString()} />
          <Stat label="Battles Survived" value={unit.battles_survived.toString()} color="text-success" />
          <Stat label="Enemy Units Destroyed" value={unit.units_destroyed.toString()} />
        </div>
      </Card>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Battle Honours <span className="text-ink-fade font-normal text-sm">({honours.length}/{maxHonours})</span></h2>
        </div>
        {honours.length === 0 ? (
          <p className="text-sm text-ink-fade italic">No Battle Honours earned yet. Each rank-up grants one Battle Honour.</p>
        ) : (
          <div className="space-y-2">
            {honours.map(h => (
              <div key={h.id} className="flex items-start justify-between gap-2 p-3 bg-bg-elevated rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color="accent">{h.category}</Badge>
                    {h.relic_category && <Badge color="warning">{h.relic_category}</Badge>}
                    <span className="font-semibold">{h.name}</span>
                    <span className="text-xs text-ink-fade">+{h.crusade_points_value} CP</span>
                  </div>
                  {h.weapon_name && <div className="text-xs text-ink-dim mt-1">Weapon: {h.weapon_name}</div>}
                  {h.description && <div className="text-xs text-ink-fade mt-1">{h.description}</div>}
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove "${h.name}"?`)) return;
                    try { await unitsApi.removeHonour(campaignId!, unitId!, h.id); invalidate(); }
                    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed'); }
                  }}
                  className="text-ink-fade hover:text-danger flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        )}
        {honours.length < maxHonours && unit.is_active && (
          <AddHonourForm campaignId={campaignId!} unitId={unitId!} onDone={invalidate} onError={setError} />
        )}
      </Card>

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Battle Scars <span className="text-ink-fade font-normal text-sm">({scars.length}/3)</span></h2>
        </div>
        {scars.length === 0 ? (
          <p className="text-sm text-ink-fade italic">No scars. Roll D6 after destruction; on a 1, choose a Battle Scar or Devastating Blow.</p>
        ) : (
          <div className="space-y-2">
            {scars.map(s => (
              <div key={s.id} className="flex items-start justify-between gap-2 p-3 bg-bg-elevated rounded-lg border border-danger/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><Badge color="danger">Scar</Badge><span className="font-semibold">{s.name}</span></div>
                  <div className="text-xs text-ink-fade mt-1">{BATTLE_SCAR_DESCRIPTIONS[s.name]}</div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <RepairButton campaignId={campaignId!} forceId={unit.force_id} unitId={unitId!} scarId={s.id} honoursCount={honours.length} onDone={invalidate} onError={setError} />
                  <button
                    onClick={async () => {
                      if (!confirm(`Remove "${s.name}" without spending RP?`)) return;
                      try { await unitsApi.removeScar(campaignId!, unitId!, s.id); invalidate(); }
                      catch (e) { setError(e instanceof ApiError ? e.message : 'Failed'); }
                    }}
                    className="text-[10px] text-ink-fade hover:text-danger"
                  >Remove (free)</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {scars.length < 3 && unit.is_active && (
          <AddScarForm campaignId={campaignId!} unitId={unitId!} existing={scars.map(s => s.name)} onDone={invalidate} onError={setError} />
        )}
      </Card>
    </>
  );
}

function Stat({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center bg-bg-elevated p-3 rounded-lg">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-ink-fade">{label}</div>
    </div>
  );
}

function AddHonourForm({ campaignId, unitId, onDone, onError }: { campaignId: string; unitId: string; onDone: () => void; onError: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<HonourCategory>('Battle Trait');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weaponName, setWeaponName] = useState('');
  const [relicCategory, setRelicCategory] = useState<RelicCategory>('Artificer');

  const m = useMutation({
    mutationFn: () => unitsApi.addHonour(campaignId, unitId, {
      category, name: name.trim(), description,
      weapon_name: category === 'Weapon Modification' ? weaponName : '',
      relic_category: category === 'Crusade Relic' ? relicCategory : null,
    }),
    onSuccess: () => { onDone(); setOpen(false); setName(''); setDescription(''); setWeaponName(''); },
    onError: (e) => onError(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)} className="mt-3">+ Add Battle Honour</Button>;

  return (
    <div className="mt-4 p-4 bg-bg-elevated rounded-lg space-y-3">
      <div className="flex gap-2 flex-wrap">
        {(['Battle Trait', 'Weapon Modification', 'Crusade Relic'] as HonourCategory[]).map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded text-xs font-medium ${category === c ? 'bg-accent text-white' : 'bg-bg text-ink-dim'}`}>
            {c}
          </button>
        ))}
      </div>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} placeholder={
        category === 'Battle Trait' ? 'e.g. Duellist' :
        category === 'Weapon Modification' ? 'e.g. Master-worked' :
        'e.g. Armour of the Soulless Sentry'
      } /></Field>
      {category === 'Weapon Modification' && (
        <Field label="Weapon"><input value={weaponName} onChange={e => setWeaponName(e.target.value)} placeholder="e.g. Hyperphase glaive" /></Field>
      )}
      {category === 'Crusade Relic' && (
        <Field label="Relic Category">
          <select value={relicCategory} onChange={e => setRelicCategory(e.target.value as RelicCategory)}>
            <option value="Artificer">Artificer (+1 CP, any rank)</option>
            <option value="Antiquity">Antiquity (+2 CP, Heroic+)</option>
            <option value="Legendary">Legendary (+3 CP, Legendary)</option>
          </select>
        </Field>
      )}
      <Field label="Description (optional)"><textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      <div className="flex gap-2">
        <Button onClick={() => m.mutate()} disabled={!name.trim() || m.isPending}>Add</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function AddScarForm({ campaignId, unitId, existing, onDone, onError }: { campaignId: string; unitId: string; existing: BattleScarName[]; onDone: () => void; onError: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<BattleScarName>(BATTLE_SCARS.find(s => !existing.includes(s)) ?? 'Crippling Damage');
  const m = useMutation({
    mutationFn: () => unitsApi.addScar(campaignId, unitId, { name }),
    onSuccess: () => { onDone(); setOpen(false); },
    onError: (e) => onError(e instanceof ApiError ? e.message : 'Failed'),
  });
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)} className="mt-3">+ Add Battle Scar</Button>;
  const available = BATTLE_SCARS.filter(s => !existing.includes(s));
  return (
    <div className="mt-4 p-4 bg-bg-elevated rounded-lg space-y-3">
      <Field label="Scar (D6 roll on Battle Scar table)">
        <select value={name} onChange={e => setName(e.target.value as BattleScarName)}>
          {available.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <p className="text-xs text-ink-fade">{BATTLE_SCAR_DESCRIPTIONS[name]}</p>
      <div className="flex gap-2">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Add Scar (-1 CP)</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function RepairButton({ campaignId, forceId, unitId, scarId, honoursCount, onDone, onError }: { campaignId: string; forceId: string; unitId: string; scarId: string; honoursCount: number; onDone: () => void; onError: (e: string) => void }) {
  const cost = Math.min(5, 1 + honoursCount);
  const m = useMutation({
    mutationFn: () => requisitionsApi.repairAndRecuperate(campaignId, forceId, { unit_id: unitId, scar_id: scarId }),
    onSuccess: onDone,
    onError: (e) => onError(e instanceof ApiError ? e.message : 'Failed'),
  });
  return (
    <button onClick={() => m.mutate()} disabled={m.isPending} className="text-[10px] text-accent hover:text-accent-hover">
      Repair ({cost} RP)
    </button>
  );
}
