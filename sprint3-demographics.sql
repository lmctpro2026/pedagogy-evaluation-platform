-- =============================================================================
-- Sprint 3 — Optional demographic collection
-- Run ONCE in: Supabase → SQL Editor → New Query → Run
--
-- Safe to run on the live database: additive only. It creates one new table and
-- its policies. It does NOT touch users / questions / sessions / responses.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DEMOGRAPHICS — one row per session, written after the survey completes.
--    `provided = false` records a participant who was asked and declined, so
--    the admin dashboard can report an honest opt-in rate.
-- ---------------------------------------------------------------------------
create table if not exists public.demographics (
  id             uuid        primary key default uuid_generate_v4(),
  session_id     uuid        not null unique references public.sessions(id) on delete cascade,
  provided       boolean     not null default true,
  age_group      text,
  gender         text,
  gender_other   text,
  academic_level text,
  created_at     timestamptz default now(),

  constraint demographics_age_group_chk check (
    age_group is null or age_group in
      ('under-25','25-34','35-44','45-54','55-64','65-plus','undisclosed')
  ),
  constraint demographics_gender_chk check (
    gender is null or gender in ('male','female','other','undisclosed')
  ),
  constraint demographics_academic_level_chk check (
    academic_level is null or academic_level in ('A','B','C','D','E','other','undisclosed')
  ),
  -- Free-text is only meaningful alongside gender = 'other', and is length-capped
  -- because this column is writable by unauthenticated participants.
  constraint demographics_gender_other_chk check (
    gender_other is null or (gender = 'other' and char_length(gender_other) <= 60)
  )
);

create index if not exists idx_demographics_session on public.demographics(session_id);


-- ---------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
--    Same posture as `responses`: any participant may write their own row
--    (they are frequently anonymous), but reads are restricted to the owner
--    and to the two admin accounts.
--    No UPDATE or DELETE policy exists by design — a demographics row is
--    write-once, so knowing a session UUID does not let anyone overwrite it.
-- ---------------------------------------------------------------------------
alter table public.demographics enable row level security;

drop policy if exists "Anyone can insert demographics" on public.demographics;
create policy "Anyone can insert demographics"
  on public.demographics for insert with check (true);

drop policy if exists "Users read own demographics" on public.demographics;
create policy "Users read own demographics"
  on public.demographics for select using (
    session_id in (select id from public.sessions where user_id = auth.uid())
  );

drop policy if exists "admins_read_all_demographics" on public.demographics;
create policy "admins_read_all_demographics"
  on public.demographics for select to authenticated
  using (
    auth.email() in (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  );


-- =============================================================================
-- VERIFY (optional) — should return the three policies above:
--   select policyname, cmd from pg_policies where tablename = 'demographics';
-- =============================================================================
