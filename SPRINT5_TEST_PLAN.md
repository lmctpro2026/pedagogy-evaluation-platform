# Sprint 5 — Test plan

Two requirements confirmed by the client:

1. **Anonymous user registration and result saving** — start anonymously; at the end, offer
   to create an account; the completed result is saved to that account and can be viewed later.
2. **Email verification code** — registering sends a code to the email address; the account is
   verified by entering that code.

## Setup

- `sprint5-claim.sql` has been run in the Supabase SQL Editor (after `sprint4-attempts.sql`).
  Check: `select proname from pg_proc where proname = 'claim_assessment';` returns one row.
- Supabase → Authentication → Email Templates → **Confirm signup** emits `{{ .Token }}`
  (the branded template is `supabase/templates/confirm-signup.html`).
- Use an inbox you can read. Each test that registers needs an address that has **never**
  been registered on the platform (add `+test1`, `+test2` … to a Gmail address).
- Open the site in a **private/incognito window** so no earlier participant is remembered.

Pass criteria are in bold.

## A. Anonymous → create account → result saved

| # | Step | Expected |
|---|------|----------|
| A1 | Home page → **Try anonymously** (or Start → Anonymous tab → consent → Continue) | Questionnaire welcome says "Anonymous — nothing is stored while you answer". |
| A2 | Start the session, answer all 20 questions, submit from the review screen | Completion screen. Status line: **"Your results are saved anonymously — on the results page you can save them to an account."** |
| A3 | Choose "No thanks, show my results" (or complete demographics) | Results page shows scores **and** a card **"Save these results to an account"** with *Create account & save* and *I already have an account*. |
| A4 | Click **Create account & save** | Modal titled **"Save your results"** with only two tabs (Sign in / Create account — **no Anonymous tab**); the register button reads **Create account & save**. |
| A5 | Enter full name, a fresh email, a password (6+ chars), tick consent, submit | Modal switches to **"Verify your email"** showing the address; button reads **Verify & save results →**. |
| A6 | Open the inbox | An email with a **6-digit code** (not a link) arrives within a minute. |
| A7 | Enter a **wrong** code | "Incorrect code…" message; modal stays open. |
| A8 | Enter the **correct** code | Modal closes. The card shows "Saving this result to your account…" then **"✓ Saved to your account."** with **Open my dashboard**. The scores on the page are unchanged. Header shows the *Dashboard / Sign out* links; the email-capture card is gone. |
| A9 | Click **Open my dashboard** | Dashboard shows **one attempt, "Active result"**, with the same overall score and category scores as the results page. |
| A10 | Sign out, close the window, open the site again, **Sign in** with the new account → Dashboard | The result is still there. |
| A11 | Admin dashboard (admin account) | The session is listed under the participant's name/email, no longer as "Unattached session". |

## B. Anonymous → sign in to an existing account

| # | Step | Expected |
|---|------|----------|
| B1 | With an account that already has a result this year: private window → anonymous → complete → results | Card shown. |
| B2 | **I already have an account** → sign in | Modal title "Save your results", button **Sign in & save results**. After sign-in: **"✓ Saved to your account. Your earlier attempt this year is kept as your previous attempt."** |
| B3 | Open my dashboard | The just-claimed result is **Active result**; the earlier one is **Previous attempt**; comparison panel shows both. |
| B4 | Repeat B1–B2 with an account that already has **two** attempts this year | Saved; dashboard still shows **exactly two** attempts for the year: the claimed one (active) and the newer of the two earlier ones. |

## C. Email verification code (registration from the home page)

| # | Step | Expected |
|---|------|----------|
| C1 | Home → Start → Create account → fresh email → submit | "Verify your email" panel; code email arrives. |
| C2 | Click **Resend code** | Toast "New code sent"; a second email arrives; **only the newest code works**. |
| C3 | Close the modal without verifying; try to **Sign in** with that email/password | Sign-in is refused; the verify panel reopens and a fresh code is emailed. |
| C4 | Enter the code | Signed in, taken to the questionnaire welcome as a signed-in participant. |
| C5 | Register again with the same email | "An account with this email already exists." — no second code is sent. |

## D. Guards and failure states

| # | Step | Expected |
|---|------|----------|
| D1 | Results page while **signed in** (not anonymous) | **No** "Save these results" card. |
| D2 | Results page for an anonymous result that did **not** reach the server (e.g. go offline before submitting; completion screen says "Saved on this device only") | **No** card — there is nothing on the server to attach. |
| D3 | Press **Escape** or the × while the claim modal is open | Modal closes; still anonymous; card unchanged; clicking the card again reopens the modal in claim mode. |
| D4 | Refresh the results page while the verify panel is open | The verify panel reopens automatically (title "Save your results" copy on the button) and entering the code still saves the result. |
| D5 | Same result, second claim (open results.html again in the same tab after A8 and try — the card is hidden; via console: `PED.assessment.claimSession(sessionStorage.getItem('ped.sessionId'))`) | Resolves `{ ok: false, message: "This result has already been saved to an account." }`. |
| D6 | Database without `sprint5-claim.sql` | After sign-in the card says "Saving results to an account needs the Sprint 5 database update…" and the dashboard link is offered; the account itself works. |

## E. Regression

| # | Step | Expected |
|---|------|----------|
| E1 | Home page: Sign in / Create account / Anonymous tabs, × close, backdrop click, Escape | All work exactly as before (the modal is now rendered by `js/auth.js`). |
| E2 | Signed-in participant completes an evaluation | Completion screen: "Saved — this is now your active … result"; previous-attempt choice shown when applicable. |
| E3 | Anonymous email capture on the results page | Still shown for anonymous participants; sends the results email. |
| E4 | Report page and PDF export after a claim | Unchanged scores; PDF exports. |
| E5 | Hard refresh on every page | No console errors; assets load with `?v=2.2`. |
