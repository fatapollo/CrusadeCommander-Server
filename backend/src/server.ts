import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import connectPgSimple from 'connect-pg-simple';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middleware/errors.js';
import authRoutes from './auth/routes.js';
import campaignsRouter from './routes/campaigns.js';
import forcesRouter from './routes/forces.js';
import unitsRouter from './routes/units.js';
import battlesRouter from './routes/battles.js';
import requisitionsRouter from './routes/requisitions.js';
import invitesRouter from './routes/invites.js';
import adminRouter from './routes/admin.js';

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: 60 * 15 }),
  name: 'connect.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSecure ? 'strict' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30,
    domain: config.cookieDomain,
  },
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, env: config.nodeEnv });
});

// API
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/campaigns/:campaignId/forces', forcesRouter);
app.use('/api/campaigns/:campaignId', unitsRouter); // exposes /forces/:fid/units and /units/:uid
app.use('/api/campaigns/:campaignId/battles', battlesRouter);
app.use('/api/campaigns/:campaignId/requisitions', requisitionsRouter);
app.use('/api', invitesRouter); // mounts /campaigns/:id/invites and /invites/:code
app.use('/api/admin', adminRouter);

// ── Static frontend (production / unified deployment) ─────────────────
// When STATIC_DIR points at a built frontend, serve it from the same origin.
// Any non-API GET falls back to index.html so client-side routing works.
const staticDir = process.env.STATIC_DIR && fs.existsSync(process.env.STATIC_DIR)
  ? process.env.STATIC_DIR
  : null;
if (staticDir) {
  console.log(`[static] serving frontend from ${staticDir}`);
  app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.use(errorHandler);

import { getSetting } from './services/settings.js';

async function start() {
  // Port: site_settings.server_port wins → env PORT → built-in default
  let port = config.port;
  try {
    const stored = await getSetting<number | null>('server_port', null);
    if (typeof stored === 'number' && stored >= 1 && stored <= 65535) {
      port = stored;
      if (stored !== config.port) {
        console.log(`[port] using server_port=${stored} from site_settings (overrides PORT env=${config.port})`);
      }
    }
  } catch (e) {
    console.warn('[port] could not read site_settings.server_port — using env/default', e);
  }

  const server = app.listen(port, () => {
    console.log(`Crusade Commander API listening on :${port} (${config.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down…`);
    server.close(() => console.log('HTTP server closed'));
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});
