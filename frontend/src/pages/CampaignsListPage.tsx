import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { campaignsApi } from '../api/endpoints';
import { Button, Card, EmptyState, PageHeader, Spinner, Badge, Field } from '../components/ui';

export default function CampaignsListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.list(),
  });

  if (isLoading) return <Spinner />;
  const campaigns = data?.campaigns ?? [];
  const setup = campaigns.filter(c => c.state === 'setup');
  const active = campaigns.filter(c => c.state === 'active');
  const concluded = campaigns.filter(c => c.state === 'concluded');

  return (
    <>
      <PageHeader
        title="Your Campaigns"
        subtitle={campaigns.length === 0 ? 'Create one, or join an existing crusade with an invite code.' : `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`}
        action={<Button variant="secondary" onClick={() => navigate('/campaigns/new')}>+ New</Button>}
      />

      <JoinByCodeCard />

      {campaigns.length === 0 ? (
        <EmptyState icon="⚔" title="No campaigns yet"
          description="Create one above, or paste an invite code shared with you."
          action={<Button onClick={() => navigate('/campaigns/new')}>Begin your first crusade</Button>} />
      ) : (
        <div className="space-y-6">
          {setup.length > 0 && <section>
            <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">In Setup</h2>
            <div className="grid gap-3 sm:grid-cols-2">{setup.map(c => <CampaignCard key={c.id} campaign={c} />)}</div>
          </section>}
          {active.length > 0 && <section>
            <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">Active</h2>
            <div className="grid gap-3 sm:grid-cols-2">{active.map(c => <CampaignCard key={c.id} campaign={c} />)}</div>
          </section>}
          {concluded.length > 0 && <section>
            <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">Concluded</h2>
            <div className="grid gap-3 sm:grid-cols-2">{concluded.map(c => <CampaignCard key={c.id} campaign={c} />)}</div>
          </section>}
        </div>
      )}
    </>
  );
}

function JoinByCodeCard() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase().replace(/\s/g, '');
    if (!trimmed) return;
    const match = trimmed.match(/INVITE\/([A-Z0-9]+)/i);
    const finalCode = match ? match[1] : trimmed;
    navigate(`/invite/${finalCode}`);
  };
  return (
    <Card className="p-4 mb-6 border-accent/20">
      <form onSubmit={submit} className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <Field label="Have an invite code?" hint="Paste a code or the full invite link.">
            <input value={code} onChange={e => setCode(e.target.value)}
              placeholder="ABCD1234EF"
              className="font-mono uppercase tracking-wider"
              autoComplete="off" spellCheck={false} />
          </Field>
        </div>
        <Button type="submit" disabled={!code.trim()}>Join Crusade →</Button>
      </form>
    </Card>
  );
}

function CampaignCard({ campaign }: { campaign: import('../types').Campaign }) {
  return (
    <Link to={`/campaigns/${campaign.id}`} className="block">
      <Card className="p-4 hover:border-accent/40 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-semibold">{campaign.name}</h3>
          <Badge color={campaign.state === 'setup' ? 'warning' : campaign.state === 'active' ? 'success' : 'dim'}>
            {campaign.state === 'setup' ? 'Setup' : campaign.state === 'active' ? 'Active' : 'Concluded'}
          </Badge>
        </div>
        {campaign.description && (
          <p className="text-sm text-ink-dim line-clamp-2 mb-3">{campaign.description}</p>
        )}
        <div className="flex gap-4 text-xs text-ink-fade">
          <span>{campaign.default_battle_size}</span>
          <span>{campaign.phase_label} {campaign.current_phase}</span>
        </div>
      </Card>
    </Link>
  );
}
