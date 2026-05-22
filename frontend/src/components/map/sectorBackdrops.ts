import type { CSSProperties } from 'react';

// Procedural SVG-based backdrops for the sector plane. Each backdrop is
// rendered entirely from inline SVG (turbulence + gradients) — no raster
// assets to ship. The catalogue id is persisted on `sector_map.backdrop`
// so players see the same backdrop the admin chose in the builder.

export interface SectorBackdrop {
  id: string;
  label: string;
  /** Short flavour text shown beside the dropdown choice. */
  flavour: string;
  /** Style applied to the canvas div (background layers, base color). */
  canvas: CSSProperties;
}

// Builds a tiling SVG noise filter. `freq` controls grain size — higher
// is finer. `seed` lets us shuffle textures without changing parameters.
function noise(freq: number, seed: number, opacity: number, hex: string): string {
  const [r, g, b] = hexToRgb01(hex);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'>` +
    `<filter id='n'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='4' seed='${seed}'/>` +
    `<feColorMatrix values='0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${opacity} 0'/>` +
    `</filter>` +
    `<rect width='100%' height='100%' filter='url(%23n)'/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// Scattered points — used for the Star Field backdrop. The SVG itself is
// just a few translated circles; the tile keeps it small.
function stars(seed: number, count = 14): string {
  const rand = mulberry32(seed);
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * 240);
    const y = Math.round(rand() * 240);
    const r = (rand() * 0.9 + 0.4).toFixed(2);
    const a = (rand() * 0.6 + 0.2).toFixed(2);
    dots.push(`<circle cx='${x}' cy='${y}' r='${r}' fill='%23ffe6c8' fill-opacity='${a}'/>`);
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'>${dots.join('')}</svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

// Sector-grid lines as an SVG (used for the default backdrop so we can
// stack it with the same layering as the textured ones).
function gridLines(): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'>` +
    `<path d='M0 0 H240 M0 0 V240' stroke='%23e2683c' stroke-opacity='0.12' stroke-width='1'/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

export const SECTOR_BACKDROPS: SectorBackdrop[] = [
  {
    id: 'grid',
    label: 'Sector Grid',
    flavour: 'plain tactical plane',
    canvas: {
      backgroundColor: '#0a0708',
      backgroundImage: `${gridLines()}`,
      backgroundSize: '10% 10%',
    },
  },
  {
    id: 'ash',
    label: 'Ash Waste',
    flavour: 'dust-choked promethium plains',
    canvas: {
      backgroundColor: '#1c130b',
      backgroundImage:
        `radial-gradient(ellipse at 25% 30%, rgba(226,160,90,0.18), transparent 55%),` +
        `radial-gradient(ellipse at 80% 75%, rgba(120,60,30,0.22), transparent 60%),` +
        `${noise(0.9, 2, 0.4, '#d48a4a')}`,
      backgroundSize: 'cover, cover, 280px 280px',
    },
  },
  {
    id: 'hive',
    label: 'Hive World',
    flavour: 'sprawling habitation grid',
    canvas: {
      backgroundColor: '#0c0a10',
      backgroundImage:
        `radial-gradient(ellipse at 50% 50%, rgba(244,193,75,0.10), transparent 60%),` +
        `${noise(1.6, 5, 0.5, '#f4c14b')},` +
        `linear-gradient(rgba(244,193,75,0.06) 1px, transparent 1px),` +
        `linear-gradient(90deg, rgba(244,193,75,0.06) 1px, transparent 1px)`,
      backgroundSize: 'cover, 220px 220px, 36px 36px, 36px 36px',
    },
  },
  {
    id: 'forge',
    label: 'Forge World',
    flavour: 'smelter-vein industrial husk',
    canvas: {
      backgroundColor: '#170808',
      backgroundImage:
        `radial-gradient(ellipse at 35% 70%, rgba(226,68,40,0.32), transparent 55%),` +
        `radial-gradient(ellipse at 75% 25%, rgba(255,140,60,0.16), transparent 60%),` +
        `${noise(0.42, 9, 0.55, '#e24428')}`,
      backgroundSize: 'cover, cover, 360px 360px',
    },
  },
  {
    id: 'ice',
    label: 'Ice World',
    flavour: 'glacier-cracked tundra',
    canvas: {
      backgroundColor: '#0a1216',
      backgroundImage:
        `radial-gradient(ellipse at 30% 30%, rgba(160,210,235,0.18), transparent 60%),` +
        `radial-gradient(ellipse at 70% 80%, rgba(80,130,170,0.18), transparent 65%),` +
        `${noise(0.7, 13, 0.42, '#bcd9ea')}`,
      backgroundSize: 'cover, cover, 300px 300px',
    },
  },
  {
    id: 'death',
    label: 'Death World',
    flavour: 'overgrown jungle hellscape',
    canvas: {
      backgroundColor: '#0a1208',
      backgroundImage:
        `radial-gradient(ellipse at 40% 60%, rgba(80,140,60,0.30), transparent 60%),` +
        `radial-gradient(ellipse at 80% 20%, rgba(40,80,30,0.22), transparent 60%),` +
        `${noise(0.55, 17, 0.55, '#6fa84a')}`,
      backgroundSize: 'cover, cover, 320px 320px',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean World',
    flavour: 'archipelagic blue immensity',
    canvas: {
      backgroundColor: '#070d18',
      backgroundImage:
        `radial-gradient(ellipse at 50% 40%, rgba(70,130,200,0.30), transparent 60%),` +
        `radial-gradient(ellipse at 20% 80%, rgba(30,60,110,0.22), transparent 60%),` +
        `${noise(0.6, 21, 0.40, '#5a98d4')}`,
      backgroundSize: 'cover, cover, 320px 320px',
    },
  },
  {
    id: 'warp',
    label: 'Warp Storm',
    flavour: 'unreality bleeding through',
    canvas: {
      backgroundColor: '#0e0612',
      backgroundImage:
        `radial-gradient(ellipse at 40% 50%, rgba(180,80,220,0.28), transparent 60%),` +
        `radial-gradient(ellipse at 80% 30%, rgba(220,80,140,0.18), transparent 60%),` +
        `${noise(0.5, 25, 0.55, '#c060d4')}`,
      backgroundSize: 'cover, cover, 320px 320px',
    },
  },
  {
    id: 'dead',
    label: 'Dead World',
    flavour: 'bone-grey crater fields',
    canvas: {
      backgroundColor: '#10100e',
      backgroundImage:
        `radial-gradient(ellipse at 50% 50%, rgba(180,170,150,0.14), transparent 65%),` +
        `${noise(0.45, 29, 0.55, '#b6ad94')}`,
      backgroundSize: 'cover, 340px 340px',
    },
  },
  {
    id: 'stars',
    label: 'Star Field',
    flavour: 'deep-void approach vector',
    canvas: {
      backgroundColor: '#050308',
      backgroundImage:
        `${stars(33)},` +
        `radial-gradient(ellipse at 60% 50%, rgba(120,90,160,0.10), transparent 60%)`,
      backgroundSize: '240px 240px, cover',
    },
  },
];

export const DEFAULT_BACKDROP_ID = 'grid';

export function backdropById(id: string | undefined): SectorBackdrop {
  return SECTOR_BACKDROPS.find(b => b.id === id) ?? SECTOR_BACKDROPS[0];
}

// helpers ────────────────────────────────────────────────────────────────────

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16);
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
}

// Deterministic 32-bit PRNG so the Star Field looks the same every render.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
