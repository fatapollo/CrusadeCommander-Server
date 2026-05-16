import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { one, query } from '../db/pool.js';
import { asyncHandler, BadRequest, Unauthorized, Conflict } from '../middleware/errors.js';
import type { User } from '../types.js';
import { config } from '../config.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: config.security.authRateLimitWindowMinutes * 60 * 1000,
  max: config.security.authRateLimitPerWindow,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again later.' },
});

const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  display_name: z.string().max(80).optional().default(''),
  admin_passcode: z.string().max(200).optional(),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest(parsed.error.issues[0]?.message ?? 'Invalid input');

  const { email, password, display_name, admin_passcode } = parsed.data;
  const existing = await one<User>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) throw new Conflict('An account with that email already exists');

  // Admin passcode: grants site-admin if a non-empty passcode is configured AND matches.
  let isSiteAdmin = false;
  if (admin_passcode && config.admin.signupPasscode) {
    if (admin_passcode === config.admin.signupPasscode) {
      isSiteAdmin = true;
    } else {
      throw new BadRequest('Invalid admin passcode.');
    }
  }

  const password_hash = await bcrypt.hash(password, config.security.bcryptCost);
  const user = await one<User>(
    `INSERT INTO users (email, password_hash, display_name, is_site_admin) VALUES ($1, $2, $3, $4)
     RETURNING id, email, display_name, created_at, is_site_admin`,
    [email, password_hash, display_name, isSiteAdmin],
  );
  if (!user) throw new Error('Failed to create user');

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => err ? reject(err) : resolve());
  });
  req.session.userId = user.id;

  res.status(201).json({ user });
}));

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequest('Invalid email or password');

  const { email, password } = parsed.data;
  const row = await one<{ id: string; password_hash: string; email: string; display_name: string; created_at: string; is_site_admin: boolean }>(
    'SELECT id, password_hash, email, display_name, created_at, is_site_admin FROM users WHERE email = $1',
    [email],
  );

  // Use a constant-time-ish flow regardless of whether the row exists to mitigate enumeration.
  const dummyHash = '$2b$12$abcdefghijklmnopqrstuv';
  const matches = row
    ? await bcrypt.compare(password, row.password_hash)
    : (await bcrypt.compare(password, dummyHash), false);

  if (!row || !matches) throw new Unauthorized('Invalid email or password');

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => err ? reject(err) : resolve());
  });
  req.session.userId = row.id;

  res.json({
    user: {
      id: row.id, email: row.email, display_name: row.display_name,
      created_at: row.created_at, is_site_admin: row.is_site_admin,
    },
  });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => err ? reject(err) : resolve());
  });
  res.clearCookie('connect.sid');
  res.status(204).end();
}));

router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session.userId) throw new Unauthorized('Not signed in');
  const user = await one<User>(
    'SELECT id, email, display_name, created_at, is_site_admin FROM users WHERE id = $1',
    [req.session.userId],
  );
  if (!user) {
    req.session.destroy(() => {});
    throw new Unauthorized('Account no longer exists');
  }
  res.json({
    user,
    config_meta: {
      admin_passcode_enabled: !!config.admin.signupPasscode,
    },
  });
}));

/** Public hint endpoint so the frontend can decide whether to show the admin-passcode field. */
router.get('/config', asyncHandler(async (_req, res) => {
  res.json({
    admin_passcode_enabled: !!config.admin.signupPasscode,
  });
}));

export default router;
