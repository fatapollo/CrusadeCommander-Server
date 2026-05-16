import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/* ───────────────────────────── Shape ───────────────────────────── */

export interface AppConfig {
  server: {
    port: number;
    nodeEnv: 'development' | 'production' | 'test';
  };
  cors: {
    origins: string[];
  };
  cookies: {
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    domain: string | undefined;
    maxAgeDays: number;
  };
  database: {
    url: string;          // canonical connection string (constructed if not supplied)
    maxConnections: number;
  };
  session: {
    secret: string;
  };
  admin: {
    /** When non-null, users supplying this passcode at /auth/register become site admins. */
    signupPasscode: string | null;
  };
  security: {
    bcryptCost: number;
    authRateLimitPerWindow: number;
    authRateLimitWindowMinutes: number;
  };

  // Legacy flat aliases — kept for back-compat with existing imports
  readonly nodeEnv: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly sessionSecret: string;
  readonly corsOrigins: string[];
  readonly cookieSecure: boolean;
  readonly cookieDomain: string | undefined;
}

/* ───────────────────────────── Defaults ───────────────────────────── */

const defaults = {
  server: { port: 3000, nodeEnv: 'development' as const },
  cors: { origins: ['http://localhost:5173'] },
  cookies: { secure: false, sameSite: 'lax' as const, domain: null as string | null, maxAgeDays: 30 },
  database: {
    url: null as string | null,
    host: 'localhost',
    port: 5432,
    user: 'crusade',
    password: '',
    database: 'crusade',
    maxConnections: 20,
  },
  session: { secret: '' },
  admin: { signupPasscode: null as string | null },
  security: {
    bcryptCost: 12,
    authRateLimitPerWindow: 10,
    authRateLimitWindowMinutes: 15,
  },
};

/* ───────────────────────────── JSON config ───────────────────────────── */

function readJsonConfig(): any {
  const configPath = process.env.CONFIG_FILE
    ?? path.resolve(process.cwd(), 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    console.log(`[config] Loaded ${configPath}`);
    return parsed;
  } catch (e) {
    console.error(`[config] Failed to parse ${configPath}:`, e);
    return {};
  }
}

/** Deep-merge `src` into `dst`, treating arrays as scalar replacements.
 * Empty strings (e.g. ADMIN_SIGNUP_PASSCODE="") are treated as "unset" so
 * they don't shadow a meaningful default from a lower-precedence layer. */
function merge<T>(dst: T, src: any): T {
  if (src == null) return dst;
  const out: any = Array.isArray(dst) ? [...(dst as any)] : { ...(dst as any) };
  for (const [k, v] of Object.entries(src)) {
    if (k.startsWith('_')) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof (out as any)[k] === 'object') {
      out[k] = merge((out as any)[k], v);
    } else if (v !== undefined && v !== null && v !== '') {
      out[k] = v;
    }
  }
  return out as T;
}

/* ───────────────────────────── Env overrides ───────────────────────────── */

function envOverrides(): any {
  const env = process.env;
  return {
    server: {
      port: env.PORT ? parseInt(env.PORT, 10) : undefined,
      nodeEnv: env.NODE_ENV,
    },
    cors: {
      origins: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    },
    cookies: {
      secure: env.COOKIE_SECURE === 'true' ? true : env.COOKIE_SECURE === 'false' ? false : undefined,
      domain: env.COOKIE_DOMAIN || undefined,
    },
    database: {
      url: env.DATABASE_URL,
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT ? parseInt(env.POSTGRES_PORT, 10) : undefined,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
    },
    session: { secret: env.SESSION_SECRET },
    admin: { signupPasscode: env.ADMIN_SIGNUP_PASSCODE },
  };
}

/* ───────────────────────────── Build config ───────────────────────────── */

function build(): AppConfig {
  // Defaults → config.json → env (each layer wins over the previous)
  const merged = merge(merge(defaults, readJsonConfig()), envOverrides());

  // Build DATABASE_URL if not directly supplied
  const db = merged.database;
  const databaseUrl: string = db.url
    ?? `postgres://${db.user}:${encodeURIComponent(db.password || '')}@${db.host}:${db.port}/${db.database}`;

  const cfg: AppConfig = {
    server: { port: merged.server.port, nodeEnv: merged.server.nodeEnv },
    cors: { origins: merged.cors.origins },
    cookies: {
      secure: !!merged.cookies.secure,
      sameSite: (merged.cookies.sameSite ?? 'lax') as AppConfig['cookies']['sameSite'],
      domain: merged.cookies.domain || undefined,
      maxAgeDays: merged.cookies.maxAgeDays,
    },
    database: { url: databaseUrl, maxConnections: merged.database.maxConnections },
    session: { secret: merged.session.secret },
    admin: { signupPasscode: merged.admin.signupPasscode || null },
    security: merged.security,
    // Legacy flat aliases (back-compat for existing imports)
    nodeEnv: merged.server.nodeEnv,
    port: merged.server.port,
    databaseUrl,
    sessionSecret: merged.session.secret,
    corsOrigins: merged.cors.origins,
    cookieSecure: !!merged.cookies.secure,
    cookieDomain: merged.cookies.domain || undefined,
  };

  // Validation
  if (!cfg.session.secret) {
    throw new Error('Missing session.secret — set in config.json or via SESSION_SECRET env var.');
  }
  if (cfg.session.secret.length < 32 && cfg.server.nodeEnv === 'production') {
    throw new Error('session.secret must be at least 32 characters in production.');
  }
  if (!cfg.database.url || cfg.database.url.includes(':@') || cfg.database.url.endsWith('@')) {
    // Catch obviously empty URLs (e.g. empty password+host)
    if (!db.host || !db.user) {
      throw new Error('Database configuration incomplete — set database.url or database.{host,user,password,database} in config.json or POSTGRES_* env vars.');
    }
  }

  if (cfg.admin.signupPasscode && cfg.admin.signupPasscode.length < 8) {
    console.warn('[config] admin.signupPasscode is shorter than 8 characters — anyone who guesses it becomes a site admin.');
  }

  return cfg;
}

export const config = build();
