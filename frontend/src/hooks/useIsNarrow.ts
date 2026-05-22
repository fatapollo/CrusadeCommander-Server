import { useEffect, useState } from 'react';

// Tracks a min-width media query and returns true when the viewport is
// narrower than `maxPx` (≤480px by default — the handoff's mobile cutoff).
export function useIsNarrow(maxPx = 480): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxPx}px)`).matches);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    setNarrow(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, [maxPx]);
  return narrow;
}
