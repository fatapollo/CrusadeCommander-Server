import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Field } from '../components/ui';
import { BunkShell } from '../components/bunker';
import { SigilHazard } from '../components/sigils';
import { ApiError } from '../api/client';

export default function AuthPage() {
  const { user, login, register, loading, adminPasscodeEnabled } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [showAdminField, setShowAdminField] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (user) {
    const pending = localStorage.getItem('pendingInviteCode')
      ?? new URLSearchParams(location.search).get('invite');
    if (pending) {
      localStorage.removeItem('pendingInviteCode');
      return <Navigate to={`/invite/${pending}`} replace />;
    }
    return <Navigate to="/campaigns" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName, adminPasscode || undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BunkShell>
      <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <SigilHazard height={8} color="#e2683c" bg="#161310" />
        <div className="p-8">
        <div className="text-center mb-6">
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-bunk-bone">
            Crusade <span className="text-bunk-rust">Commander</span>
          </h1>
          <p className="font-mono text-[10px] tracking-mono-md text-bunk-boneDim mt-2 uppercase">
            Warhammer 40k Narrative Campaigns
          </p>
        </div>

        <div className="flex gap-px mb-6" style={{ background: '#2e251e' }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 px-3 font-display text-[13px] font-bold tracking-[2px] uppercase transition-colors ${
                mode === m ? 'bg-bunk-rust text-bunk-ink' : 'bg-bunk-ink text-bunk-boneDim hover:text-bunk-bone'
              }`}
            >
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <Field label="Display Name">
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Brother-Captain Stern" autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Password" hint={mode === 'register' ? 'Minimum 8 characters' : undefined}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={mode === 'register' ? 8 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          {mode === 'register' && adminPasscodeEnabled && (
            <>
              {!showAdminField ? (
                <button type="button" onClick={() => setShowAdminField(true)}
                  className="text-xs text-ink-fade hover:text-ink-dim text-left">
                  + I have an admin passcode
                </button>
              ) : (
                <Field label="Admin Passcode" hint="Promotes this account to site admin.">
                  <input type="password" value={adminPasscode} onChange={e => setAdminPasscode(e.target.value)}
                    autoComplete="off" spellCheck={false} />
                </Field>
              )}
            </>
          )}
          {error && <p className="font-mono text-[11px] text-bunk-red">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>
        </div>
      </Card>
    </div>
    </BunkShell>
  );
}
