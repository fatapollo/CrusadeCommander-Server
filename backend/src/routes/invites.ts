import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query, one, tx } from '../db/pool.js';
import { asyncHandler, BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from '../middleware/errors.js';
import { requireAuth, loadCampaign, requireAdmin } from '../middleware/auth.js';
import { getSetting } from '../services/settings.js';

const router = Router();

// ----- Code helpers -----
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit confusing chars
function generateCode(len = 10): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

// =========================================================
// /api/campaigns/:campaignId/invites — admin-only management
// =========================================================
const adminRouter = Router({ mergeParams: true });
adminRouter.use(requireAuth, loadCampaign, requireAdmin);

adminRouter.get('/', asyncHandler(async (_req, res) => {
  const domain = await getSetting<string>('default_domain', '');
  const rows = await query(
    `SELECT i.*, u.email AS created_by_email, u.display_name AS created_by_name
     FROM campaign_invites i
     LEFT JOIN users u ON u.id = i.created_by
     WHERE i.campaign_id = $1
     ORDER BY i.created_at DESC`,
    [res.locals.campaignId],
  );
  const invites = rows.map((r: any) => ({
    ...r,
    share_url: domain ? `${domain}/invite/${r.code}` : null,
  }));
  res.json({ invites });
}));

const createSchema = z.object({
  role_on_accept: z.enum(['admin', 'participant']).optional().default('participant'),
  label: z.string().max(120).optional().default(''),
  max_uses: z.number().int().min(1).max(100).optional().default(1),
  expires_in_hours: z.number().int().min(1).max(24 * 365).nullable().optional().default(null),
});

adminRouter.post('/', asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
  const { role_on_accept, label, max_uses, expires_in_hours } = parsed.data;
  const expiresAt = expires_in_hours ? new Date(Date.now() + expires_in_hours * 3600_000) : null;

  // Generate a unique code (collision astronomically unlikely; one retry max)
  let code = generateCode();
  let invite = await one(
    `INSERT INTO campaign_invites (campaign_id, code, created_by, role_on_accept, label, max_uses, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (code) DO NOTHING
     RETURNING *`,
    [res.locals.campaignId, code, res.locals.userId, role_on_accept, label, max_uses, expiresAt],
  );
  if (!invite) {
    code = generateCode();
    invite = await one(
      `INSERT INTO campaign_invites (campaign_id, code, created_by, role_on_accept, label, max_uses, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [res.locals.campaignId, code, res.locals.userId, role_on_accept, label, max_uses, expiresAt],
    );
  }
  const domain = await getSetting<string>('default_domain', '');
  const share_url = domain ? `${domain}/invite/${(invite as any).code}` : null;
  res.status(201).json({ invite: { ...invite, share_url } });
}));

adminRouter.delete('/:inviteId', asyncHandler(async (req, res) => {
  const r = await one(
    'DELETE FROM campaign_invites WHERE id = $1 AND campaign_id = $2 RETURNING id',
    [req.params.inviteId, res.locals.campaignId],
  );
  if (!r) throw new NotFound();
  res.status(204).end();
}));

router.use('/campaigns/:campaignId/invites', adminRouter);

// =========================================================
// /api/invites/:code — public preview + accept
// =========================================================
const publicRouter = Router();

publicRouter.get('/:code', asyncHandler(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const invite = await one<any>(
    `SELECT i.id, i.campaign_id, i.role_on_accept, i.label, i.max_uses, i.times_used, i.expires_at,
            c.name AS campaign_name, c.description AS campaign_description
     FROM campaign_invites i
     JOIN campaigns c ON c.id = i.campaign_id
     WHERE i.code = $1`,
    [code],
  );
  if (!invite) throw new NotFound('Invite not found');
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Conflict('Invite expired');
  if (invite.times_used >= invite.max_uses) throw new Conflict('Invite has reached its maximum uses');
  res.json({
    campaign: { id: invite.campaign_id, name: invite.campaign_name, description: invite.campaign_description },
    role: invite.role_on_accept,
    label: invite.label,
    remaining_uses: invite.max_uses - invite.times_used,
  });
}));

publicRouter.post('/:code/accept', requireAuth, asyncHandler(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const userId = req.session.userId!;

  const result = await tx(async (client) => {
    const { rows } = await client.query<any>(
      `SELECT * FROM campaign_invites WHERE code = $1 FOR UPDATE`,
      [code],
    );
    const invite = rows[0];
    if (!invite) throw new NotFound('Invite not found');
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Conflict('Invite expired');
    if (invite.times_used >= invite.max_uses) throw new Conflict('Invite has reached its maximum uses');

    // Skip if already owner
    const { rows: campRows } = await client.query<{ owner_id: string }>(
      'SELECT owner_id FROM campaigns WHERE id = $1',
      [invite.campaign_id],
    );
    if (campRows[0]?.owner_id === userId) {
      return { campaign_id: invite.campaign_id, role: 'owner', already_member: true };
    }

    // Insert or upgrade membership
    const { rows: memberRows } = await client.query<{ role: string }>(
      `INSERT INTO campaign_members (campaign_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (campaign_id, user_id) DO UPDATE
         SET role = CASE
           WHEN campaign_members.role = 'admin' THEN campaign_members.role
           ELSE EXCLUDED.role
         END
       RETURNING role`,
      [invite.campaign_id, userId, invite.role_on_accept],
    );

    await client.query(
      'UPDATE campaign_invites SET times_used = times_used + 1 WHERE id = $1',
      [invite.id],
    );

    return { campaign_id: invite.campaign_id, role: memberRows[0]!.role, already_member: false };
  });

  res.json(result);
}));

router.use('/invites', publicRouter);

export default router;
