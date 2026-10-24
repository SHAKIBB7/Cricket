-- ==============================================================================
-- Cricket Scorer Pro — Supabase Schema & Row-Level Security (RLS) Policies
-- Authoritative Production Database Security Migration
-- ==============================================================================

-- 0. UNIFIED CALLER IDENTITY FUNCTION
-- Resolves the requesting user UID across both native Supabase Auth (auth.uid())
-- and Firebase Auth external identity JWT (auth.jwt() ->> 'sub').
-- Ensures unauthenticated calls return NULL, preventing client user_id spoofing.
CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS TEXT AS $$
    SELECT COALESCE(
        auth.jwt() ->> 'sub',
        auth.uid()::text
    );
$$ LANGUAGE sql STABLE;


-- 1. MATCHES TABLE
CREATE TABLE IF NOT EXISTS public.matches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    team_a TEXT NOT NULL,
    team_b TEXT NOT NULL,
    toss_winner TEXT,
    toss_decision TEXT,
    total_overs INTEGER NOT NULL DEFAULT 6,
    status TEXT NOT NULL DEFAULT 'ONGOING',
    current_innings INTEGER NOT NULL DEFAULT 1,
    target_score INTEGER DEFAULT 0,
    venue TEXT,
    result TEXT,
    is_public BOOLEAN NOT NULL DEFAULT true,
    scorecard_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on user_id and updated_at for fast authenticated queries
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches (user_id);
CREATE INDEX IF NOT EXISTS idx_matches_updated_at ON public.matches (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_is_public ON public.matches (is_public);

-- Enable Row-Level Security
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Matches RLS Policies (Owner write, public or owner read)
DROP POLICY IF EXISTS "Users can only read own matches" ON public.matches;
DROP POLICY IF EXISTS "Public can view matches and owners can read own" ON public.matches;
DROP POLICY IF EXISTS "Users can read own matches and public matches" ON public.matches;

CREATE POLICY "Users can read own matches and public matches" 
    ON public.matches FOR SELECT 
    USING (is_public = true OR public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only insert own matches" ON public.matches;
CREATE POLICY "Users can only insert own matches" 
    ON public.matches FOR INSERT 
    WITH CHECK (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only update own matches" ON public.matches;
CREATE POLICY "Users can only update own matches" 
    ON public.matches FOR UPDATE 
    USING (public.requesting_user_id() = user_id)
    WITH CHECK (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only delete own matches" ON public.matches;
CREATE POLICY "Users can only delete own matches" 
    ON public.matches FOR DELETE 
    USING (public.requesting_user_id() = user_id);


-- 2. TEAMS TABLE
CREATE TABLE IF NOT EXISTS public.teams (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    captain TEXT,
    manager TEXT,
    players JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_user_id ON public.teams (user_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only read own teams" ON public.teams;
CREATE POLICY "Users can only read own teams" 
    ON public.teams FOR SELECT 
    USING (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only insert own teams" ON public.teams;
CREATE POLICY "Users can only insert own teams" 
    ON public.teams FOR INSERT 
    WITH CHECK (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only update own teams" ON public.teams;
CREATE POLICY "Users can only update own teams" 
    ON public.teams FOR UPDATE 
    USING (public.requesting_user_id() = user_id)
    WITH CHECK (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only delete own teams" ON public.teams;
CREATE POLICY "Users can only delete own teams" 
    ON public.teams FOR DELETE 
    USING (public.requesting_user_id() = user_id);


-- 3. TOURNAMENTS TABLE
CREATE TABLE IF NOT EXISTS public.tournaments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    format TEXT NOT NULL,
    tournament_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_user_id ON public.tournaments (user_id);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only read own tournaments" ON public.tournaments;
CREATE POLICY "Users can only read own tournaments" 
    ON public.tournaments FOR SELECT 
    USING (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only insert own tournaments" ON public.tournaments;
CREATE POLICY "Users can only insert own tournaments" 
    ON public.tournaments FOR INSERT 
    WITH CHECK (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only update own tournaments" ON public.tournaments;
CREATE POLICY "Users can only update own tournaments" 
    ON public.tournaments FOR UPDATE 
    USING (public.requesting_user_id() = user_id)
    WITH CHECK (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only delete own tournaments" ON public.tournaments;
CREATE POLICY "Users can only delete own tournaments" 
    ON public.tournaments FOR DELETE 
    USING (public.requesting_user_id() = user_id);


-- 4. GROUNDS TABLE
CREATE TABLE IF NOT EXISTS public.grounds (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    google_place_id TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grounds_user_id ON public.grounds (user_id);

ALTER TABLE public.grounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only read own grounds" ON public.grounds;
CREATE POLICY "Users can only read own grounds" 
    ON public.grounds FOR SELECT 
    USING (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only insert own grounds" ON public.grounds;
CREATE POLICY "Users can only insert own grounds" 
    ON public.grounds FOR INSERT 
    WITH CHECK (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only update own grounds" ON public.grounds;
CREATE POLICY "Users can only update own grounds" 
    ON public.grounds FOR UPDATE 
    USING (public.requesting_user_id() = user_id)
    WITH CHECK (public.requesting_user_id() = user_id);

DROP POLICY IF EXISTS "Users can only delete own grounds" ON public.grounds;
CREATE POLICY "Users can only delete own grounds" 
    ON public.grounds FOR DELETE 
    USING (public.requesting_user_id() = user_id);


-- 5. SECURE PUBLIC SPECTATOR VIEW
-- Excludes private owner ID (user_id) and internal tracking data.
-- Spectators, live scoring viewers, and broadcast widgets query this view.
CREATE OR REPLACE VIEW public.public_matches AS
SELECT
    id,
    team_a,
    team_b,
    toss_winner,
    toss_decision,
    total_overs,
    status,
    current_innings,
    target_score,
    venue,
    result,
    is_public,
    scorecard_data,
    created_at,
    updated_at
FROM public.matches
WHERE is_public = true;

-- Grant SELECT on public_matches to anonymous and authenticated users
GRANT SELECT ON public.public_matches TO anon, authenticated;
