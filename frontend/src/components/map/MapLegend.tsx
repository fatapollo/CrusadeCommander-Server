import type { CrusadeForce, NodeType } from '../../types';
import { crestFor } from '../sigils';
import { NODE_TYPE } from './utils';

export interface MapLegendProps {
  forces: CrusadeForce[];
}

// Right-rail legend: forces (crest + colour), states, and node-type glyphs.
// Pure presentation — caller filters to forces that actually appear on the
// map if it wants a tight legend.
export function MapLegend({ forces }: MapLegendProps) {
  return (
    <div className="bg-bunk-surface border border-bunk-line">
      <div className="px-3 py-2 border-b border-dashed border-bunk-line font-mono text-[9px] tracking-mono-lg text-bunk-rust">
        // LEGEND
      </div>

      <Section title="Forces">
        <div className="grid gap-1.5">
          {forces.map(f => {
            const Crest = crestFor(f.faction);
            return (
              <Row
                key={f.id}
                color={f.color_hex}
                glyph={<Crest size={16} color={f.color_hex} />}
                label={f.name}
              />
            );
          })}
          <Row color="#5c5346" label="Neutral" />
        </div>
      </Section>

      <Section title="States">
        <div className="grid gap-1.5">
          <Row
            color="#f4c14b" dashed
            label="Contested"
            note="Hazard ring · current phase"
          />
          <Row
            color="#f4c14b" dashedRing
            label="Objective"
            note="Reticle ring"
          />
        </div>
      </Section>

      <Section title="Node Types">
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
          {(Object.keys(NODE_TYPE) as NodeType[]).map(t => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-5 h-5 bg-bunk-ink border border-bunk-line flex items-center justify-center font-mono text-[10px] text-bunk-boneDim">
                {NODE_TYPE[t].glyph}
              </span>
              <span className="font-mono text-[10px] tracking-mono-sm text-bunk-bone uppercase">
                {NODE_TYPE[t].label}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-3 border-b border-bunk-line last:border-b-0">
      <div className="font-mono text-[9px] tracking-mono-lg text-bunk-boneDim mb-2 uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  color, label, note, glyph, dashed, dashedRing,
}: {
  color: string; label: string; note?: string;
  glyph?: React.ReactNode; dashed?: boolean; dashedRing?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-5 h-5 flex items-center justify-center flex-shrink-0"
        style={{
          background: '#06040a',
          border: dashed ? `2px dashed ${color}` : '1px solid #2e251e',
          borderRadius: dashedRing ? 999 : 0,
          borderStyle: dashedRing ? 'dashed' : undefined,
          borderColor: dashedRing ? color : undefined,
          borderLeftWidth: dashed || dashedRing ? undefined : 4,
          borderLeftColor: dashed || dashedRing ? undefined : color,
          borderLeftStyle: 'solid',
        }}
      >
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] tracking-mono-sm text-bunk-bone uppercase truncate">{label}</div>
        {note && <div className="font-mono text-[9px] text-bunk-boneMute uppercase truncate">{note}</div>}
      </div>
    </div>
  );
}
