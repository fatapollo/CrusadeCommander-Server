import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, AdminCampaign, AdminUser } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Field, Badge, Spinner, PageHeader, EmptyState } from '../components/ui';
import { ApiError } from '../api/client';
import { copyToClipboard } from '../utils/clipboard';

type Tab = 'settings' | 'users' | 'campaigns';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'settings', label: 'Settings', icon: '⚙' },
  { key: 'users', label: 'Users', icon: '◆' },
  { key: 'campaigns', label: 'Campaigns', icon: '⚔' },
];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('settings');

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  if (!user.is_site_admin) {
    return <EmptyState icon="◷" title="Site admin only" description="Your account doesn't have site admin permissions." />;
  }

  return (
    <>
      <PageHeader title="Site Administration" subtitle="Global settings, users, and campaigns." />
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

      {tab === 'settings' && <SettingsTab />}
      {tab === 'users' && <UsersTab currentUserId={user.id} />}
      {tab === 'campaigns' && <CampaignsTab />}
    </>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => adminApi.getSettings() });
  if (settingsQ.isLoading) return <Spinner />;
  const settings = settingsQ.data?.settings ?? {};
  const schema = settingsQ.data?.schema ?? {};
  return (
    <Card className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-1">Site Settings</h2>
      <p className="text-xs text-ink-fade mb-6">Runtime-editable settings (stored in the database). For secrets like SESSION_SECRET use config.json or env vars instead.</p>
      <div className="space-y-5">
        {Object.entries(schema).map(([key, meta]: [string, any]) => (
          <SettingRow key={key} settingKey={key} meta={meta} value={settings[key] ?? meta.default}
            onSaved={() => qc.invalidateQueries({ queryKey: ['admin', 'settings'] })} />
        ))}
      </div>
    </Card>
  );
}

function SettingRow({ settingKey, meta, value, onSaved }: { settingKey: string; meta: any; value: any; onSaved: () => void }) {
  const initial = value == null ? '' : String(value);
  const [local, setLocal] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const m = useMutation({
    mutationFn: () => {
      // Send null to clear, otherwise the trimmed value (the backend coerces port to int).
      const payload: any = local.trim() === '' ? null : local;
      return adminApi.updateSettings({ [settingKey]: payload });
    },
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1500); onSaved(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  const dirty = local !== initial;
  const label = settingKey.split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
  const isPort = meta?.type === 'port' || settingKey === 'server_port';

  return (
    <div>
      <Field label={label} hint={meta.description}>
        <input
          value={local}
          onChange={e => { setLocal(e.target.value); setError(null); }}
          type={isPort ? 'number' : 'text'}
          inputMode={isPort ? 'numeric' : undefined}
          min={isPort ? 1 : undefined}
          max={isPort ? 65535 : undefined}
          placeholder={
            isPort ? '3000'
            : settingKey === 'default_domain' ? 'https://crusade.example.com'
            : undefined
          }
        />
      </Field>
      <div className="flex items-center gap-2 mt-2">
        <Button onClick={() => m.mutate()} disabled={!dirty || m.isPending}>
          {m.isPending ? '…' : saved ? '✓ Saved' : 'Save'}
        </Button>
        {dirty && <button onClick={() => { setLocal(initial); setError(null); }} className="text-xs text-ink-fade hover:text-ink-dim">reset</button>}
        {isPort && local.trim() !== '' && <span className="text-[10px] text-warning">↻ requires restart</span>}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const usersQ = useQuery({ queryKey: ['admin', 'users'], queryFn: () => adminApi.listUsers() });
  const [filter, setFilter] = useState('');
  const setAdminM = useMutation({
    mutationFn: ({ id, is_site_admin }: { id: string; is_site_admin: boolean }) => adminApi.updateUser(id, { is_site_admin }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
  const resetPwM = useMutation({
    mutationFn: (id: string) => adminApi.resetPassword(id),
    onSuccess: ({ temporary_password }, id) => {
      const u = usersQ.data?.users.find(x => x.id === id);
      if (temporary_password) alert(`Temporary password for ${u?.email ?? 'user'}:\n\n${temporary_password}\n\nShare this securely.`);
    },
  });

  if (usersQ.isLoading) return <Spinner />;
  const users = (usersQ.data?.users ?? []).filter(u =>
    !filter || u.email.toLowerCase().includes(filter.toLowerCase()) ||
    u.display_name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Users ({usersQ.data?.users.length ?? 0})</h2>
        <input placeholder="Filter by email or name…" value={filter} onChange={e => setFilter(e.target.value)} className="!w-64" />
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-fade uppercase tracking-wider">
            <tr className="border-b border-white/5">
              <th className="text-left p-3">User</th>
              <th className="text-left p-3 hidden sm:table-cell">Campaigns</th>
              <th className="text-left p-3 hidden md:table-cell">Joined</th>
              <th className="text-left p-3">Role</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="p-3">
                  <div className="font-medium">{u.display_name || u.email.split('@')[0]}{u.id === currentUserId && <span className="text-ink-fade text-xs ml-1">(you)</span>}</div>
                  <div className="text-xs text-ink-fade">{u.email}</div>
                </td>
                <td className="p-3 text-xs hidden sm:table-cell">
                  <div>{u.owned_campaigns} owned</div>
                  <div className="text-ink-fade">{u.member_campaigns} joined · {u.force_count} forces</div>
                </td>
                <td className="p-3 text-xs text-ink-fade hidden md:table-cell">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="p-3">{u.is_site_admin ? <Badge color="accent">Site Admin</Badge> : <Badge color="dim">User</Badge>}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1 text-xs flex-wrap">
                    <button onClick={() => resetPwM.mutate(u.id)} className="text-ink-fade hover:text-ink-dim px-2">Reset PW</button>
                    <button onClick={() => setAdminM.mutate({ id: u.id, is_site_admin: !u.is_site_admin })}
                      className="text-accent hover:text-accent-hover px-2">{u.is_site_admin ? 'Demote' : 'Promote'}</button>
                    {u.id !== currentUserId && (
                      <button onClick={() => confirm(`Delete ${u.email}? Their campaigns, forces, and history will be removed.`) && deleteM.mutate(u.id)}
                        className="text-danger/80 hover:text-danger px-2">Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function CampaignsTab() {
  const qc = useQueryClient();
  const campaignsQ = useQuery({ queryKey: ['admin', 'campaigns'], queryFn: () => adminApi.listCampaigns() });
  const usersQ = useQuery({ queryKey: ['admin', 'users'], queryFn: () => adminApi.listUsers() });
  const [filter, setFilter] = useState('');
  const [showTransfer, setShowTransfer] = useState<AdminCampaign | null>(null);
  const [showInvite, setShowInvite] = useState<AdminCampaign | null>(null);
  const deleteM = useMutation({
    mutationFn: (id: string) => adminApi.deleteCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
  });

  if (campaignsQ.isLoading) return <Spinner />;
  const all = campaignsQ.data?.campaigns ?? [];
  const campaigns = all.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase()) || c.owner_email?.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Campaigns ({all.length})</h2>
        <input placeholder="Filter by name or owner…" value={filter} onChange={e => setFilter(e.target.value)} className="!w-64" />
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-fade uppercase tracking-wider">
            <tr className="border-b border-white/5">
              <th className="text-left p-3">Campaign</th>
              <th className="text-left p-3 hidden md:table-cell">Owner</th>
              <th className="text-left p-3">State</th>
              <th className="text-left p-3 hidden lg:table-cell">Activity</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="p-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-ink-fade">{c.default_battle_size} · Turn {c.current_phase}</div>
                </td>
                <td className="p-3 text-xs hidden md:table-cell">
                  <div>{c.owner_name || c.owner_email?.split('@')[0]}</div>
                  <div className="text-ink-fade">{c.owner_email}</div>
                </td>
                <td className="p-3"><Badge color={c.state === 'setup' ? 'warning' : c.state === 'active' ? 'success' : 'dim'}>{c.state}</Badge></td>
                <td className="p-3 text-xs text-ink-fade hidden lg:table-cell">{c.force_count} forces · {c.battle_count} battles · {c.member_count} extra members</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1 text-xs flex-wrap">
                    <button onClick={() => setShowInvite(c)} className="text-accent hover:text-accent-hover px-2">Invite</button>
                    <button onClick={() => setShowTransfer(c)} className="text-ink-fade hover:text-ink-dim px-2">Transfer</button>
                    <button onClick={() => confirm(`Delete campaign "${c.name}"? All forces, units, and battles will be lost.`) && deleteM.mutate(c.id)}
                      className="text-danger/80 hover:text-danger px-2">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showTransfer && (
        <TransferModal campaign={showTransfer} users={usersQ.data?.users ?? []}
          onClose={() => setShowTransfer(null)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ['admin', 'campaigns'] }); setShowTransfer(null); }} />
      )}
      {showInvite && <InviteModal campaign={showInvite} onClose={() => setShowInvite(null)} />}
    </>
  );
}

function TransferModal({ campaign, users, onClose, onSuccess }: { campaign: AdminCampaign; users: AdminUser[]; onClose: () => void; onSuccess: () => void }) {
  const [newOwnerId, setNewOwnerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => adminApi.transferCampaign(campaign.id, newOwnerId),
    onSuccess, onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });
  const candidates = users.filter(u => u.id !== campaign.owner_id);
  return (
    <ModalShell title={`Transfer "${campaign.name}"`} onClose={onClose}>
      <p className="text-sm text-ink-dim mb-3">
        Current owner: <span className="text-ink">{campaign.owner_name || campaign.owner_email}</span>. The previous owner will be demoted to admin (still has elevated access).
      </p>
      <Field label="New Owner">
        <select value={newOwnerId} onChange={e => setNewOwnerId(e.target.value)}>
          <option value="">Select user…</option>
          {candidates.map(u => <option key={u.id} value={u.id}>{u.display_name || u.email} ({u.email})</option>)}
        </select>
      </Field>
      {error && <p className="text-sm text-danger mt-3">{error}</p>}
      <div className="flex gap-2 mt-4">
        <Button onClick={() => m.mutate()} disabled={!newOwnerId || m.isPending}>{m.isPending ? '…' : 'Transfer ownership'}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </ModalShell>
  );
}

function InviteModal({ campaign, onClose }: { campaign: AdminCampaign; onClose: () => void }) {
  const [role, setRole] = useState<'admin' | 'participant'>('participant');
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [created, setCreated] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const m = useMutation({
    mutationFn: () => adminApi.createInvite(campaign.id, { role_on_accept: role, label, max_uses: maxUses, expires_in_hours: 168 }),
    onSuccess: ({ invite }) => setCreated(invite),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });
  if (created) {
    const link = created.share_url ?? `${location.origin}/invite/${created.code}`;
    return (
      <ModalShell title="Invite created" onClose={onClose}>
        <p className="text-sm text-ink-dim mb-3">Share the link or code with the user.</p>
        <Field label="Code"><input readOnly value={created.code} onFocus={e => e.currentTarget.select()} className="font-mono uppercase tracking-wider" /></Field>
        <div className="mt-3">
          <Field label="Share link"><input readOnly value={link} onFocus={e => e.currentTarget.select()} className="font-mono text-xs" /></Field>
        </div>
        <Button variant="secondary"
          onClick={async () => { const ok = await copyToClipboard(link); setCopied(ok); setTimeout(() => setCopied(false), 1500); }}
          className="mt-3">{copied ? '✓ Copied' : 'Copy link'}</Button>
        <Button onClick={onClose} className="ml-2 mt-3">Done</Button>
      </ModalShell>
    );
  }
  return (
    <ModalShell title={`Invite to "${campaign.name}"`} onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Role on accept">
          <select value={role} onChange={e => setRole(e.target.value as any)}>
            <option value="participant">Participant</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Max uses"><input type="number" min={1} max={50} value={maxUses} onChange={e => setMaxUses(+e.target.value)} /></Field>
        <Field label="Label (optional)"><input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. For Bob" /></Field>
      </div>
      {error && <p className="text-sm text-danger mt-3">{error}</p>}
      <div className="flex gap-2 mt-4">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? '…' : 'Generate invite'}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-ink-fade hover:text-ink-dim text-xl leading-none">×</button>
        </div>
        {children}
      </Card>
    </div>
  );
}
