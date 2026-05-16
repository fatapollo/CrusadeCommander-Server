import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { invitesApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Badge, Spinner } from '../components/ui';
import { ApiError } from '../api/client';

export default function AcceptInvitePage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode?.toUpperCase() ?? '';
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) localStorage.setItem('pendingInviteCode', code);
  }, [loading, user, code]);

  const previewQ = useQuery({
    queryKey: ['invite', code],
    queryFn: () => invitesApi.preview(code),
    enabled: !!code, retry: false,
  });

  const acceptM = useMutation({
    mutationFn: () => invitesApi.accept(code),
    onSuccess: (data) => {
      localStorage.removeItem('pendingInviteCode');
      navigate(`/campaigns/${data.campaign_id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/?invite=${code}`} replace />;
  if (previewQ.isLoading) return <Spinner />;
  if (previewQ.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 max-w-md text-center">
          <h2 className="text-lg font-semibold mb-2">Invite Unavailable</h2>
          <p className="text-sm text-ink-fade mb-4">
            {previewQ.error instanceof ApiError ? previewQ.error.message : 'This invite is invalid or has expired.'}
          </p>
          <Button variant="secondary" onClick={() => navigate('/campaigns')}>Back to Campaigns</Button>
        </Card>
      </div>
    );
  }

  const info = previewQ.data!;
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full">
        <div className="text-xs text-ink-fade uppercase tracking-wider mb-2">Crusade Invitation</div>
        <h1 className="text-2xl font-bold mb-1">{info.campaign.name}</h1>
        {info.campaign.description && <p className="text-sm text-ink-dim mb-4">{info.campaign.description}</p>}

        <div className="space-y-2 my-6 text-sm">
          <div className="flex justify-between"><span className="text-ink-fade">Code</span><code className="text-accent font-mono">{code}</code></div>
          <div className="flex justify-between"><span className="text-ink-fade">Joining as</span><Badge>{info.role}</Badge></div>
          {info.label && <div className="flex justify-between"><span className="text-ink-fade">From</span><span>{info.label}</span></div>}
          <div className="flex justify-between"><span className="text-ink-fade">Uses left</span><span>{info.remaining_uses}</span></div>
        </div>

        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/campaigns')} className="flex-1">Decline</Button>
          <Button onClick={() => acceptM.mutate()} disabled={acceptM.isPending} className="flex-1">
            {acceptM.isPending ? '…' : 'Join Crusade'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
