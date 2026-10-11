-- =============================================================================
-- Question bank — administrators edit the wording of the 20 statements
-- Run in: Supabase → SQL Editor → New Query → Run   (safe to re-run)
--
-- Prerequisites: supabase-setup.sql, admin-policies.sql
--
-- The questions table already holds the 20 statements; until now the platform
-- read the copy in js/questions.js. With this update the admin dashboard shows
-- the bank and lets an administrator change a statement's wording. Every page
-- that shows a statement (home page, questionnaire, admin responses) reads the
-- database first and falls back to the JS copy when it cannot be reached.
--
-- What makes this safe:
--   - Only the two admin emails can update (RLS); everyone can still read.
--   - Only the wording can change. Code, category, weight, order and active
--     flag are locked by a trigger, so the scoring model (5 statements per
--     category, equal weights) cannot be altered from the dashboard.
--   - Wording is trimmed and must be 10–400 characters.
--   - Each edit records when and by whom (updated_at, updated_by).
--   - Stored responses keep their answer values; an edit changes what future
--     participants read, not past data.
-- =============================================================================

alter table public.questions
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

-- Wording must be a real sentence, not blank or a novel.
alter table public.questions drop constraint if exists questions_text_length;
alter table public.questions
  add constraint questions_text_length
  check (char_length(btrim(text)) between 10 and 400);

-- Only the wording can change; stamp the edit.
create or replace function public.questions_guard_update()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code        is distinct from old.code
  or new.category    is distinct from old.category
  or new.weight      is distinct from old.weight
  or new.order_index is distinct from old.order_index
  or new.is_active   is distinct from old.is_active then
    raise exception 'Only the wording of a question can be edited'
      using errcode = '42501';
  end if;
  new.text       := btrim(new.text);
  new.updated_at := now();
  new.updated_by := lower(coalesce(auth.email(), ''));
  return new;
end;
$$;

drop trigger if exists questions_guard_update on public.questions;
create trigger questions_guard_update
  before update on public.questions
  for each row execute function public.questions_guard_update();

-- Admins may update; the select policy from supabase-setup.sql stays as is.
drop policy if exists "admins_update_questions" on public.questions;
create policy "admins_update_questions" on public.questions
  for update to authenticated
  using (
    auth.email() in (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  )
  with check (
    auth.email() in (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  );

grant select on public.questions to anon, authenticated;
grant update on public.questions to authenticated;


-- =============================================================================
-- VERIFY (optional):
--   select code, left(text, 40), updated_at, updated_by
--     from public.questions order by order_index;
--   select policyname from pg_policies where tablename = 'questions';
-- =============================================================================
