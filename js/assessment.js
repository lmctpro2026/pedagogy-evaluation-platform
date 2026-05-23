// ===========================================================================
// Assessment module — session lifecycle + Supabase persistence + email trigger.
// All Supabase calls are non-blocking: assessment flow continues regardless.
// ===========================================================================

(function () {
  const EDGE_FN_PATH = '/functions/v1/send-results-email';

  // Create a session row at the start of an assessment.
  // Returns the new session UUID (string) or null if offline.
  async function createSession() {
    const sb = window.PED.supabase;
    if (!sb) return null;
    try {
      const stored  = JSON.parse(localStorage.getItem('ped.session') || 'null');
      const { data: { user } } = await sb.auth.getUser();
      const { data, error } = await sb.from('sessions').insert([{
        user_id:           user?.id || null,
        participant_email: stored?.email || null,
      }]).select('id').single();
      if (error) { console.warn('[assessment] createSession:', error.message); return null; }
      const id = data?.id ?? null;
      if (id) { try { sessionStorage.setItem('ped.sessionId', id); } catch {} }
      return id;
    } catch (e) {
      console.warn('[assessment] createSession error (non-fatal):', e);
      return null;
    }
  }

  // Update session with final scores + batch-insert all responses.
  // Then fire the email edge function (non-blocking).
  async function completeSession(sessionId, responseList, scores) {
    const sb = window.PED.supabase;
    if (!sb) return;
    try {
      const completedAt = new Date().toISOString();
      if (sessionId) {
        await sb.from('sessions').update({
          score_tp:     scores.TP,
          score_pd:     scores.PD,
          score_ta:     scores.TA,
          score_tpp:    scores.TPP,
          completed_at: completedAt,
        }).eq('id', sessionId);

        await sb.from('responses').insert(
          responseList.map(r => ({
            session_id:   sessionId,
            question_id:  r.question_id,
            category:     r.category,
            answer_value: r.answer_value,
          }))
        );
      }

      // Fire-and-forget — email must not block the redirect
      sendEmailNotifications(sessionId, scores).catch(() => {});
    } catch (e) {
      console.warn('[assessment] completeSession error (non-fatal):', e);
    }
  }

  // POST to Supabase Edge Function → Resend → participant + Dr Firmin.
  async function sendEmailNotifications(sessionId, scores) {
    const url = window.PED.supabaseUrl;
    const key = window.PED.supabaseKey;
    const sb  = window.PED.supabase;
    if (!url || !key) return;

    const stored = JSON.parse(localStorage.getItem('ped.session') || 'null');
    const participantEmail = stored?.email
      || sessionStorage.getItem('ped.userEmail')
      || null;
    const participantName = stored?.displayName
      || sessionStorage.getItem('ped.userName')
      || 'Participant';

    let token = key;
    try {
      if (sb) {
        const { data: { session: authSession } } = await sb.auth.getSession();
        if (authSession?.access_token) token = authSession.access_token;
      }
    } catch {}

    try {
      await fetch(`${url}${EDGE_FN_PATH}`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey':        key,
        },
        body: JSON.stringify({ sessionId, scores, participantEmail, participantName }),
      });
    } catch (e) {
      console.warn('[assessment] sendEmailNotifications failed (non-fatal):', e);
    }
  }

  window.PED = window.PED || {};
  window.PED.assessment = { createSession, completeSession, sendEmailNotifications };
})();
