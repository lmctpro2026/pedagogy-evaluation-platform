-- =============================================================================
-- DEMO DATA — Sprint 3 demonstration only.  OPTIONAL.
--
-- Creates eight fictional participants so the admin dashboard has something to
-- show: completed and in-progress sessions, registered and anonymous, and a
-- spread of demographics across all three charts.
--
-- SAFE TO REMOVE. Every row it creates uses an id beginning `ddddddd`, and the
-- cleanup block at the bottom of this file deletes exactly those rows and
-- nothing else. Real participant data is never touched.
--
-- ⚠ Run sprint3-demographics.sql FIRST — the demographics insert below depends
--   on that table existing.
--
-- Run in: Supabase → SQL Editor → New Query → Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Participants
--    Emails use the reserved .invalid TLD, so they can never reach a real inbox.
-- -----------------------------------------------------------------------------
insert into public.users (id, email, full_name, is_anonymous, created_at) values
  ('ddddddd0-0000-4000-8000-000000000001', 'a.hughes@demo.invalid',  'Amelia Hughes',  false, now() - interval '21 days'),
  ('ddddddd0-0000-4000-8000-000000000002', 'r.patel@demo.invalid',   'Rohan Patel',    false, now() - interval '18 days'),
  ('ddddddd0-0000-4000-8000-000000000003', 'j.okafor@demo.invalid',  'Joy Okafor',     false, now() - interval '15 days'),
  ('ddddddd0-0000-4000-8000-000000000004', null,                     null,             true,  now() - interval '12 days'),
  ('ddddddd0-0000-4000-8000-000000000005', 'l.chen@demo.invalid',    'Li Chen',        false, now() - interval '9 days'),
  ('ddddddd0-0000-4000-8000-000000000006', 'm.silva@demo.invalid',   'Marco Silva',    false, now() - interval '6 days'),
  ('ddddddd0-0000-4000-8000-000000000007', 'k.brennan@demo.invalid', 'Kate Brennan',   false, now() - interval '3 days'),
  ('ddddddd0-0000-4000-8000-000000000008', 'p.novak@demo.invalid',   'Petra Novak',    false, now() - interval '1 days')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Sessions
--    Each completed session uses one Likert value per category, so the stored
--    score is exactly value/5*100 and the responses below always reconcile with
--    the scores shown on the dashboard.
--
--    User 7 is deliberately left in progress, and user 8 never starts — this is
--    what makes "started", "completed", "in progress" and "completion rate"
--    show distinct numbers during the demo.
-- -----------------------------------------------------------------------------
insert into public.sessions
  (id, user_id, participant_email, score_tp, score_pd, score_ta, score_tpp, completed_at, created_at) values
  ('ddddddd1-0000-4000-8000-000000000001', 'ddddddd0-0000-4000-8000-000000000001', 'a.hughes@demo.invalid',  100, 80, 80, 100, now() - interval '21 days', now() - interval '21 days'),
  ('ddddddd1-0000-4000-8000-000000000002', 'ddddddd0-0000-4000-8000-000000000002', 'r.patel@demo.invalid',    60, 60, 40,  40, now() - interval '18 days', now() - interval '18 days'),
  ('ddddddd1-0000-4000-8000-000000000003', 'ddddddd0-0000-4000-8000-000000000003', 'j.okafor@demo.invalid',   80, 100, 60,  80, now() - interval '15 days', now() - interval '15 days'),
  ('ddddddd1-0000-4000-8000-000000000004', 'ddddddd0-0000-4000-8000-000000000004', null,                      40, 40, 20,  20, now() - interval '12 days', now() - interval '12 days'),
  ('ddddddd1-0000-4000-8000-000000000005', 'ddddddd0-0000-4000-8000-000000000005', 'l.chen@demo.invalid',     80, 60, 100, 80, now() - interval '9 days',  now() - interval '9 days'),
  ('ddddddd1-0000-4000-8000-000000000006', 'ddddddd0-0000-4000-8000-000000000006', 'm.silva@demo.invalid',    60, 80, 60,  60, now() - interval '6 days',  now() - interval '6 days'),
  -- started but never finished
  ('ddddddd1-0000-4000-8000-000000000007', 'ddddddd0-0000-4000-8000-000000000007', 'k.brennan@demo.invalid', null, null, null, null, null, now() - interval '3 days')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Responses — 20 per completed session, matching the scores above exactly.
-- -----------------------------------------------------------------------------
with per_session (session_id, tp, pd, ta, tpp) as (
  values
    ('ddddddd1-0000-4000-8000-000000000001'::uuid, 5, 4, 4, 5),
    ('ddddddd1-0000-4000-8000-000000000002'::uuid, 3, 3, 2, 2),
    ('ddddddd1-0000-4000-8000-000000000003'::uuid, 4, 5, 3, 4),
    ('ddddddd1-0000-4000-8000-000000000004'::uuid, 2, 2, 1, 1),
    ('ddddddd1-0000-4000-8000-000000000005'::uuid, 4, 3, 5, 4),
    ('ddddddd1-0000-4000-8000-000000000006'::uuid, 3, 4, 3, 3)
)
insert into public.responses (session_id, question_id, category, answer_value)
select s.session_id, q.code, q.category,
       case q.category
         when 'TP'  then s.tp
         when 'PD'  then s.pd
         when 'TA'  then s.ta
         when 'TPP' then s.tpp
       end
from per_session s
cross join public.questions q
where q.is_active
on conflict (session_id, question_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Demographics
--    Five opted in and one declined, so the dashboard shows a realistic opt-in
--    rate rather than a flat 100%.
-- -----------------------------------------------------------------------------
insert into public.demographics
  (session_id, provided, age_group, gender, gender_other, academic_level) values
  ('ddddddd1-0000-4000-8000-000000000001', true,  '45-54',       'female',      null,         'D'),
  ('ddddddd1-0000-4000-8000-000000000002', true,  '25-34',       'male',        null,         'A'),
  ('ddddddd1-0000-4000-8000-000000000003', true,  '35-44',       'female',      null,         'C'),
  ('ddddddd1-0000-4000-8000-000000000004', true,  '25-34',       'other',       'Non-binary', 'B'),
  ('ddddddd1-0000-4000-8000-000000000005', true,  '55-64',       'male',        null,         'E'),
  -- asked and declined — this is what makes the opt-in rate meaningful
  ('ddddddd1-0000-4000-8000-000000000006', false, null,          null,          null,         null)
on conflict (session_id) do nothing;


-- =============================================================================
-- EXPECTED ON THE DASHBOARD AFTER RUNNING THIS
--   Participants 8 · Started 7 · Completed 6 · Accounts created 7
--   Completion rate 86% · In progress 1 · Average score 65.8%
--   Demographics 5 provided · 1 declined · 83% opt-in
-- Use these to confirm the seed landed correctly before demonstrating.
-- =============================================================================


-- =============================================================================
-- CLEANUP — run this block to remove every row created above.
-- Uncomment and run when the demo is finished.
-- =============================================================================
-- delete from public.demographics where session_id::text like 'ddddddd1%';
-- delete from public.responses     where session_id::text like 'ddddddd1%';
-- delete from public.sessions      where id::text         like 'ddddddd1%';
-- delete from public.users         where id::text         like 'ddddddd0%';
