// ===========================================================================
// Supabase Edge Function — send-results-email
//
// Sends a results summary to the admin and, if they gave an address, to the
// participant. Only for a real evaluation stored in the last 30 minutes, using
// the scores in the database (not whatever the caller sends).
//
// Deploy:  supabase functions deploy send-results-email --no-verify-jwt
//
// Secrets — use SMTP (e.g. a project Gmail account with an app password):
//          SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER  SMTP_PASS
// or the Resend API (needs a verified sending domain):
//          RESEND_API_KEY
// Always:  ADMIN_EMAIL   who gets every new result
// Optional: FROM_EMAIL   defaults to "Pedagogy Evaluation Platform <SMTP_USER>"
//           SITE_URL     link back to the platform
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// ===========================================================================

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import nodemailer from 'npm:nodemailer@^9';

const SMTP_HOST      = Deno.env.get('SMTP_HOST') ?? '';
const SMTP_PORT      = Number(Deno.env.get('SMTP_PORT') ?? '465');
const SMTP_USER      = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS      = Deno.env.get('SMTP_PASS') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')  ?? `Pedagogy Evaluation Platform <${SMTP_USER}>`;
const ADMIN_EMAIL    = Deno.env.get('ADMIN_EMAIL') ?? 'mushfiqurr@students.federation.edu.au';
const SITE_URL       = Deno.env.get('SITE_URL')    ?? 'https://lmctpro2026.github.io/pedagogy-evaluation-platform';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MAX_AGE_MS = 30 * 60 * 1000;

const CATEGORIES = [
  { code: 'TP',  name: 'Teaching Practice',           column: 'score_tp',  color: '#2F6DB5' },
  { code: 'PD',  name: 'Pedagogical Development',     column: 'score_pd',  color: '#7A4BA8' },
  { code: 'TA',  name: 'Technology Adoption',         column: 'score_ta',  color: '#1E8560' },
  { code: 'TPP', name: 'Techno-Pedagogical Practice', column: 'score_tpp', color: '#C0480F' },
];

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!SMTP_HOST && !RESEND_API_KEY) return json({ error: 'Email service not configured.' }, 500);

    const { sessionId, participantEmail, participantName } = await req.json();
    const session = await loadRecentSession(sessionId);
    if (!session) return json({ error: 'No recent completed evaluation for that session.' }, 404);

    const scores = Object.fromEntries(CATEGORIES.map(c => [c.code, Number(session[c.column])]));
    const overall = Math.round(CATEGORIES.reduce((sum, c) => sum + scores[c.code], 0) / CATEGORIES.length);
    const name = clean(participantName) || 'Participant';
    const email = validEmail(participantEmail) ? participantEmail.trim().toLowerCase() : null;
    const completed = new Date(session.completed_at).toLocaleString('en-AU', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne',
    });

    const results = await Promise.allSettled([
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `New evaluation · ${name} · ${overall}/100`,
        html: layout('New evaluation completed', `
          ${detailRow('Participant', escapeHtml(name))}
          ${detailRow('Email', email ? `<a href="mailto:${escapeHtml(email)}" style="color:#1F5A96;">${escapeHtml(email)}</a>` : 'Not provided')}
          ${detailRow('Completed', completed)}
          ${detailRow('Session', `<span style="font-family:Menlo,Consolas,monospace;font-size:12px;">${escapeHtml(sessionId)}</span>`)}
          ${scoreTable(scores, overall)}
          ${button(`${SITE_URL}/admin.html`, 'Open admin dashboard')}
        `),
      }),
      email ? sendEmail({
        to: email,
        subject: `Your Pedagogy Evaluation results · ${overall}/100`,
        html: layout(`Thanks, ${escapeHtml(name)}`, `
          <p style="margin:0 0 16px;color:#3F4957;font-size:15px;line-height:1.6;">
            Here is a summary of your techno-pedagogical practice, scored against the Firmin (2020) framework.
          </p>
          ${scoreTable(scores, overall)}
          <p style="margin:16px 0 0;color:#3F4957;font-size:15px;line-height:1.6;">
            With an account, your dashboard keeps up to three years of results so you can see how each category changes.
          </p>
          ${button(`${SITE_URL}/my-results.html`, 'Open my dashboard')}
        `),
      }) : Promise.resolve(),
    ]);

    const failed = results.filter(r => r.status === 'rejected').length;
    return json({ ok: failed === 0, sent: results.length - failed, overall }, failed ? 502 : 200);
  } catch (err) {
    console.error('[send-results-email] unhandled error:', err);
    return json({ error: 'Could not send email.' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
async function loadRecentSession(sessionId: unknown) {
  if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const url = `${SUPABASE_URL}/rest/v1/sessions?id=eq.${sessionId}&select=completed_at,score_tp,score_pd,score_ta,score_tpp`;
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) return null;
  const [row] = await res.json();
  if (!row?.completed_at) return null;
  if (Date.now() - new Date(row.completed_at).getTime() > MAX_AGE_MS) return null;
  return row;
}

// ---------------------------------------------------------------------------
// Email markup — table layout and inline styles so it renders in Outlook and Gmail.
// ---------------------------------------------------------------------------
function layout(heading: string, body: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F5F6F8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #DCE0E6;border-radius:12px;">
        <tr><td style="padding:20px 28px;border-bottom:1px solid #DCE0E6;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#17202C;">
          <strong>Pedagogy</strong> <span style="color:#667080;">/ Evaluation</span>
        </td></tr>
        <tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:#17202C;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;">${heading}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #DCE0E6;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#667080;line-height:1.5;">
          Pedagogy Evaluation Platform · Federation University Australia · ITECH3208<br>
          Based on Firmin (2020). Results are for reflective purposes.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function detailRow(label: string, value: string) {
  return `<p style="margin:0 0 6px;font-size:14px;color:#3F4957;"><span style="display:inline-block;width:92px;color:#667080;">${label}</span>${value}</p>`;
}

function scoreTable(scores: Record<string, number>, overall: number) {
  const rows = CATEGORIES.map(c => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #DCE0E6;font-size:14px;color:#17202C;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c.color};margin-right:8px;"></span>${c.name}
      </td>
      <td align="right" style="padding:10px 12px;border-bottom:1px solid #DCE0E6;font-family:Menlo,Consolas,monospace;font-size:14px;color:#17202C;">${scores[c.code]}</td>
    </tr>`).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;border:1px solid #DCE0E6;border-radius:8px;border-collapse:separate;">
      ${rows}
      <tr>
        <td style="padding:12px;background:#F0F2F5;font-size:14px;font-weight:bold;color:#17202C;">Overall</td>
        <td align="right" style="padding:12px;background:#F0F2F5;font-family:Menlo,Consolas,monospace;font-size:16px;font-weight:bold;color:#1F5A96;">${overall} / 100</td>
      </tr>
    </table>`;
}

function button(href: string, label: string) {
  return `<p style="margin:24px 0 0;"><a href="${href}" style="display:inline-block;background:#1F5A96;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:bold;padding:11px 18px;border-radius:8px;">${label}</a></p>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const smtp = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,   // 25 and 587 are blocked from Edge Functions
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (smtp) {
    await smtp.sendMail({ from: FROM_EMAIL, to, subject, html });
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[resend] ${res.status} → ${text}`);
    throw new Error(`Resend ${res.status}`);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
