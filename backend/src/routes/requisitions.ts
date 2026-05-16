import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../db/pool.js';
import { asyncHandler, BadRequest, Conflict, NotFound } from '../middleware/errors.js';
import { requireAuth, loadCampaign, requireForceAccess } from '../middleware/auth.js';
import type { CrusadeForce, RequisitionLogEntry, Unit } from '../types.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadCampaign);

/**
 * Standard Requisitions from the Crusade core rules:
 *  - Increase Supply Limit: 1 RP, +200 supply
 *  - Renowned Heroes: 1-3 RP (1 + 1 per existing Enhancement, max 3)
 *  - Legendary Veterans: 3 RP (non-Character at 30 XP → can exceed)
 *  - Rearm and Resupply: 1 RP (change wargear)
 *  - Repair and Recuperate: 1-5 RP (remove a scar; 1 + battle_honours, max 5)
 *  - Fresh Recruits: 1-4 RP (add models; 1 + ceil(battle_honours/2), max 4)
 */

router.get('/:forceId/log', asyncHandler(async (req, res) => {
  const rows = await query<RequisitionLogEntry>(
    `SELECT rl.* FROM requisition_log rl
     JOIN crusade_forces f ON f.id = rl.force_id
     WHERE rl.force_id = $1 AND f.campaign_id = $2
     ORDER BY rl.used_at DESC`,
    [req.params.forceId, res.locals.campaignId],
  );
  res.json({ log: rows });
}));

async function loadForce(client: import('pg').PoolClient, forceId: string, campaignId: string): Promise<CrusadeForce> {
  const { rows } = await client.query<CrusadeForce>(
    'SELECT * FROM crusade_forces WHERE id = $1 AND campaign_id = $2',
    [forceId, campaignId],
  );
  if (rows.length === 0) throw new NotFound('Force not found');
  return rows[0]!;
}

function ensureAfford(force: CrusadeForce, cost: number) {
  if (force.requisition_points < cost) {
    throw new Conflict(`Not enough RP: have ${force.requisition_points}, need ${cost}.`);
  }
}

async function spend(client: import('pg').PoolClient, force: CrusadeForce, requisitionName: string, cost: number, targetUnitId: string | null, notes: string) {
  await client.query('UPDATE crusade_forces SET requisition_points = requisition_points - $1 WHERE id = $2', [cost, force.id]);
  const { rows } = await client.query<RequisitionLogEntry>(
    `INSERT INTO requisition_log (force_id, requisition_name, cost_paid, target_unit_id, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [force.id, requisitionName, cost, targetUnitId, notes],
  );
  return rows[0]!;
}

/* ---- Increase Supply Limit ---- */
router.post('/:forceId/increase-supply-limit', requireForceAccess, asyncHandler(async (req, res) => {
  const result = await tx(async (client) => {
    const force = await loadForce(client, req.params.forceId, res.locals.campaignId);
    ensureAfford(force, 1);
    const entry = await spend(client, force, 'Increase Supply Limit', 1, null, '+200 pts Supply Limit');
    const { rows } = await client.query<CrusadeForce>(
      'UPDATE crusade_forces SET supply_limit = supply_limit + 200 WHERE id = $1 RETURNING *',
      [force.id],
    );
    return { force: rows[0]!, log: entry };
  });
  res.status(201).json(result);
}));

/* ---- Renowned Heroes (Add Enhancement) ----
 * Cost = 1 + 1 per existing Enhancement honour across the whole force, max 3.
 */
router.post('/:forceId/renowned-heroes', requireForceAccess, asyncHandler(async (req, res) => {
  const schema = z.object({
    unit_id: z.string().uuid(),
    enhancement_name: z.string().min(1).max(120),
    description: z.string().max(2000).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');

  const result = await tx(async (client) => {
    const force = await loadForce(client, req.params.forceId, res.locals.campaignId);
    const { rows: unitRows } = await client.query<Unit>('SELECT * FROM units WHERE id = $1 AND force_id = $2', [parsed.data.unit_id, force.id]);
    const unit = unitRows[0];
    if (!unit) throw new NotFound('Unit not in this force');
    if (!unit.is_character) throw new BadRequest('Only Character units may receive an Enhancement.');
    const { rows: alreadyRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM battle_honours bh
       JOIN units u ON u.id = bh.unit_id
       WHERE u.force_id = $1 AND bh.category = 'Enhancement' AND bh.unit_id = $2`,
      [force.id, unit.id],
    );
    if (Number(alreadyRows[0]?.count ?? 0) > 0) throw new Conflict('Unit already has an Enhancement.');

    const { rows: forceCountRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM battle_honours bh
       JOIN units u ON u.id = bh.unit_id
       WHERE u.force_id = $1 AND bh.category = 'Enhancement'`,
      [force.id],
    );
    const cost = Math.min(3, 1 + Number(forceCountRows[0]?.count ?? 0));
    ensureAfford(force, cost);

    const entry = await spend(client, force, 'Renowned Heroes', cost, unit.id, parsed.data.enhancement_name);
    await client.query(
      `INSERT INTO battle_honours (unit_id, category, name, description, crusade_points_value)
       VALUES ($1, 'Enhancement', $2, $3, $4)`,
      [unit.id, parsed.data.enhancement_name, parsed.data.description, unit.is_titanic ? 2 : 1],
    );
    await client.query('UPDATE units SET crusade_points = crusade_points + $1 WHERE id = $2', [unit.is_titanic ? 2 : 1, unit.id]);

    const { rows } = await client.query<CrusadeForce>('SELECT * FROM crusade_forces WHERE id = $1', [force.id]);
    return { force: rows[0]!, log: entry };
  });
  res.status(201).json(result);
}));

/* ---- Legendary Veterans ---- */
router.post('/:forceId/legendary-veterans', requireForceAccess, asyncHandler(async (req, res) => {
  const schema = z.object({ unit_id: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest('unit_id required');

  const result = await tx(async (client) => {
    const force = await loadForce(client, req.params.forceId, res.locals.campaignId);
    ensureAfford(force, 3);
    const { rows: uRows } = await client.query<Unit>('SELECT * FROM units WHERE id = $1 AND force_id = $2', [parsed.data.unit_id, force.id]);
    const unit = uRows[0];
    if (!unit) throw new NotFound('Unit not in force');
    if (unit.is_character) throw new BadRequest('Legendary Veterans applies only to non-Character units.');
    if (unit.xp < 30) throw new BadRequest('Unit must have reached 30 XP.');
    const entry = await spend(client, force, 'Legendary Veterans', 3, unit.id, '');
    await client.query('UPDATE units SET can_exceed_30_xp = true WHERE id = $1', [unit.id]);
    const { rows } = await client.query<CrusadeForce>('SELECT * FROM crusade_forces WHERE id = $1', [force.id]);
    return { force: rows[0]!, log: entry };
  });
  res.status(201).json(result);
}));

/* ---- Rearm and Resupply ---- */
router.post('/:forceId/rearm-and-resupply', requireForceAccess, asyncHandler(async (req, res) => {
  const schema = z.object({
    unit_id: z.string().uuid(),
    new_equipment: z.string().max(4000),
    new_points_cost: z.number().int().min(0).max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');

  const result = await tx(async (client) => {
    const force = await loadForce(client, req.params.forceId, res.locals.campaignId);
    ensureAfford(force, 1);
    const { rows: uRows } = await client.query<Unit>('SELECT * FROM units WHERE id = $1 AND force_id = $2', [parsed.data.unit_id, force.id]);
    const unit = uRows[0]; if (!unit) throw new NotFound('Unit not in force');
    const entry = await spend(client, force, 'Rearm and Resupply', 1, unit.id, parsed.data.new_equipment);
    if (parsed.data.new_points_cost !== undefined) {
      await client.query('UPDATE units SET equipment = $1, points_cost = $2 WHERE id = $3', [parsed.data.new_equipment, parsed.data.new_points_cost, unit.id]);
    } else {
      await client.query('UPDATE units SET equipment = $1 WHERE id = $2', [parsed.data.new_equipment, unit.id]);
    }
    const { rows } = await client.query<CrusadeForce>('SELECT * FROM crusade_forces WHERE id = $1', [force.id]);
    return { force: rows[0]!, log: entry };
  });
  res.status(201).json(result);
}));

/* ---- Repair and Recuperate ----
 * Cost = 1 + battle_honours on the unit, max 5. Removes one Battle Scar.
 */
router.post('/:forceId/repair-and-recuperate', requireForceAccess, asyncHandler(async (req, res) => {
  const schema = z.object({ unit_id: z.string().uuid(), scar_id: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest('unit_id and scar_id required');

  const result = await tx(async (client) => {
    const force = await loadForce(client, req.params.forceId, res.locals.campaignId);
    const { rows: uRows } = await client.query<Unit>('SELECT * FROM units WHERE id = $1 AND force_id = $2', [parsed.data.unit_id, force.id]);
    const unit = uRows[0]; if (!unit) throw new NotFound('Unit not in force');
    const { rows: honoursRows } = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM battle_honours WHERE unit_id = $1', [unit.id]);
    const cost = Math.min(5, 1 + Number(honoursRows[0]?.count ?? 0));
    ensureAfford(force, cost);
    const { rows: scarRows } = await client.query('DELETE FROM battle_scars WHERE id = $1 AND unit_id = $2 RETURNING id', [parsed.data.scar_id, unit.id]);
    if (scarRows.length === 0) throw new NotFound('Scar not found on this unit');
    await client.query('UPDATE units SET crusade_points = crusade_points + 1 WHERE id = $1', [unit.id]);
    const entry = await spend(client, force, 'Repair and Recuperate', cost, unit.id, '');
    const { rows } = await client.query<CrusadeForce>('SELECT * FROM crusade_forces WHERE id = $1', [force.id]);
    return { force: rows[0]!, log: entry };
  });
  res.status(201).json(result);
}));

/* ---- Fresh Recruits ----
 * Cost = 1 + ceil(battle_honours / 2), max 4. Adds models (points cost increase) to a unit.
 */
router.post('/:forceId/fresh-recruits', requireForceAccess, asyncHandler(async (req, res) => {
  const schema = z.object({
    unit_id: z.string().uuid(),
    added_points: z.number().int().min(1).max(1000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');

  const result = await tx(async (client) => {
    const force = await loadForce(client, req.params.forceId, res.locals.campaignId);
    const { rows: uRows } = await client.query<Unit>('SELECT * FROM units WHERE id = $1 AND force_id = $2', [parsed.data.unit_id, force.id]);
    const unit = uRows[0]; if (!unit) throw new NotFound('Unit not in force');
    // Supply check
    const { rows: usedRows } = await client.query<{ used: string }>('SELECT COALESCE(SUM(points_cost), 0)::text AS used FROM units WHERE force_id = $1 AND is_active = true', [force.id]);
    if (Number(usedRows[0]?.used ?? 0) + parsed.data.added_points > force.supply_limit) {
      throw new Conflict('Adding these models would exceed Supply Limit.');
    }
    const { rows: hRows } = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM battle_honours WHERE unit_id = $1', [unit.id]);
    const cost = Math.min(4, 1 + Math.ceil(Number(hRows[0]?.count ?? 0) / 2));
    ensureAfford(force, cost);
    await client.query('UPDATE units SET points_cost = points_cost + $1 WHERE id = $2', [parsed.data.added_points, unit.id]);
    const entry = await spend(client, force, 'Fresh Recruits', cost, unit.id, `+${parsed.data.added_points} pts`);
    const { rows } = await client.query<CrusadeForce>('SELECT * FROM crusade_forces WHERE id = $1', [force.id]);
    return { force: rows[0]!, log: entry };
  });
  res.status(201).json(result);
}));

export default router;
