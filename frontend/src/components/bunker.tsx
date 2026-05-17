// Shared chrome for the Bunker Command visual direction.
//
// Per the design handoff, the exploration toggles (hazard stripes, grid
// backdrop, telemetry bar, headline case) are LOCKED at the design defaults
// in production — they are not user settings. The accent palette and density
// are intended to become real user preferences later; until then everything
// uses the rust default via the `bunk` Tailwind tokens.

import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SigilHazard, FACTION_CRESTS } from './sigils';

const RUST = '#e2683c';

export function BunkShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen relative font-sans text-bunk-bone"
      style={{
        background: '#0c0a08',
        backgroundImage: `
          linear-gradient(rgba(226,104,60,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(226,104,60,0.05) 1px, transparent 1px),
          radial-gradient(circle at 0% 0%, rgba(0,0,0,0.45), transparent 50%),
          radial-gradient(circle at 100% 100%, rgba(0,0,0,0.40), transparent 55%)
        `,
        backgroundSize: '100% 32px, 32px 100%, 100% 100%, 100% 100%',
      }}
    >
      {children}
    </div>
  );
}

export function BunkStatusBar() {
  const { user } = useAuth();
  const ident = (user?.display_name || user?.email || 'OPERATOR').toUpperCase();
  return (
    <div className="flex items-center gap-3.5 px-7 py-1.5 bg-bunk-ink border-b border-bunk-line font-mono text-[10px] tracking-mono-md text-bunk-boneDim">
      <span>
        <span className="text-bunk-green">●</span> LINK OK
      </span>
      <span>
        <span className="text-bunk-rust">●</span> AUSPEX 87%
      </span>
      <span className="hidden sm:inline">
        <span className="text-bunk-green">●</span> SECTOR 14-Ω
      </span>
      <span className="flex-1 text-center hidden md:block">// CRUSADE COMMANDER · OPERATIONS THEATRE</span>
      <span className="truncate max-w-[40vw]">{ident}</span>
      <span className="text-bunk-rust">VAULT 003-Ω</span>
    </div>
  );
}

interface NavTab {
  n: string;
  label: string;
  to?: string;
}

// Forces and Battles are campaign-scoped (reached via a campaign's tabs), so
// they route to the Campaigns hub where a campaign is selected.
const DEFAULT_TABS: NavTab[] = [
  { n: '01', label: 'CAMPAIGNS', to: '/campaigns' },
  { n: '02', label: 'FORCES', to: '/campaigns' },
  { n: '03', label: 'BATTLES', to: '/campaigns' },
];
export function BunkNav({ active = '01' }: { active?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const Crest = FACTION_CRESTS.IRON_LEGION;
  return (
    <div>
      <BunkStatusBar />
      <SigilHazard height={8} color={RUST} bg="#06040a" />
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-8 px-7 py-4 bg-bunk-surfaceLo border-b border-bunk-line">
        <Link to="/campaigns" className="flex items-center gap-3.5">
          <div className="relative w-[46px] h-[46px] bg-bunk-rust text-bunk-ink flex items-center justify-center font-display text-[22px] font-bold tracking-wide">
            CC
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-bunk-green" />
          </div>
          <div className="hidden sm:block">
            <div className="font-display text-[22px] font-bold tracking-[2px] text-bunk-bone leading-none">
              CRUSADE COMMANDER
            </div>
            <div className="font-mono text-[9px] tracking-[3px] text-bunk-rust mt-1">
              OPERATIONAL THEATRE // SECTOR 14-Ω
            </div>
          </div>
        </Link>

        <div className="hidden lg:flex justify-center">
          {DEFAULT_TABS.map((it) => {
            const isActive = it.n === active;
            const cls =
              'px-5 py-2.5 -ml-px border-x border-bunk-line font-display text-[13px] font-bold tracking-[2px] flex items-center gap-2 ' +
              (isActive
                ? 'bg-bunk-rust text-bunk-ink'
                : 'text-bunk-boneDim hover:text-bunk-bone');
            return (
              <Link key={it.n} to={it.to!} className={cls}>
                <span className="font-mono text-[10px] opacity-65">{it.n}</span>
                {it.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3.5">
          {user?.is_site_admin && (
            <Link
              to="/admin"
              className="hidden sm:block px-3 py-1.5 border border-bunk-line font-mono text-[10px] tracking-mono-md text-bunk-boneDim hover:text-bunk-bone"
            >
              ADMIN
            </Link>
          )}
          <button
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="px-3 py-1.5 border border-bunk-line font-mono text-[10px] tracking-mono-md text-bunk-boneDim hover:text-bunk-bone"
          >
            SIGN OUT
          </button>
          <div className="w-10 h-10 bg-bunk-surfaceHi border-2 border-bunk-rust hidden sm:flex items-center justify-center">
            <Crest size={26} color={RUST} />
          </div>
        </div>
      </div>
    </div>
  );
}

export type BunkStatus = 'ACTIVE' | 'NEW' | 'ARCHIVED';

const PILL: Record<BunkStatus, { text: string; bg: string }> = {
  ACTIVE: { text: 'text-bunk-green', bg: 'rgba(111,176,104,0.10)' },
  NEW: { text: 'text-bunk-warning', bg: 'rgba(244,193,75,0.10)' },
  ARCHIVED: { text: 'text-bunk-boneDim', bg: 'rgba(140,130,112,0.08)' },
};

const PILL_BORDER: Record<BunkStatus, string> = {
  ACTIVE: 'border-bunk-green',
  NEW: 'border-bunk-warning',
  ARCHIVED: 'border-bunk-boneDim',
};

const PILL_DOT: Record<BunkStatus, string> = {
  ACTIVE: 'bg-bunk-green',
  NEW: 'bg-bunk-warning',
  ARCHIVED: 'bg-bunk-boneDim',
};

export function BunkPill({ status }: { status: BunkStatus }) {
  const m = PILL[status] ?? PILL.ACTIVE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] border ${PILL_BORDER[status]} ${m.text} font-mono text-[10px] tracking-mono-md`}
      style={{ background: m.bg }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${PILL_DOT[status]}`} />
      {status}
    </span>
  );
}

export function BunkBar({
  pct,
  segments = 24,
  colorClass = 'bg-bunk-rust border-bunk-rust',
}: {
  pct: number;
  segments?: number;
  colorClass?: string;
}) {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * segments);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`flex-1 h-2 border ${
            i < filled ? colorClass : 'bg-bunk-surfaceLo border-bunk-line'
          }`}
        />
      ))}
    </div>
  );
}

// Standard page wrapper for screens without a bespoke full-bleed layout:
// Bunker shell + nav + a padded content column.
export function BunkPage({
  active = '01',
  children,
  width = 'max-w-6xl',
}: {
  active?: string;
  children: ReactNode;
  width?: string;
}) {
  return (
    <BunkShell>
      <BunkNav active={active} />
      <div className={`${width} w-full mx-auto px-pad-sect py-8`}>{children}</div>
    </BunkShell>
  );
}

// Hazard-marked section heading used across the body of most screens.
export function BunkSectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <div className="hidden sm:block self-center w-12">
        <SigilHazard width={48} height={10} color={RUST} bg="#0c0a08" />
      </div>
      <div className="font-display text-2xl font-bold tracking-wide text-bunk-bone uppercase">
        {title}
      </div>
      {count != null && (
        <div className="font-mono text-[10px] tracking-mono-md text-bunk-rust">{count}</div>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

// Side-rail panel with a mono "// LABEL" header strip.
export function BunkRailPanel({
  label,
  accent = 'rust',
  children,
}: {
  label: string;
  accent?: 'rust' | 'oxblood';
  children: ReactNode;
}) {
  const labelColor = accent === 'oxblood' ? 'text-bunk-red' : 'text-bunk-rust';
  const topBorder = accent === 'oxblood' ? 'border-t-[3px] border-t-bunk-oxblood' : '';
  return (
    <div className={`bg-bunk-surface border border-bunk-line ${topBorder}`}>
      <div
        className={`px-3.5 py-2 border-b border-dashed border-bunk-line font-mono text-[9px] tracking-mono-lg ${labelColor}`}
      >
        // {label}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

// Numeric stat grid (1px gaps revealing the line color underneath).
export function BunkStatGrid({
  stats,
  cols = 4,
}: {
  stats: [string, ReactNode, string][];
  cols?: number;
}) {
  return (
    <div
      className="grid gap-px"
      style={{ background: '#2e251e', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
    >
      {stats.map(([k, v, c]) => (
        <div key={k} className="bg-bunk-surface px-4 py-3.5">
          <div className={`font-display text-3xl font-bold leading-none ${c}`}>{v}</div>
          <div className="font-mono text-[9px] tracking-mono-md text-bunk-boneDim mt-1.5">{k}</div>
        </div>
      ))}
    </div>
  );
}

// Numbered form section card (01 / TITLE · count / action).
export function BunkFormSection({
  num,
  title,
  count,
  action,
  children,
}: {
  num: string;
  title: string;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-bunk-surface border border-bunk-line">
      <div className="px-4 py-3 border-b border-bunk-line bg-bunk-surfaceLo flex gap-3.5 items-center">
        <div className="w-8 h-8 bg-bunk-rust text-bunk-ink flex items-center justify-center font-display text-[13px] font-bold">
          {num}
        </div>
        <div className="font-display text-xl font-bold tracking-wide text-bunk-bone uppercase">
          {title}
        </div>
        {count != null && (
          <div className="font-mono text-[10px] tracking-mono-md text-bunk-boneDim">· {count}</div>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-4 grid gap-3">{children}</div>
    </div>
  );
}

// Read-only labelled value styled like a Bunker field.
export function BunkField({
  label,
  value,
  mono = false,
  suffix,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  suffix?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-mono-md text-bunk-rust mb-1.5 uppercase">
        {label}
      </div>
      <div
        className={`px-3.5 py-2.5 bg-bunk-ink border border-bunk-line border-b-2 border-b-bunk-rust text-bunk-bone flex justify-between items-center ${
          mono ? 'font-mono text-sm' : 'font-display text-lg font-semibold'
        }`}
      >
        <span>{value}</span>
        {suffix && (
          <span className="font-mono text-[10px] text-bunk-boneDim tracking-mono-md">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// Equal-width segmented option strip (1px line gaps show through).
export function BunkSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-mono-md text-bunk-rust mb-1.5 uppercase">
        {label}
      </div>
      <div className="flex gap-px" style={{ background: '#2e251e' }}>
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`flex-1 px-3 py-2.5 font-display text-[13px] font-bold tracking-[2px] text-center uppercase ${
                on ? 'bg-bunk-rust text-bunk-ink' : 'bg-bunk-ink text-bunk-bone hover:text-bunk-rust'
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
