// Parser for NewRecruit (newrecruit.eu) plain-text army list exports.
//
// Recognised structure:
//   + Faction: Necrons +
//   + Detachment: Awakened Dynasty +
//   + Total Cost: 1995 pts +
//
//   + CHARACTERS +
//   Imotekh the Stormlord [185 pts]: Warlord, Hyperphase blade
//   . Enhancement: Solar Inscriptions [+25 pts]
//
//   + BATTLELINE +
//   Necron Warriors [125 pts]: 10x Warrior w/ gauss reaper
//   . 10x Necron Warrior w/ flayer
//
// Lines starting with "+" are headers (faction / detachment / section).
// Lines starting with "." or "•" are sub-bullets attached to the previous unit.
// Unit lines match `Name [N pts]` with optional ":equipment after".
//
// The parser is intentionally forgiving — NewRecruit's format drifts slightly
// between versions and game systems.

export interface ParsedUnit {
  name: string;
  datasheet: string;
  points_cost: number;
  equipment: string;
  is_character: boolean;
  is_epic_hero: boolean;
  is_titanic: boolean;
  notes: string;
}

export interface ParsedRoster {
  faction: string | null;
  detachment: string | null;
  total_points: number | null;
  units: ParsedUnit[];
}

const UNIT_LINE = /^(.+?)\s*\[(\d+)\s*(?:pts?|points?)\](?::\s*(.*))?$/i;

export function parseNewRecruitText(input: string): ParsedRoster {
  const lines = input.split(/\r?\n/);
  let faction: string | null = null;
  let detachment: string | null = null;
  let totalPoints: number | null = null;
  let currentSection = '';
  const units: ParsedUnit[] = [];
  let pending: ParsedUnit | null = null;
  const buf: string[] = [];

  const flush = () => {
    if (pending) {
      pending.equipment = buf
        .map(s => s.trim())
        .filter(Boolean)
        .join('; ');
      units.push(pending);
    }
    pending = null;
    buf.length = 0;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // ── Header rows (faction, detachment, section, total) ─────────────
    if (line.startsWith('+')) {
      flush();
      const inner = line.replace(/^\++/, '').replace(/\++$/, '').trim();

      const factionMatch = inner.match(/^Faction:\s*(.+)$/i);
      if (factionMatch) { faction = factionMatch[1]!.trim(); continue; }

      const detachmentMatch = inner.match(/^Detachment:\s*(.+)$/i);
      if (detachmentMatch) { detachment = detachmentMatch[1]!.trim(); continue; }

      const totalMatch = inner.match(/^Total\s*(?:Cost|Points)?:\s*(\d+)/i);
      if (totalMatch) { totalPoints = parseInt(totalMatch[1]!, 10); continue; }

      // Section heading (e.g. CHARACTERS, BATTLELINE, EPIC HEROES, INFANTRY)
      currentSection = inner.toUpperCase();
      continue;
    }

    // ── Sub-bullet (equipment / enhancement for the current unit) ─────
    if (line.startsWith('.') || line.startsWith('•') || line.startsWith('-')) {
      const sub = line.replace(/^[•\-\.]+\s*/, '').trim();
      if (pending && sub) {
        buf.push(sub);
        // "+N pts" in a sub-bullet (enhancements/upgrades) — fold into parent cost
        const plusMatch = sub.match(/\[\+(\d+)\s*(?:pts?|points?)\]/i);
        if (plusMatch) pending.points_cost += parseInt(plusMatch[1]!, 10);
      }
      continue;
    }

    // ── Unit line ─────────────────────────────────────────────────────
    const m = line.match(UNIT_LINE);
    if (m) {
      flush();
      const name = m[1]!.trim();
      const points = parseInt(m[2]!, 10);
      const tail = (m[3] ?? '').trim();

      const section = currentSection;
      const isCharacter =
        section.includes('CHARACTER') || section.includes('EPIC HERO') ||
        section.includes('WARLORD');
      const isEpicHero = section.includes('EPIC HERO');
      const isTitanic = section.includes('TITANIC') || section.includes('MONSTER');

      pending = {
        name,
        datasheet: name,
        points_cost: points,
        equipment: '',
        is_character: isCharacter,
        is_epic_hero: isEpicHero,
        is_titanic: isTitanic,
        notes: '',
      };
      if (tail) buf.push(tail);
      continue;
    }
    // Loose continuation line — append to the current unit's buffer
    if (pending) buf.push(line);
  }
  flush();

  return { faction, detachment, total_points: totalPoints, units };
}
