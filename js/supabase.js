// ===========================================================================
// Supabase client
//
// HOW TO WIRE UP YOUR REAL PROJECT:
//   1. Go to supabase.com → your project → Settings → API
//   2. Copy "Project URL"  → paste below as SUPABASE_URL
//   3. Copy "anon / public" key → paste below as SUPABASE_ANON_KEY
//   4. Run supabase-setup.sql in the SQL editor (one paste, one click Run)
//   5. In Auth → Settings: disable "Confirm email", set Site URL to your
//      GitHub Pages URL, add it to redirect URLs.
//
// Without real credentials the app runs in offline mode — all data stays
// in localStorage and the full assessment flow still works for demo use.
// ===========================================================================

const SUPABASE_URL      = 'https://your-project.supabase.co';  // ← replace
const SUPABASE_ANON_KEY = 'your-anon-key';                     // ← replace

const _isPlaceholder = SUPABASE_URL.includes('your-project') ||
                       SUPABASE_ANON_KEY === 'your-anon-key';

let supabaseClient = null;
if (!_isPlaceholder) {
  try {
    if (window.supabase?.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
  } catch (err) {
    console.warn('[supabase] Init failed — falling back to offline mode:', err);
  }
}

window.PED = window.PED || {};
window.PED.supabase    = supabaseClient;
window.PED.offlineMode = !supabaseClient;

if (window.PED.offlineMode) {
  console.info('[supabase] Offline mode — responses stored in localStorage only.');
} else {
  console.info('[supabase] Connected to project:', SUPABASE_URL);
}

// ---------------------------------------------------------------------------
// Helpers used by questionnaire.js and results.js
// ---------------------------------------------------------------------------

/** Save a completed session + all responses to Supabase (no-op in offline mode) */
window.PED.saveSession = async function (sessionData) {
  const sb = window.PED.supabase;
  if (!sb) return null;

  try {
    const { data: { user } } = await sb.auth.getUser();
    const userId = user?.id ?? null;

    const { data: session, error: sErr } = await sb.from('assessment_sessions').insert({
      user_id:      userId,
      mode:         sessionData.mode,
      is_complete:  true,
      completed_at: new Date().toISOString()
    }).select('id').single();

    if (sErr) throw sErr;

    const rows = sessionData.responses.map(r => ({
      session_id:  session.id,
      question_id: r.questionId,
      category:    r.category,
      value:       r.value
    }));

    const { error: rErr } = await sb.from('responses').insert(rows);
    if (rErr) throw rErr;

    const scores = sessionData.scores;
    await sb.from('scores').insert({
      session_id:    session.id,
      tp_score:      scores.TP,
      pd_score:      scores.PD,
      ta_score:      scores.TA,
      tpp_score:     scores.TPP,
      overall_score: scores.overall
    });

    return session.id;
  } catch (err) {
    console.error('[supabase] saveSession failed:', err);
    return null;
  }
};

/** Fetch all past sessions for the current user */
window.PED.getSessions = async function () {
  const sb = window.PED.supabase;
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('assessment_sessions')
      .select('id, started_at, completed_at, scores(*)')
      .eq('is_complete', true)
      .order('completed_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[supabase] getSessions failed:', err);
    return [];
  }
};
