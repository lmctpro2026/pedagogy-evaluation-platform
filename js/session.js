// ===========================================================================
// Session — who is taking the evaluation, sign-out, and the 10-minute
// evaluation session clock. Load after supabase.js on every page.
//
//   window.PED.identity.current()        → ped.session profile or null
//   window.PED.identity.isRegistered()   → signed in with an account (not anonymous)
//   window.PED.identity.begin(profile)   → start as a new participant
//   window.PED.identity.requireAccount() → resolves the Supabase user or redirects
//   window.PED.identity.signOut(reason)
//
//   window.PED.evalSession.start()       → start the 10-minute clock (no-op if running)
//   window.PED.evalSession.startedAt()   → ISO start time or null
//   window.PED.evalSession.remainingMs() → ms left (0 when expired), null if not started
//   window.PED.evalSession.isExpired()
//   window.PED.evalSession.clear()
// ===========================================================================

(function () {
  const OWNER_KEY      = 'ped.responsesOwner';
  const STARTED_KEY    = 'ped.sessionStartedAt';
  const SESSION_LIMIT_MS = 10 * 60 * 1000;

  window.PED = window.PED || {};

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }

  function current() {
    return readJSON('ped.session');
  }

  function isRegistered(profile = current()) {
    return !!profile && profile.mode !== 'anonymous' && !!profile.email;
  }

  function ownerOf(profile) {
    if (!profile) return '';
    return isRegistered(profile) ? `user:${profile.email}` : 'anonymous';
  }

  // Answers and scores on this device belong to one participant. Starting as
  // someone else clears them, so a shared computer never shows the previous
  // person's answers. Answers given before choosing (the home-page question)
  // have no owner yet and are kept.
  function begin(profile) {
    const nextOwner = ownerOf(profile);
    let prevOwner = '';
    try { prevOwner = localStorage.getItem(OWNER_KEY) || ''; } catch {}

    if (prevOwner && prevOwner !== nextOwner) clearAssessmentData();
    try {
      localStorage.setItem('ped.session', JSON.stringify(profile));
      localStorage.setItem(OWNER_KEY, nextOwner);
      sessionStorage.setItem('ped.userName',  profile.displayName || '');
      sessionStorage.setItem('ped.userEmail', profile.email || '');
    } catch {}
  }

  function clearAssessmentData() {
    try {
      ['ped.responses', 'ped.scores', 'ped.completed', OWNER_KEY, STARTED_KEY].forEach(k => localStorage.removeItem(k));
      sessionStorage.removeItem('ped.sessionId');
    } catch {}
  }

  function clearIdentity() {
    try {
      localStorage.removeItem('ped.session');
      // Scores are on the server for account holders — don't leave them on screen.
      localStorage.removeItem('ped.scores');
      localStorage.removeItem('ped.completed');
      ['ped.userName', 'ped.userEmail', 'ped.sessionId'].forEach(k => sessionStorage.removeItem(k));
    } catch {}
  }

  async function signOut(reason) {
    const sb = window.PED.supabase;
    try { if (sb) await sb.auth.signOut(); } catch {}
    clearIdentity();
    const target = document.body?.dataset.signoutRedirect || 'index.html';
    const qs = reason ? `?signedout=${encodeURIComponent(reason)}` : '';
    window.location.href = target + qs;
  }

  // Confirms a signed-in profile still has a live Supabase session.
  // Resolves the auth user, or redirects to sign in and resolves null.
  async function requireAccount() {
    const sb = window.PED.supabase;
    if (!sb) return null;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user && !session.user.is_anonymous) return session.user;
    } catch {}
    clearIdentity();
    window.location.href = 'index.html?signin=expired';
    return null;
  }

  // -------------------------------------------------------------------------
  // 10-minute evaluation session. The start time lives in localStorage so a
  // refresh or a second tab can't reset the clock. The server re-checks it on
  // submission (submit_assessment rejects anything past 10 minutes + grace).
  // -------------------------------------------------------------------------
  const evalSession = {
    LIMIT_MS: SESSION_LIMIT_MS,

    startedAt() {
      try {
        const v = localStorage.getItem(STARTED_KEY);
        return v && !Number.isNaN(Date.parse(v)) ? v : null;
      } catch { return null; }
    },

    start() {
      const existing = evalSession.startedAt();
      if (existing && !evalSession.isExpired()) return existing;
      const iso = new Date().toISOString();
      try { localStorage.setItem(STARTED_KEY, iso); } catch {}
      return iso;
    },

    remainingMs() {
      const s = evalSession.startedAt();
      if (!s) return null;
      return Math.max(0, SESSION_LIMIT_MS - (Date.now() - Date.parse(s)));
    },

    isExpired() {
      const r = evalSession.remainingMs();
      return r !== null && r <= 0;
    },

    clear() {
      try { localStorage.removeItem(STARTED_KEY); } catch {}
    },
  };

  // -------------------------------------------------------------------------
  // Signed-in state for [data-auth] elements.
  // -------------------------------------------------------------------------
  function paintAuthState(profile) {
    const member = isRegistered(profile);
    document.body.classList.toggle('is-member', member);
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = member ? (profile.displayName || profile.email) : '';
    });
  }

  document.addEventListener('click', e => {
    if (e.target.closest('[data-sign-out]')) { e.preventDefault(); signOut('manual'); }
  });

  // Scripts load at the end of <body>, so paint now to avoid a guest/member flash.
  if (document.body) paintAuthState(current());

  document.addEventListener('DOMContentLoaded', async () => {
    paintAuthState(current());
    const sb = window.PED.supabase;
    if (!sb || !isRegistered()) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user || session.user.is_anonymous) {
        // Profile says signed in but the auth session is gone (expired or
        // signed out elsewhere) — stop presenting them as signed in.
        clearIdentity();
        paintAuthState(null);
      }
    } catch {}
  });

  window.PED.identity = { current, isRegistered, begin, clearAssessmentData, requireAccount, signOut };
  window.PED.evalSession = evalSession;
})();
