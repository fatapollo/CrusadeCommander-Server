import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { forcesApi } from '../../api/endpoints';
import type { CrusadeForce } from '../../types';
import { Button, Card, Field, ColorPickerRow, FACTIONS, PLAYER_COLORS, EmptyState, Badge, SUGGESTED_TEAMS } from '../../components/ui';
import { ApiError } from '../../api/client';

export default function ForcesTab({ campaignId, forces, currentUserId, isAdmin }: {
  campaignId: string; forces: CrusadeForce[]; currentUserId: string; isAdmin: boolean;
}) {
  const existingTeams = Array.from(new Set(forces.map(f => f.team).filter(Boolean))).sort();
  const [showAdd, setShowAdd] = useState(false);
  const myActive = forces.filter(f => f.user_id === currentUserId && f.is_active);
  const myDropped = forces.filter(f => f.user_id === currentUserId && !f.is_active);
  const otherActive = forces.filter(f => f.user_id !== currentUserId && f.is_active);
  const otherDropped = forces.filter(f => f.user_id !== currentUserId && !f.is_active);
  const myForce = forces.find(f => f.user_id === currentUserId);
  const canAdd = !myForce;

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">{forces.length} Crusade Force{forces.length === 1 ? '' : 's'}</h2>
        {canAdd && (
          <Button onClick={() => setShowAdd(s => !s)}>{showAdd ? 'Close' : '+ Add Force'}</Button>
        )}
        {myForce && (
          <span className="text-xs text-ink-fade">
            You command <span className="text-accent font-medium">{myForce.name}</span>
            {!myForce.is_active && ' (dropped)'}
          </span>
        )}
      </div>

      {showAdd && canAdd && <AddForceForm campaignId={campaignId} onDone={() => setShowAdd(false)} existingTeams={existingTeams} />}

      {forces.length === 0 && !showAdd ? (
        <EmptyState icon="◉" title="No crusade forces" description="Create your own Crusade Force." />
      ) : (
        <div className="space-y-6 mt-4">
          {myActive.length > 0 && (
            <Section title="Your Forces">
              {myActive.map(f => <ForceCard key={f.id} force={f} campaignId={campaignId} canEdit={true} />)}
            </Section>
          )}
          {otherActive.length > 0 && (
            <Section title="Other Forces">
              {otherActive.map(f => <ForceCard key={f.id} force={f} campaignId={campaignId} canEdit={isAdmin} />)}
            </Section>
          )}
          {(myDropped.length + otherDropped.length) > 0 && (
            <Section title="Dropped">
              {myDropped.map(f => <ForceCard key={f.id} force={f} campaignId={campaignId} canEdit={true} />)}
              {otherDropped.map(f => <ForceCard key={f.id} force={f} campaignId={campaignId} canEdit={isAdmin} />)}
            </Section>
          )}
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

function ForceCard({ force, campaignId, canEdit }: { force: CrusadeForce; campaignId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'forces'] });
  const removeM = useMutation({ mutationFn: () => forcesApi.remove(campaignId, force.id), onSuccess: invalidate });
  const dropM = useMutation({ mutationFn: () => forcesApi.drop(campaignId, force.id), onSuccess: invalidate });
  const rejoinM = useMutation({ mutationFn: () => forcesApi.rejoin(campaignId, force.id), onSuccess: invalidate });

  return (
    <Card className={`p-4 ${!force.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ backgroundColor: force.color_hex }}>
          {force.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <Link to={`/campaigns/${campaignId}/forces/${force.id}`} className="block hover:text-accent">
            <div className="font-semibold truncate flex items-center gap-2 flex-wrap">
              {force.name}
              {force.team && <Badge color="accent">{force.team}</Badge>}
              {!force.is_active && <Badge color="dim">Dropped</Badge>}
            </div>
          </Link>
          <div className="text-xs text-ink-fade truncate">
            {force.faction || 'Unknown faction'}{force.player_name && ` · ${force.player_name}`}
          </div>
        </div>
        {canEdit && force.is_active && (
          <button
            onClick={() => confirm(`Drop ${force.name}? Their force becomes inactive but history is preserved.`) && dropM.mutate()}
            className="text-[10px] text-ink-fade hover:text-warning flex-shrink-0"
            title="Drop from campaign"
          >Drop</button>
        )}
        {canEdit && !force.is_active && (
          <button onClick={() => rejoinM.mutate()}
            className="text-[10px] text-accent hover:text-accent-hover flex-shrink-0"
            title="Rejoin campaign">Rejoin</button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4 text-center">
        <Stat label="Supply" value={force.supply_limit} />
        <Stat label="RP" value={force.requisition_points} color="text-accent" />
        <Stat label="Battles" value={force.battle_tally} />
        <Stat label="Wins" value={force.victories} color="text-success" />
      </div>
      {canEdit && !force.is_active && (
        <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
          <span className="text-[10px] text-ink-fade">
            {force.dropped_at && `Dropped ${new Date(force.dropped_at).toLocaleDateString()}`}
          </span>
          <button
            onClick={() => confirm(`Permanently delete ${force.name}? This wipes all units, honours, scars and history.`) && removeM.mutate()}
            className="text-[10px] text-ink-fade hover:text-danger"
          >Delete forever</button>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, color = '' }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-ink-fade">{label}</div>
    </div>
  );
}

function AddForceForm({ campaignId, onDone, existingTeams }: {
  campaignId: string; onDone: () => void; existingTeams: string[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [faction, setFaction] = useState('');
  const [team, setTeam] = useState('');
  const [colorHex, setColorHex] = useState(PLAYER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => forcesApi.create(campaignId, {
      name: name.trim(), player_name: playerName.trim(),
      faction, team: team.trim(), color_hex: colorHex,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'forces'] }); onDone(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  const suggestions = Array.from(new Set([...existingTeams, ...SUGGESTED_TEAMS]));

  return (
    <Card className="p-5 mb-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Force Name"><input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
        <Field label="Player Name (optional)"><input value={playerName} onChange={e => setPlayerName(e.target.value)} /></Field>
        <Field label="Faction">
          <select value={faction} onChange={e => setFaction(e.target.value)}>
            <option value="">Select…</option>
            {FACTIONS.map(f => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Team / Alliance (optional)" hint="Forces on the same team are allied. Free-form — pick a suggestion or type your own.">
          <input value={team} onChange={e => setTeam(e.target.value)}
            placeholder="e.g. Imperium" list="team-suggestions" autoComplete="off" />
          <datalist id="team-suggestions">
            {suggestions.map(t => <option key={t} value={t} />)}
          </datalist>
        </Field>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {suggestions.slice(0, 8).map(t => (
            <button key={t} type="button" onClick={() => setTeam(t)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                team === t ? 'bg-accent text-white' : 'bg-accent-soft text-accent hover:bg-accent/30'
              }`}>{t}</button>
          ))}
        </div>
      )}

      <div className="mt-3"><ColorPickerRow value={colorHex} onChange={setColorHex} /></div>
      {error && <p className="text-sm text-danger mt-3">{error}</p>}
      <div className="flex gap-2 mt-4">
        <Button onClick={() => m.mutate()} disabled={!name.trim() || m.isPending}>{m.isPending ? '…' : 'Add'}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}
