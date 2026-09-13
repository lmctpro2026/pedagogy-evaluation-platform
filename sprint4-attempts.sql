-- =============================================================================
-- Sprint 4 — Attempt rules, 3-year retention, anonymous-on-completion
-- Run ONCE in: Supabase → SQL Editor → New Query → Run   (safe to re-run)
--
-- Prerequisites: supabase-setup.sql, admin-policies.sql, sprint3-demographics.sql
--
-- Rules this enforces (client, Sprint 4 planning):
--   1. Anonymous participants: nothing is written until they submit a complete
--      assessment. The session + all 20 responses are then stored in one
--      transaction, with no user attached.
--   2. Signed-in participants: one result per calendar year (Australia/Melbourne).
--      Submitting again in the same year replaces that year's result — the
--      previous attempt and its responses/demographics are deleted.
--   3. Retention: assessment data is kept for 3 years, then purged.
--
-- Scores are recalculated here from the answers, so a client cannot store a
-- score that does not match its responses.
-- =============================================================================

create index if not exists idx_sessions_user_completed on public.sessions(user_id, completed_at);


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
-- 2. submit_assessment — the single write path for a completed assessment.
--
--   p_responses          {"q01": 4, "q02": 5, ... "q20": 3}  (all active questions, 1–5)
--   p_session_id         optional in-progress session created for a signed-in user
--   p_participant_email  optional email (anonymous participants may leave it null)
--
-- Returns { session_id, scores: {TP,PD,TA,TPP}, replaced, year }
-- ---------------------------------------------------------------------------
create or replace function public.submit_assessment(
  p_responses         jsonb,
  p_session_id        uuid default null,
  p_participant_email text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid    := auth.uid();
  v_registered boolean := v_uid is not null
                          and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
  v_expected   integer;
  v_valid      integer;
  v_keys       integer;
  v_sid        uuid;
  v_tp integer; v_pd integer; v_ta integer; v_tpp integer;
  v_year       integer := extract(year from (now() at time zone 'Australia/Melbourne'))::integer;
  v_replaced   integer := 0;
  v_email      text    := nullif(lower(trim(coalesce(p_participant_email, ''))), '');
begin
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

  if v_registered then
    -- Reuse the user's own in-progress session when one was passed in.
    if p_session_id is not null then
      select id into v_sid from public.sessions
       where id = p_session_id and user_id = v_uid and completed_at is null;
    end if;
    if v_sid is null then
      insert into public.sessions (user_id, participant_email)
      values (v_uid, coalesce(v_email, lower(auth.email())))
      returning id into v_sid;
    end if;
  else
    -- Anonymous: the first and only write happens here, on completion.
    insert into public.sessions (user_id, participant_email)
    values (null, v_email)
    returning id into v_sid;
  end if;

  update public.sessions
     set score_tp = v_tp, score_pd = v_pd, score_ta = v_ta, score_tpp = v_tpp,
         completed_at = now()
   where id = v_sid;

  delete from public.responses where session_id = v_sid;
  insert into public.responses (session_id, question_id, category, answer_value)
  select v_sid, q.code, q.category, (e.value::text)::int
    from jsonb_each(p_responses) e
    join public.questions q on q.code = e.key and q.is_active;

  if v_registered then
    -- Only the current attempt counts for this year: remove this year's earlier
    -- results and any abandoned in-progress sessions. Cascades to responses
    -- and demographics. Earlier years are kept for comparison.
    delete from public.sessions
     where user_id = v_uid
       and id <> v_sid
       and (completed_at is null
            or extract(year from (completed_at at time zone 'Australia/Melbourne'))::integer = v_year);
    get diagnostics v_replaced = row_count;
  end if;

  perform public.purge_expired_assessments();

  return jsonb_build_object(
    'session_id', v_sid,
    'scores',     jsonb_build_object('TP', v_tp, 'PD', v_pd, 'TA', v_ta, 'TPP', v_tpp),
    'replaced',   v_replaced,
    'year',       v_year
  );
end;
$$;

revoke all   on function public.submit_assessment(jsonb, uuid, text) from public;
grant execute on function public.submit_assessment(jsonb, uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Daily purge via pg_cron, when the extension is available on the project.
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
-- 4. One-off clean-up of existing data so it already follows the rules:
--    keep each signed-in user's latest completed result per year, and drop
--    anything past the retention window.
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
 where s.id = ranked.id and ranked.rn > 1;

select public.purge_expired_assessments();


-- =============================================================================
-- VERIFY (optional):
--   select proname from pg_proc where proname in ('submit_assessment','purge_expired_assessments');
--   select jobname, schedule from cron.job;   -- only if pg_cron is enabled
-- =============================================================================
