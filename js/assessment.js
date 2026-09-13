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
  //
  // Returns true only when the scores AND the responses actually reached the
  // server, so the caller can tell the participant the truth. supabase-js
  // reports failures on `error` rather than throwing, so both must be checked —
  // an RLS rejection would otherwise pass silently.
  async function completeSession(sessionId, responseList, scores) {
    const sb = window.PED.supabase;
    let saved = false;

    if (sb && sessionId) {
      try {
        const { error: sessionError } = await sb.from('sessions').update({
          score_tp:     scores.TP,
          score_pd:     scores.PD,
          score_ta:     scores.TA,
          score_tpp:    scores.TPP,
          completed_at: new Date().toISOString(),
        }).eq('id', sessionId);
        if (sessionError) throw sessionError;

        const { error: responsesError } = await sb.from('responses').insert(
          responseList.map(r => ({
            session_id:   sessionId,
            question_id:  r.question_id,
            category:     r.category,
            answer_value: r.answer_value,
          }))
        );
        // 23505 = unique_violation → this session's answers are already stored.
        if (responsesError && responsesError.code !== '23505') throw responsesError;

        saved = true;
      } catch (e) {
        console.warn('[assessment] completeSession failed (non-fatal):', e.message || e);
      }
    }

    // Fire-and-forget — the email carries the scores we already hold, so it is
    // still worth sending even if the database write did not land.
    sendEmailNotifications(sessionId, scores).catch(() => {});
    return saved;
  }

  // Persist the optional demographics for a completed session.
  // `data.provided === false` records a participant who was asked and declined.
  // The row is write-once (unique session_id, no UPDATE policy), so a repeat
  // submit — e.g. the browser back button — is treated as already-recorded
  // rather than as an error.
  // Returns true when the answer is safely on the server, false otherwise.
  async function saveDemographics(sessionId, data) {
    const sb = window.PED.supabase;
    if (!sb || !sessionId) return false;
    try {
      const { error } = await sb.from('demographics').insert([{
        session_id:     sessionId,
        provided:       data.provided !== false,
        age_group:      data.ageGroup      || null,
        gender:         data.gender        || null,
        gender_other:   data.genderOther   || null,
        academic_level: data.academicLevel || null,
      }]);
      // 23505 = unique_violation → this session already has a row.
      if (error && error.code !== '23505') {
        console.warn('[assessment] saveDemographics:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[assessment] saveDemographics error (non-fatal):', e);
      return false;
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
        // The participant may navigate to the demographics or results page
        // straight after completing — keepalive lets this small request finish
        // instead of being cancelled with the page.
        keepalive: true,
      });
    } catch (e) {
      console.warn('[assessment] sendEmailNotifications failed (non-fatal):', e);
    }
  }

  window.PED = window.PED || {};
  window.PED.assessment = { createSession, completeSession, saveDemographics, sendEmailNotifications };
})();
