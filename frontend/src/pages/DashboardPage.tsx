import { useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { battlesApi, campaignsApi, forcesApi } from '../api/endpoints';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { BunkPage, BunkPill, BunkStatus, BunkStatGrid } from '../components/bunker';
import { SigilHazard } from '../components/sigils';
import { ApiError } from '../api/client';
import OverviewTab from './tabs/OverviewTab';
import ForcesTab from './tabs/ForcesTab';
import BattlesTab from './tabs/BattlesTab';
import MembersTab from './tabs/MembersTab';
import { useAuth } from '../auth/AuthContext';

type TabKey = 'overview' | 'forces' | 'battles' | 'members';
const TAB_KEYS: TabKey[] = ['overview', 'forces', 'battles', 'members'];

export default function DashboardPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('tab') as TabKey | null;
  const tab: TabKey = raw && TAB_KEYS.includes(raw) ? raw : 'overview';

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

  if (isLoading) return <BunkPage active="01"><Spinner /></BunkPage>;
  if (error || !data) return (
    <BunkPage active="01">
      <EmptyState icon="✕" title="Campaign not found"
        action={<Button onClick={() => navigate('/campaigns')}>Back</Button>} />
    </BunkPage>
  );

  const c = data.campaign;
  const role = data.role;
  const forces = forcesQ.data?.forces ?? [];
  const battles = battlesQ.data?.battles ?? [];
  const isAdmin = role === 'owner' || role === 'admin';
  const activeForces = forces.filter(f => f.is_active);

  const stateStatus: BunkStatus = c.state === 'setup' ? 'NEW' : c.state === 'active' ? 'ACTIVE' : 'ARCHIVED';

  return (
    <BunkPage active="01">
      {/* Hero */}
      <div className="relative overflow-hidden border border-bunk-line bg-bunk-surface mb-6">
        <SigilHazard height={8} color="#e2683c" bg="#06040a" />
        <div className="p-6">
          <Link to="/campaigns" className="font-mono text-[10px] tracking-mono-lg text-bunk-rust hover:text-bunk-bone">
            ‹ OPERATIONS // ALL CRUSADES
          </Link>
          <div className="flex items-center gap-3 flex-wrap mt-3">
            <h1 className="font-display text-5xl font-bold uppercase tracking-tight text-bunk-bone leading-none">
              {c.name}
            </h1>
            <BunkPill status={stateStatus} />
          </div>
          {c.description && <p className="text-sm text-bunk-boneDim mt-3 max-w-2xl">{c.description}</p>}
          <div className="flex gap-3 font-mono text-[10px] tracking-mono-md text-bunk-boneDim mt-3 flex-wrap items-center uppercase">
            <span className="text-bunk-rust">{c.default_battle_size}</span>
            <span>· {c.phase_label} {c.current_phase}</span>
            <span>· YOU ARE {role}</span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <BunkStatGrid
          cols={4}
          stats={[
            ['BATTLES', c.battle_count ?? battles.length, 'text-bunk-bone'],
            ['FORCES', c.force_count ?? activeForces.length, 'text-bunk-bone'],
            ['UNITS', c.unit_count ?? 0, 'text-bunk-bone'],
            ['POINTS', c.power_rating ?? 0, 'text-bunk-rust'],
          ]}
        />
      </div>

      <LifecycleBanner campaign={c} isAdmin={isAdmin} activeForceCount={activeForces.length} />

      {tab === 'overview' && <OverviewTab campaign={c} forces={forces} battles={battles} />}
      {tab === 'forces' && <ForcesTab campaignId={c.id} forces={forces} currentUserId={user!.id} isAdmin={isAdmin} />}
      {tab === 'battles' && (
        <BattlesTab campaignId={c.id} forces={forces} battles={battles}
          currentUserId={user!.id} currentRole={role} campaignState={c.state} />
      )}
      {tab === 'members' && <MembersTab campaignId={c.id} currentRole={role} currentUserId={user!.id} />}
    </BunkPage>
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
      <Card className="p-4 mb-6 border-bunk-warning/40" >
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold uppercase tracking-wide text-bunk-warning">Campaign in setup</div>
            <p className="text-xs text-bunk-boneDim mt-1">
              Invite players via the Members tab and create Crusade Forces. Battles cannot be recorded until the campaign is started.
            </p>
            <p className="font-mono text-[10px] tracking-mono-sm text-bunk-boneDim mt-1 uppercase">
              {activeForceCount} active force{activeForceCount === 1 ? '' : 's'} — {ready ? 'ready to start' : 'need at least 2'}.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => startM.mutate()} disabled={!ready || startM.isPending}>
              {startM.isPending ? '…' : 'Start Campaign'}
            </Button>
          )}
        </div>
        {error && <p className="font-mono text-[10px] text-bunk-red mt-2">{error}</p>}
      </Card>
    );
  }

  if (c.state === 'concluded') {
    return (
      <Card className="p-4 mb-6 bg-bunk-surfaceLo">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1">
            <div className="font-display font-bold uppercase tracking-wide text-bunk-boneDim">Campaign concluded</div>
            <p className="text-xs text-bunk-boneMute mt-1">
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
        {error && <p className="font-mono text-[10px] text-bunk-red mt-2">{error}</p>}
      </Card>
    );
  }

  if (c.state === 'active' && isAdmin) {
    return (
      <Card className="p-3 mb-6">
        <div className="flex items-center gap-3 flex-wrap font-mono text-[10px] tracking-mono-sm uppercase">
          <span className="text-bunk-green">● Campaign active</span>
          <span className="text-bunk-boneDim">{activeForceCount} active force{activeForceCount === 1 ? '' : 's'}</span>
          {c.started_at && <span className="text-bunk-boneDim">started {new Date(c.started_at).toLocaleDateString()}</span>}
          <div className="flex-1" />
          <button
            onClick={() => confirm('Conclude this campaign? No more battles can be recorded.') && concludeM.mutate()}
            className="text-bunk-boneDim hover:text-bunk-red"
            disabled={concludeM.isPending}
          >Conclude</button>
        </div>
        {error && <p className="font-mono text-[10px] text-bunk-red mt-2">{error}</p>}
      </Card>
    );
  }
  return null;
}
