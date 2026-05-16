import type { Request, Response, NextFunction } from 'express';
import { Forbidden, NotFound, Unauthorized } from './errors.js';
import { one } from '../db/pool.js';

export type CampaignRole = 'owner' | 'admin' | 'participant';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.userId) return next(new Unauthorized('Sign in required'));
  next();
}

/** Site admin check — gates the global admin panel routes. */
export async function requireSiteAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.session.userId) throw new Unauthorized();
    const row = await one<{ is_site_admin: boolean }>(
      'SELECT is_site_admin FROM users WHERE id = $1',
      [req.session.userId],
    );
    if (!row?.is_site_admin) throw new Forbidden('Site admin permission required');
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Loads the campaign at req.params.campaignId and the user's role for it.
 * Owner is implicit (no row in campaign_members). Sets:
 *   res.locals.campaignId
 *   res.locals.campaignRole  ('owner' | 'admin' | 'participant')
 *   res.locals.userId
 */
export async function loadCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.session.userId) throw new Unauthorized();
    const id = req.params.campaignId;
    if (!id) throw new NotFound('Campaign id missing');

    const row = await one<{ id: string; owner_id: string; role: string | null }>(
      `SELECT c.id, c.owner_id, m.role
       FROM campaigns c
       LEFT JOIN campaign_members m ON m.campaign_id = c.id AND m.user_id = $2
       WHERE c.id = $1`,
      [id, req.session.userId],
    );

    if (!row) throw new NotFound('Campaign not found');

    let role: CampaignRole;
    if (row.owner_id === req.session.userId) role = 'owner';
    else if (row.role === 'admin') role = 'admin';
    else if (row.role === 'participant') role = 'participant';
    else throw new Forbidden('No access to this campaign');

    res.locals.campaignId = row.id;
    res.locals.campaignRole = role;
    res.locals.userId = req.session.userId;
    next();
  } catch (e) {
    next(e);
  }
}

/** Owner or admin. */
export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  const r = res.locals.campaignRole as CampaignRole | undefined;
  if (r === 'owner' || r === 'admin') return next();
  next(new Forbidden('Admin permission required'));
}

/** Owner only (campaign deletion). */
export function requireOwner(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.campaignRole === 'owner') return next();
  next(new Forbidden('Owner permission required'));
}

/**
 * Asserts that `force_id` belongs to the current user, OR the current user is
 * owner/admin of the campaign. Reads from req.params.forceId by default.
 */
/**
 * Asserts that the unit at req.params.unitId belongs to a force the current
 * user owns, OR the current user is owner/admin of the campaign.
 */
export async function requireUnitAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const role = res.locals.campaignRole as CampaignRole;
    if (role === 'owner' || role === 'admin') return next();
    const unitId = req.params.unitId;
    if (!unitId) throw new Forbidden('Unit id required');
    const row = await one<{ user_id: string | null }>(
      `SELECT f.user_id FROM units u
       JOIN crusade_forces f ON f.id = u.force_id
       WHERE u.id = $1 AND f.campaign_id = $2`,
      [unitId, res.locals.campaignId],
    );
    if (!row) throw new NotFound('Unit not found');
    if (row.user_id !== res.locals.userId) {
      throw new Forbidden('You do not own this unit\'s Crusade Force');
    }
    next();
  } catch (e) {
    next(e);
  }
}

export async function requireForceAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const role = res.locals.campaignRole as CampaignRole;
    if (role === 'owner' || role === 'admin') return next();
    const forceId = req.params.forceId ?? req.body.force_id;
    if (!forceId) throw new Forbidden('Force id required');
    const row = await one<{ user_id: string | null }>(
      'SELECT user_id FROM crusade_forces WHERE id = $1 AND campaign_id = $2',
      [forceId, res.locals.campaignId],
    );
    if (!row) throw new NotFound('Force not found');
    if (row.user_id !== res.locals.userId) {
      throw new Forbidden('You do not own this Crusade Force');
    }
    next();
  } catch (e) {
    next(e);
  }
}
