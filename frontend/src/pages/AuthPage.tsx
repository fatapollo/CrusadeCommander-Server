import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Field } from '../components/ui';
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-accent">Crusade Commander</h1>
          <p className="text-ink-dim text-sm mt-1">Warhammer 40k narrative campaigns</p>
        </div>

        <div className="flex gap-1 p-1 bg-bg-elevated rounded-lg mb-6">
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 px-3 rounded text-sm font-medium transition-colors ${
                mode === m ? 'bg-accent text-white' : 'text-ink-dim hover:text-ink'
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
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
