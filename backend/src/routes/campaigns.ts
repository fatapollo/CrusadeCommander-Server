import { Router } from 'express';
import { z } from 'zod';
import { query, one } from '../db/pool.js';
import { asyncHandler, BadRequest, NotFound } from '../middleware/errors.js';
import { requireAuth, loadCampaign, requireAdmin, requireOwner } from '../middleware/auth.js';
import type { Campaign, CampaignPhase } from '../types.js';

const router = Router();
router.use(requireAuth);

// Correlated aggregates surfaced alongside every campaign so the index /
// detail screens can show real force / unit / battle / power-rating figures.
const CAMPAIGN_STATS = `
  (SELECT COUNT(*)::int FROM crusade_forces f
     WHERE f.campaign_id = c.id AND f.is_active) AS force_count,
  (SELECT COUNT(*)::int FROM units u
     JOIN crusade_forces f ON f.id = u.force_id
     WHERE f.campaign_id = c.id AND f.is_active AND u.is_active) AS unit_count,
  (SELECT COUNT(*)::int FROM battles b
     WHERE b.campaign_id = c.id AND b.status = 'confirmed') AS battle_count,
  (SELECT COALESCE(SUM(u.points_cost), 0)::int FROM units u
     JOIN crusade_forces f ON f.id = u.force_id
     WHERE f.campaign_id = c.id AND f.is_active AND u.is_active) AS power_rating`;

// Sector Map needs a phase list; if admins haven't persisted one yet,
// synthesize a sensible default from the existing scalar fields so the
// frontend can always assume `campaign.phases` is a populated array.
function withPhases(c: Campaign): Campaign {
  if (c.phases && c.phases.length > 0) return c;
  const total = Math.max(1, c.current_phase ?? 1);
  const synth: CampaignPhase[] = [];
  for (let i = 1; i <= total; i++) {
    synth.push({
      idx: i,
      label: i === total ? (c.phase_label || `Phase ${String(i).padStart(2, '0')}`) : `Phase ${String(i).padStart(2, '0')}`,
      date: null,
    });
  }
  return { ...c, phases: synth };
}

router.get('/', asyncHandler(async (req, res) => {
  const rows = await query<Campaign>(
    `SELECT DISTINCT c.*, ${CAMPAIGN_STATS} FROM campaigns c
     LEFT JOIN campaign_members m ON m.campaign_id = c.id
     WHERE c.owner_id = $1 OR m.user_id = $1
     ORDER BY c.created_at DESC`,
    [req.session.userId],
  );
  res.json({ campaigns: rows.map(withPhases) });
}));

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(''),
  phase_label: z.string().max(40).optional().default('Campaign Turn'),
  default_battle_size: z.enum(['Incursion', 'Strike Force', 'Onslaught']).optional().default('Strike Force'),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const { name, description, phase_label, default_battle_size } = parsed.data;
  const campaign = await one<Campaign>(
    `INSERT INTO campaigns (owner_id, name, description, phase_label, default_battle_size)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.session.userId, name, description, phase_label, default_battle_size],
  );
  res.status(201).json({ campaign });
}));

router.get('/:campaignId', loadCampaign, asyncHandler(async (_req, res) => {
  const c = await one<Campaign>(
    `SELECT c.*, ${CAMPAIGN_STATS} FROM campaigns c WHERE c.id = $1`,
    [res.locals.campaignId],
  );
  if (!c) throw new NotFound();
  res.json({ campaign: withPhases(c), role: res.locals.campaignRole });
}));

const updateSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
  current_phase: z.number().int().min(1).max(1000).optional(),
});

router.patch('/:campaignId', loadCampaign, requireAdmin, asyncHandler(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const fields = parsed.data;
  const setClauses: string[] = []; const values: any[] = []; let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    setClauses.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (setClauses.length === 0) {
    const c = await one<Campaign>('SELECT * FROM campaigns WHERE id = $1', [res.locals.campaignId]);
    res.json({ campaign: c });
    return;
  }
  setClauses.push(`updated_at = now()`);
  values.push(res.locals.campaignId);
  const updated = await one<Campaign>(
    `UPDATE campaigns SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  res.json({ campaign: updated });
}));

// Sector Map — admin replaces the full phase list. 1-based idx must include
// at least the campaign's current_phase. Cosmetic only; no rules effects.
const phaseSchema = z.object({
  idx: z.number().int().min(1).max(200),
  label: z.string().max(80).default(''),
  date: z.string().max(40).nullable().default(null),
  pending: z.boolean().optional(),
});
const phasesBodySchema = z.object({ phases: z.array(phaseSchema).min(1).max(200) });

router.put('/:campaignId/phases', loadCampaign, requireAdmin, asyncHandler(async (req, res) => {
  const parsed = phasesBodySchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const updated = await one<Campaign>(
    `UPDATE campaigns SET phases = $1::jsonb, updated_at = now()
     WHERE id = $2 RETURNING *`,
    [JSON.stringify(parsed.data.phases), res.locals.campaignId],
  );
  if (!updated) throw new NotFound();
  res.json({ campaign: withPhases(updated) });
}));

const nodeSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  type: z.enum(['HIVE', 'FORGE', 'PORT', 'RELIC', 'STRONG', 'WILD', 'OBJ']),
  pos: z.object({ x: z.number(), y: z.number() }),
  value: z.number().int().min(1).max(5),
  traits: z.array(z.string().max(40)).max(20).default([]),
  owners: z.array(z.string().max(64)).max(200),
  isObjective: z.boolean().default(false),
  history: z.array(z.object({
    phase: z.number().int().min(1).max(200),
    event: z.string().max(200),
  })).max(2000).default([]),
  battles: z.array(z.string().uuid()).max(2000).default([]),
});
const sectorMapSchema = z.object({
  nodes: z.array(nodeSchema).max(200),
  edges: z.array(z.tuple([z.string(), z.string()])).max(400),
});

router.put('/:campaignId/map', loadCampaign, requireAdmin, asyncHandler(async (req, res) => {
  const parsed = sectorMapSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  // Edges must reference known node ids.
  const ids = new Set(parsed.data.nodes.map(n => n.id));
  for (const [a, b] of parsed.data.edges) {
    if (!ids.has(a) || !ids.has(b)) throw new BadRequest(`Edge references unknown node: ${a} / ${b}`);
  }
  const updated = await one<Campaign>(
    `UPDATE campaigns SET sector_map = $1::jsonb, updated_at = now()
     WHERE id = $2 RETURNING *`,
    [JSON.stringify(parsed.data), res.locals.campaignId],
  );
  if (!updated) throw new NotFound();
  res.json({ campaign: withPhases(updated) });
}));

router.delete('/:campaignId', loadCampaign, requireOwner, asyncHandler(async (_req, res) => {
  await query('DELETE FROM campaigns WHERE id = $1', [res.locals.campaignId]);
  res.status(204).end();
}));

// Lifecycle transitions
router.post('/:campaignId/start', loadCampaign, requireAdmin, asyncHandler(async (_req, res) => {
  const c = await one<Campaign>('SELECT * FROM campaigns WHERE id = $1', [res.locals.campaignId]);
  if (!c) throw new NotFound();
  if (c.state === 'active') return res.json({ campaign: c });
  if (c.state === 'concluded') throw new BadRequest('Cannot start a concluded campaign — use reopen');

  const { count } = (await one<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM crusade_forces WHERE campaign_id = $1 AND is_active = true`,
    [res.locals.campaignId],
  ))!;
  if (parseInt(count, 10) < 2) throw new BadRequest('Need at least 2 active forces to start the campaign');

  const updated = await one<Campaign>(
    `UPDATE campaigns SET state = 'active', started_at = COALESCE(started_at, now()), is_active = true, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [res.locals.campaignId],
  );
  res.json({ campaign: updated });
}));

router.post('/:campaignId/conclude', loadCampaign, requireAdmin, asyncHandler(async (_req, res) => {
  const c = await one<Campaign>(
    `UPDATE campaigns SET state = 'concluded', concluded_at = now(), is_active = false, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [res.locals.campaignId],
  );
  if (!c) throw new NotFound();
  res.json({ campaign: c });
}));

router.post('/:campaignId/reopen', loadCampaign, requireAdmin, asyncHandler(async (_req, res) => {
  const c = await one<Campaign>(
    `UPDATE campaigns SET state = 'active', concluded_at = NULL, is_active = true, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [res.locals.campaignId],
  );
  if (!c) throw new NotFound();
  res.json({ campaign: c });
}));

// Members: list participants for this campaign (owner + members)
router.get('/:campaignId/members', loadCampaign, asyncHandler(async (_req, res) => {
  const rows = await query<{ user_id: string; email: string; display_name: string; role: string; joined_at: string }>(
    `SELECT u.id AS user_id, u.email, u.display_name, 'owner' AS role, c.created_at AS joined_at
     FROM campaigns c JOIN users u ON u.id = c.owner_id
     WHERE c.id = $1
     UNION ALL
     SELECT u.id AS user_id, u.email, u.display_name, m.role, m.joined_at
     FROM campaign_members m JOIN users u ON u.id = m.user_id
     WHERE m.campaign_id = $1
     ORDER BY joined_at ASC`,
    [res.locals.campaignId],
  );
  res.json({ members: rows });
}));

router.delete('/:campaignId/members/:userId', loadCampaign, requireAdmin, asyncHandler(async (req, res) => {
  // Cannot remove the owner
  const camp = await one<{ owner_id: string }>('SELECT owner_id FROM campaigns WHERE id = $1', [res.locals.campaignId]);
  if (camp?.owner_id === req.params.userId) throw new BadRequest('Cannot remove the owner');
  const r = await one('DELETE FROM campaign_members WHERE campaign_id = $1 AND user_id = $2 RETURNING user_id', [res.locals.campaignId, req.params.userId]);
  if (!r) throw new NotFound();
  res.status(204).end();
}));

router.patch('/:campaignId/members/:userId', loadCampaign, requireAdmin, asyncHandler(async (req, res) => {
  const role = String(req.body?.role ?? '');
  if (!['admin', 'participant'].includes(role)) throw new BadRequest('Role must be admin or participant');
  const r = await one<{ role: string }>(
    `UPDATE campaign_members SET role = $1 WHERE campaign_id = $2 AND user_id = $3 RETURNING role`,
    [role, res.locals.campaignId, req.params.userId],
  );
  if (!r) throw new NotFound();
  res.json({ role: r.role });
}));

export default router;
