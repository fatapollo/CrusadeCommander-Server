import type { CampaignPhase } from '../../types';

export interface PhaseScrubberProps {
  phases: CampaignPhase[];
  /** 1-based current phase being viewed. */
  current: number;
  onChange: (idx: number) => void;
  /** True when `current === campaign.current_phase` — drives the LIVE pip. */
  isCurrent: boolean;
}

// Dropdown jump (left) + tick rail (middle) + LIVE indicator (right).
// Below the rail, the current phase label + optional date.
export function PhaseScrubber({ phases, current, onChange, isCurrent }: PhaseScrubberProps) {
  const safe = Math.max(1, Math.min(phases.length, current));
  const here = phases.find(p => p.idx === safe) ?? phases[phases.length - 1];

  return (
    <div className="bg-bunk-surfaceLo border border-bunk-line">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 border-b border-dashed border-bunk-line">
        {/* Dropdown jump */}
        <select
          value={safe}
          onChange={(e) => onChange(Number(e.target.value))}
          className="!w-auto !bg-bunk-ink !border !border-bunk-line !border-b-2 !border-b-bunk-rust !rounded-none !py-1.5 !px-2 font-mono !text-[11px] tracking-mono-md text-bunk-bone uppercase"
          aria-label="Jump to phase"
        >
          {phases.map(p => (
            <option key={p.idx} value={p.idx}>
              PHASE {String(p.idx).padStart(2, '0')}
            </option>
          ))}
        </select>

        {/* Tick rail */}
        <div className="relative h-8">
          {/* Track */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-bunk-line" />
          {/* Filled track up to current */}
          {phases.length > 1 && (
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-px bg-bunk-rust"
              style={{ width: `${((safe - 1) / (phases.length - 1)) * 100}%` }}
            />
          )}
          {phases.map((p, i) => {
            const x = phases.length === 1 ? 0 : (i / (phases.length - 1)) * 100;
            const isPast = p.idx < safe;
            const isActive = p.idx === safe;
            return (
              <button
                key={p.idx}
                type="button"
                onClick={() => onChange(p.idx)}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                style={{ left: `${x}%` }}
                aria-label={`Phase ${p.idx}`}
              >
                <span
                  className={
                    isActive
                      ? 'block w-3 h-3 bg-bunk-rust'
                      : isPast
                        ? 'block w-2 h-2 bg-bunk-rustDeep'
                        : 'block w-2 h-2 border border-bunk-boneMute'
                  }
                />
                <span className="absolute left-1/2 -translate-x-1/2 -top-4 font-mono text-[9px] tracking-mono-sm text-bunk-boneDim">
                  {String(p.idx).padStart(2, '0')}
                </span>
              </button>
            );
          })}
        </div>

        {/* LIVE indicator */}
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-mono-md uppercase">
          <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-bunk-green' : 'bg-bunk-boneMute'}`} />
          <span className={isCurrent ? 'text-bunk-green' : 'text-bunk-boneDim'}>
            {isCurrent ? 'Live' : 'History'}
          </span>
        </div>
      </div>
      <div className="px-3 py-2 flex items-baseline gap-3">
        <span className="font-display text-base font-bold uppercase tracking-wide text-bunk-bone">
          {here?.label || `Phase ${String(safe).padStart(2, '0')}`}
        </span>
        {here?.date && (
          <span className="font-mono text-[10px] tracking-mono-sm text-bunk-boneDim">{here.date}</span>
        )}
      </div>
    </div>
  );
}
