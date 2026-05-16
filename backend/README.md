# Crusade Commander — Backend

Dockerised Node.js + TypeScript + PostgreSQL backend for the Warhammer 40k narrative campaign manager. Mirrors the iOS app's domain logic (team influence, front-line rules, random node bonuses, configurable resources/events/rewards) with secure session-based authentication.

## Stack

- Node.js 20 + Express + TypeScript (strict)
- PostgreSQL 16 with JSONB for flexible per-campaign config
- `express-session` + `connect-pg-simple` (server-side sessions, DB-backed)
- `bcrypt` cost 12 for passwords
- `helmet` security headers, `express-rate-limit` on auth endpoints, CSRF-grade `httpOnly` cookies (`secure` + `sameSite=strict` in production)
- Zod for input validation
- Multi-stage Dockerfile, runs as non-root, behind `tini`

## Quick start

The canonical way to run the full stack is the top-level `docker-compose.yml`
(see `../README.md`). It builds the frontend, the backend, and orchestrates the
database in one container set.

For backend-only development against the dockerised DB:

```bash
# from the project root
docker compose up -d db   # bring up just Postgres

# in this directory:
cp .env.example .env
# set POSTGRES_PASSWORD + SESSION_SECRET (openssl rand -base64 48)
npm install
npm run migrate:dev
npm run dev   # tsx watch with hot reload on :3000
```

## API surface

All endpoints under `/api` return JSON. Send `Cookie: connect.sid=…` (browsers do this automatically with `credentials: 'include'`).

### Auth (`/api/auth`)
- `POST /register` — `{ email, password, display_name? }` → `{ user }`
- `POST /login` — `{ email, password }` → `{ user }`
- `POST /logout`
- `GET /me` — `{ user }` (401 if not signed in)

### Campaigns (`/api/campaigns`)
- `GET /` — list mine (owner or member)
- `POST /` — `{ name, description?, max_points?, phase_label?, load_defaults? }`
- `GET /:campaignId`
- `PATCH /:campaignId` — partial updates
- `DELETE /:campaignId` — owner only
- `POST /:campaignId/map/generate` — `{ planet_count, nodes_per_planet, layout, theme, bonus_chance?, replace_existing? }`

### Players (`/api/campaigns/:campaignId/players`)
- `GET /` — sorted by Crusade Points then wins
- `POST /` — `{ name, faction?, army_name?, team?, color_hex?, supply_limit?, crusade_points? }`
- `PATCH /:playerId`
- `DELETE /:playerId`
- `GET /:playerId/resources`
- `PATCH /:playerId/resources/:resourceTypeId` — `{ amount }`

### Battles (`/api/campaigns/:campaignId/battles`)
- `GET /` — list
- `GET /eligible-locations?attacker_id=…&defender_id=…` — front-line filtered nodes
- `POST /` — `{ attacker_id, defender_id, outcome, battle_section_id?, mission_name?, attacker_score?, defender_score?, notes?, applied_event_type_ids?, bypass_frontline_check? }`
  - Atomically: updates W/D/L, applies ±2 team influence on the section, transfers ownership when influence ≥ 3, applies any chosen event effects to resources.
- `DELETE /:battleId`

### Map Nodes (`/api/campaigns/:campaignId/nodes`)
- `GET /` · `POST /` · `PATCH /:nodeId` · `DELETE /:nodeId`
- `POST /:nodeId/connect/:otherId` — connect two nodes (bidirectional)
- `DELETE /:nodeId/connect/:otherId` — disconnect

### Resource Types (`/api/campaigns/:campaignId/resources`)
- `GET /` · `POST /` · `PATCH /:resourceTypeId` · `DELETE /:resourceTypeId`
- Creating a resource auto-seeds it for every existing player.

### Event Types & Log (`/api/campaigns/:campaignId/events`)
- `GET /types` · `POST /types` · `PATCH /types/:typeId` · `DELETE /types/:typeId`
- `GET /log` — historical event instances
- `POST /log` — log a narrative event

### Reward Types & Grants (`/api/campaigns/:campaignId/rewards`)
- `GET /types` · `POST /types` · `PATCH /types/:typeId` · `DELETE /types/:typeId`
- `GET /granted` — player rewards history
- `POST /grant` — `{ player_id, reward_type_id, unit_name?, notes? }` (auto-applies bonuses)

## Domain rules

Mirrors the iOS app:

- **Capture threshold:** team influence ≥ 3 captures a node.
- **Battle outcomes:** Win = +2 influence for winner's team, -2 for loser's team (clamped at 0). Draws are neutral.
- **Front-line restriction:** a battle at node N requires both teams to either control N or control a neighbour of N. The server enforces this; clients can pass `bypass_frontline_check: true` for admin overrides.
- **Random bonuses:** generated maps can roll one of `+50 Points`, `Orbital Laser Strike`, `Reinforcements`, `Fortified Position`, `Air Supremacy`, `Strategic Reserve`, `Ammo Cache`, `Scrying Array`.
- **Event effects:** declarative `{ resource_type_name, target, operation, amount }` apply automatically when an event type is attached to a battle.

## Security checklist

- ✅ Server-side sessions in Postgres (not stateless tokens) — easy revocation
- ✅ `httpOnly` cookies — JS cannot read the session id
- ✅ `secure` + `sameSite=strict` enforced when `COOKIE_SECURE=true` (production)
- ✅ Bcrypt cost 12, minimum 8-char passwords
- ✅ Constant-time-ish login flow (dummy hash on missing user) — limits enumeration
- ✅ Rate limit on `/auth/login` and `/auth/register` (10 / 15min)
- ✅ Helmet default security headers
- ✅ Per-campaign authorization middleware (`loadCampaign` + `requireWriteAccess`)
- ✅ Postgres parameterized queries everywhere — no SQL string concat
- ✅ Non-root container user, `tini` PID 1, multi-stage build
- ⚠ Behind a reverse proxy (Caddy/Nginx) for HTTPS in production. Set `COOKIE_SECURE=true` once TLS is terminated.

## File layout

```
backend/
├── Dockerfile               multi-stage build
├── docker-compose.yml       db + api
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── server.ts            entry point
│   ├── config.ts            typed env config
│   ├── types.ts             domain types
│   ├── db/
│   │   ├── pool.ts          pg pool + helpers (query, one, tx)
│   │   ├── schema.sql       idempotent migration
│   │   └── migrate.ts       runs schema.sql on container start
│   ├── auth/
│   │   ├── routes.ts        register/login/logout/me
│   │   └── session.d.ts     express-session type augmentation
│   ├── middleware/
│   │   ├── auth.ts          requireAuth, loadCampaign, requireWriteAccess
│   │   └── errors.ts        HttpError + asyncHandler + errorHandler
│   ├── services/
│   │   ├── frontline.ts     capture / influence / front-line rules
│   │   └── mapGen.ts        deterministic-ish map generator
│   └── routes/
│       ├── campaigns.ts
│       ├── players.ts
│       ├── battles.ts
│       ├── nodes.ts
│       ├── resources.ts
│       ├── events.ts
│       └── rewards.ts
```
