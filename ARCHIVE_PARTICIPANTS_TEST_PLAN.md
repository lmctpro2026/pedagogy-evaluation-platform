# Archive instead of delete — Test plan

Administrators cannot delete a participant. They can archive one, which hides the participant
from the dashboard, and restore them later. Nothing is deleted.

## Setup

- `archive-participants.sql` has been run in the Supabase SQL Editor (after `admin-policies.sql`).
  Check: `select policyname from pg_policies where policyname like 'admins_delete%';` returns no rows.
- An admin account and at least two ordinary participant accounts with completed evaluations.

Pass criteria are in bold.

## A. Archive and restore

| # | Step | Expected |
|---|------|----------|
| A1 | Sign in to `admin.html` as an admin | Participant rows show an **Archive** button; there is **no Delete** button and no "Reset all test data" button (also not with `?debug=1`). |
| A2 | Click **Archive** on a participant → confirm | The row **disappears**; Participants, Started, Completed, Accounts and Average score **decrease** accordingly; the footer reads "… · 1 archived". |
| A3 | Tick **Show archived (1)** | The row reappears, greyed, with an **Archived** badge (hover shows date and administrator) and a **Restore** button; the stats are unchanged. |
| A4 | Export CSV | The archived participant is **not** in the file. |
| A5 | Click **Restore** → confirm | Row returns to normal; stats go back up; footer no longer mentions archived. |
| A6 | Refresh the page after archiving | Still archived (stored in the database, not the browser). |

## B. Guards

| # | Step | Expected |
|---|------|----------|
| B1 | As an ordinary participant, in the console: `await PED.supabase.rpc('set_participant_archived', { p_user_id: '<own id>', p_archived: true })` | Error **"Only an administrator can archive or restore a participant"**. |
| B2 | As an ordinary participant: `await PED.supabase.from('users').update({ archived_at: null, archived_by: null }).eq('id', '<own id>')` (after an admin archived them) | **Refused** by the trigger with the same message; still archived in the dashboard. |
| B3 | As admin, archive an administrator account via the console | Error **"Administrator accounts cannot be archived"**. |
| B4 | As admin, in SQL Editor: `delete from public.sessions where id = '<any>';` run **as the authenticated role** (or via the REST API with the admin's token) | **0 rows** — no administrator delete policy exists. |
| B5 | As admin: `select proname from pg_proc where proname = 'admin_reset_test_data';` | **No rows**. |
| B6 | Before `archive-participants.sql` is run | No Archive button, no toggle; dashboard loads normally. |

## C. What participants see

| # | Step | Expected |
|---|------|----------|
| C1 | Archived participant signs in | Sign-in works; dashboard and history unchanged (archive affects the admin view only). |
| C2 | Archived participant completes a new evaluation | Stored; **still hidden** from the admin dashboard until restored. |

## D. Regression

| # | Step | Expected |
|---|------|----------|
| D1 | Participant deletes their own previous attempt from the dashboard | Still works (participant action, unaffected). |
| D2 | Admin stats, chart, category summary, demographics, question bank, participant modal | Unchanged for active participants. |
| D3 | Hard refresh on every page | No console errors; assets load with `?v=2.5`. |
