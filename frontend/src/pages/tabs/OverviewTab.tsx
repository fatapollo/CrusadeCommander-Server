import { Card, Badge } from '../../components/ui';
import type { Battle, Campaign, CrusadeForce } from '../../types';

export default function OverviewTab({ campaign, forces, battles }: {
  campaign: Campaign; forces: CrusadeForce[]; battles: Battle[];
}) {
  const sorted = [...forces].sort((a, b) => b.victories - a.victories || b.battle_tally - a.battle_tally);
  const recent = [...battles].slice(0, 5);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="p-5 md:col-span-2">
        <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">Standings</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-ink-fade">No crusade forces yet.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3 py-2">
                <span className={`w-6 text-center text-sm font-bold ${
                  i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-ink-fade'
                }`}>{i + 1}</span>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color_hex }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2 flex-wrap">
                    <span>{f.name}</span>
                    {f.team && <Badge color="accent">{f.team}</Badge>}
                  </div>
                  <div className="text-xs text-ink-fade truncate">{f.faction || 'Unknown'}{f.player_name && ` · ${f.player_name}`}</div>
                </div>
                <div className="text-right">
                  <div className="text-success font-bold tabular-nums">{f.victories} W</div>
                  <div className="text-xs text-ink-fade tabular-nums">{f.battle_tally} battle{f.battle_tally === 1 ? '' : 's'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">Campaign</h2>
        <div className="space-y-2 text-sm">
          <Row label="Phase" value={`${campaign.phase_label} ${campaign.current_phase}`} />
          <Row label="Battle Size" value={campaign.default_battle_size} />
          <Row label="Battles" value={battles.length.toString()} />
          <Row label="Forces" value={forces.length.toString()} />
        </div>
      </Card>

      {recent.length > 0 && (
        <Card className="p-5 md:col-span-3">
          <h2 className="text-xs font-semibold tracking-wider text-ink-fade uppercase mb-3">Recent Battles</h2>
          <div className="space-y-2">
            {recent.map(b => {
              const att = forces.find(f => f.id === b.attacker_force_id);
              const def = forces.find(f => f.id === b.defender_force_id);
              const winnerId = b.outcome === 'Attacker Wins' ? b.attacker_force_id : b.outcome === 'Defender Wins' ? b.defender_force_id : null;
              return (
                <div key={b.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className="text-xs text-ink-fade w-20">{new Date(b.occurred_at).toLocaleDateString()}</span>
                  <Badge color="dim">{b.battle_size}</Badge>
                  <span className={`flex-1 text-sm ${winnerId === b.attacker_force_id ? 'font-semibold' : ''}`}>{att?.name ?? '?'}</span>
                  <span className="text-ink-fade text-xs">vs</span>
                  <span className={`flex-1 text-sm text-right ${winnerId === b.defender_force_id ? 'font-semibold' : ''}`}>{def?.name ?? '?'}</span>
                  <Badge color={b.outcome === 'Draw' ? 'dim' : 'success'}>{b.outcome}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-ink-fade">{label}</span><span className="font-medium">{value}</span></div>;
}
