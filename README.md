# Crusade Commander — Server

Self-hostable Warhammer 40k Crusade campaign tracker. Manage Orders of Battle, record battles with two-player confirmation, hand out battle honours and scars, run requisitions, invite friends with codes, transfer ownership — all of it.

> The native SwiftUI iOS client lives in a separate repository:
> <https://github.com/fatapollo/CrusadeCommander-iOS>

```
.
├── docker-compose.yml             Orchestrates db + app
├── Dockerfile                     Multi-stage build (frontend + backend → 1 image)
├── .env.example                   Copy to .env and fill in
├── frontend/                      React + Vite + Tailwind web client
└── backend/                       Node + Express + Postgres API + RAW rules engine
```

## One-command run

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -base64 48)
docker compose up --build
```

Open <http://localhost:3000/>. That's it — API and web are served from the same port; the `app` container migrates Postgres on boot and serves the built React bundle.

## Updating

```bash
git pull            # if version-controlled
docker compose up --build
```

## Backup / restore

The DB lives in the named volume `db-data`. Backup:

```bash
docker compose exec db pg_dump -U crusade crusade | gzip > crusade-$(date +%F).sql.gz
```

Restore:

```bash
gunzip -c crusade-2026-05-15.sql.gz | docker compose exec -T db psql -U crusade crusade
```

## Local development (hot reload)

```bash
docker compose up -d db                      # bring up Postgres only
cd backend && npm install && npm run dev     # API on :3000 (tsx watch)
cd ../frontend && npm install && npm run dev # Web on :5173 (Vite + /api proxy)
```

The Vite config proxies `/api/*` to `localhost:3000` so the browser sees same-origin cookies.

## Configuration

Three layered sources, highest precedence wins:

1. Built-in defaults in `backend/src/config.ts`
2. `backend/config.json` (non-secret defaults)
3. Environment variables from `.env` / `docker compose`

Runtime-editable settings (e.g. **Default Domain** used for shareable invite links) live in the `site_settings` table and are edited from `/admin → Settings`.

## Becoming the first site admin

Set `ADMIN_SIGNUP_PASSCODE=somesecret` in `.env`, restart. On the sign-up form, click *"I have an admin passcode"* and enter the value — that account becomes `is_site_admin = true`. From there you can promote/demote users, reset passwords, transfer or delete campaigns, and invite anyone from `/admin`.

## iOS app

The SwiftUI iOS client lives in its own repo: <https://github.com/fatapollo/CrusadeCommander-iOS>. It talks to this same JSON API. First launch asks for your server URL:

- `http://localhost:3000` from the iOS simulator
- `http://<your-LAN-ip>:3000` from a real iPhone on your network
- `https://your-public-domain.com` once you've put the container behind a TLS-terminating reverse proxy

## Putting it on the public internet

Don't expose the container's plain HTTP port directly. Use a reverse proxy for TLS:

- **Caddy** (one line): `your-domain.com { reverse_proxy localhost:3000 }`
- **Nginx** / **Traefik** / **Cloudflare Tunnel** all work fine

Once HTTPS is terminating, set `COOKIE_SECURE=true` and optionally `COOKIE_DOMAIN=.your-domain.com` in `.env` and restart. Session cookies will then be `Secure; SameSite=Strict`.

## Unraid deployment

Extra files for Unraid live at the repo root:

- `docker-compose.unraid.yml` — Postgres data as an appdata bind mount, prebuilt-image aware
- `unraid-template.xml` — Community Applications template (app container)
- `.github/workflows/docker-publish.yml` — builds & pushes the image to GHCR

**Recommended path — Compose Manager plugin:**

1. Push this repo to GitHub. The Actions workflow builds and pushes
   `ghcr.io/<owner>/crusade-commander:latest` to GHCR. Make the package
   **public** (GitHub → Packages → Package settings → visibility).
2. Install the **Compose Manager** plugin on Unraid. Create a stack and add
   `docker-compose.unraid.yml` plus a production `.env` with:

   ```
   POSTGRES_PASSWORD=<strong random>
   SESSION_SECRET=<openssl rand -base64 48>
   PUBLIC_URL=https://crusade.yourdomain.com
   COOKIE_SECURE=true
   ADMIN_SIGNUP_PASSCODE=<your secret>
   APPDATA=/mnt/user/appdata
   CRUSADE_IMAGE=ghcr.io/<owner>/crusade-commander:latest
   ```
3. **Compose Up.** Postgres data persists at
   `/mnt/user/appdata/crusade-db`; the app migrates the schema on boot.
4. Front it with SWAG / Nginx Proxy Manager → `crusade-app:3000` for HTTPS.

**Alternative — native Docker UI:** run an official `postgres:16-alpine`
container (appdata at `/mnt/user/appdata/crusade-db`), then add the app via
`unraid-template.xml` (replace `OWNER` with your GitHub user first). Put both
on the same custom Docker network so the app resolves the DB by name, and set
`DATABASE_URL` accordingly.

> ⚠️ The in-app **server_port** setting only changes the container's internal
> port — it does *not* change the Unraid host mapping. Leave it blank and keep
> the container on `3000`; do all remapping at the port mapping / reverse
> proxy.

## Stack notes

- **Backend**: Node 20, Express 4, PostgreSQL 16, `connect-pg-simple` sessions, bcrypt cost 12, `helmet` + `express-rate-limit`, Zod validation
- **Frontend**: React 18, Vite 5, TanStack Query, React Router 6, Tailwind 3
- **iOS**: SwiftUI, URLSession with HTTPCookieStorage (transparent session persistence), iOS 17+
- **One Postgres schema** is the source of truth — the iOS and web clients both speak the same JSON API
- **NewRecruit roster import** — paste a plain-text export into any Force's Order of Battle and have it parsed into units (characters, points, equipment, enhancements all recognised)
