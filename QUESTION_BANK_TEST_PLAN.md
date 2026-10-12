# Question bank — Test plan

Administrators can see the 20 statements in the admin dashboard and edit their wording.

## Setup

- `question-bank.sql` has been run in the Supabase SQL Editor (after `admin-policies.sql`).
  Check: `select policyname from pg_policies where tablename = 'questions';` lists
  `admins_update_questions`.
- An admin account (`mushfiqurr@students.federation.edu.au` or `sally.firmin@federation.edu.au`)
  and a second, ordinary account.

Pass criteria are in bold.

## A. Viewing

| # | Step | Expected |
|---|------|----------|
| A1 | Sign in to `admin.html` as an admin | A **Question bank** panel sits between Demographic summary and Participant sessions. |
| A2 | Read the panel | **20 rows**, numbered 01–20, category pills TP ×5, PD ×5, TA ×5, TPP ×5, each statement in a text box with a `n / 400` counter, "Original wording" in the Last edited column, a disabled **Save** button. Panel note reads "20 statements · original wording". |
| A3 | Before `question-bank.sql` is run | Same rows, text boxes **read-only**, note reads "Read-only until question-bank.sql has been run…". |

## B. Editing

| # | Step | Expected |
|---|------|----------|
| B1 | Change the wording of statement 03 | Counter updates; **Save** becomes enabled; **Restore original** appears. |
| B2 | Delete the text down to a few characters | Message "Wording must be at least 10 characters."; **Save disabled**. |
| B3 | Click **Restore original** | Shipped wording returns; Save disabled; Restore hidden. |
| B4 | Type new wording and click **Save** (or press Ctrl/⌘+Enter) | Button reads "Saving…" then "Save"; message **"Saved"**; Last edited shows the date, time and your email; note reads "20 statements · 1 edited". |
| B5 | Refresh the page | The new wording is still there with the edit stamp. |
| B6 | Type wording with leading/trailing spaces and save | Stored **trimmed**. |

## C. What participants see

| # | Step | Expected |
|---|------|----------|
| C1 | Open the home page in a private window | The first statement in the hero shows the **edited** wording (it may flash the shipped wording for a moment on a slow connection). |
| C2 | Start the assessment and reach statement 03 | Edited wording shown on the card and later on the review screen. |
| C3 | Admin → open a participant → View responses | Statement 03 shows the edited wording; the recorded answer values are unchanged. |
| C4 | Go offline and open the questionnaire | Shipped wording shown; the evaluation still works. |

## D. Guards

| # | Step | Expected |
|---|------|----------|
| D1 | Sign in as an ordinary account and run in the console: `await PED.questionBank.update('q01', 'Something long enough to pass validation.')` | `{ ok: false, message: "Your account is not permitted to edit questions." }`; wording unchanged. |
| D2 | As admin, in SQL Editor: `update public.questions set category = 'PD' where code = 'q01';` | Error **"Only the wording of a question can be edited"**. Same for `order_index`, `weight`, `is_active`, `code`. |
| D3 | As admin, in SQL Editor: `update public.questions set text = 'short' where code = 'q01';` | Error on **`questions_text_length`**. Same for blank text and text over 400 characters. |
| D4 | Re-run `question-bank.sql` | Completes without error (safe to re-run). |

## E. Regression

| # | Step | Expected |
|---|------|----------|
| E1 | Admin dashboard stats, chart, demographics, participants table, CSV export | Unchanged. |
| E2 | Full anonymous evaluation → results → report PDF | Unchanged; scores identical for the same answers. |
| E3 | Hard refresh on every page | No console errors; assets load with `?v=2.3`. |
