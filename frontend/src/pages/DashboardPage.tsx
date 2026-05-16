import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { battlesApi, campaignsApi, forcesApi } from '../api/endpoints';
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui';
import { ApiError } from '../api/client';
import OverviewTab from './tabs/OverviewTab';
import ForcesTab from './tabs/ForcesTab';
import BattlesTab from './tabs/BattlesTab';
import MembersTab from './tabs/MembersTab';
import { useAuth } from '../auth/AuthContext';

type TabKey = 'overview' | 'forces' | 'battles' | 'members';
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '▤' },
  { key: 'forces', label: 'Forces', icon: '◉' },
  { key: 'battles', label: 'Battles', icon: '⚔' },
  { key: 'members', label: 'Members', icon: '⛁' },
];

export default function DashboardPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('overview');

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignsApi.get(campaignId!),
    enabled: !!campaignId,
  });
  const forcesQ = useQuery({
    queryKey: ['campaign', campaignId, 'forces'],
    queryFn: () => forcesApi.list(campaignId!), enabled: !!campaignId,
  });
  const battlesQ = useQuery({
    queryKey: ['campaign', campaignId, 'battles'],
    queryFn: () => battlesApi.list(campaignId!), enabled: !!campaignId,
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return (
    <EmptyState icon="✕" title="Campaign not found"
      action={<Button onClick={() => navigate('/campaigns')}>Back</Button>} />
  );

  const c = data.campaign;
  const role = data.role;
  const forces = forcesQ.data?.forces ?? [];
  const battles = battlesQ.data?.battles ?? [];
  const isAdmin = role === 'owner' || role === 'admin';
  const activeForces = forces.filter(f => f.is_active);

  return (
    <>
      <div className="mb-4">
        <Link to="/campaigns" className="text-xs text-ink-fade hover:text-ink-dim">← Campaigns</Link>
        <h1 className="text-2xl font-bold mt-1">{c.name}</h1>
        {c.description && <p className="text-sm text-ink-dim mt-1 max-w-2xl">{c.description}</p>}
        <div className="flex gap-3 text-xs text-ink-fade mt-2 flex-wrap items-center">
          <Badge>{c.default_battle_size}</Badge>
          <span>{c.phase_label} {c.current_phase}</span>
          <Badge color={c.state === 'setup' ? 'warning' : c.state === 'active' ? 'success' : 'dim'}>
            {c.state === 'setup' ? 'In Setup' : c.state === 'active' ? 'Active' : 'Concluded'}
          </Badge>
          <Badge color={role === 'owner' ? 'accent' : role === 'admin' ? 'warning' : 'dim'}>You are {role}</Badge>
        </div>
      </div>

      <LifecycleBanner campaign={c} isAdmin={isAdmin} activeForceCount={activeForces.length} />

      <div className="flex gap-1 mb-6 border-b border-white/5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key ? 'text-accent border-accent' : 'text-ink-dim border-transparent hover:text-ink'
            }`}>
            <span className="mr-1.5">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab campaign={c} forces={forces} battles={battles} />}
      {tab === 'forces' && <ForcesTab campaignId={c.id} forces={forces} currentUserId={user!.id} isAdmin={isAdmin} />}
      {tab === 'battles' && (
        <BattlesTab campaignId={c.id} forces={forces} battles={battles}
          defaultBattleSize={c.default_battle_size}
          currentUserId={user!.id} currentRole={role} campaignState={c.state} />
      )}
      {tab === 'members' && <MembersTab campaignId={c.id} currentRole={role} currentUserId={user!.id} />}
    </>
  );
}

function LifecycleBanner({ campaign: c, isAdmin, activeForceCount }: {
  campaign: import('../types').Campaign; isAdmin: boolean; activeForceCount: number;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const startM = useMutation({
    mutationFn: () => campaignsApi.start(c.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', c.id] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });
  const concludeM = useMutation({
    mutationFn: () => campaignsApi.conclude(c.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', c.id] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });
  const reopenM = useMutation({
    mutationFn: () => campaignsApi.reopen(c.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', c.id] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (c.state === 'setup') {
    const ready = activeForceCount >= 2;
    return (
      <Card className="p-4 mb-6 bg-warning/5 border-warning/30">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-warning">Campaign in setup</div>
            <p className="text-xs text-ink-dim mt-1">
              Invite players via the Members tab and create Crusade Forces. Battles cannot be recorded until the campaign is started.
            </p>
            <p className="text-xs text-ink-fade mt-1">
              {activeForceCount} active force{activeForceCount === 1 ? '' : 's'} — {ready ? 'ready to start' : 'need at least 2'}.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => startM.mutate()} disabled={!ready || startM.isPending}>
              {startM.isPending ? '…' : '⚔ Start Campaign'}
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
      </Card>
    );
  }

  if (c.state === 'concluded') {
    return (
      <Card className="p-4 mb-6 bg-bg-elevated">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1">
            <div className="font-semibold text-ink-dim">Campaign concluded</div>
            <p className="text-xs text-ink-fade mt-1">
              {c.concluded_at && `Ended ${new Date(c.concluded_at).toLocaleDateString()}. `}
              No new battles can be recorded.
            </p>
          </div>
          {isAdmin && (
            <Button variant="secondary" onClick={() => reopenM.mutate()} disabled={reopenM.isPending}>
              {reopenM.isPending ? '…' : 'Reopen'}
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
      </Card>
    );
  }

  if (c.state === 'active' && isAdmin) {
    return (
      <Card className="p-3 mb-6 bg-bg-card border-white/5">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="text-success font-medium">✓ Campaign active</span>
          <span className="text-ink-fade">{activeForceCount} active force{activeForceCount === 1 ? '' : 's'}</span>
          {c.started_at && <span className="text-ink-fade">started {new Date(c.started_at).toLocaleDateString()}</span>}
          <div className="flex-1" />
          <button
            onClick={() => confirm('Conclude this campaign? No more battles can be recorded.') && concludeM.mutate()}
            className="text-ink-fade hover:text-danger"
            disabled={concludeM.isPending}
          >Conclude</button>
        </div>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
      </Card>
    );
  }
  return null;
}
