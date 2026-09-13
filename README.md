# Pedagogy Evaluation Platform

**ITECH3208 IT Capstone Project 1 · Federation University Australia**

A web-based self-assessment tool implementing Firmin's (2020) Techno-Pedagogical
Practice framework. An academic answers a 20-question Likert survey, receives a
weighted score across four research-defined categories, and can view a written
report with PDF export. Administrators see aggregate results through a dashboard.

---

## Team

| Name | Role |
|---|---|
| Mushfiqur Rahman | Lead Developer |
| Shafiullah Anik | Scrum Master |
| Albin Roy | Product Owner |
| Merajun Nabi | Tester |

---

## The framework

Four categories, five questions each, scored 1–5 on a Likert scale:

| Code | Category | Questions |
|---|---|---|
| **TP** | Teaching Practice | q01–q05 |
| **PD** | Pedagogical Development | q06–q10 |
| **TA** | Technology Adoption | q11–q15 |
| **TPP** | Techno-Pedagogical Practice | q16–q20 |

Category score = (sum of answers ÷ 25) × 100. Overall = mean of the four.

Descriptor bands: ≥80 Highly Developed · ≥60 Developing Well · ≥40 Emerging ·
<40 Needs Attention.

---

## Tech stack

- **Frontend** — plain HTML, CSS and vanilla JavaScript. No framework, no bundler,
  no build step. All modules attach to a single `window.PED` namespace.
- **Database & auth** — Supabase (PostgreSQL, ap-southeast-2 Sydney), with
  row-level security. Sign-in, OTP registration and anonymous access.
- **Email** — Resend, via a Supabase Edge Function (Deno).
- **Libraries (CDN)** — Chart.js 4.4.1, jsPDF 2.5.1 + html2canvas 1.4.1,
  GSAP 3.12.2 (landing page only).
- **Hosting** — GitHub Pages.

Postgres was chosen because the data is strictly relational — participants →
sessions → responses → demographics, joined by foreign keys — and because row-level
security lets the privacy rules be enforced in the database rather than only in the
interface.

---

## Running it locally

No install and no build. Serve the folder:

```bash
python3 -m http.server 5173
```

Then open <http://localhost:5173>.

| Page | Purpose |
|---|---|
| `index.html` | Landing page and sign-in / register / anonymous access |
| `questionnaire.html` | The 20-question assessment, validation and review screen |
| `demographics.html` | Optional demographic details, shown after completion |
| `results.html` | Category scores, chart, optional email capture |
| `report.html` | Full written report with PDF export |
| `admin.html` | Administrator dashboard (sign-in gated) |

---

## Repository structure

```
.
├── index.html · questionnaire.html · demographics.html
├── results.html · report.html · admin.html
├── css/
│   └── main · landing · modal · questionnaire · demographics · results · report · admin
├── js/
│   ├── supabase.js             Supabase client init
│   ├── questions.js            The 20 questions, categories, Likert scale
│   ├── demographic-options.js  Permitted demographic values
│   ├── scoring.js              Scoring engine
│   ├── auth.js                 Auth modal and Supabase auth flows
│   ├── assessment.js           Session lifecycle and persistence
│   ├── questionnaire.js        Question flow, validation, review, consent
│   ├── demographics.js         Demographics form and validation
│   ├── results.js              Results rendering
│   ├── report.js               Report rendering and PDF export
│   ├── admin.js                Dashboard data, charts, table, CSV export
│   └── cursor.js               Custom cursor (landing only)
├── supabase/functions/send-results-email/   Edge function (Deno)
├── supabase-setup.sql          Base schema
├── admin-policies.sql          Admin read policies
├── sprint3-demographics.sql    Sprint 3 — demographics table
├── demo-seed.sql               Optional demonstration data
└── docs/                       Reports, test plan, slides, demo scripts
```

---

## Database setup

Run these in the Supabase SQL Editor, in order. Each is idempotent.

| # | File | Purpose |
|---|---|---|
| 1 | `supabase-setup.sql` | Base schema — users, questions, sessions, responses, RLS |
| 2 | `admin-policies.sql` | Lets admin accounts read all rows |
| 3 | `sprint3-demographics.sql` | Sprint 3 demographics table and its policies |
| 4 | `demo-seed.sql` | *Optional* — eight fictional participants for demonstrations |

Then, in the Supabase dashboard:

- **Authentication → Settings** — enable anonymous sign-ins
- **Authentication → URL Configuration** — set the Site URL to the deployed address
- **Authentication → Email Templates → Confirm signup** — must emit `{{ .Token }}`
  so registration sends a 6-digit code rather than a magic link

### Schema

| Table | Purpose |
|---|---|
| `users` | Mirrors Supabase Auth; created automatically by a trigger |
| `questions` | The 20 questions, seeded once |
| `sessions` | One row per assessment attempt, holding the four category scores |
| `responses` | One row per answer, unique per (session, question) |
| `demographics` | One row per session; write-once, links demographics to the response |

Row-level security is on for every table. Participants can read only their own
rows; the two admin accounts bypass this by email.

---

## Sprint 3

Three requirement areas, all delivered.

### Optional demographic collection

After completing the survey the participant is asked whether they are happy to
provide demographic information. Choosing yes opens a dedicated page collecting
age group, gender (with free text for "other") and academic level A–E. The record
is stored against the **same session as the scores**.

Declines are recorded explicitly as `provided = false`. Without this an opt-in rate
could not be reported, because a participant who declined would be
indistinguishable from one never asked. Every question offers "prefer not to say",
so requiring a definite choice never forces disclosure.

The row is **write-once** — no UPDATE or DELETE policy exists, so possession of a
session ID does not allow anyone to alter another participant's answers.

### Administrator dashboard

Eight summary statistics in two bands:

- **Participation** — participants, started, completed, accounts created
- **Engagement** — completion rate, in progress, average score, demographics opt-in

Plus a TP/PD/TA/TPP table (responses, mean, median, lowest, highest per category)
beneath the existing bar chart, three demographic distribution charts, and four new
demographic columns in the CSV export.

Both the category chart and its table read the same set of completed sessions, so
they cannot disagree.

### Validation and error handling

- **At each question** — attempting to advance without an answer shows an explicit
  message rather than silently disabling the button.
- **At submission** — a review screen lists all 20 answers grouped by category.
  Submitting while incomplete is refused and names the missing question numbers.
- **One completion gate** — nothing is scored, stored or emailed until all 20
  questions carry a valid 1–5 answer.

A *Review answers* control sits in the progress bar so the review screen is
reachable at any point. Without it the submission gate could never be exercised in
an incomplete state, making the requirement impossible to demonstrate or test.

---

## Testing

`docs/SPRINT3_TEST_PLAN.md` is the formal test script — setup, five requirement
sections, dashboard checks and regression checks, with explicit pass criteria.

Developer verification performed before handover: incomplete submission refused
with nothing written; scores checked against manual calculation; all eight
dashboard counts checked by hand against a controlled data set; graceful behaviour
when the demographics table is absent; keyboard navigation; responsive layout at
375 px.

---

## Documentation

| File | What it is |
|---|---|
| `docs/PEP_Sprint3_Report.pdf` | Sprint 3 report — delivery, quality assurance, outstanding items |
| `docs/SPRINT3_TEST_PLAN.md` | Test script for the sprint acceptance criteria |
| `docs/SPRINT3_Slides.pptx` / `.pdf` | Sprint review deck |
| `docs/PRESENTATION_SCRIPT.pdf` | Presentation script, split by speaker |
| `docs/DEMO_SCRIPT.pdf` | Live demonstration runbook |

---

## Deployment

The site is static. Pushing to `main` publishes it through GitHub Pages.

The Edge Function deploys separately:

```bash
supabase functions deploy send-results-email --no-verify-jwt
```

---

## Configuration and secrets

There is no `.env` file. The Supabase **project URL and anon key are inlined** in
`js/supabase.js` — this is by design and safe: the anon key is a public,
frontend-facing credential, and row-level security is what actually protects the
data.

Server-side secrets (the Resend API key) exist only as Supabase Edge Function
secrets and are never committed.

**Never commit** the service role key, the Supabase CLI token, or the local
handover document that contains them.

---

## Known limitations

- The Supabase free tier auto-pauses the project after roughly a week of
  inactivity; the first request afterwards fails until it resumes.
- Database backups are not enabled.
- The results email currently sends to a development address, pending switch to the
  researcher's address before participants are recruited.
- The platform has not been load-tested.

---

## Reference

Firmin, S. (2020). *Techno-Pedagogical Practice framework.* Monash University.
