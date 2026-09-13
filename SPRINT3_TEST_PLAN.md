# Sprint 3 — Test Plan

Pedagogy Evaluation Platform · Federation University · Client: Dr Selena (Sally) Firmin

Covers the five items Bhavna asked the tester to verify: incomplete submission, error
message behaviour, completion button, score calculation, and the demographics page flow
and data saving.

**Tester:** Merajun Nabi · **Build under test:** Sprint 3 · **Environment:** see Setup below

---

## 0. Setup (must be done before ANY test)

### 0.1 Apply the database migration — BLOCKING

The demographics table does not exist yet. Until it is created, demographics answers
are not stored and the admin dashboard shows *"migration not applied"*.

1. Supabase Dashboard → **SQL Editor → New Query**
2. Paste the full contents of `sprint3-demographics.sql`
3. **Run**
4. Verify — run this and expect three rows:
   ```sql
   select policyname, cmd from pg_policies where tablename = 'demographics';
   ```

This file is additive and safe on the live database. It creates one new table and its
policies; it does not touch `users`, `questions`, `sessions` or `responses`.

### 0.2 Run the site locally

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`. (Or test the deployed GitHub Pages build once merged.)

### 0.3 Reset between test runs

Open DevTools → Console and run:

```js
localStorage.clear(); sessionStorage.clear(); location.reload();
```

Answers are cached in `localStorage` under `ped.responses`, so **skipping this step will
make a fresh run resume a previous one** and several tests below will not reproduce.

---

## 1. Incomplete survey submission

**Requirement:** users cannot submit unless all questions are answered.

| # | Step | Expected result |
|---|------|-----------------|
| 1.1 | Start the assessment, answer questions 1–3 only | Progress bar shows 3/20 |
| 1.2 | Click **Review answers** in the top progress bar | Review screen lists all 20 questions grouped into the four Firmin categories; 17 rows are highlighted red and read *"Not answered"* |
| 1.3 | Check the status pill and meter | Reads *"3 of 20 answered · 17 still incomplete"* in amber, with the bar filled to 15%. Each category header shows its own count (e.g. *"3 of 5"* in amber, *"5 of 5"* in green) |
| 1.4 | Click **Submit assessment →** | **Submission is blocked.** Red error box appears naming the count and the exact missing question numbers |
| 1.5 | Every incomplete row pulses red twice | Confirms which rows need attention |
| 1.6 | In DevTools Console run `localStorage.getItem('ped.scores')` | Returns `null` — **nothing was scored or saved** |
| 1.7 | Run `localStorage.getItem('ped.completed')` | Returns `null` |
| 1.8 | Check the Supabase `responses` table for this session | **No rows** — responses are only written on full completion |

**PASS =** submission blocked, error shown, and no scores/responses written anywhere.

---

## 2. Error message behaviour

**Requirement:** show an error message if any question is left incomplete.

| # | Step | Expected result |
|---|------|-----------------|
| 2.1 | On any question, click **Next** without selecting a response | Red message under the scale: *"Please select a response before continuing — every question is required."* The scale gets a red outline |
| 2.2 | Confirm you did not advance | Question counter is unchanged |
| 2.3 | Now select any response 1–5 | The error and the red outline clear immediately |
| 2.4 | Click **Next** | Advances normally |
| 2.5 | From the review screen error box, click **"Go to question N →"** | Jumps straight to that question; the button now reads **Back to review** |
| 2.6 | Answer it and click **Back to review** | Returns to review; the status pill, the meter and that category's count have each increased by one |
| 2.7 | Click **Submit** again while still incomplete | Error re-appears with an updated count and updated question numbers |

**Accessibility check:** the error elements carry `role="alert"`, so a screen reader
announces them when they appear.

**PASS =** an explicit error message every time, in both places, and it clears on fix.

---

## 3. Completion button functionality

| # | Step | Expected result |
|---|------|-----------------|
| 3.1 | Answer all 20 questions | On question 20 the button reads **Review answers** |
| 3.2 | Click it | Review screen; status pill is green: *"20 of 20 answered · ready to submit"*; no red rows |
| 3.3 | Click **← Back to questions** | Returns to **the question you were on when you opened review** (question 20 here) with the answer still selected |
| 3.3b | Repeat from mid-survey: at question 6, click **Review answers**, then **← Back to questions** | Returns to question 6, *not* question 20 |
| 3.4 | Return to review, click **Submit assessment →** | Completion screen: *"All done. Your profile is ready."* |
| 3.5 | Observe the demographics question | *"Are you happy to provide demographic information?"* with **Yes** / **No thanks** |
| 3.5b | Watch the two buttons at the moment of submitting | They start **disabled** with *"Saving your results…"* and a spinner, then enable once the write lands. This is deliberate — leaving the page too early would cancel the database write |
| 3.5c | Read the status line after it settles | *"✓ Your results are saved."* Only when the server write actually succeeded. If it failed it must say *"Saved on this device — we could not reach the server."* — verify by turning off wi-fi before submitting |
| 3.6 | Check `localStorage.getItem('ped.scores')` | Now contains the four category scores |
| 3.7 | Check the Supabase `sessions` row | `completed_at` is set and the four score columns are populated |
| 3.8 | Check the Supabase `responses` table | Exactly **20 rows** for this session |

**PASS =** the button only completes a full survey, and completion writes exactly once.

---

## 4. Score calculation

Each category = (sum of its 5 answers ÷ 25) × 100, rounded. Overall = mean of the four.

**Test A — all 3s (mid-scale)**

Answer every question **3**. Expected: TP 60, PD 60, TA 60, TPP 60, Overall 60.

**Test B — all 5s (maximum)**

Answer every question **5**. Expected: 100 / 100 / 100 / 100, Overall 100,
descriptor *"Highly Developed"*.

**Test C — all 1s (minimum)**

Answer every question **1**. Expected: 20 / 20 / 20 / 20, Overall 20,
descriptor *"Needs Attention"*.

**Test D — mixed, verifies categories are not cross-contaminated**

| Questions | Answer | Category | Expected |
|-----------|--------|----------|----------|
| 1–5   | 5 | TP  | 100% |
| 6–10  | 4 | PD  | 80%  |
| 11–15 | 2 | TA  | 40%  |
| 16–20 | 1 | TPP | 20%  |

Overall = (100 + 80 + 40 + 20) ÷ 4 = **60**.

| # | Check | Where |
|---|-------|-------|
| 4.1 | Category percentages match the table | `results.html` score cards |
| 4.2 | Overall matches | Results hero — *"Overall Score"* |
| 4.3 | Same figures appear in the written report | `report.html` |
| 4.4 | Same figures appear for the admin | Admin dashboard row for this participant |
| 4.5 | Descriptor bands | ≥80 Highly Developed · ≥60 Developing Well · ≥40 Emerging · <40 Needs Attention |

**PASS =** all four surfaces agree and match the hand calculation.

---

## 5. Demographics page flow and data saving

### 5.1 "Yes" path — happy case

| # | Step | Expected result |
|---|------|-----------------|
| 5.1.1 | Complete the survey, click **Yes, I'm happy to →** | Lands on `demographics.html` |
| 5.1.2 | Check the options | Age group 7 options · Gender 4 · Academic level 7 (Level A–E + Other + Prefer not to say) |
| 5.1.3 | Click **Save and see results →** with nothing selected | **Blocked.** All three fields show *"Please choose an option — 'Prefer not to say' is fine."* plus a summary error |
| 5.1.4 | Select an age group | That field's error clears; the chosen option fills copper and its radio dot fills |
| 5.1.5 | Select **Gender → Other** | A *"Please specify"* text box appears and receives focus |
| 5.1.6 | Submit with **Other** selected but the box empty | **Blocked** — *"Please describe your gender, or choose another option above."* |
| 5.1.7 | Type a description (limit is 60 characters) | Error clears |
| 5.1.8 | Select an academic level, then submit | Redirects to `results.html` |
| 5.1.9 | Check Supabase `demographics` | One row: same `session_id` as the assessment, `provided = true`, and your three values |
| 5.1.10 | Confirm the link | That `session_id` matches the `sessions` row holding the scores |

### 5.2 "No" path

| # | Step | Expected result |
|---|------|-----------------|
| 5.2.1 | Complete a survey, click **No thanks, show my results** | Goes straight to `results.html`, no demographics page |
| 5.2.2 | Check Supabase `demographics` | One row with `provided = false` and all fields null — the decline is recorded, which is what makes the opt-in rate meaningful |

### 5.3 Skip from the demographics page

| # | Step | Expected result |
|---|------|-----------------|
| 5.3.1 | Click **Yes**, then **Skip — go to my results** | Goes to results; a `provided = false` row is written |

### 5.4 Guard

| # | Step | Expected result |
|---|------|-----------------|
| 5.4.1 | Clear storage, then open `demographics.html` directly | Redirects to `questionnaire.html` — the page is only reachable after completing a survey |

### 5.5 Stored values

Codes stored in the database (not the display labels):

| Field | Stored values |
|-------|---------------|
| `age_group` | `under-25` · `25-34` · `35-44` · `45-54` · `55-64` · `65-plus` · `undisclosed` |
| `gender` | `male` · `female` · `other` · `undisclosed` |
| `academic_level` | `A` · `B` · `C` · `D` · `E` · `other` · `undisclosed` |

`gender_other` is only accepted when `gender = 'other'` and is capped at 60 characters —
both enforced by database CHECK constraints, not just by the form.

---

## 6. Admin dashboard

Sign in at `admin.html` with an admin account
(`mushfiqurr@students.federation.edu.au` or `sally.firmin@federation.edu.au`).

| # | Card | Definition to verify against the data |
|---|------|----------------------------------------|
| 6.0 | Card layout | Eight cards in two labelled bands — **Participation** (the four counts Bhavna asked for) and **Engagement** |
| 6.1 | **Participants** | Every non-admin person, including anonymous ones |
| 6.2 | **Started Survey** | Participants with at least one session row |
| 6.3 | **Completed Survey** | Participants with at least one finished session |
| 6.4 | **Accounts Created** | Participants who registered (not anonymous sign-ins) |
| 6.5 | **Completion Rate** | Completed ÷ Started |
| 6.6 | **In Progress** | Started but never finished |
| 6.7 | **Average Score** | Mean overall across completed assessments |
| 6.8 | **Demographics** | Count who provided, plus declined count and opt-in rate |

| # | Panel | Expected |
|---|-------|----------|
| 6.9  | Category Results chart | Four bars — TP / PD / TA / TPP averages |
| 6.10 | Category summary table | Responses, mean, median, lowest, highest per category, plus an overall composite row. **The mean column must match the bar chart** |
| 6.11 | Demographic Summary | Three bar charts (age group, gender, academic level). Empty categories are not drawn |
| 6.12 | Participant table | Participants who provided demographics carry a green **demo** badge |
| 6.13 | Click any row | Profile modal shows that session's demographics, or *"declined"* / *"not asked"* |
| 6.14 | **Export CSV** | Includes Age Group, Gender, Gender (specified) and Academic Level columns |

**6.15 — Before/after the migration.** If step 0.1 has not been run, the dashboard must
still load completely, with the Demographics card showing *"migration not applied"* and
the demographic panel explaining which SQL file to run. Verify this does **not** break
any other panel.

---

## 7. Regression checks (existing features must still work)

| # | Check |
|---|-------|
| 7.1 | Sign in, register with OTP, and Try Anonymously all still work from the landing page |
| 7.2 | Resuming a part-finished assessment restores previous answers and reopens at the first unanswered question |
| 7.3 | **Start over** on the welcome screen clears answers and begins a new session |
| 7.4 | Keyboard navigation — `1`–`5` select, `Enter`/`→` next, `←` previous. `Enter` on an unanswered question shows the error instead of advancing |
| 7.4b | Click **Next** twice in quick succession mid-slide — the error must appear once, on the card in front of you, never on the one sliding away |
| 7.5 | Results page renders the four score cards and the doughnut chart |
| 7.6 | Full report renders and **Export PDF** produces a correct multi-page PDF |
| 7.7 | Anonymous email capture on the results page still sends the results email |
| 7.8 | Admin row delete still removes a participant and refreshes every panel |
| 7.9 | Mobile — check the review screen, demographics form and admin dashboard at 375px wide |

---

## Defect reporting

For each failure record: test ID, browser + OS, exact steps, expected vs actual,
a screenshot, and any Console errors (DevTools → Console).
