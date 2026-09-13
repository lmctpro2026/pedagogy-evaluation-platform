// ===========================================================================
// Assessment module — session lifecycle + Supabase persistence + email trigger.
// All Supabase calls are non-blocking: assessment flow continues regardless.
// ===========================================================================

(function () {
  const EDGE_FN_PATH = '/functions/v1/send-results-email';

  const identity = () => window.PED.identity;
  const isRegistered = () => !!identity()?.isRegistered();

  // Nothing is written while an evaluation is in progress — for anonymous and
  // signed-in participants alike. completeSession() is the first and only write.
  //
  // It stores the session, scores and all responses in one transaction via the
  // submit_assessment() database function (sprint4-attempts.sql), which also
  // enforces the 10-minute session and the two-attempts-per-year rule.
  //
  //   options.startedAt        ISO time the 10-minute session began (required)
  //   options.replacePrevious  signed-in: delete this year's earlier attempt(s)
  //
  // Resolves { saved, expired, sessionId, previousId, removed, year }. `saved`
  // is true only when the write reached the server, so the caller can tell the
  // participant the truth.
  async function completeSession(responseList, scores, options = {}) {
    const sb = window.PED.supabase;
    const result = { saved: false, expired: false, sessionId: null, previousId: null, removed: 0, year: null };

    if (sb) {
      const answers = Object.fromEntries(responseList.map(r => [r.question_id, r.answer_value]));
      const profile = identity()?.current();
      try {
        const { data, error } = await sb.rpc('submit_assessment', {
          p_responses:         answers,
          p_started_at:        options.startedAt,
          p_replace_previous:  !!options.replacePrevious && isRegistered(),
          p_participant_email: profile?.email || null,
        });
        if (error) throw error;
        result.saved      = true;
        result.sessionId  = data?.session_id || null;
        result.previousId = data?.previous_id || null;
        result.removed    = data?.removed || 0;
        result.year       = data?.year || null;
      } catch (e) {
        if (/SESSION_EXPIRED/.test(e?.message || '')) {
          result.expired = true;
        } else if (e?.code === 'PGRST202') {
          // Function not found → sprint4-attempts.sql not applied yet.
          console.warn('[assessment] submit_assessment missing — run sprint4-attempts.sql. Using legacy save.');
          Object.assign(result, await legacySave(sb, responseList, scores));
        } else {
          console.warn('[assessment] completeSession failed (non-fatal):', e.message || e);
        }
      }
    }

    try {
      if (result.sessionId) sessionStorage.setItem('ped.sessionId', result.sessionId);
      else sessionStorage.removeItem('ped.sessionId');
    } catch {}

    // An expired session is not an evaluation — don't email it.
    if (!result.expired) sendEmailNotifications(result.sessionId, scores).catch(() => {});
    return result;
  }

  // Pre-Sprint-4 write path, kept so the platform still saves if the migration
  // has not been run. It cannot enforce the attempt or session-time rules.
  async function legacySave(sb, responseList, scores) {
    const out = { saved: false, sessionId: null };
    try {
      let userId = null;
      if (isRegistered()) {
        const { data: { user } } = await sb.auth.getUser();
        userId = user?.id || null;
      }
      // Client-generated id: an anonymous caller cannot read the row back.
      const id = crypto.randomUUID();
      const { error } = await sb.from('sessions').insert([{
        id, user_id: userId,
        participant_email: identity()?.current()?.email || null,
        score_tp: scores.TP, score_pd: scores.PD, score_ta: scores.TA, score_tpp: scores.TPP,
        completed_at: new Date().toISOString(),
      }]);
      if (error) throw error;
      const { error: responsesError } = await sb.from('responses').insert(
        responseList.map(r => ({ session_id: id, ...r }))
      );
      if (responsesError && responsesError.code !== '23505') throw responsesError;
      out.saved = true;
      out.sessionId = id;
    } catch (e) {
      console.warn('[assessment] legacy save failed (non-fatal):', e.message || e);
    }
    return out;
  }

  const yearOf = iso => Number(new Intl.DateTimeFormat('en-AU', {
    year: 'numeric', timeZone: 'Australia/Melbourne',
  }).format(new Date(iso)));

  // Every stored attempt for the signed-in user within the 3-year window,
  // newest first. The newest attempt is the active result; within each year the
  // newest attempt is that year's result and any other is the "previous" one.
  //   [{ id, year, completedAt, startedAt, scores, overall, isActive, isYearResult }]
  // Resolves [] for anonymous/offline and null when the request failed.
  async function getAttempts() {
    const sb = window.PED.supabase;
    if (!sb || !isRegistered()) return [];
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return [];
      const { data, error } = await sb.from('sessions')
        .select('id, score_tp, score_pd, score_ta, score_tpp, created_at, completed_at')
        .eq('user_id', user.id)
        .not('completed_at', 'is', null)
        .gte('completed_at', new Date(Date.now() - 3 * 365.25 * 24 * 3600 * 1000).toISOString())
        .order('completed_at', { ascending: false });
      if (error) throw error;

      const seenYears = new Set();
      return (data || []).map((s, i) => {
        const year = yearOf(s.completed_at);
        const scores = { TP: Number(s.score_tp), PD: Number(s.score_pd), TA: Number(s.score_ta), TPP: Number(s.score_tpp) };
        const isYearResult = !seenYears.has(year);
        seenYears.add(year);
        return {
          id: s.id, year, scores,
          overall: window.PED.scoring.overallScore(scores),
          completedAt: s.completed_at,
          startedAt: s.created_at,
          isActive: i === 0,
          isYearResult,
        };
      });
    } catch (e) {
      console.warn('[assessment] getAttempts failed:', e.message || e);
      return null;
    }
  }

  // Delete one of the signed-in user's earlier attempts. The server refuses to
  // delete the newest (active) attempt. Resolves { ok, message }.
  async function deletePreviousAttempt(sessionId) {
    const sb = window.PED.supabase;
    if (!sb || !sessionId) return { ok: false, message: 'Not connected.' };
    try {
      const { error } = await sb.rpc('delete_previous_attempt', { p_session_id: sessionId });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      const message = e?.code === 'PGRST202'
        ? 'Deleting attempts needs the Sprint 4 database update.'
        : (e?.message || 'Could not delete the attempt.');
      return { ok: false, message };
    }
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
  window.PED.assessment = { completeSession, getAttempts, deletePreviousAttempt, saveDemographics, sendEmailNotifications };
})();
