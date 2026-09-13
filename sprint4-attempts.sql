-- =============================================================================
-- Sprint 4 — Attempts, 3-year history, 10-minute sessions, store-on-completion
-- Run in: Supabase → SQL Editor → New Query → Run   (safe to re-run, and safe to
-- run over the earlier version of this file)
--
-- Prerequisites: supabase-setup.sql, admin-policies.sql, sprint3-demographics.sql
--
-- Rules this enforces (Sprint 4 backlog):
--   1. Store on completion. Nothing about an evaluation is written while it is in
--      progress — for anonymous AND signed-in participants. The session and all
--      20 responses are stored in one transaction when the participant submits.
--   2. 10-minute session. An evaluation must be submitted within 10 minutes of
--      starting (plus 1 minute of grace for slow networks). Late submissions are
--      rejected with SESSION_EXPIRED and nothing is stored.
--   3. Two attempts per year. A signed-in participant keeps at most two attempts
--      per calendar year (Australia/Melbourne): the current (newest) one and the
--      previous one. The newest attempt is always the active result. The
--      participant can delete/override the previous attempt, at submission time
--      or later from their dashboard; their newest attempt can't be deleted.
--   4. 3-year history. Attempts older than 3 years are purged.
--
-- Scores are recalculated here from the answers, so a client cannot store a
-- score that does not match its responses.
-- =============================================================================

create index if not exists idx_sessions_user_completed on public.sessions(user_id, completed_at);

-- Earlier draft of this file had a different signature.
drop function if exists public.submit_assessment(jsonb, uuid, text);


-- ---------------------------------------------------------------------------
-- 1. Retention purge — anything older than 3 years.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_assessments()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  delete from public.sessions
   where coalesce(completed_at, created_at) < now() - interval '3 years';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_assessments() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. submit_assessment — the only write path for an evaluation.
--
--   p_responses          {"q01": 4, "q02": 5, ... "q20": 3}  (every active question, 1–5)
--   p_started_at         when the participant began the 10-minute session
--   p_replace_previous   signed-in only: delete this year's earlier attempt(s) so
--                        the new attempt is the only one kept
--   p_participant_email  optional email for the results copy
--
-- Returns { session_id, scores: {TP,PD,TA,TPP}, year, previous_id, removed }
--   previous_id — this year's previous attempt that is still kept (signed-in), or null
--   removed     — how many older attempts were deleted by this submission
-- ---------------------------------------------------------------------------
create or replace function public.submit_assessment(
  p_responses         jsonb,
  p_started_at        timestamptz,
  p_replace_previous  boolean default false,
  p_participant_email text    default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_limit      constant interval := interval '10 minutes';
  c_grace      constant interval := interval '1 minute';
  v_uid        uuid    := auth.uid();
  v_registered boolean := v_uid is not null
                          and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
  v_expected   integer;
  v_valid      integer;
  v_keys       integer;
  v_sid        uuid;
  v_prev       uuid;
  v_removed    integer := 0;
  v_tp integer; v_pd integer; v_ta integer; v_tpp integer;
  v_year       integer := extract(year from (now() at time zone 'Australia/Melbourne'))::integer;
  v_email      text    := nullif(lower(trim(coalesce(p_participant_email, ''))), '');
begin
  -- 10-minute session ------------------------------------------------------
  if p_started_at is null or p_started_at > now() + c_grace then
    raise exception 'A valid session start time is required' using errcode = '22023';
  end if;
  if now() - p_started_at > c_limit + c_grace then
    raise exception 'SESSION_EXPIRED: the 10-minute session ended before it was submitted'
      using errcode = 'P0001';
  end if;

  -- Answers ----------------------------------------------------------------
  if p_responses is null or jsonb_typeof(p_responses) <> 'object' then
    raise exception 'responses must be a JSON object' using errcode = '22023';
  end if;

  select count(*) into v_expected from public.questions where is_active;
  select count(*) into v_keys     from jsonb_object_keys(p_responses);
  select count(*) into v_valid
    from jsonb_each(p_responses) e
    join public.questions q on q.code = e.key and q.is_active
   where e.value::text ~ '^[1-5]$';

  if v_expected = 0 or v_valid <> v_expected or v_keys <> v_expected then
    raise exception 'All % questions must be answered with a value from 1 to 5', v_expected
      using errcode = '22023';
  end if;

  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    v_email := null;
  end if;

  -- Category score = weighted sum / weighted max × 100 (matches js/scoring.js).
  select
    round(100.0 * sum((e.value::text)::int * q.weight) filter (where q.category = 'TP')
                / nullif(sum(5 * q.weight) filter (where q.category = 'TP'), 0)),
    round(100.0 * sum((e.value::text)::int * q.weight) filter (where q.category = 'PD')
                / nullif(sum(5 * q.weight) filter (where q.category = 'PD'), 0)),
    round(100.0 * sum((e.value::text)::int * q.weight) filter (where q.category = 'TA')
                / nullif(sum(5 * q.weight) filter (where q.category = 'TA'), 0)),
    round(100.0 * sum((e.value::text)::int * q.weight) filter (where q.category = 'TPP')
                / nullif(sum(5 * q.weight) filter (where q.category = 'TPP'), 0))
  into v_tp, v_pd, v_ta, v_tpp
  from jsonb_each(p_responses) e
  join public.questions q on q.code = e.key and q.is_active;

  -- Store — the first and only write for this evaluation --------------------
  insert into public.sessions
    (user_id, participant_email, score_tp, score_pd, score_ta, score_tpp, created_at, completed_at)
  values
    (case when v_registered then v_uid end,
     case when v_registered then coalesce(v_email, lower(auth.email())) else v_email end,
     v_tp, v_pd, v_ta, v_tpp, p_started_at, now())
  returning id into v_sid;

  insert into public.responses (session_id, question_id, category, answer_value)
  select v_sid, q.code, q.category, (e.value::text)::int
    from jsonb_each(p_responses) e
    join public.questions q on q.code = e.key and q.is_active;

  -- Two attempts per year (signed-in) --------------------------------------
  if v_registered then
    -- Rows from the old "create at start" flow are not evaluations.
    delete from public.sessions where user_id = v_uid and completed_at is null;

    if p_replace_previous then
      delete from public.sessions
       where user_id = v_uid and id <> v_sid and completed_at is not null
         and extract(year from (completed_at at time zone 'Australia/Melbourne'))::integer = v_year;
      get diagnostics v_removed = row_count;
    else
      -- Keep the newest earlier attempt as "previous"; anything older this year goes.
      delete from public.sessions
       where id in (
         select id from public.sessions
          where user_id = v_uid and id <> v_sid and completed_at is not null
            and extract(year from (completed_at at time zone 'Australia/Melbourne'))::integer = v_year
          order by completed_at desc
          offset 1);
      get diagnostics v_removed = row_count;

      select id into v_prev from public.sessions
       where user_id = v_uid and id <> v_sid and completed_at is not null
         and extract(year from (completed_at at time zone 'Australia/Melbourne'))::integer = v_year
       order by completed_at desc
       limit 1;
    end if;
  end if;

  perform public.purge_expired_assessments();

  return jsonb_build_object(
    'session_id',  v_sid,
    'scores',      jsonb_build_object('TP', v_tp, 'PD', v_pd, 'TA', v_ta, 'TPP', v_tpp),
    'year',        v_year,
    'previous_id', v_prev,
    'removed',     v_removed
  );
end;
$$;

revoke all   on function public.submit_assessment(jsonb, timestamptz, boolean, text) from public;
grant execute on function public.submit_assessment(jsonb, timestamptz, boolean, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. delete_previous_attempt — a signed-in participant deletes one of their own
--    earlier attempts. Their newest attempt is the active result and can't be
--    deleted. Responses and demographics cascade.
-- ---------------------------------------------------------------------------
create or replace function public.delete_previous_attempt(p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_completed timestamptz;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in to manage your attempts' using errcode = '42501';
  end if;

  select completed_at into v_completed
    from public.sessions
   where id = p_session_id and user_id = v_uid and completed_at is not null;
  if not found then
    raise exception 'Attempt not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.sessions
                  where user_id = v_uid and completed_at > v_completed) then
    raise exception 'Your most recent attempt is your active result and can''t be deleted'
      using errcode = '22023';
  end if;

  delete from public.sessions where id = p_session_id;
  return jsonb_build_object('deleted', p_session_id);
end;
$$;

revoke all   on function public.delete_previous_attempt(uuid) from public;
grant execute on function public.delete_previous_attempt(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Daily purge via pg_cron, when the extension is available on the project.
--    If it is not, the purge still runs on every submission (above).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('ped-purge-expired-assessments', '15 3 * * *',
                          'select public.purge_expired_assessments()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. One-off clean-up so existing data follows the rules:
--    at most two attempts per signed-in user per year, no abandoned
--    "in progress" rows older than a day, nothing past 3 years.
-- ---------------------------------------------------------------------------
delete from public.sessions s
 using (
   select id,
          row_number() over (
            partition by user_id, extract(year from (completed_at at time zone 'Australia/Melbourne'))
            order by completed_at desc
          ) as rn
     from public.sessions
    where user_id is not null and completed_at is not null
 ) ranked
 where s.id = ranked.id and ranked.rn > 2;

delete from public.sessions
 where completed_at is null and created_at < now() - interval '1 day';

select public.purge_expired_assessments();


-- =============================================================================
-- VERIFY (optional):
--   select proname from pg_proc
--    where proname in ('submit_assessment','delete_previous_attempt','purge_expired_assessments');
--   select jobname, schedule from cron.job;   -- only if pg_cron is enabled
-- =============================================================================
