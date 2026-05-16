import { one, query } from '../db/pool.js';

/**
 * Site-wide settings stored in the `site_settings` table.
 * Differ from src/config.ts (file/env-driven): these are runtime-editable
 * by site admins via /api/admin/settings.
 *
 * Keep keys simple (snake_case) and values JSON-serialisable.
 */

const cache = new Map<string, any>();

export async function getSetting<T = any>(key: string, fallback: T): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  const row = await one<{ value: any }>('SELECT value FROM site_settings WHERE key = $1', [key]);
  const value = row ? row.value : fallback;
  cache.set(key, value);
  return value as T;
}

export async function setSetting(key: string, value: any, userId: string | null = null): Promise<void> {
  await query(
    `INSERT INTO site_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), userId],
  );
  cache.set(key, value);
}

export async function getAllSettings(): Promise<Record<string, any>> {
  const rows = await query<{ key: string; value: any }>('SELECT key, value FROM site_settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function clearSettingsCache(): void {
  cache.clear();
}

/** Setting keys recognised by the admin panel UI. */
export const KNOWN_SETTINGS = {
  default_domain: {
    description: 'Base URL used to build shareable links (e.g. invite URLs). Include scheme: https://...',
    default: '' as string | null,
    type: 'string' as const,
  },
  server_port: {
    description: 'Port the API server binds to. Restart the app container for changes to apply. Leave blank to use the PORT env var (default 3000).',
    default: null as number | null,
    type: 'port' as const,
  },
} as const;

export type SettingKey = keyof typeof KNOWN_SETTINGS;
