import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui';

export default function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/5 bg-bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/campaigns" className="font-bold tracking-tight text-accent text-lg">
            Crusade Commander
          </Link>
          {user && (
            <div className="flex items-center gap-3">
              {user.is_site_admin && (
                <Link to="/admin" className="text-xs text-accent hover:text-accent-hover hover:underline">
                  Admin
                </Link>
              )}
              <span className="text-sm text-ink-dim hidden sm:inline">
                {user.display_name || user.email}
              </span>
              <Button variant="ghost" onClick={async () => { await logout(); navigate('/'); }}>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
