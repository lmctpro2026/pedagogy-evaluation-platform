// ===========================================================================
// Supabase Edge Function — send-results-email
// Deploy: supabase functions deploy send-results-email
// Secret:  supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
// ===========================================================================

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SALLY_EMAIL    = 'sally.firmin@federation.edu.au';
const FROM_EMAIL     = 'Pedagogy Platform <onboarding@resend.dev>';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { sessionId, scores, participantEmail, participantName } = await req.json();

    if (!RESEND_API_KEY) {
      console.error('[send-results-email] RESEND_API_KEY not configured');
      return json({ error: 'Email service not configured.' }, 500);
    }

    const overall  = ((scores.TP + scores.PD + scores.TA + scores.TPP) / 4).toFixed(1);
    const scoreRows = [
      ['Teaching Practice',            'TP',  scores.TP],
      ['Professional Development',      'PD',  scores.PD],
      ['Technology Adoption',           'TA',  scores.TA],
      ['Techno-Pedagogical Practice',   'TPP', scores.TPP],
    ];

    const tableHtml = `
      <table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:14px;">
        <thead>
          <tr style="background:#1C1914;color:#C17F3A;">
            <th style="text-align:left;padding:8px 12px;border-bottom:1px solid #2A2520;">Category</th>
            <th style="text-align:right;padding:8px 12px;border-bottom:1px solid #2A2520;">Score</th>
          </tr>
        </thead>
        <tbody>
          ${scoreRows.map(([label, , val]) => `
            <tr>
              <td style="padding:7px 12px;border-bottom:1px solid #2A2520;">${label}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #2A2520;text-align:right;font-weight:bold;">${(val as number).toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const sends: Promise<void>[] = [];

    // Always notify Dr Firmin
    sends.push(sendEmail({
      to:      SALLY_EMAIL,
      subject: `[PEP] New assessment — ${participantName} · ${overall}%`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1C1914;">
          <h2 style="margin-bottom:4px;">New assessment completed</h2>
          <p style="color:#888;font-size:13px;margin-top:0;">Pedagogy Evaluation Platform · Firmin (2020)</p>
          <hr style="border:none;border-top:1px solid #E5E0D8;margin:16px 0;">
          <p><strong>Participant:</strong> ${participantName}</p>
          ${participantEmail ? `<p><strong>Email:</strong> <a href="mailto:${participantEmail}">${participantEmail}</a></p>` : '<p><em>Anonymous — no email provided</em></p>'}
          <p><strong>Session ID:</strong> <code style="font-size:12px;">${sessionId ?? 'offline'}</code></p>
          <p><strong>Overall score:</strong> <span style="font-size:1.2em;font-weight:bold;color:#C17F3A;">${overall}%</span></p>
          <br>${tableHtml}
          <p style="color:#888;font-size:12px;margin-top:24px;">Federation University Australia · Research Ethics Approved</p>
        </div>
      `,
    }));

    // Email participant if they supplied an address
    if (participantEmail && participantEmail.includes('@')) {
      sends.push(sendEmail({
        to:      participantEmail,
        subject: `Your Pedagogy Evaluation results — ${overall}%`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1C1914;">
            <h2>Hi ${participantName},</h2>
            <p>Thank you for completing the Pedagogy Evaluation. Here is a summary of your results based on the <strong>Firmin (2020)</strong> techno-pedagogical framework.</p>
            <p style="font-size:1.4em;font-weight:bold;color:#C17F3A;margin:20px 0;">${overall}% overall</p>
            ${tableHtml}
            <p style="margin-top:20px;">Your detailed results remain available at the platform — you can retake the assessment at any time.</p>
            <p style="color:#888;font-size:12px;margin-top:24px;">Pedagogy Evaluation Platform · Federation University Australia<br>Based on Firmin (2020). Results are for reflective purposes only.</p>
          </div>
        `,
      }));
    }

    await Promise.allSettled(sends);
    return json({ ok: true, overall });

  } catch (err) {
    console.error('[send-results-email] unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[resend] ${res.status} → ${text}`);
  }
}
