-- Crusade Commander schema (RAW-aligned with Warhammer 40k Crusade rules).
-- Idempotent.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

------------------------------------------------------------
-- Sessions (connect-pg-simple)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey' AND conrelid = '"session"'::regclass
    ) THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

------------------------------------------------------------
-- Users
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_site_admin BOOLEAN NOT NULL DEFAULT FALSE;

------------------------------------------------------------
-- Site settings (runtime-editable; complements file/env config)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

------------------------------------------------------------
-- Campaigns
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    current_phase INTEGER NOT NULL DEFAULT 1,
    phase_label TEXT NOT NULL DEFAULT 'Campaign Turn',
    default_battle_size TEXT NOT NULL DEFAULT 'Strike Force' CHECK (default_battle_size IN ('Incursion', 'Strike Force', 'Onslaught')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns(owner_id);

-- Campaign lifecycle (added later — idempotent additive ALTERs)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'setup'
    CHECK (state IN ('setup', 'active', 'concluded'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS concluded_at TIMESTAMPTZ;
-- Backfill: existing rows that were "active" with any battles → active; others → setup
DO $$ BEGIN
    UPDATE campaigns SET state = 'active', started_at = COALESCE(started_at, created_at)
        WHERE state = 'setup' AND is_active = true
          AND EXISTS (SELECT 1 FROM battles WHERE battles.campaign_id = campaigns.id);
    UPDATE campaigns SET state = 'concluded', concluded_at = COALESCE(concluded_at, now())
        WHERE state = 'setup' AND is_active = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS campaign_members (
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'participant'
        CHECK (role IN ('admin', 'participant')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (campaign_id, user_id)
);
-- Back-compat: add joined_at for older installs, remap legacy roles
ALTER TABLE campaign_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$ BEGIN
    BEGIN
        UPDATE campaign_members SET role = 'admin' WHERE role IN ('editor', 'owner');
        UPDATE campaign_members SET role = 'participant' WHERE role = 'viewer';
    EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

------------------------------------------------------------
-- Campaign invites (codes that grant access on accept)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_on_accept TEXT NOT NULL DEFAULT 'participant'
        CHECK (role_on_accept IN ('admin', 'participant')),
    label TEXT NOT NULL DEFAULT '',
    max_uses INTEGER NOT NULL DEFAULT 1,
    times_used INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS idx_invites_campaign ON campaign_invites(campaign_id);

------------------------------------------------------------
-- Crusade Forces
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crusade_forces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- which user controls this force
    name TEXT NOT NULL,                         -- e.g. "Destroyer Cult"
    player_name TEXT NOT NULL DEFAULT '',       -- the human's name
    faction TEXT NOT NULL DEFAULT '',           -- e.g. "Necrons"
    color_hex TEXT NOT NULL DEFAULT '#C0392B',
    supply_limit INTEGER NOT NULL DEFAULT 1000, -- starts 1000, +200 per Increase Supply Limit Req
    requisition_points INTEGER NOT NULL DEFAULT 5, -- starts 5, cap 10
    battle_tally INTEGER NOT NULL DEFAULT 0,
    victories INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forces_campaign ON crusade_forces(campaign_id);
CREATE INDEX IF NOT EXISTS idx_forces_user ON crusade_forces(user_id);

-- Force lifecycle (dropped vs active mid-campaign)
ALTER TABLE crusade_forces ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE crusade_forces ADD COLUMN IF NOT EXISTS dropped_at TIMESTAMPTZ;
-- Team / alliance grouping (free-form, e.g. "Imperium", "Chaos", "Xenos")
ALTER TABLE crusade_forces ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_forces_team ON crusade_forces(campaign_id, team);
-- One faction per user per campaign (partial: legacy NPC forces with NULL user_id allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_forces_user_campaign_unique
    ON crusade_forces(campaign_id, user_id)
    WHERE user_id IS NOT NULL;

------------------------------------------------------------
-- Units (Crusade Cards) — the heart of the system
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    force_id UUID NOT NULL REFERENCES crusade_forces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                  -- unique unit name, e.g. "Thekryst the Executioner"
    datasheet TEXT NOT NULL DEFAULT '',  -- e.g. "Skorpekh Lord"
    points_cost INTEGER NOT NULL DEFAULT 0,
    equipment TEXT NOT NULL DEFAULT '',
    is_character BOOLEAN NOT NULL DEFAULT FALSE,
    is_titanic BOOLEAN NOT NULL DEFAULT FALSE,
    is_epic_hero BOOLEAN NOT NULL DEFAULT FALSE,
    is_fortification BOOLEAN NOT NULL DEFAULT FALSE,
    is_swarm BOOLEAN NOT NULL DEFAULT FALSE,
    xp INTEGER NOT NULL DEFAULT 0,
    crusade_points INTEGER NOT NULL DEFAULT 0,
    battles_played INTEGER NOT NULL DEFAULT 0,
    battles_survived INTEGER NOT NULL DEFAULT 0,
    units_destroyed INTEGER NOT NULL DEFAULT 0, -- enemy units destroyed cumulative
    can_exceed_30_xp BOOLEAN NOT NULL DEFAULT FALSE, -- set by Legendary Veterans Requisition
    is_active BOOLEAN NOT NULL DEFAULT TRUE,         -- false = permanently destroyed
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_force ON units(force_id);

------------------------------------------------------------
-- Battle Honours (per-unit, max 3 / 6)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS battle_honours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('Battle Trait', 'Weapon Modification', 'Crusade Relic', 'Enhancement')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    weapon_name TEXT NOT NULL DEFAULT '',        -- target weapon (for Weapon Modifications)
    relic_category TEXT,                          -- 'Artificer' | 'Antiquity' | 'Legendary' (for Crusade Relic)
    crusade_points_value INTEGER NOT NULL DEFAULT 1, -- 1 (Trait/WM/Artificer), 2 (Antiquity/Titanic), 3 (Legendary)
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_honours_unit ON battle_honours(unit_id);

------------------------------------------------------------
-- Battle Scars (per-unit, max 3)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS battle_scars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name IN ('Crippling Damage', 'Battle-weary', 'Fatigued', 'Disgraced', 'Mark of Shame', 'Deep Scars')),
    description TEXT NOT NULL DEFAULT '',
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scars_unit ON battle_scars(unit_id);

------------------------------------------------------------
-- Battles
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS battles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    battle_size TEXT NOT NULL CHECK (battle_size IN ('Incursion', 'Strike Force', 'Onslaught')),
    mission_name TEXT NOT NULL DEFAULT '',
    attacker_force_id UUID NOT NULL REFERENCES crusade_forces(id) ON DELETE CASCADE,
    defender_force_id UUID NOT NULL REFERENCES crusade_forces(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL CHECK (outcome IN ('Attacker Wins', 'Defender Wins', 'Draw')),
    notes TEXT NOT NULL DEFAULT '',
    campaign_phase INTEGER NOT NULL DEFAULT 1,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_battles_campaign ON battles(campaign_id);

-- Battle confirmation workflow (idempotent column additions)
ALTER TABLE battles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'disputed', 'cancelled'));
ALTER TABLE battles ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS confirmed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS dispute_reason TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(campaign_id, status);

------------------------------------------------------------
-- Per-unit battle records
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unit_battle_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    force_id UUID NOT NULL REFERENCES crusade_forces(id) ON DELETE CASCADE,
    was_warlord BOOLEAN NOT NULL DEFAULT FALSE,
    enemies_destroyed INTEGER NOT NULL DEFAULT 0,
    was_destroyed BOOLEAN NOT NULL DEFAULT FALSE,
    marked_for_greatness BOOLEAN NOT NULL DEFAULT FALSE,
    -- XP gained this battle (sum of: +1 BattleExp, +1 per 3 kills threshold crossed, +3 Marked)
    xp_gained INTEGER NOT NULL DEFAULT 0,
    -- Out of Action result (only relevant if was_destroyed): null = not tested, passed, devastating_blow, battle_scar
    ooa_result TEXT CHECK (ooa_result IN (NULL, 'passed', 'devastating_blow', 'battle_scar')),
    notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ubr_battle ON unit_battle_records(battle_id);
CREATE INDEX IF NOT EXISTS idx_ubr_unit ON unit_battle_records(unit_id);

------------------------------------------------------------
-- Requisition log (audit of RP spend)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requisition_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    force_id UUID NOT NULL REFERENCES crusade_forces(id) ON DELETE CASCADE,
    requisition_name TEXT NOT NULL,
    cost_paid INTEGER NOT NULL,
    target_unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    notes TEXT NOT NULL DEFAULT '',
    used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_req_force ON requisition_log(force_id);

------------------------------------------------------------
-- Redesign additions: richer battle / unit / force fields
-- (idempotent ALTERs so existing databases upgrade in place)
------------------------------------------------------------
ALTER TABLE battles ADD COLUMN IF NOT EXISTS attacker_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS defender_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS deployment TEXT NOT NULL DEFAULT '';
ALTER TABLE battles ADD COLUMN IF NOT EXISTS duration_turns INTEGER NOT NULL DEFAULT 0;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS opposing_commander TEXT NOT NULL DEFAULT '';

ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_type TEXT NOT NULL DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Reserve', 'Injured'));

ALTER TABLE crusade_forces ADD COLUMN IF NOT EXISTS commander TEXT NOT NULL DEFAULT '';
ALTER TABLE crusade_forces ADD COLUMN IF NOT EXISTS motto TEXT NOT NULL DEFAULT '';

-- Inline battle outcomes (applied when the battle is confirmed).
ALTER TABLE unit_battle_records ADD COLUMN IF NOT EXISTS grant_honour_json TEXT;
ALTER TABLE unit_battle_records ADD COLUMN IF NOT EXISTS grant_scar TEXT;
