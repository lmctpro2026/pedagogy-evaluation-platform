# Forgot password — Test plan

A participant who has forgotten their password can set a new one with a 6-digit code emailed
to their address, from the sign-in panel on any page that opens it.

## Setup

- Supabase → Authentication → Emails → Templates → **Reset password** emits `{{ .Token }}`
  (paste `supabase/templates/reset-password.html`; subject "Your Pedagogy Evaluation password
  reset code"). Until this is done the email contains a link, not a code, and step A3 fails.
- Custom SMTP is configured (it is — codes arrive from `noreply@crmpilot.com.au`).
- An existing account whose inbox you can read, and its current password.
- Open the site in a **private/incognito window**.

Pass criteria are in bold.

## A. Reset from the home page

| # | Step | Expected |
|---|------|----------|
| A1 | Home → **Sign in** | Sign-in panel shows a **Forgot password?** link under the password field. |
| A2 | Click it | Title **"Reset your password"**, no tab row, one Email field, button **Email me a code** (disabled until a valid address is typed), "Back to sign in". |
| A3 | Enter the account's address → Email me a code | Title **"Choose a new password"**; the panel says "If an account exists for &lt;address&gt; a 6-digit code is on its way". An email **with a 6-digit code** arrives within a minute from `noreply@crmpilot.com.au`. |
| A4 | Enter a **wrong** code and a new password → Set password & sign in | "Incorrect or expired code…" under the code field; panel stays open. |
| A5 | Enter the **correct** code and the new password | Toast **"Password updated — you are signed in."**; modal closes; questionnaire welcome shows you signed in. |
| A6 | Sign out, Sign in with the **old** password | **Refused** ("Invalid email or password"). |
| A7 | Sign in with the **new** password → Dashboard | Signed in; history unchanged. |

## B. Guards

| # | Step | Expected |
|---|------|----------|
| B1 | Forgot password with an address that has **no** account | Same "Choose a new password" panel and wording — **no hint** that the address is unknown; no email arrives. |
| B2 | New password shorter than 6 characters | "Password must be at least 6 characters."; button disabled. |
| B3 | Same password as before | Supabase refuses ("New password should be different…") under the password field; the panel stays open. |
| B4 | Click **Resend code**, then enter the first code | "Incorrect or expired code…" — **only the newest code works**. Toast "New code sent". |
| B5 | Wait for the code to expire (1 hour) or use a stale one | "Incorrect or expired code…" — Resend sends a fresh one. |
| B6 | Refresh the page while the reset panel is open | The **reset panel reopens** with the same address; entering the code still works. Closing the modal (×, Escape, backdrop) forgets the pending reset. |
| B7 | Go offline, request a code | "Can't reach the sign-in service…" under the Email field. |

## C. From the results page (save-to-account flow)

| # | Step | Expected |
|---|------|----------|
| C1 | Anonymous evaluation → results → **I already have an account** → **Forgot password?** | Reset panels open inside the "Save your results" modal; the final button reads **Set password & save results**. |
| C2 | Enter the code and a new password | Password updated **and** the card shows "Saved to your account" — the result is attached, as with a normal sign-in. |

## D. Regression

| # | Step | Expected |
|---|------|----------|
| D1 | Sign in, Create account (with code), Anonymous | Unchanged. |
| D2 | Register panel password strength meter | Still works; the reset panel has the same meter. |
| D3 | Hard refresh on every page | No console errors; assets load with `?v=2.4`. |
