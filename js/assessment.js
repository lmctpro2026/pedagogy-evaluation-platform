// ===========================================================================
// Assessment module — session lifecycle + Supabase persistence + email trigger.
// All Supabase calls are non-blocking: assessment flow continues regardless.
// ===========================================================================

(function () {
  const EDGE_FN_PATH = '/functions/v1/send-results-email';

  const identity = () => window.PED.identity;
  const isRegistered = () => !!identity()?.isRegistered();

  // Create an in-progress session row when a signed-in participant begins, so
  // the admin dashboard can see who has started. Anonymous participants get
  // nothing written until they submit (see completeSession).
  // Returns the new session UUID (string) or null.
  async function createSession() {
    const sb = window.PED.supabase;
    if (!sb || !isRegistered()) return null;
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user || user.is_anonymous) return null;
      const { data, error } = await sb.from('sessions').insert([{
        user_id:           user.id,
        participant_email: user.email || null,
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

  // Store a completed assessment: session, scores and all responses in one
  // transaction via the submit_assessment() database function
  // (sprint4-attempts.sql). For signed-in users that function also replaces
  // this year's earlier result. Then fire the email edge function.
  //
  // Resolves { saved, sessionId, replaced, year }. `saved` is true only when
  // the write actually reached the server, so the caller can tell the
  // participant the truth.
  async function completeSession(sessionId, responseList, scores) {
    const sb = window.PED.supabase;
    const result = { saved: false, sessionId: null, replaced: 0, year: null };

    if (sb) {
      const answers = Object.fromEntries(responseList.map(r => [r.question_id, r.answer_value]));
      const profile = identity()?.current();
      try {
        const { data, error } = await sb.rpc('submit_assessment', {
          p_responses:         answers,
          p_session_id:        isRegistered() ? sessionId : null,
          p_participant_email: profile?.email || null,
        });
        if (error) throw error;
        result.saved     = true;
        result.sessionId = data?.session_id || null;
        result.replaced  = data?.replaced || 0;
        result.year      = data?.year || null;
      } catch (e) {
        // PGRST202 = function not found → sprint4-attempts.sql not applied yet.
        if (e?.code === 'PGRST202') {
          console.warn('[assessment] submit_assessment missing — run sprint4-attempts.sql. Using legacy save.');
          Object.assign(result, await legacySave(sb, sessionId, responseList, scores));
        } else {
          console.warn('[assessment] completeSession failed (non-fatal):', e.message || e);
        }
      }
    }

    try {
      if (result.sessionId) sessionStorage.setItem('ped.sessionId', result.sessionId);
      else sessionStorage.removeItem('ped.sessionId');
    } catch {}

    // Fire-and-forget — the email carries the scores we already hold, so it is
    // still worth sending even if the database write did not land.
    sendEmailNotifications(result.sessionId, scores).catch(() => {});
    return result;
  }

  // Pre-Sprint-4 write path, kept so the platform still saves if the migration
  // has not been run. It cannot enforce the one-result-per-year rule.
  async function legacySave(sb, sessionId, responseList, scores) {
    const out = { saved: false, sessionId: null, replaced: 0, year: null };
    try {
      const completed = {
        score_tp: scores.TP, score_pd: scores.PD, score_ta: scores.TA, score_tpp: scores.TPP,
        completed_at: new Date().toISOString(),
      };
      let id = isRegistered() ? sessionId : null;
      if (id) {
        const { error } = await sb.from('sessions').update(completed).eq('id', id);
        if (error) throw error;
      } else {
        // Client-generated id: an anonymous caller cannot read the row back.
        id = crypto.randomUUID();
        const { error } = await sb.from('sessions').insert([{
          id, ...completed, participant_email: identity()?.current()?.email || null,
        }]);
        if (error) throw error;
      }
      const { error: responsesError } = await sb.from('responses').insert(
        responseList.map(r => ({ session_id: id, ...r }))
      );
      // 23505 = unique_violation → this session's answers are already stored.
      if (responsesError && responsesError.code !== '23505') throw responsesError;
      out.saved = true;
      out.sessionId = id;
    } catch (e) {
      console.warn('[assessment] legacy save failed (non-fatal):', e.message || e);
    }
    return out;
  }

  // Signed-in user's completed results, newest first, one per year, within
  // the 3-year retention window. Resolves [] for anonymous/offline.
  async function getHistory() {
    const sb = window.PED.supabase;
    if (!sb || !isRegistered()) return [];
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return [];
      const { data, error } = await sb.from('sessions')
        .select('id, score_tp, score_pd, score_ta, score_tpp, completed_at')
        .eq('user_id', user.id)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false });
      if (error) throw error;

      const yearOf = iso => Number(new Intl.DateTimeFormat('en-AU', {
        year: 'numeric', timeZone: 'Australia/Melbourne',
      }).format(new Date(iso)));
      const cutoff = Date.now() - 3 * 365.25 * 24 * 3600 * 1000;
      const byYear = new Map();
      for (const s of data || []) {
        if (new Date(s.completed_at).getTime() < cutoff) continue;
        const year = yearOf(s.completed_at);
        if (byYear.has(year)) continue;   // rows are newest first — keep the latest
        byYear.set(year, {
          id: s.id,
          year,
          completedAt: s.completed_at,
          scores: { TP: Number(s.score_tp), PD: Number(s.score_pd), TA: Number(s.score_ta), TPP: Number(s.score_tpp) },
        });
      }
      return [...byYear.values()];
    } catch (e) {
      console.warn('[assessment] getHistory failed:', e.message || e);
      return null;   // null = could not load, distinct from "no results"
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
  window.PED.assessment = { createSession, completeSession, getHistory, saveDemographics, sendEmailNotifications };
})();
