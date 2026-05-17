import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { battlesApi } from '../../api/endpoints';
import type { Battle, CampaignRole, CrusadeForce } from '../../types';
import { Badge, Button, Card, EmptyState } from '../../components/ui';
import { ApiError } from '../../api/client';

export default function BattlesTab({ campaignId, forces, battles, currentUserId, currentRole, campaignState }: {
  campaignId: string; forces: CrusadeForce[]; battles: Battle[];
  currentUserId: string; currentRole: CampaignRole;
  campaignState: 'setup' | 'active' | 'concluded';
}) {
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
        <Link to={`/campaigns/${campaignId}/battles/new`}>
          <Button>＋ Inscribe Battle</Button>
        </Link>
      </div>

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
