-- =============================================================================
-- Pedagogy Evaluation Platform — Supabase Database Setup
-- Paste this entire file into: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. PROFILES — mirror of auth.users with display data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name   TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-create a profile row the moment a user registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 2. ASSESSMENT SESSIONS — one row per attempt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assessment_sessions (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode         TEXT        NOT NULL CHECK (mode IN ('email', 'register', 'anonymous')),
  started_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ,
  is_complete  BOOLEAN     DEFAULT false NOT NULL
);


-- ---------------------------------------------------------------------------
-- 3. RESPONSES — one row per question per session
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.responses (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  UUID        REFERENCES public.assessment_sessions(id) ON DELETE CASCADE NOT NULL,
  question_id TEXT        NOT NULL,                          -- e.g. "TP1", "PD3"
  category    TEXT        NOT NULL CHECK (category IN ('TP','PD','TA','TPP')),
  value       SMALLINT    NOT NULL CHECK (value BETWEEN 1 AND 5),
  answered_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (session_id, question_id)
);


-- ---------------------------------------------------------------------------
-- 4. SCORES — computed & stored once session is complete
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scores (
  session_id    UUID    REFERENCES public.assessment_sessions(id) ON DELETE CASCADE PRIMARY KEY,
  tp_score      NUMERIC(5,2),
  pd_score      NUMERIC(5,2),
  ta_score      NUMERIC(5,2),
  tpp_score     NUMERIC(5,2),
  overall_score NUMERIC(5,2),
  computed_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- ---------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores            ENABLE ROW LEVEL SECURITY;

-- Profiles: user sees only their own row
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Sessions: user sees only their own sessions
CREATE POLICY "sessions_self" ON public.assessment_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Responses: user sees only responses for their sessions
CREATE POLICY "responses_self" ON public.responses
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.assessment_sessions WHERE user_id = auth.uid()
    )
  );

-- Scores: user sees only scores for their sessions
CREATE POLICY "scores_self" ON public.scores
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.assessment_sessions WHERE user_id = auth.uid()
    )
  );

-- Allow anonymous inserts (no auth.uid()) — sessions created before sign-in
-- are local-only, but this gives room to save them later with the anon key
CREATE POLICY "sessions_anon_insert" ON public.assessment_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "responses_anon_insert" ON public.responses
  FOR INSERT WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- 6. HELPFUL INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON public.assessment_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_responses_session ON public.responses(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_cat     ON public.responses(category);


-- =============================================================================
-- Done! After running this, go to:
--   Supabase Dashboard → Authentication → Settings
--   → Disable "Confirm email" (toggle off) so users can log in immediately
--   → Set "Site URL" to https://lmctpro2026.github.io/pedagogy-evaluation-platform
--   → Add redirect URL: https://lmctpro2026.github.io/pedagogy-evaluation-platform/*
-- =============================================================================
