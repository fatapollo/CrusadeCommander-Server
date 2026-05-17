// Reusable abstract sigils — geometric primitives only, no real-world or
// trademarked iconography. Ported from the Bunker Command design handoff.

interface SizeColor {
  size?: number;
  color?: string;
}

export function SigilStar({
  size = 32,
  color = 'currentColor',
  points = 8,
  inner = 0.42,
}: SizeColor & { points?: number; inner?: number }) {
  const r = size / 2;
  const ir = r * inner;
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const ang = (Math.PI / points) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : ir;
    pts.push([r + Math.cos(ang) * rad, r + Math.sin(ang) * rad]);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={color} />
    </svg>
  );
}

export function SigilCrossedLances({
  size = 48,
  color = 'currentColor',
  stroke = 2,
}: SizeColor & { stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="square">
        <line x1="6" y1="6" x2="42" y2="42" />
        <line x1="42" y1="6" x2="6" y2="42" />
        <circle cx="24" cy="24" r="6" />
        <circle cx="24" cy="24" r="10" />
      </g>
    </svg>
  );
}

export function SigilRing({
  size = 40,
  color = 'currentColor',
  stroke = 1.5,
}: SizeColor & { stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <g stroke={color} fill="none" strokeWidth={stroke}>
        <circle cx="20" cy="20" r="18" />
        <circle cx="20" cy="20" r="13" />
        <circle cx="20" cy="20" r="3" fill={color} />
        <line x1="20" y1="0" x2="20" y2="6" />
        <line x1="20" y1="34" x2="20" y2="40" />
        <line x1="0" y1="20" x2="6" y2="20" />
        <line x1="34" y1="20" x2="40" y2="20" />
      </g>
    </svg>
  );
}

export function SigilDiamond({ size = 28, color = 'currentColor' }: SizeColor) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke={color} strokeWidth="1.5" />
      <polygon points="14,8 20,14 14,20 8,14" fill={color} />
    </svg>
  );
}

export function SigilBanner({
  width = 80,
  height = 110,
  color = 'currentColor',
  accent = 'currentColor',
  label = '',
}: {
  width?: number;
  height?: number;
  color?: string;
  accent?: string;
  label?: string;
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 80 110" aria-hidden="true">
      <path d="M10 4 L70 4 L70 86 L40 100 L10 86 Z" fill="none" stroke={color} strokeWidth="1.5" />
      <path d="M10 4 L70 4 L70 18 L10 18 Z" fill={accent} opacity="0.85" />
      <line x1="10" y1="24" x2="70" y2="24" stroke={color} strokeWidth="1" />
      <text
        x="40"
        y="14"
        textAnchor="middle"
        fontSize="9"
        fill="#120906"
        fontFamily="monospace"
        letterSpacing="2"
      >
        {label}
      </text>
      <circle cx="40" cy="48" r="11" fill="none" stroke={color} strokeWidth="1.2" />
      <circle cx="40" cy="48" r="3" fill={color} />
      <line x1="40" y1="62" x2="40" y2="82" stroke={color} strokeWidth="1" />
      <line x1="30" y1="72" x2="50" y2="72" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function SigilReticle({
  size = 60,
  color = 'currentColor',
  stroke = 1,
}: SizeColor & { stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <g stroke={color} fill="none" strokeWidth={stroke}>
        <circle cx="30" cy="30" r="26" />
        <circle cx="30" cy="30" r="18" strokeDasharray="2 3" />
        <circle cx="30" cy="30" r="2" fill={color} />
        <line x1="30" y1="0" x2="30" y2="10" />
        <line x1="30" y1="50" x2="30" y2="60" />
        <line x1="0" y1="30" x2="10" y2="30" />
        <line x1="50" y1="30" x2="60" y2="30" />
        <path d="M22 6 L30 14 L38 6" />
      </g>
    </svg>
  );
}

export function SigilHazard({
  width = 200,
  height = 14,
  color = '#e2683c',
  bg = '#120906',
}: {
  width?: number;
  height?: number;
  color?: string;
  bg?: string;
}) {
  const id = `hz-${width}-${height}`;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={id}
          width="20"
          height={height}
          patternUnits="userSpaceOnUse"
          patternTransform="skewX(-30)"
        >
          <rect x="0" y="0" width="10" height={height} fill={color} />
          <rect x="10" y="0" width="10" height={height} fill={bg} />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </svg>
  );
}

export function CornerOrnament({
  size = 24,
  color = 'currentColor',
  flip = '',
}: SizeColor & { flip?: string }) {
  let transform = '';
  if (flip.includes('x')) transform += ` scale(-1,1) translate(${-size},0)`;
  if (flip.includes('y')) transform += ` scale(1,-1) translate(0,${-size})`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={transform} stroke={color} strokeWidth="1" fill="none">
        <path d={`M0 0 L${size} 0 L${size} 2 L2 2 L2 ${size} L0 ${size} Z`} fill={color} />
        <path d={`M6 6 L${size - 2} 6`} />
        <path d={`M6 6 L6 ${size - 2}`} />
        <circle cx="6" cy="6" r="2" fill={color} />
      </g>
    </svg>
  );
}

type CrestComponent = (props: SizeColor) => JSX.Element;

export const FACTION_CRESTS: Record<string, CrestComponent> = {
  IRON_LEGION: ({ size = 60, color = 'currentColor' }: SizeColor) => (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <g stroke={color} fill="none" strokeWidth="1.5">
        <polygon points="30,4 56,30 30,56 4,30" />
        <polygon points="30,14 46,30 30,46 14,30" fill={color} />
        <line x1="30" y1="0" x2="30" y2="60" />
      </g>
    </svg>
  ),
  ORDER_VIGIL: ({ size = 60, color = 'currentColor' }: SizeColor) => (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <g stroke={color} fill="none" strokeWidth="1.5">
        <circle cx="30" cy="30" r="26" />
        <circle cx="30" cy="30" r="18" />
        <line x1="30" y1="4" x2="30" y2="56" />
        <line x1="4" y1="30" x2="56" y2="30" />
        <circle cx="30" cy="30" r="4" fill={color} />
      </g>
    </svg>
  ),
  BLACK_HORN: ({ size = 60, color = 'currentColor' }: SizeColor) => (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <g stroke={color} fill="none" strokeWidth="1.5">
        <path d="M10 50 Q30 4 50 50 Z" fill={color} />
        <path d="M18 48 L30 18 L42 48" stroke="#120906" />
      </g>
    </svg>
  ),
  COG_ASCENDANT: ({ size = 60, color = 'currentColor' }: SizeColor) => (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <g stroke={color} fill="none" strokeWidth="1.5">
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (Math.PI / 4) * i;
          return (
            <line
              key={i}
              x1={30 + Math.cos(a) * 20}
              y1={30 + Math.sin(a) * 20}
              x2={30 + Math.cos(a) * 28}
              y2={30 + Math.sin(a) * 28}
            />
          );
        })}
        <circle cx="30" cy="30" r="20" />
        <circle cx="30" cy="30" r="12" />
        <circle cx="30" cy="30" r="4" fill={color} />
      </g>
    </svg>
  ),
  WHISPER_HOST: ({ size = 60, color = 'currentColor' }: SizeColor) => (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <g stroke={color} fill="none" strokeWidth="1.5">
        <path d="M8 30 Q30 6 52 30 Q30 54 8 30 Z" />
        <path d="M16 30 Q30 16 44 30 Q30 44 16 30 Z" />
        <circle cx="30" cy="30" r="3" fill={color} />
      </g>
    </svg>
  ),
};

// Map a real (free-text) 40k faction to one of the abstract crests. Purely
// cosmetic — keyword buckets, with a neutral reticle fallback.
export function crestFor(faction: string | null | undefined): CrestComponent {
  const f = (faction ?? '').toLowerCase();
  if (/chaos|death guard|thousand sons|world eaters|emperor'?s children|daemon|khorne|nurgle|tzeentch|slaanesh|chaos knights/.test(f))
    return FACTION_CRESTS.BLACK_HORN;
  if (/mechanicus|imperial knight|knight|votann|skitarii|cult mechanicus/.test(f))
    return FACTION_CRESTS.COG_ASCENDANT;
  if (/aeldari|eldar|harlequin|drukhari|ynnari|craftworld/.test(f))
    return FACTION_CRESTS.WHISPER_HOST;
  if (/tyranid|genestealer|necron|ork|t'?au|tau|leagues of votann/.test(f))
    return FACTION_CRESTS.ORDER_VIGIL;
  if (f.trim() === '')
    return ({ size = 60, color = 'currentColor' }: SizeColor) => <SigilReticle size={size} color={color} />;
  // Imperium / Space Marines / Astra Militarum / Custodes / Sisters / default
  return FACTION_CRESTS.IRON_LEGION;
}
