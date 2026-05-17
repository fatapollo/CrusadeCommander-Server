import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx, pool } from '../db/pool.js';
import { asyncHandler, BadRequest, NotFound, Conflict } from '../middleware/errors.js';
import { requireAuth, loadCampaign, requireForceAccess, requireUnitAccess } from '../middleware/auth.js';
import type { Unit, BattleHonour, BattleScar } from '../types.js';
import { maxBattleHonours, ranksGained, BATTLE_SCARS } from '../types.js';
import { parseNewRecruitText } from '../services/newrecruit.js';
import type { PoolClient } from 'pg';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadCampaign);

/**
 * How many *unspent* Battle Honours a unit may still claim from earned
 * progression. Each rank-up grants one; a unit Marked for Greatness that
 * survives also earns one. Enhancements are bought via Renowned Heroes
 * (Requisition) so they don't consume rank-earned slots — but everything
 * still respects the absolute maxBattleHonours cap.
 */
async function honourAvailable(client: Pick<PoolClient, 'query'>, unit: Unit): Promise<number> {
  const heldQ = client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM battle_honours
     WHERE unit_id = $1 AND category <> 'Enhancement'`,
    [unit.id],
  );
  const totalQ = client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM battle_honours WHERE unit_id = $1`,
    [unit.id],
  );
  const markedQ = client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM unit_battle_records
     WHERE unit_id = $1 AND marked_for_greatness = true AND was_destroyed = false`,
    [unit.id],
  );
  const [held, total, marked] = await Promise.all([heldQ, totalQ, markedQ]);
  const heldN = Number(held.rows[0]?.count ?? 0);
  const totalN = Number(total.rows[0]?.count ?? 0);
  const markedN = Number(marked.rows[0]?.count ?? 0);
  const earned = ranksGained(unit.xp, unit.is_character, unit.can_exceed_30_xp) + markedN;
  const capRemaining = maxBattleHonours(unit.is_character, unit.can_exceed_30_xp) - totalN;
  return Math.max(0, Math.min(earned - heldN, capRemaining));
}

/* ---------------- Units ---------------- */

router.get('/forces/:forceId/units', asyncHandler(async (req, res) => {
  const units = await query<Unit>(
    `SELECT u.* FROM units u
     JOIN crusade_forces f ON f.id = u.force_id
     WHERE u.force_id = $1 AND f.campaign_id = $2
     ORDER BY u.is_active DESC, u.xp DESC, u.name ASC`,
    [req.params.forceId, res.locals.campaignId],
  );
  const withAvail = await Promise.all(
    units.map(async (u) => ({ ...u, honour_available: await honourAvailable(pool, u) })),
  );
  res.json({ units: withAvail });
}));

router.get('/units/:unitId', asyncHandler(async (req, res) => {
  const unit = await one<Unit>(
    `SELECT u.* FROM units u
     JOIN crusade_forces f ON f.id = u.force_id
     WHERE u.id = $1 AND f.campaign_id = $2`,
    [req.params.unitId, res.locals.campaignId],
  );
  if (!unit) throw new NotFound();
  const honours = await query<BattleHonour>('SELECT * FROM battle_honours WHERE unit_id = $1 ORDER BY earned_at ASC', [unit.id]);
  const scars = await query<BattleScar>('SELECT * FROM battle_scars WHERE unit_id = $1 ORDER BY earned_at ASC', [unit.id]);
  const honour_available = await honourAvailable(pool, unit);
  res.json({ unit, honours, scars, honour_available });
}));

const createUnitSchema = z.object({
  name: z.string().min(1).max(120),
  datasheet: z.string().max(120).optional().default(''),
  points_cost: z.number().int().min(0).max(2000).optional().default(0),
  equipment: z.string().max(4000).optional().default(''),
  is_character: z.boolean().optional().default(false),
  is_titanic: z.boolean().optional().default(false),
  is_epic_hero: z.boolean().optional().default(false),
  is_fortification: z.boolean().optional().default(false),
  is_swarm: z.boolean().optional().default(false),
  notes: z.string().max(4000).optional().default(''),
  unit_type: z.string().max(40).optional().default(''),
  status: z.enum(['Active', 'Reserve', 'Injured']).optional().default('Active'),
});

router.post('/forces/:forceId/units', requireForceAccess, asyncHandler(async (req, res) => {
  const parsed = createUnitSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  // Enforce force belongs to this campaign + supply limit
  const force = await one<{ id: string; supply_limit: number }>(
    'SELECT id, supply_limit FROM crusade_forces WHERE id = $1 AND campaign_id = $2',
    [req.params.forceId, res.locals.campaignId],
  );
  if (!force) throw new NotFound('Crusade force not found');
  // Check supply used
  const supplyUsed = await one<{ used: string }>('SELECT COALESCE(SUM(points_cost), 0)::text AS used FROM units WHERE force_id = $1 AND is_active = true', [force.id]);
  const used = Number(supplyUsed?.used ?? 0);
  if (used + parsed.data.points_cost > force.supply_limit) {
    throw new Conflict(`Adding this unit (${parsed.data.points_cost} pts) would exceed Supply Limit (${force.supply_limit}). Current use: ${used}.`);
  }
  const d = parsed.data;
  const unit = await one<Unit>(
    `INSERT INTO units (force_id, name, datasheet, points_cost, equipment, is_character, is_titanic, is_epic_hero, is_fortification, is_swarm, notes, unit_type, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [force.id, d.name, d.datasheet, d.points_cost, d.equipment, d.is_character, d.is_titanic, d.is_epic_hero, d.is_fortification, d.is_swarm, d.notes, d.unit_type, d.status],
  );
  res.status(201).json({ unit });
}));

/**
 * Bulk import units from an external list builder (e.g. NewRecruit text export).
 * dry_run=true parses and returns the preview without writing to the DB.
 */
const importSchema = z.object({
  format: z.enum(['newrecruit_text']),
  text: z.string().min(1).max(50_000),
  dry_run: z.boolean().optional().default(false),
});

router.post('/forces/:forceId/units/import', requireForceAccess, asyncHandler(async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const { format, text, dry_run } = parsed.data;

  const roster = format === 'newrecruit_text'
    ? parseNewRecruitText(text)
    : { faction: null, detachment: null, total_points: null, units: [] };

  if (roster.units.length === 0) {
    throw new BadRequest('No units detected — paste the full plain-text export from NewRecruit.');
  }

  let created: Unit[] | null = null;
  if (!dry_run) {
    created = [];
    await tx(async (client) => {
      for (const u of roster.units) {
        const { rows } = await client.query<Unit>(
          `INSERT INTO units (force_id, name, datasheet, points_cost, equipment, is_character, is_titanic, is_epic_hero)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [req.params.forceId, u.name, u.datasheet, u.points_cost, u.equipment, u.is_character, u.is_titanic, u.is_epic_hero],
        );
        if (rows[0]) created!.push(rows[0]);
      }
    });
  }

  res.json({ parsed: roster, created });
}));

const updateUnitSchema = createUnitSchema.partial().extend({
  xp: z.number().int().min(0).optional(),
  units_destroyed: z.number().int().min(0).optional(),
  battles_played: z.number().int().min(0).optional(),
  battles_survived: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  can_exceed_30_xp: z.boolean().optional(),
});

router.patch('/units/:unitId', requireUnitAccess, asyncHandler(async (req, res) => {
  const parsed = updateUnitSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const fields = parsed.data;
  const setClauses: string[] = []; const values: any[] = []; let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    setClauses.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (setClauses.length === 0) {
    const u = await one<Unit>('SELECT * FROM units WHERE id = $1', [req.params.unitId]);
    if (!u) throw new NotFound();
    res.json({ unit: u }); return;
  }
  values.push(req.params.unitId, res.locals.campaignId);
  const updated = await one<Unit>(
    `UPDATE units SET ${setClauses.join(', ')}
     FROM crusade_forces f
     WHERE units.id = $${i} AND f.id = units.force_id AND f.campaign_id = $${i+1}
     RETURNING units.*`,
    values,
  );
  if (!updated) throw new NotFound();
  res.json({ unit: updated });
}));

router.delete('/units/:unitId', requireUnitAccess, asyncHandler(async (req, res) => {
  const r = await one(
    `DELETE FROM units USING crusade_forces f
     WHERE units.id = $1 AND f.id = units.force_id AND f.campaign_id = $2 RETURNING units.id`,
    [req.params.unitId, res.locals.campaignId],
  );
  if (!r) throw new NotFound();
  res.status(204).end();
}));

/* ---------------- Battle Honours ---------------- */

const honourSchema = z.object({
  category: z.enum(['Battle Trait', 'Weapon Modification', 'Crusade Relic', 'Enhancement']),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(''),
  weapon_name: z.string().max(120).optional().default(''),
  relic_category: z.enum(['Artificer', 'Antiquity', 'Legendary']).nullable().optional(),
});

router.post('/units/:unitId/honours', requireUnitAccess, asyncHandler(async (req, res) => {
  const parsed = honourSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const d = parsed.data;

  const honour = await tx(async (client) => {
    const { rows: uRows } = await client.query<Unit>(
      `SELECT u.* FROM units u
       JOIN crusade_forces f ON f.id = u.force_id
       WHERE u.id = $1 AND f.campaign_id = $2`,
      [req.params.unitId, res.locals.campaignId],
    );
    const unit = uRows[0];
    if (!unit) throw new NotFound('Unit not found');

    const { rows: countRows } = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM battle_honours WHERE unit_id = $1',
      [unit.id],
    );
    const have = Number(countRows[0]?.count ?? 0);
    const max = maxBattleHonours(unit.is_character, unit.can_exceed_30_xp);
    if (have >= max) throw new Conflict(`Unit already has the maximum ${max} Battle Honours.`);

    // Rank-up gate: a Battle Honour is earned by ranking up (or surviving a
    // battle Marked for Greatness). Enhancements are bought via the Renowned
    // Heroes Requisition, so they bypass this gate.
    if (d.category !== 'Enhancement') {
      const avail = await honourAvailable(client, unit);
      if (avail <= 0) {
        throw new Conflict(
          'No Battle Honour available — this unit must rank up (gain XP) or be Marked for Greatness and survive a battle before it can take another Battle Honour.',
        );
      }
    }

    // Compute crusade points value
    let cpValue = 1;
    if (d.category === 'Crusade Relic') {
      cpValue = d.relic_category === 'Legendary' ? 3 : d.relic_category === 'Antiquity' ? 2 : 1;
    } else if (unit.is_titanic) {
      cpValue = 2;
    }

    const { rows } = await client.query<BattleHonour>(
      `INSERT INTO battle_honours (unit_id, category, name, description, weapon_name, relic_category, crusade_points_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [unit.id, d.category, d.name, d.description, d.weapon_name, d.relic_category ?? null, cpValue],
    );
    // Bump unit's crusade_points
    await client.query('UPDATE units SET crusade_points = crusade_points + $1 WHERE id = $2', [cpValue, unit.id]);
    return rows[0]!;
  });

  res.status(201).json({ honour });
}));

router.delete('/units/:unitId/honours/:honourId', requireUnitAccess, asyncHandler(async (req, res) => {
  await tx(async (client) => {
    const { rows } = await client.query<BattleHonour>(
      `DELETE FROM battle_honours bh
       USING units u, crusade_forces f
       WHERE bh.id = $1 AND bh.unit_id = $2 AND u.id = bh.unit_id AND f.id = u.force_id AND f.campaign_id = $3
       RETURNING bh.*`,
      [req.params.honourId, req.params.unitId, res.locals.campaignId],
    );
    if (rows.length === 0) throw new NotFound();
    await client.query('UPDATE units SET crusade_points = crusade_points - $1 WHERE id = $2', [rows[0]!.crusade_points_value, req.params.unitId]);
  });
  res.status(204).end();
}));

/* ---------------- Battle Scars ---------------- */

const scarSchema = z.object({
  name: z.enum(['Crippling Damage', 'Battle-weary', 'Fatigued', 'Disgraced', 'Mark of Shame', 'Deep Scars']),
  description: z.string().max(500).optional().default(''),
});

router.post('/units/:unitId/scars', requireUnitAccess, asyncHandler(async (req, res) => {
  const parsed = scarSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');

  const scar = await tx(async (client) => {
    const { rows: uRows } = await client.query<Unit>(
      `SELECT u.* FROM units u
       JOIN crusade_forces f ON f.id = u.force_id
       WHERE u.id = $1 AND f.campaign_id = $2`,
      [req.params.unitId, res.locals.campaignId],
    );
    const unit = uRows[0];
    if (!unit) throw new NotFound('Unit not found');

    const { rows: countRows } = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM battle_scars WHERE unit_id = $1',
      [unit.id],
    );
    if (Number(countRows[0]?.count ?? 0) >= 3) {
      throw new Conflict('Unit already has the maximum 3 Battle Scars. A failed Out of Action test would now force a Devastating Blow.');
    }

    // Check duplicate
    const { rows: dupRows } = await client.query<BattleScar>('SELECT id FROM battle_scars WHERE unit_id = $1 AND name = $2', [unit.id, parsed.data.name]);
    if (dupRows.length > 0) throw new Conflict(`Unit already has the ${parsed.data.name} scar.`);

    const { rows } = await client.query<BattleScar>(
      `INSERT INTO battle_scars (unit_id, name, description) VALUES ($1,$2,$3) RETURNING *`,
      [unit.id, parsed.data.name, parsed.data.description],
    );
    await client.query('UPDATE units SET crusade_points = crusade_points - 1 WHERE id = $1', [unit.id]);
    return rows[0]!;
  });

  res.status(201).json({ scar });
}));

router.delete('/units/:unitId/scars/:scarId', requireUnitAccess, asyncHandler(async (req, res) => {
  await tx(async (client) => {
    const { rows } = await client.query<BattleScar>(
      `DELETE FROM battle_scars bs
       USING units u, crusade_forces f
       WHERE bs.id = $1 AND bs.unit_id = $2 AND u.id = bs.unit_id AND f.id = u.force_id AND f.campaign_id = $3
       RETURNING bs.*`,
      [req.params.scarId, req.params.unitId, res.locals.campaignId],
    );
    if (rows.length === 0) throw new NotFound();
    await client.query('UPDATE units SET crusade_points = crusade_points + 1 WHERE id = $1', [req.params.unitId]);
  });
  res.status(204).end();
}));

export default router;
