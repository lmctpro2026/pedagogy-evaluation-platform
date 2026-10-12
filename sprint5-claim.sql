-- =============================================================================
-- Sprint 5 — Save an anonymous result to a new (or existing) account
-- Run in: Supabase → SQL Editor → New Query → Run   (safe to re-run)
--
-- Prerequisites: supabase-setup.sql, admin-policies.sql, sprint3-demographics.sql,
--                sprint4-attempts.sql
--
-- A participant can take the evaluation anonymously and, once it is submitted,
-- create an account (email + password, verified with the emailed 6-digit code)
-- or sign in to one. claim_assessment() then attaches that stored, anonymous
-- result to the signed-in account so it appears on their dashboard.
--
-- What makes this safe:
--   - Only a signed-in, non-anonymous user can call it (anon role has no grant).
--   - The session id is a random UUID that submit_assessment() returns only to
--     the browser that submitted it; nothing lets another caller list or guess
--     unclaimed sessions (RLS: users read their own rows, admins read all).
--   - A result can be claimed only once (user_id must still be null) and only
--     within 24 hours of completing it.
--   - The two-attempts-per-calendar-year rule from Sprint 4 is applied exactly
--     as for a fresh submission: the claimed result becomes the active one, the
--     newest earlier attempt that year is kept as "previous", anything older
--     that year is removed.
-- =============================================================================

create or replace function public.claim_assessment(p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_window     constant interval := interval '24 hours';
  v_uid        uuid    := auth.uid();
  v_registered boolean := v_uid is not null
                          and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
  v_email      text    := nullif(lower(trim(coalesce(auth.email(), ''))), '');
  v_completed  timestamptz;
  v_year       integer;
  v_prev       uuid;
  v_removed    integer := 0;
begin
  if not v_registered then
    raise exception 'Sign in to save results to your account' using errcode = '42501';
  end if;
  if p_session_id is null then
    raise exception 'A session id is required' using errcode = '22023';
  end if;

  -- Only a stored, completed, still-anonymous result can be claimed.
  select completed_at into v_completed
    from public.sessions
   where id = p_session_id and user_id is null and completed_at is not null
     for update;
  if not found then
    raise exception 'CLAIM_UNAVAILABLE: this result is not available to save'
      using errcode = 'P0002';
  end if;
  if now() - v_completed > c_window then
    raise exception 'CLAIM_EXPIRED: results can be saved to an account within 24 hours of completing'
      using errcode = 'P0001';
  end if;

  update public.sessions
     set user_id           = v_uid,
         participant_email = coalesce(v_email, participant_email)
   where id = p_session_id;

  v_year := extract(year from (v_completed at time zone 'Australia/Melbourne'))::integer;

  -- Two attempts per year: the claimed result plus the newest earlier attempt
  -- from the same year. Older attempts that year go, as on submission.
  delete from public.sessions
   where id in (
     select id from public.sessions
      where user_id = v_uid and id <> p_session_id and completed_at is not null
        and extract(year from (completed_at at time zone 'Australia/Melbourne'))::integer = v_year
      order by completed_at desc
      offset 1);
  get diagnostics v_removed = row_count;

  select id into v_prev from public.sessions
   where user_id = v_uid and id <> p_session_id and completed_at is not null
     and extract(year from (completed_at at time zone 'Australia/Melbourne'))::integer = v_year
   order by completed_at desc
   limit 1;

  return jsonb_build_object(
    'session_id',  p_session_id,
    'year',        v_year,
    'previous_id', v_prev,
    'removed',     v_removed
  );
end;
$$;

revoke all   on function public.claim_assessment(uuid) from public, anon;
grant execute on function public.claim_assessment(uuid) to authenticated;


-- =============================================================================
-- VERIFY (optional):
--   select proname, proacl from pg_proc where proname = 'claim_assessment';
-- =============================================================================
