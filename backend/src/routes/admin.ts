import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { one, query, tx } from '../db/pool.js';
import { asyncHandler, BadRequest, NotFound, Conflict, Forbidden } from '../middleware/errors.js';
import { requireAuth, requireSiteAdmin } from '../middleware/auth.js';
import { getAllSettings, getSetting, setSetting, KNOWN_SETTINGS } from '../services/settings.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth, requireSiteAdmin);

/* ─────────────── Settings ─────────────── */

router.get('/settings', asyncHandler(async (_req, res) => {
  const stored = await getAllSettings();
  // Merge in defaults so the UI always sees known keys
  const merged: Record<string, any> = {};
  for (const [k, meta] of Object.entries(KNOWN_SETTINGS)) {
    merged[k] = stored[k] ?? meta.default;
  }
  res.json({ settings: merged, schema: KNOWN_SETTINGS });
}));

/**
 * server_port may arrive as a number or numeric string (the form sends strings).
 * Blank / null clears the override so the env PORT / default takes over again.
 */
const settingsSchema = z.object({
  default_domain: z.string().max(500).optional(),
  server_port: z.union([z.number(), z.string()]).nullable().optional(),
}).strict();

router.patch('/settings', asyncHandler(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    let cleaned: any = v;

    if (k === 'default_domain' && typeof v === 'string') {
      cleaned = v.trim().replace(/\/+$/, '');
      if (cleaned && !/^https?:\/\//i.test(cleaned)) {
        throw new BadRequest('default_domain must start with http:// or https://');
      }
    } else if (k === 'server_port') {
      if (v === null || (typeof v === 'string' && v.trim() === '')) {
        cleaned = null; // clear → fall back to env / default
      } else {
        const n = typeof v === 'number' ? v : parseInt(String(v), 10);
        if (!Number.isFinite(n) || n < 1 || n > 65535) {
          throw new BadRequest('server_port must be an integer between 1 and 65535');
        }
        cleaned = n;
      }
    }
    await setSetting(k, cleaned, req.session.userId!);
  }
  const all = await getAllSettings();
  res.json({ settings: all });
}));

/* ─────────────── Users ─────────────── */

interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  is_site_admin: boolean;
  created_at: string;
  owned_campaigns: number;
  member_campaigns: number;
  force_count: number;
}

router.get('/users', asyncHandler(async (_req, res) => {
  const users = await query<AdminUserRow>(
    `SELECT u.id, u.email, u.display_name, u.is_site_admin, u.created_at,
            (SELECT COUNT(*)::int FROM campaigns c WHERE c.owner_id = u.id) AS owned_campaigns,
            (SELECT COUNT(*)::int FROM campaign_members m WHERE m.user_id = u.id) AS member_campaigns,
            (SELECT COUNT(*)::int FROM crusade_forces f WHERE f.user_id = u.id) AS force_count
     FROM users u
     ORDER BY u.created_at DESC`,
  );
  res.json({ users });
}));

router.get('/users/:userId', asyncHandler(async (req, res) => {
  const user = await one<AdminUserRow>(
    `SELECT u.id, u.email, u.display_name, u.is_site_admin, u.created_at,
            (SELECT COUNT(*)::int FROM campaigns c WHERE c.owner_id = u.id) AS owned_campaigns,
            (SELECT COUNT(*)::int FROM campaign_members m WHERE m.user_id = u.id) AS member_campaigns,
            (SELECT COUNT(*)::int FROM crusade_forces f WHERE f.user_id = u.id) AS force_count
     FROM users u WHERE u.id = $1`,
    [req.params.userId],
  );
  if (!user) throw new NotFound('User not found');

  const ownedCampaigns = await query(
    `SELECT id, name, state, default_battle_size, created_at FROM campaigns
     WHERE owner_id = $1 ORDER BY created_at DESC`,
    [req.params.userId],
  );
  const memberCampaigns = await query(
    `SELECT c.id, c.name, c.state, m.role, m.joined_at FROM campaign_members m
     JOIN campaigns c ON c.id = m.campaign_id
     WHERE m.user_id = $1 ORDER BY m.joined_at DESC`,
    [req.params.userId],
  );

  res.json({ user, owned_campaigns: ownedCampaigns, member_campaigns: memberCampaigns });
}));

const userPatchSchema = z.object({
  display_name: z.string().max(80).optional(),
  is_site_admin: z.boolean().optional(),
}).strict();

router.patch('/users/:userId', asyncHandler(async (req, res) => {
  const parsed = userPatchSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');

  // Safety: prevent the last site admin from demoting themselves
  if (parsed.data.is_site_admin === false && req.params.userId === req.session.userId) {
    const { count } = (await one<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE is_site_admin = true AND id <> $1`,
      [req.params.userId],
    ))!;
    if (parseInt(count, 10) === 0) throw new Conflict('Cannot demote the last site admin');
  }

  const sets: string[] = []; const vals: any[] = []; let i = 1;
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    sets.push(`${k} = $${i++}`); vals.push(v);
  }
  if (sets.length === 0) {
    const u = await one('SELECT id, email, display_name, is_site_admin FROM users WHERE id = $1', [req.params.userId]);
    return res.json({ user: u });
  }
  vals.push(req.params.userId);
  const updated = await one(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
     RETURNING id, email, display_name, is_site_admin, created_at`,
    vals,
  );
  if (!updated) throw new NotFound();
  res.json({ user: updated });
}));

router.post('/users/:userId/reset-password', asyncHandler(async (req, res) => {
  const schema = z.object({ new_password: z.string().min(8).max(200).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequest('Password must be at least 8 characters');

  // Auto-generate if not supplied
  const password = parsed.data.new_password
    ?? crypto.randomBytes(9).toString('base64url'); // ~12 chars
  const hash = await bcrypt.hash(password, config.security.bcryptCost);

  const updated = await one(
    `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id`,
    [hash, req.params.userId],
  );
  if (!updated) throw new NotFound('User not found');

  // If the admin reset themselves, regenerate session so the old session is still valid
  // (no need to invalidate other devices unless we add a session-version field; future work).
  res.json({ ok: true, temporary_password: parsed.data.new_password ? null : password });
}));

router.delete('/users/:userId', asyncHandler(async (req, res) => {
  if (req.params.userId === req.session.userId) {
    throw new Conflict('Use a different admin account to delete yourself');
  }
  const target = await one<{ is_site_admin: boolean }>(
    'SELECT is_site_admin FROM users WHERE id = $1', [req.params.userId],
  );
  if (!target) throw new NotFound();
  // A site admin may only delete normal users. Deleting another site-admin
  // account is never permitted (self-deletion is already blocked above).
  if (target.is_site_admin) {
    throw new Forbidden('Cannot delete another site admin account');
  }

  await query('DELETE FROM users WHERE id = $1', [req.params.userId]);
  res.status(204).end();
}));

/* ─────────────── Campaigns (all) ─────────────── */

interface AdminCampaignRow {
  id: string;
  name: string;
  state: string;
  default_battle_size: string;
  current_phase: number;
  created_at: string;
  owner_id: string;
  owner_email: string;
  owner_name: string;
  force_count: number;
  member_count: number;
  battle_count: number;
}

router.get('/campaigns', asyncHandler(async (_req, res) => {
  const campaigns = await query<AdminCampaignRow>(
    `SELECT c.id, c.name, c.state, c.default_battle_size, c.current_phase, c.created_at,
            c.owner_id, u.email AS owner_email, u.display_name AS owner_name,
            (SELECT COUNT(*)::int FROM crusade_forces WHERE campaign_id = c.id) AS force_count,
            (SELECT COUNT(*)::int FROM campaign_members WHERE campaign_id = c.id) AS member_count,
            (SELECT COUNT(*)::int FROM battles WHERE campaign_id = c.id AND status = 'confirmed') AS battle_count
     FROM campaigns c
     LEFT JOIN users u ON u.id = c.owner_id
     ORDER BY c.created_at DESC`,
  );
  res.json({ campaigns });
}));

router.delete('/campaigns/:campaignId', asyncHandler(async (req, res) => {
  const r = await one('DELETE FROM campaigns WHERE id = $1 RETURNING id', [req.params.campaignId]);
  if (!r) throw new NotFound();
  res.status(204).end();
}));

router.post('/campaigns/:campaignId/transfer', asyncHandler(async (req, res) => {
  const schema = z.object({ new_owner_id: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest('new_owner_id (UUID) required');
  const newOwnerId = parsed.data.new_owner_id;

  const result = await tx(async (client) => {
    const { rows: campRows } = await client.query<{ id: string; owner_id: string }>(
      'SELECT id, owner_id FROM campaigns WHERE id = $1 FOR UPDATE',
      [req.params.campaignId],
    );
    const camp = campRows[0];
    if (!camp) throw new NotFound('Campaign not found');
    if (camp.owner_id === newOwnerId) return camp;

    const { rows: userRows } = await client.query('SELECT id FROM users WHERE id = $1', [newOwnerId]);
    if (userRows.length === 0) throw new NotFound('Target user not found');

    // Demote new owner from any existing membership row (avoids dup role on a user)
    await client.query(
      'DELETE FROM campaign_members WHERE campaign_id = $1 AND user_id = $2',
      [req.params.campaignId, newOwnerId],
    );
    // Make the previous owner an admin so they retain elevated access
    await client.query(
      `INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'admin'`,
      [req.params.campaignId, camp.owner_id],
    );
    // Transfer
    const { rows } = await client.query(
      'UPDATE campaigns SET owner_id = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [newOwnerId, req.params.campaignId],
    );
    return rows[0];
  });

  res.json({ campaign: result });
}));

/* ─────────────── Invites (admin-side, for any campaign) ─────────────── */
// Reuses the normal invite system but allows site admins to invite into any campaign.

router.post('/campaigns/:campaignId/invites', asyncHandler(async (req, res) => {
  const schema = z.object({
    role_on_accept: z.enum(['admin', 'participant']).optional().default('participant'),
    label: z.string().max(120).optional().default(''),
    max_uses: z.number().int().min(1).max(100).optional().default(1),
    expires_in_hours: z.number().int().min(1).max(24 * 365).nullable().optional().default(null),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');

  const camp = await one<{ id: string }>('SELECT id FROM campaigns WHERE id = $1', [req.params.campaignId]);
  if (!camp) throw new NotFound('Campaign not found');

  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i++) code += ALPHABET[crypto.randomBytes(1)[0]! % ALPHABET.length];
  const expiresAt = parsed.data.expires_in_hours ? new Date(Date.now() + parsed.data.expires_in_hours * 3600_000) : null;
  const invite = await one(
    `INSERT INTO campaign_invites (campaign_id, code, created_by, role_on_accept, label, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.params.campaignId, code, req.session.userId, parsed.data.role_on_accept, parsed.data.label, parsed.data.max_uses, expiresAt],
  );
  const domain = await getSetting<string>('default_domain', '');
  const share_url = `${domain || ''}/invite/${code}`;
  res.status(201).json({ invite: { ...invite, share_url: domain ? share_url : null } });
}));

export default router;
