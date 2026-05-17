import { Router } from 'express';
import { z } from 'zod';
import { query, one } from '../db/pool.js';
import { asyncHandler, BadRequest, NotFound } from '../middleware/errors.js';
import { requireAuth, loadCampaign, requireAdmin, requireForceAccess } from '../middleware/auth.js';
import type { CrusadeForce } from '../types.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadCampaign);

router.get('/', asyncHandler(async (_req, res) => {
  const forces = await query<CrusadeForce>(
    `SELECT cf.*,
       (SELECT COUNT(*)::int FROM units u
          WHERE u.force_id = cf.id AND u.is_active) AS unit_count,
       (SELECT COALESCE(SUM(u.points_cost), 0)::int FROM units u
          WHERE u.force_id = cf.id AND u.is_active) AS power_rating
     FROM crusade_forces cf
     WHERE cf.campaign_id = $1
     ORDER BY victories DESC, battle_tally DESC, name ASC`,
    [res.locals.campaignId],
  );
  res.json({ forces });
}));

const createSchema = z.object({
  name: z.string().min(1).max(80),
  player_name: z.string().max(80).optional().default(''),
  faction: z.string().max(80).optional().default(''),
  team: z.string().max(80).optional().default(''),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#C0392B'),
  supply_limit: z.number().int().min(0).max(20_000).optional().default(1000),
  requisition_points: z.number().int().min(0).max(10).optional().default(5),
  notes: z.string().max(2000).optional().default(''),
});

// Any member can create their own Crusade Force in this campaign.
// One-faction-per-user rule: a user cannot have a second force in the same campaign.
// If they previously dropped, they must rejoin that one instead of creating a new one.
router.post('/', asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const d = parsed.data;

  const existing = await one<{ id: string; is_active: boolean; name: string }>(
    'SELECT id, is_active, name FROM crusade_forces WHERE campaign_id = $1 AND user_id = $2',
    [res.locals.campaignId, req.session.userId],
  );
  if (existing) {
    if (existing.is_active) {
      throw new BadRequest(`You already command "${existing.name}" in this campaign — one faction per user.`);
    }
    throw new BadRequest(`You previously commanded "${existing.name}" in this campaign. Rejoin that force instead of creating a new one.`);
  }

  const force = await one<CrusadeForce>(
    `INSERT INTO crusade_forces (campaign_id, user_id, name, player_name, faction, team, color_hex, supply_limit, requisition_points, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [res.locals.campaignId, req.session.userId, d.name, d.player_name, d.faction, d.team, d.color_hex, d.supply_limit, d.requisition_points, d.notes],
  );
  res.status(201).json({ force });
}));

router.get('/:forceId', asyncHandler(async (req, res) => {
  const force = await one<CrusadeForce>(
    'SELECT * FROM crusade_forces WHERE id = $1 AND campaign_id = $2',
    [req.params.forceId, res.locals.campaignId],
  );
  if (!force) throw new NotFound();
  res.json({ force });
}));

const updateSchema = createSchema.partial().extend({
  battle_tally: z.number().int().min(0).optional(),
  victories: z.number().int().min(0).optional(),
});

router.patch('/:forceId', requireForceAccess, asyncHandler(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const fields = parsed.data;
  const setClauses: string[] = []; const values: any[] = []; let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (k === 'requisition_points' && typeof v === 'number') {
      setClauses.push(`${k} = LEAST(10, GREATEST(0, $${i++}))`);
    } else {
      setClauses.push(`${k} = $${i++}`);
    }
    values.push(v);
  }
  if (setClauses.length === 0) {
    const f = await one<CrusadeForce>('SELECT * FROM crusade_forces WHERE id = $1 AND campaign_id = $2', [req.params.forceId, res.locals.campaignId]);
    if (!f) throw new NotFound();
    res.json({ force: f }); return;
  }
  values.push(req.params.forceId, res.locals.campaignId);
  const updated = await one<CrusadeForce>(
    `UPDATE crusade_forces SET ${setClauses.join(', ')} WHERE id = $${i} AND campaign_id = $${i+1} RETURNING *`,
    values,
  );
  if (!updated) throw new NotFound();
  res.json({ force: updated });
}));

router.delete('/:forceId', requireForceAccess, asyncHandler(async (req, res) => {
  const r = await one('DELETE FROM crusade_forces WHERE id = $1 AND campaign_id = $2 RETURNING id', [req.params.forceId, res.locals.campaignId]);
  if (!r) throw new NotFound();
  res.status(204).end();
}));

// Drop out of the campaign — soft (preserves units, honours, history). Owner of the force or admin.
router.post('/:forceId/drop', requireForceAccess, asyncHandler(async (req, res) => {
  const updated = await one<CrusadeForce>(
    `UPDATE crusade_forces SET is_active = false, dropped_at = now()
     WHERE id = $1 AND campaign_id = $2 RETURNING *`,
    [req.params.forceId, res.locals.campaignId],
  );
  if (!updated) throw new NotFound();
  res.json({ force: updated });
}));

router.post('/:forceId/rejoin', requireForceAccess, asyncHandler(async (req, res) => {
  const updated = await one<CrusadeForce>(
    `UPDATE crusade_forces SET is_active = true, dropped_at = NULL
     WHERE id = $1 AND campaign_id = $2 RETURNING *`,
    [req.params.forceId, res.locals.campaignId],
  );
  if (!updated) throw new NotFound();
  res.json({ force: updated });
}));

export default router;
