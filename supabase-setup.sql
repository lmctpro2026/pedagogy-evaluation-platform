-- =============================================================================
-- Pedagogy Evaluation Platform — Supabase Database Setup v2
-- Paste this entire file into: Supabase → SQL Editor → New Query → Run
-- =============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. USERS (mirrors Supabase Auth; auto-populated via trigger)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid        primary key default uuid_generate_v4(),
  email         text        unique,
  full_name     text,
  discipline    text,
  is_anonymous  boolean     default true,
  consent_given boolean     default false,
  created_at    timestamptz default now()
);

-- Auto-create a user row when someone registers via Supabase Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name, is_anonymous)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    (new.email is null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 2. QUESTIONS (seeded once; platform uses JS copies for speed)
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id          uuid    primary key default uuid_generate_v4(),
  code        text    unique not null,               -- 'q01' … 'q20'
  text        text    not null,
  category    text    not null check (category in ('TP','PD','TA','TPP')),
  weight      decimal default 1.0,
  order_index integer not null unique,
  is_active   boolean default true
);


-- ---------------------------------------------------------------------------
-- 3. SESSIONS (one row per assessment attempt)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id                uuid        primary key default uuid_generate_v4(),
  user_id           uuid        references public.users(id) on delete set null,
  participant_email text,
  score_tp          decimal,
  score_pd          decimal,
  score_ta          decimal,
  score_tpp         decimal,
  completed_at      timestamptz,
  created_at        timestamptz default now()
);


-- ---------------------------------------------------------------------------
-- 4. RESPONSES (one row per answer per session)
-- ---------------------------------------------------------------------------
create table if not exists public.responses (
  id           uuid        primary key default uuid_generate_v4(),
  session_id   uuid        references public.sessions(id) on delete cascade not null,
  question_id  text        not null,   -- 'q01' … 'q20'
  category     text        not null check (category in ('TP','PD','TA','TPP')),
  answer_value integer     check (answer_value between 1 and 5),
  answered_at  timestamptz default now(),
  unique (session_id, question_id)
);


-- ---------------------------------------------------------------------------
-- 5. INDEXES
-- ---------------------------------------------------------------------------
create index if not exists idx_sessions_completed  on public.sessions(completed_at);
create index if not exists idx_sessions_scores     on public.sessions(score_tp, score_pd, score_ta, score_tpp);
create index if not exists idx_responses_session   on public.responses(session_id);
create index if not exists idx_responses_category  on public.responses(category);


-- ---------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.users      enable row level security;
alter table public.questions  enable row level security;
alter table public.sessions   enable row level security;
alter table public.responses  enable row level security;

-- Questions: publicly readable
create policy "Questions are publicly readable"
  on public.questions for select using (is_active = true);

-- Users: own record only
create policy "Users read own record"
  on public.users for select using (auth.uid() = id);
create policy "Users update own record"
  on public.users for update using (auth.uid() = id);
create policy "Anyone can create a user record"
  on public.users for insert with check (true);

-- Sessions
create policy "Users read own sessions"
  on public.sessions for select using (auth.uid() = user_id);
create policy "Anyone can create a session"
  on public.sessions for insert with check (true);
create policy "Users update own session"
  on public.sessions for update using (auth.uid() = user_id);

-- Responses
create policy "Anyone can insert responses"
  on public.responses for insert with check (true);
create policy "Users read own responses"
  on public.responses for select using (
    session_id in (select id from public.sessions where user_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 7. SEED QUESTIONS (idempotent)
-- ---------------------------------------------------------------------------
insert into public.questions (code, text, category, order_index) values
  ('q01', 'I regularly reflect on my teaching practice to identify areas for improvement.',          'TP',  1),
  ('q02', 'I design learning experiences centred around the needs of my students.',                  'TP',  2),
  ('q03', 'I adjust my teaching strategies in response to student feedback and performance.',        'TP',  3),
  ('q04', 'I create opportunities for active learning and student participation in my classes.',     'TP',  4),
  ('q05', 'I assess whether my teaching methods are achieving the intended learning outcomes.',      'TP',  5),
  ('q06', 'I engage with current educational research and literature to inform my teaching.',        'PD',  6),
  ('q07', 'I participate in professional development activities related to pedagogy.',               'PD',  7),
  ('q08', 'I critically examine the theoretical underpinnings of my teaching philosophy.',          'PD',  8),
  ('q09', 'I collaborate with colleagues to develop and refine pedagogical approaches.',            'PD',  9),
  ('q10', 'I seek feedback from peers or mentors on my pedagogical practice.',                      'PD', 10),
  ('q11', 'I regularly explore new technologies that could enhance my teaching.',                   'TA', 11),
  ('q12', 'I feel confident using digital tools and platforms in my teaching.',                     'TA', 12),
  ('q13', 'I integrate technology in ways that support rather than replace good pedagogy.',         'TA', 13),
  ('q14', 'I evaluate the effectiveness of the technology tools I use in teaching.',               'TA', 14),
  ('q15', 'I help students develop digital literacy skills through my teaching.',                   'TA', 15),
  ('q16', 'I thoughtfully combine technology and pedagogy to create effective learning experiences.','TPP',16),
  ('q17', 'My use of technology is guided by clear pedagogical goals and student needs.',           'TPP',17),
  ('q18', 'I design technology-enhanced activities that promote higher-order thinking.',            'TPP',18),
  ('q19', 'I reflect on the relationship between technology and my pedagogical practice.',          'TPP',19),
  ('q20', 'Technology has meaningfully transformed my approach to teaching.',                       'TPP',20)
on conflict (code) do nothing;


-- =============================================================================
-- AFTER RUNNING THIS SQL, do these 3 things in the Supabase Dashboard:
--
--   Authentication → Settings:
--     1. Disable "Enable email confirmations"  ← so users can log in immediately
--     2. Enable  "Enable anonymous sign-ins"   ← for the Try Anonymously flow
--
--   Authentication → URL Configuration:
--     3. Set Site URL to your GitHub Pages URL
--        e.g.  https://lmctpro2026.github.io/pedagogy-evaluation-platform
--        Add the same URL + /* to Redirect URLs
-- =============================================================================
