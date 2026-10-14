-- =============================================================================
-- Archive instead of delete — administrators can archive a participant, not
-- remove one. Run in: Supabase → SQL Editor → New Query → Run (safe to re-run)
--
-- Prerequisites: supabase-setup.sql, admin-policies.sql
--
-- An archived participant is hidden from the admin dashboard, its charts and
-- the CSV export by default, and can be restored at any time. Nothing is
-- deleted: the profile, sessions and responses stay in place and still fall
-- under the three-year purge like everything else.
--
-- What makes this safe:
--   - Only the two administrator accounts can archive or restore, through one
--     function; the anonymous role has no grant and a non-administrator caller
--     is refused inside the function as well.
--   - A participant cannot archive or restore themselves: a trigger refuses any
--     change to the archive columns from a non-administrator, even though they
--     may update their own profile row.
--   - Administrator accounts cannot be archived.
--   - The administrator DELETE policies and the reset-test-data function from
--     admin-delete-and-reset.sql are removed, so deletion is not an
--     administrator action anywhere, not only in the dashboard. Participants'
--     own delete_previous_attempt() is SECURITY DEFINER and is unaffected.
-- =============================================================================

alter table public.users
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

create index if not exists idx_users_archived_at on public.users (archived_at);

-- Archive or restore one participant. Returns the row's new archive state.
create or replace function public.set_participant_archived(p_user_id uuid, p_archived boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_admins constant text[] := array[
    'mushfiqurr@students.federation.edu.au',
    'sally.firmin@federation.edu.au'
  ];
  v_caller text := lower(coalesce(auth.email(), ''));
  v_target text;
  v_at     timestamptz;
begin
  if v_caller = '' or not (v_caller = any(c_admins)) then
    raise exception 'Only an administrator can archive or restore a participant'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A participant id is required' using errcode = '22023';
  end if;

  select lower(coalesce(email, '')) into v_target from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Participant not found' using errcode = 'P0002';
  end if;
  if v_target = any(c_admins) then
    raise exception 'Administrator accounts cannot be archived' using errcode = '42501';
  end if;

  update public.users
     set archived_at = case when p_archived then now() else null end,
         archived_by = case when p_archived then v_caller else null end
   where id = p_user_id
   returning archived_at into v_at;

  return jsonb_build_object('user_id', p_user_id, 'archived', p_archived, 'archived_at', v_at);
end;
$$;

revoke all   on function public.set_participant_archived(uuid, boolean) from public, anon;
grant execute on function public.set_participant_archived(uuid, boolean) to authenticated;

-- Participants may update their own profile row (supabase-setup.sql), but not
-- the archive columns.
create or replace function public.users_guard_archive()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.archived_at is distinct from old.archived_at
      or new.archived_by is distinct from old.archived_by)
     and lower(coalesce(auth.email(), '')) not in (
       'mushfiqurr@students.federation.edu.au',
       'sally.firmin@federation.edu.au'
     ) then
    raise exception 'Only an administrator can archive or restore a participant'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_archive on public.users;
create trigger users_guard_archive
  before update on public.users
  for each row execute function public.users_guard_archive();

-- Deletion is not an administrator action.
drop policy if exists "admins_delete_sessions"  on public.sessions;
drop policy if exists "admins_delete_responses" on public.responses;
drop policy if exists "admins_delete_users"     on public.users;
drop function if exists public.admin_reset_test_data();


-- =============================================================================
-- VERIFY (optional):
--   select id, email, archived_at, archived_by from public.users where archived_at is not null;
--   select policyname from pg_policies where policyname like 'admins_delete%';   -- none
-- =============================================================================
