import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { campaignsApi, invitesApi } from '../../api/endpoints';
import type { CampaignRole } from '../../types';
import { Button, Card, Field, Badge, Spinner } from '../../components/ui';
import { ApiError } from '../../api/client';
import { copyToClipboard } from '../../utils/clipboard';

export default function MembersTab({ campaignId, currentRole, currentUserId }: {
  campaignId: string; currentRole: CampaignRole; currentUserId: string;
}) {
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';
  const membersQ = useQuery({ queryKey: ['campaign', campaignId, 'members'], queryFn: () => campaignsApi.members(campaignId) });
  const invitesQ = useQuery({ queryKey: ['campaign', campaignId, 'invites'], queryFn: () => invitesApi.list(campaignId), enabled: isAdmin });

  if (membersQ.isLoading) return <Spinner />;
  const members = membersQ.data?.members ?? [];
  const invites = invitesQ.data?.invites ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">Members ({members.length})</h2>
        <div className="space-y-2">
          {members.map(m => (
            <MemberRow key={m.user_id} member={m} campaignId={campaignId} isAdmin={isAdmin} isSelf={m.user_id === currentUserId} />
          ))}
        </div>
      </Card>

      {isAdmin ? (
        <Card className="p-5">
          <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">Invites</h2>
          <CreateInviteForm campaignId={campaignId} />
          {invites.length === 0 ? (
            <p className="text-sm text-ink-fade italic mt-4">No active invites.</p>
          ) : (
            <div className="space-y-2 mt-4">
              {invites.map(i => <InviteRow key={i.id} invite={i} campaignId={campaignId} />)}
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-5">
          <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">Your Role</h2>
          <p className="text-sm text-ink-dim">
            You're a <Badge>{currentRole}</Badge> in this campaign. You can manage your own Crusade Forces and submit battles you're part of.
          </p>
          <p className="text-xs text-ink-fade mt-3">Ask an admin to share an invite code to bring more players in.</p>
        </Card>
      )}
    </div>
  );
}

function MemberRow({ member, campaignId, isAdmin, isSelf }: { member: any; campaignId: string; isAdmin: boolean; isSelf: boolean }) {
  const qc = useQueryClient();
  const removeM = useMutation({
    mutationFn: () => campaignsApi.removeMember(campaignId, member.user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'members'] }),
  });
  const setRoleM = useMutation({
    mutationFn: (role: 'admin' | 'participant') => campaignsApi.setMemberRole(campaignId, member.user_id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'members'] }),
  });
  const isOwner = member.role === 'owner';
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-sm font-bold">
        {(member.display_name || member.email)[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{member.display_name || member.email}{isSelf && <span className="text-ink-fade text-xs ml-2">(you)</span>}</div>
        <div className="text-xs text-ink-fade truncate">{member.email}</div>
      </div>
      <Badge color={isOwner ? 'accent' : member.role === 'admin' ? 'warning' : 'dim'}>{member.role}</Badge>
      {isAdmin && !isOwner && !isSelf && (
        <div className="flex gap-1">
          <button onClick={() => setRoleM.mutate(member.role === 'admin' ? 'participant' : 'admin')}
            className="text-[10px] text-ink-fade hover:text-ink-dim px-1" title="Toggle admin">
            {member.role === 'admin' ? '↓' : '↑'}</button>
          <button onClick={() => confirm(`Remove ${member.display_name || member.email}?`) && removeM.mutate()}
            className="text-ink-fade hover:text-danger">×</button>
        </div>
      )}
    </div>
  );
}

function CreateInviteForm({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<'admin' | 'participant'>('participant');
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [expires, setExpires] = useState<number | null>(168);
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => invitesApi.create(campaignId, { role_on_accept: role, label, max_uses: maxUses, expires_in_hours: expires }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'invites'] });
      setLabel('');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  return (
    <div className="space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role on Accept">
          <select value={role} onChange={e => setRole(e.target.value as any)}>
            <option value="participant">Participant</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Label (e.g. recipient name)"><input value={label} onChange={e => setLabel(e.target.value)} placeholder="For Bob" /></Field>
        <Field label="Max Uses"><input type="number" min={1} max={50} value={maxUses} onChange={e => setMaxUses(+e.target.value)} /></Field>
        <Field label="Expires">
          <select value={expires ?? ''} onChange={e => setExpires(e.target.value ? +e.target.value : null)}>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
            <option value="720">30 days</option>
            <option value="">Never</option>
          </select>
        </Field>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? '…' : '+ Generate Invite'}</Button>
    </div>
  );
}

function InviteRow({ invite, campaignId }: { invite: any; campaignId: string }) {
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<'idle' | 'copied-link' | 'copied-code' | 'failed'>('idle');
  const link = invite.share_url ?? `${location.origin}/invite/${invite.code}`;
  const removeM = useMutation({
    mutationFn: () => invitesApi.remove(campaignId, invite.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'invites'] }),
  });

  const copy = async (text: string, kind: 'copied-link' | 'copied-code') => {
    const ok = await copyToClipboard(text);
    setFeedback(ok ? kind : 'failed');
    setTimeout(() => setFeedback('idle'), 2000);
  };

  return (
    <div className="bg-bg-elevated p-3 rounded-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => copy(invite.code, 'copied-code')}
          className="text-accent font-mono text-sm font-bold hover:underline cursor-pointer"
          title="Click to copy code">{invite.code}</button>
        <Badge color={invite.role_on_accept === 'admin' ? 'warning' : 'dim'}>{invite.role_on_accept}</Badge>
        <span className="text-xs text-ink-fade">{invite.times_used}/{invite.max_uses}</span>
        <div className="flex-1" />
        <button onClick={() => copy(link, 'copied-link')}
          className="text-xs text-ink-fade hover:text-ink-dim px-2">
          {feedback === 'copied-link' ? '✓ copied!' : feedback === 'failed' ? '⚠ select manually' : 'copy link'}
        </button>
        <button onClick={() => confirm('Revoke this invite?') && removeM.mutate()}
          className="text-ink-fade hover:text-danger px-1" title="Revoke">×</button>
      </div>

      <div className="mt-2">
        <input type="text" readOnly value={link}
          onFocus={e => e.currentTarget.select()}
          onClick={e => e.currentTarget.select()}
          className="w-full text-xs font-mono !py-1 !px-2 text-ink-dim cursor-text"
          aria-label="Invite link (click to select)" />
        {feedback === 'copied-code' && <div className="text-[10px] text-success mt-1">✓ Code copied — share it directly.</div>}
      </div>

      {invite.label && <div className="text-xs text-ink-fade mt-1">{invite.label}</div>}
      {invite.expires_at && <div className="text-[10px] text-ink-fade mt-1">expires {new Date(invite.expires_at).toLocaleString()}</div>}
    </div>
  );
}
