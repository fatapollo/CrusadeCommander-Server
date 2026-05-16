import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { query, one, tx } from '../db/pool.js';
import { asyncHandler, BadRequest, Forbidden, NotFound, Conflict } from '../middleware/errors.js';
import { requireAuth, loadCampaign, requireAdmin } from '../middleware/auth.js';
import type { Battle, Unit, UnitBattleRecord } from '../types.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadCampaign);

router.get('/', asyncHandler(async (_req, res) => {
  const battles = await query<Battle>(
    `SELECT * FROM battles WHERE campaign_id = $1 ORDER BY occurred_at DESC`,
    [res.locals.campaignId],
  );
  res.json({ battles });
}));

router.get('/:battleId', asyncHandler(async (req, res) => {
  const battle = await one<Battle>('SELECT * FROM battles WHERE id = $1 AND campaign_id = $2', [req.params.battleId, res.locals.campaignId]);
  if (!battle) throw new NotFound();
  const records = await query<UnitBattleRecord>('SELECT * FROM unit_battle_records WHERE battle_id = $1', [battle.id]);
  res.json({ battle, records });
}));

const unitRecordSchema = z.object({
  unit_id: z.string().uuid(),
  was_warlord: z.boolean().optional().default(false),
  enemies_destroyed: z.number().int().min(0).max(50).optional().default(0),
  was_destroyed: z.boolean().optional().default(false),
  marked_for_greatness: z.boolean().optional().default(false),
  ooa_result: z.enum(['passed', 'devastating_blow', 'battle_scar']).nullable().optional(),
  notes: z.string().max(500).optional().default(''),
});

const recordBattleSchema = z.object({
  battle_size: z.enum(['Incursion', 'Strike Force', 'Onslaught']),
  mission_name: z.string().max(120).optional().default(''),
  attacker_force_id: z.string().uuid(),
  defender_force_id: z.string().uuid(),
  outcome: z.enum(['Attacker Wins', 'Defender Wins', 'Draw']),
  notes: z.string().max(4000).optional().default(''),
  attacker_units: z.array(unitRecordSchema).default([]),
  defender_units: z.array(unitRecordSchema).default([]),
});

/**
 * Submit a battle. If the opposing force has a different owner, the battle is
 * created as 'pending' and the opponent must call /confirm to apply the result.
 * Auto-confirm cases: submitter owns both forces, submitter is admin/owner, or
 * opposing force has no user_id.
 */
router.post('/', asyncHandler(async (req, res) => {
  const parsed = recordBattleSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const d = parsed.data;
  if (d.attacker_force_id === d.defender_force_id) throw new BadRequest('Attacker and defender must be different forces');
  if (d.attacker_units.filter(u => u.marked_for_greatness).length > 1) throw new BadRequest('Only one attacker unit may be Marked for Greatness.');
  if (d.defender_units.filter(u => u.marked_for_greatness).length > 1) throw new BadRequest('Only one defender unit may be Marked for Greatness.');

  const userId = res.locals.userId as string;
  const role = res.locals.campaignRole as 'owner' | 'admin' | 'participant';

  const result = await tx(async (client) => {
    // Campaign must be active
    const { rows: campRows } = await client.query<{ current_phase: number; state: string }>(
      'SELECT current_phase, state FROM campaigns WHERE id = $1',
      [res.locals.campaignId],
    );
    const camp = campRows[0];
    if (camp?.state !== 'active') {
      throw new Conflict(`Battles can only be recorded while the campaign is active (current state: ${camp?.state}).`);
    }
    const phase = camp.current_phase ?? 1;

    // Verify both forces, load ownership + active flag
    const { rows: forces } = await client.query<{ id: string; user_id: string | null; is_active: boolean; name: string }>(
      `SELECT id, user_id, is_active, name FROM crusade_forces WHERE campaign_id = $1 AND id IN ($2, $3)`,
      [res.locals.campaignId, d.attacker_force_id, d.defender_force_id],
    );
    if (forces.length !== 2) throw new NotFound('One or both forces not found in this campaign');
    const attacker = forces.find(f => f.id === d.attacker_force_id)!;
    const defender = forces.find(f => f.id === d.defender_force_id)!;
    if (!attacker.is_active || !defender.is_active) {
      const dropped = [attacker, defender].filter(f => !f.is_active).map(f => f.name).join(', ');
      throw new BadRequest(`Dropped force(s) cannot fight: ${dropped}. Rejoin first.`);
    }

    // Permission check: submitter must own at least one of the two forces (or be admin/owner)
    const isAdmin = role === 'owner' || role === 'admin';
    if (!isAdmin && attacker.user_id !== userId && defender.user_id !== userId) {
      throw new Forbidden('You can only submit battles involving your own force');
    }

    // Determine who, if anyone, must confirm
    const opposingUserId = attacker.user_id === userId ? defender.user_id : attacker.user_id;
    const needsConfirmation = !isAdmin && opposingUserId !== null && opposingUserId !== userId;

    const status = needsConfirmation ? 'pending' : 'confirmed';

    const { rows: bRows } = await client.query<Battle>(
      `INSERT INTO battles (campaign_id, battle_size, mission_name, attacker_force_id, defender_force_id, outcome, notes, campaign_phase, status, submitted_by_user_id, confirmed_by_user_id, confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        res.locals.campaignId, d.battle_size, d.mission_name,
        d.attacker_force_id, d.defender_force_id, d.outcome, d.notes, phase,
        status, userId,
        status === 'confirmed' ? userId : null,
        status === 'confirmed' ? new Date() : null,
      ],
    );
    const battle = bRows[0]!;

    // Store records (with proposed XP gain; not yet applied if pending)
    const allInputs = [
      ...d.attacker_units.map(u => ({ ...u, force_id: d.attacker_force_id })),
      ...d.defender_units.map(u => ({ ...u, force_id: d.defender_force_id })),
    ];
    const records: UnitBattleRecord[] = [];
    for (const input of allInputs) {
      const xpGain = await previewXpGain(client, input);
      const { rows: recRows } = await client.query<UnitBattleRecord>(
        `INSERT INTO unit_battle_records (battle_id, unit_id, force_id, was_warlord, enemies_destroyed, was_destroyed, marked_for_greatness, xp_gained, ooa_result, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [battle.id, input.unit_id, input.force_id, input.was_warlord, input.enemies_destroyed, input.was_destroyed, input.marked_for_greatness, xpGain, input.ooa_result ?? null, input.notes],
      );
      records.push(recRows[0]!);
    }

    if (status === 'confirmed') {
      await applyBattleEffects(client, battle, records);
    }

    return { battle, records, needs_confirmation: needsConfirmation, opposing_user_id: opposingUserId };
  });

  res.status(201).json(result);
}));

/**
 * Confirm a pending battle. Must be a member of the opposing force or admin.
 */
router.post('/:battleId/confirm', asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const role = res.locals.campaignRole as 'owner' | 'admin' | 'participant';
  const isAdmin = role === 'owner' || role === 'admin';

  const result = await tx(async (client) => {
    const { rows: bRows } = await client.query<Battle>(
      'SELECT * FROM battles WHERE id = $1 AND campaign_id = $2',
      [req.params.battleId, res.locals.campaignId],
    );
    const battle = bRows[0];
    if (!battle) throw new NotFound('Battle not found');
    if (battle.status !== 'pending') throw new Conflict(`Battle is already ${battle.status}`);

    // Authorization: confirmer is admin, or owns the opposing force
    if (!isAdmin) {
      if (battle.submitted_by_user_id === userId) {
        throw new Forbidden('You submitted this battle; the opponent must confirm');
      }
      const { rows: forceRows } = await client.query<{ id: string; user_id: string | null }>(
        'SELECT id, user_id FROM crusade_forces WHERE id IN ($1, $2)',
        [battle.attacker_force_id, battle.defender_force_id],
      );
      const userOwnsAForce = forceRows.some(f => f.user_id === userId);
      if (!userOwnsAForce) throw new Forbidden('Only an opposing player or admin can confirm');
    }

    await client.query(
      `UPDATE battles SET status = 'confirmed', confirmed_by_user_id = $1, confirmed_at = now() WHERE id = $2`,
      [userId, battle.id],
    );
    battle.status = 'confirmed' as any;

    const { rows: records } = await client.query<UnitBattleRecord>(
      'SELECT * FROM unit_battle_records WHERE battle_id = $1',
      [battle.id],
    );
    await applyBattleEffects(client, battle, records);

    return { battle, records };
  });

  res.json(result);
}));

/**
 * Dispute a pending battle. The submitter or an admin must then resolve it
 * (delete & resubmit, or admin can confirm).
 */
router.post('/:battleId/dispute', asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const role = res.locals.campaignRole as 'owner' | 'admin' | 'participant';
  const isAdmin = role === 'owner' || role === 'admin';
  const reason = (req.body?.reason ?? '').toString().slice(0, 500);

  const battle = await one<Battle>(
    'SELECT * FROM battles WHERE id = $1 AND campaign_id = $2',
    [req.params.battleId, res.locals.campaignId],
  );
  if (!battle) throw new NotFound();
  if (battle.status !== 'pending') throw new Conflict(`Battle is already ${battle.status}`);

  if (!isAdmin) {
    const forces = await query<{ user_id: string | null }>(
      'SELECT user_id FROM crusade_forces WHERE id IN ($1, $2)',
      [battle.attacker_force_id, battle.defender_force_id],
    );
    if (!forces.some(f => f.user_id === userId)) throw new Forbidden('Only a player in this battle or an admin can dispute');
    if (battle.submitted_by_user_id === userId) throw new Forbidden('You submitted this battle; you cannot dispute your own submission');
  }

  await query(
    `UPDATE battles SET status = 'disputed', dispute_reason = $1 WHERE id = $2`,
    [reason, battle.id],
  );
  res.json({ battle: { ...battle, status: 'disputed', dispute_reason: reason } });
}));

/**
 * Delete: pending battles can be deleted by the submitter or an admin (no
 * effects to undo). Confirmed battles can only be deleted by admins, and
 * we don't reverse XP/RP — admins must manually reconcile.
 */
router.delete('/:battleId', asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const role = res.locals.campaignRole as 'owner' | 'admin' | 'participant';
  const isAdmin = role === 'owner' || role === 'admin';

  const battle = await one<Battle>(
    'SELECT * FROM battles WHERE id = $1 AND campaign_id = $2',
    [req.params.battleId, res.locals.campaignId],
  );
  if (!battle) throw new NotFound();

  if (battle.status === 'pending' || battle.status === 'disputed') {
    if (!isAdmin && battle.submitted_by_user_id !== userId) {
      throw new Forbidden('Only the submitter or an admin can delete this battle');
    }
  } else {
    if (!isAdmin) throw new Forbidden('Only admins can delete confirmed battles (effects not auto-reversed)');
  }

  await query('DELETE FROM battles WHERE id = $1', [battle.id]);
  res.status(204).end();
}));

export default router;

// =========================================================
// Internal: shared battle-effects logic
// =========================================================

/** Compute XP gain for a unit record without persisting (used at submit time so the records show predicted XP). */
async function previewXpGain(
  client: PoolClient,
  input: { unit_id: string; enemies_destroyed: number; marked_for_greatness: boolean },
): Promise<number> {
  const { rows } = await client.query<Unit>('SELECT * FROM units WHERE id = $1', [input.unit_id]);
  const unit = rows[0];
  if (!unit) return 0;
  if (unit.is_epic_hero || unit.is_fortification || unit.is_swarm) return 0;
  const oldKills = unit.units_destroyed;
  const newKills = oldKills + input.enemies_destroyed;
  const crossings = Math.floor(newKills / 3) - Math.floor(oldKills / 3);
  let xp = 1 + crossings; // Battle Experience + Dealers of Death
  if (input.marked_for_greatness) xp += 3;
  return xp;
}

/**
 * Apply confirmed-battle effects: bump unit XP/tallies, force RP/tally/victories,
 * handle Devastating Blow / Battle Scar from OOA result.
 */
async function applyBattleEffects(
  client: PoolClient,
  battle: Battle,
  records: UnitBattleRecord[],
): Promise<void> {
  for (const r of records) {
    const { rows: uRows } = await client.query<Unit>('SELECT * FROM units WHERE id = $1', [r.unit_id]);
    const unit = uRows[0];
    if (!unit) continue;

    const canExceed = unit.is_character || unit.can_exceed_30_xp;
    const epicSkipsXp = unit.is_epic_hero || unit.is_fortification || unit.is_swarm;
    const xpGain = epicSkipsXp ? 0 : r.xp_gained;
    const newXp = canExceed ? unit.xp + xpGain : Math.min(30, unit.xp + xpGain);

    await client.query(
      `UPDATE units SET
        xp = $1,
        units_destroyed = units_destroyed + $2,
        battles_played = battles_played + 1,
        battles_survived = battles_survived + $3
       WHERE id = $4`,
      [newXp, r.enemies_destroyed, r.was_destroyed ? 0 : 1, unit.id],
    );

    // Devastating Blow: pop most recent honour (-CP). If none, unit is permanently destroyed.
    if (r.was_destroyed && r.ooa_result === 'devastating_blow') {
      const { rows: hRows } = await client.query<{ id: string; crusade_points_value: number }>(
        'SELECT id, crusade_points_value FROM battle_honours WHERE unit_id = $1 ORDER BY earned_at DESC LIMIT 1',
        [unit.id],
      );
      if (hRows[0]) {
        await client.query('DELETE FROM battle_honours WHERE id = $1', [hRows[0].id]);
        await client.query('UPDATE units SET crusade_points = crusade_points - $1 WHERE id = $2', [hRows[0].crusade_points_value, unit.id]);
      } else {
        await client.query('UPDATE units SET is_active = false WHERE id = $1', [unit.id]);
      }
    }
  }

  // Forces: +1 battle_tally, +1 RP (cap 10) for both; +1 victory for winner
  await client.query(
    `UPDATE crusade_forces SET
      battle_tally = battle_tally + 1,
      requisition_points = LEAST(10, requisition_points + 1)
     WHERE id IN ($1, $2)`,
    [battle.attacker_force_id, battle.defender_force_id],
  );
  if (battle.outcome === 'Attacker Wins') {
    await client.query('UPDATE crusade_forces SET victories = victories + 1 WHERE id = $1', [battle.attacker_force_id]);
  } else if (battle.outcome === 'Defender Wins') {
    await client.query('UPDATE crusade_forces SET victories = victories + 1 WHERE id = $1', [battle.defender_force_id]);
  }
}
