import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '../api/endpoints';
import { Button, Card, Field, PageHeader, Badge } from '../components/ui';
import type { BattleSize } from '../types';
import { BATTLE_SIZE_POINTS } from '../types';
import { ApiError } from '../api/client';

const BATTLE_SIZES: BattleSize[] = ['Incursion', 'Strike Force', 'Onslaught'];

export default function WizardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [battleSize, setBattleSize] = useState<BattleSize>('Strike Force');
  const [phaseLabel, setPhaseLabel] = useState('Campaign Turn');

  const launchMutation = useMutation({
    mutationFn: () => campaignsApi.create({
      name: name.trim(), description, phase_label: phaseLabel, default_battle_size: battleSize,
    }),
    onSuccess: ({ campaign }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/campaigns/${campaign.id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Launch failed'),
  });

  return (
    <>
      <PageHeader title="New Crusade" subtitle="Set up the campaign. You'll invite players and build forces next." />

      <Card className="p-6 mb-6 space-y-4">
        <Field label="Campaign Name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="The Octarius War" autoFocus />
        </Field>
        <Field label="Description (optional)">
          <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </Field>
        <Field label="Default Battle Size" hint={`${BATTLE_SIZE_POINTS[battleSize]} points per army`}>
          <div className="flex gap-2">
            {BATTLE_SIZES.map(bs => (
              <button key={bs} type="button" onClick={() => setBattleSize(bs)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                  battleSize === bs ? 'bg-accent text-white' : 'bg-bg-elevated text-ink-dim hover:text-ink'
                }`}>
                <div>{bs}</div>
                <div className="text-xs opacity-75">{BATTLE_SIZE_POINTS[bs]} pts</div>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Phase Label"><input value={phaseLabel} onChange={e => setPhaseLabel(e.target.value)} /></Field>
      </Card>

      <Card className="p-5 mb-6 bg-bg-elevated">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-fade mb-2">What happens next</h4>
        <ol className="text-xs text-ink-dim space-y-1 list-decimal pl-4">
          <li>Campaign is created in <Badge color="warning">setup</Badge> state — no battles allowed yet.</li>
          <li>Invite players via the <strong>Members</strong> tab.</li>
          <li>Each player creates a Crusade Force (1000-pt Supply, 5 RP starting).</li>
          <li>Once at least 2 forces are ready, hit <strong>Start Campaign</strong>.</li>
          <li>Players can <strong>drop</strong> mid-campaign without losing history, and rejoin later.</li>
        </ol>
      </Card>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => navigate('/campaigns')} className="flex-1">Cancel</Button>
        <Button onClick={() => launchMutation.mutate()}
          disabled={!name.trim() || launchMutation.isPending}
          className="flex-1">
          {launchMutation.isPending ? '…' : 'Create Crusade'}
        </Button>
      </div>
    </>
  );
}
