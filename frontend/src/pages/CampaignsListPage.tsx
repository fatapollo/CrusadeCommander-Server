import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { campaignsApi } from '../api/endpoints';
import { Spinner } from '../components/ui';
import { BunkShell, BunkNav, BunkPill, BunkStatus } from '../components/bunker';
import { SigilHazard, SigilReticle, FACTION_CRESTS } from '../components/sigils';
import type { Campaign, CampaignState } from '../types';

const RUST = '#e2683c';

type Filter = 'ALL' | 'ACTIVE' | 'NEW' | 'ARCHIVED';

const STATE_TO_STATUS: Record<CampaignState, BunkStatus> = {
  setup: 'NEW',
  active: 'ACTIVE',
  concluded: 'ARCHIVED',
};

const STATUS_LEFT_BORDER: Record<BunkStatus, string> = {
  ACTIVE: '#e2683c',
  NEW: '#f4c14b',
  ARCHIVED: '#5c5346',
};

export default function CampaignsListPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('ALL');
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.list(),
  });

  if (isLoading) {
    return (
      <BunkShell>
        <BunkNav active="01" />
        <div className="py-20">
          <Spinner />
        </div>
      </BunkShell>
    );
  }

  const campaigns = data?.campaigns ?? [];

  if (campaigns.length === 0) {
    return (
      <BunkShell>
        <BunkNav active="01" />
        <BunkEmpty />
      </BunkShell>
    );
  }

  const sum = (k: 'force_count' | 'unit_count' | 'battle_count' | 'power_rating') =>
    campaigns.reduce((s, c) => s + (c[k] ?? 0), 0);
  const counts = {
    ACTIVE: campaigns.filter((c) => c.state === 'active').length,
    BATTLES: sum('battle_count'),
    UNITS: sum('unit_count'),
    PPR: sum('power_rating'),
  };

  const visible =
    filter === 'ALL'
      ? campaigns
      : campaigns.filter((c) => STATE_TO_STATUS[c.state] === filter);

  return (
    <BunkShell>
      <BunkNav active="01" />

      {/* Title strip */}
      <div className="px-pad-sect pt-8 pb-6 border-b border-bunk-line grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-8 xl:items-end">
        <div>
          <div className="font-mono text-[11px] tracking-mono-lg text-bunk-rust mb-3">
            VOL. III · LIBER CAMPAIGNARUM // ALL CRUSADES
          </div>
          <div className="font-display text-6xl sm:text-7xl font-bold text-bunk-bone tracking-tight leading-[0.9] uppercase">
            Operations
            <br />
            <span className="text-bunk-rust">Roster</span>
          </div>
        </div>
        <div
          className="grid grid-cols-4 gap-px xl:min-w-[520px]"
          style={{ background: '#2e251e' }}
        >
          {(
            [
              ['ACTIVE', counts.ACTIVE, 'text-bunk-rust'],
              ['BATTLES', counts.BATTLES, 'text-bunk-bone'],
              ['UNITS', counts.UNITS, 'text-bunk-bone'],
              ['PPR', counts.PPR, 'text-bunk-rust'],
            ] as const
          ).map(([k, v, c]) => (
            <div key={k} className="bg-bunk-surface px-4 py-3.5">
              <div className={`font-display text-4xl font-bold leading-none ${c}`}>{v}</div>
              <div className="font-mono text-[9px] tracking-mono-md text-bunk-boneDim mt-1.5">
                {k}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter strip */}
      <div className="px-pad-sect py-3.5 flex flex-wrap gap-2 items-center bg-bunk-surfaceLo border-b border-bunk-line">
        <div className="hidden sm:block">
          <SigilHazard width={24} height={8} color={RUST} bg="#0a0807" />
        </div>
        <div className="font-display text-[13px] tracking-[2px] font-bold text-bunk-bone mr-2.5">
          FILTER ━
        </div>
        {(['ALL', 'ACTIVE', 'NEW', 'ARCHIVED'] as Filter[]).map((t) => {
          const on = filter === t;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-[5px] font-display text-xs tracking-[2px] font-semibold border ${
                on
                  ? 'bg-bunk-rust text-bunk-ink border-bunk-rust'
                  : 'bg-transparent text-bunk-boneDim border-bunk-line hover:text-bunk-bone'
              }`}
            >
              {t}
            </button>
          );
        })}
        <div className="ml-3 font-mono text-[10px] tracking-mono-md text-bunk-boneDim hidden md:block">
          // {visible.length} OF {campaigns.length} RECORDS
        </div>
        <div className="flex-1" />
        <JoinByCode />
        <button
          onClick={() => navigate('/campaigns/new')}
          className="px-4 py-2 font-display text-[13px] tracking-[2px] font-bold bg-bunk-bone text-bunk-ink hover:bg-bunk-boneDim"
        >
          ＋ DECLARE NEW CRUSADE
        </button>
      </div>

      <div className="p-pad-sect">
        {visible.length === 0 ? (
          <div className="font-mono text-[11px] tracking-mono-md text-bunk-boneDim border border-bunk-line bg-bunk-surface px-5 py-8 text-center">
            // NO RECORDS MATCH FILTER · {filter}
          </div>
        ) : (
          <div className="grid gap-3">
            {visible.map((c, i) => (
              <BunkCampaignRow key={c.id} c={c} featured={i === 0 && filter === 'ALL'} />
            ))}
          </div>
        )}
      </div>

      <div className="px-pad-sect py-4 border-t border-bunk-line bg-bunk-ink flex justify-between font-mono text-[9px] tracking-mono-md text-bunk-boneMute">
        <span>// END TRANSMISSION</span>
        <span>CRUSADE COMMANDER · VAULT 003-Ω</span>
      </div>
    </BunkShell>
  );
}

function BunkCampaignRow({ c, featured = false }: { c: Campaign; featured?: boolean }) {
  const status = STATE_TO_STATUS[c.state];
  const created = c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '—';
  return (
    <Link
      to={`/campaigns/${c.id}`}
      className="block group"
      style={{ borderLeft: `4px solid ${STATUS_LEFT_BORDER[status]}` }}
    >
      <div
        className={`grid grid-cols-[auto_1fr_auto_auto] items-stretch border transition-colors ${
          featured
            ? 'bg-bunk-surfaceHi border-bunk-lineHi'
            : 'bg-bunk-surface border-bunk-line group-hover:border-bunk-lineHi'
        }`}
      >
        {/* Crest / id block */}
        <div className="w-[84px] bg-bunk-ink flex flex-col items-center justify-center border-r border-bunk-line py-2.5">
          <SigilReticle size={42} color={RUST} />
          <div className="font-mono text-[9px] tracking-mono-md text-bunk-boneDim mt-2">
            {c.id.replace(/-/g, '').slice(0, 4).toUpperCase()}
          </div>
        </div>

        {/* Narrative */}
        <div className="px-5 py-4 min-w-0">
          <div className="flex gap-2.5 items-center mb-2 flex-wrap">
            <BunkPill status={status} />
            <span className="font-mono text-[10px] tracking-mono-md text-bunk-boneDim uppercase">
              {c.phase_label} {c.current_phase} // {c.default_battle_size}
            </span>
          </div>
          <div
            className={`font-display font-bold tracking-wide text-bunk-bone uppercase leading-none ${
              featured ? 'text-3xl' : 'text-2xl'
            }`}
          >
            {c.name}
          </div>
          {c.description && (
            <div className="text-xs text-bunk-boneDim mt-2 leading-relaxed max-w-[540px] line-clamp-2">
              {c.description}
            </div>
          )}
          <div className="font-mono text-[10px] tracking-mono-sm text-bunk-boneDim mt-3">
            OPENED {created}
          </div>
        </div>

        {/* Telemetry block */}
        <div className="hidden sm:flex w-[180px] border-l border-bunk-line bg-bunk-surfaceLo flex-col justify-center px-4 py-3.5 font-mono text-[10px] tracking-mono-sm text-bunk-boneDim gap-1">
          <div className="flex justify-between">
            <span>FORCES</span>
            <span className="text-bunk-bone">{String(c.force_count ?? 0).padStart(2, '0')}</span>
          </div>
          <div className="flex justify-between">
            <span>UNITS</span>
            <span className="text-bunk-bone">{String(c.unit_count ?? 0).padStart(2, '0')}</span>
          </div>
          <div className="flex justify-between">
            <span>PPR</span>
            <span className="text-bunk-rust">{c.power_rating ?? 0}</span>
          </div>
        </div>

        {/* Battles numeral block */}
        <div className="w-[140px] border-l border-bunk-line bg-bunk-ink flex flex-col items-center justify-center p-3.5 gap-1">
          <div
            className={`font-display font-bold text-bunk-rust leading-[0.9] tracking-tight ${
              featured ? 'text-6xl' : 'text-5xl'
            }`}
          >
            {String(c.battle_count ?? 0).padStart(2, '0')}
          </div>
          <div className="font-mono text-[9px] tracking-mono-md text-bunk-boneDim text-center">
            BATTLES
          </div>
          <div className="font-mono text-[9px] tracking-mono-sm text-bunk-rust mt-1.5">
            {c.default_battle_size.toUpperCase()}
          </div>
        </div>
      </div>
    </Link>
  );
}

function JoinByCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase().replace(/\s/g, '');
    if (!trimmed) return;
    const match = trimmed.match(/INVITE\/([A-Z0-9]+)/i);
    navigate(`/invite/${match ? match[1] : trimmed}`);
  };
  return (
    <form onSubmit={submit} className="flex items-stretch">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="INVITE CODE"
        autoComplete="off"
        spellCheck={false}
        className="!w-[150px] !rounded-none !bg-bunk-ink !border-bunk-line !border-b-2 !border-b-bunk-rust font-mono !text-[11px] tracking-mono-sm uppercase !py-2"
      />
      <button
        type="submit"
        disabled={!code.trim()}
        className="px-3 py-2 font-display text-[12px] tracking-[2px] font-bold bg-bunk-surface border border-bunk-line text-bunk-boneDim hover:text-bunk-bone disabled:opacity-40"
      >
        JOIN →
      </button>
    </form>
  );
}

function BunkEmpty() {
  const navigate = useNavigate();
  return (
    <>
      <div className="px-pad-sect py-16 relative overflow-hidden min-h-[500px]">
        <div className="absolute -right-[120px] -top-[100px] opacity-[0.04]">
          <FACTION_CRESTS.IRON_LEGION size={600} color={RUST} />
        </div>
        <div className="absolute -left-[60px] -bottom-[80px] opacity-[0.04]">
          <SigilReticle size={360} color={RUST} />
        </div>
        <div className="relative max-w-[760px] mx-auto text-center">
          <div className="mb-7 flex justify-center">
            <SigilHazard width={80} height={14} color={RUST} bg="#0c0a08" />
          </div>
          <div className="font-mono text-[11px] tracking-mono-lg text-bunk-rust mb-4">
            VAULT 003-Ω · NO RECORDS ON FILE
          </div>
          <div className="font-display text-6xl sm:text-8xl font-bold text-bunk-bone tracking-tight leading-[0.9] uppercase">
            The Ledger
            <br />
            <span className="text-bunk-rust">Awaits</span>
          </div>
          <div className="font-narrative italic text-xl text-bunk-boneDim mt-6 max-w-[540px] mx-auto leading-relaxed">
            A crusade is the chronicle of a force across linked engagements — its
            honours, its scars, the names that endure. Yours starts with a single
            declaration.
          </div>
          <div className="flex flex-wrap gap-3 justify-center mt-9 items-stretch">
            <button
              onClick={() => navigate('/campaigns/new')}
              className="px-7 py-3.5 bg-bunk-rust text-bunk-ink font-display text-base tracking-mono-md font-bold hover:bg-bunk-rustDeep"
            >
              ＋ DECLARE FIRST CRUSADE
            </button>
            <JoinByCode />
          </div>
        </div>
      </div>

      <div
        className="px-pad-sect pt-6 pb-10 border-t border-bunk-line grid grid-cols-1 md:grid-cols-3 gap-px"
        style={{ background: '#2e251e' }}
      >
        {[
          {
            n: '01',
            title: 'DECLARE A CRUSADE',
            text: 'Name your campaign and pick a faction. Crusades persist across battles — every engagement adds to its chronicle.',
          },
          {
            n: '02',
            title: 'MUSTER A FORCE',
            text: 'Add units to your roster. Each one earns experience, honours, and battle scars across the campaign — and grows in power.',
          },
          {
            n: '03',
            title: 'INSCRIBE A BATTLE',
            text: 'When the dust settles, log the result. The system tracks XP, promotions, and the scars your force carries forward.',
          },
        ].map((c) => (
          <div
            key={c.n}
            className="bg-bunk-surface px-7 py-7"
            style={{ borderTop: `3px solid ${RUST}` }}
          >
            <div className="font-display text-5xl font-bold text-bunk-rust leading-none tracking-tight">
              {c.n}
            </div>
            <div className="font-display text-xl font-bold tracking-wide text-bunk-bone mt-3.5 uppercase">
              {c.title}
            </div>
            <div className="text-[13px] text-bunk-boneDim leading-relaxed mt-2.5">{c.text}</div>
          </div>
        ))}
      </div>

      <div className="px-pad-sect py-4 border-t border-bunk-line bg-bunk-ink flex justify-between font-mono text-[9px] tracking-mono-md text-bunk-boneMute">
        <span>// VAULT INITIALIZED · 0 RECORDS · AWAITING DECLARATION</span>
        <span>CRUSADE COMMANDER · VAULT 003-Ω</span>
      </div>
    </>
  );
}
