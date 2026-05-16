import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { invitesApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Badge, Spinner } from '../components/ui';
import { BunkShell } from '../components/bunker';
import { SigilHazard } from '../components/sigils';
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
      <BunkShell>
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="p-6 max-w-md text-center">
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-bunk-bone mb-2">Invite Unavailable</h2>
            <p className="text-sm text-bunk-boneDim mb-4">
              {previewQ.error instanceof ApiError ? previewQ.error.message : 'This invite is invalid or has expired.'}
            </p>
            <Button variant="secondary" onClick={() => navigate('/campaigns')}>Back to Campaigns</Button>
          </Card>
        </div>
      </BunkShell>
    );
  }

  const info = previewQ.data!;
  return (
    <BunkShell>
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <SigilHazard height={8} color="#e2683c" bg="#161310" />
          <div className="p-8">
            <div className="font-mono text-[10px] text-bunk-rust uppercase tracking-mono-lg mb-2">// Crusade Invitation</div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-bunk-bone mb-1">{info.campaign.name}</h1>
            {info.campaign.description && <p className="text-sm text-bunk-boneDim mb-4">{info.campaign.description}</p>}

            <div className="space-y-2 my-6 font-mono text-[11px] tracking-mono-sm">
              <div className="flex justify-between"><span className="text-bunk-boneDim">CODE</span><code className="text-bunk-rust">{code}</code></div>
              <div className="flex justify-between items-center"><span className="text-bunk-boneDim">JOINING AS</span><Badge>{info.role}</Badge></div>
              {info.label && <div className="flex justify-between"><span className="text-bunk-boneDim">FROM</span><span className="text-bunk-bone">{info.label}</span></div>}
              <div className="flex justify-between"><span className="text-bunk-boneDim">USES LEFT</span><span className="text-bunk-bone">{info.remaining_uses}</span></div>
            </div>

            {error && <p className="font-mono text-[11px] text-bunk-red mb-3">{error}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate('/campaigns')} className="flex-1">Decline</Button>
              <Button onClick={() => acceptM.mutate()} disabled={acceptM.isPending} className="flex-1">
                {acceptM.isPending ? '…' : 'Join Crusade'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </BunkShell>
  );
}
