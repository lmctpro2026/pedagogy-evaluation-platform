// ===========================================================================
// Session — who is taking the assessment, sign-out, and the 10-minute idle
// timeout for signed-in users. Load after supabase.js on every page.
//
//   window.PED.identity.current()        → ped.session profile or null
//   window.PED.identity.isRegistered()   → signed in with an account (not anonymous)
//   window.PED.identity.begin(profile)   → start as a new participant
//   window.PED.identity.requireAccount() → resolves the Supabase user or redirects
//   window.PED.identity.signOut(reason)
// ===========================================================================

(function () {
  const IDLE_LIMIT_MS = 10 * 60 * 1000;
  const WARN_AT_MS    = 9 * 60 * 1000;
  const ACTIVITY_KEY  = 'ped.lastActivity';
  const OWNER_KEY     = 'ped.responsesOwner';

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
    touch(true);
  }

  function clearAssessmentData() {
    try {
      ['ped.responses', 'ped.scores', 'ped.completed', OWNER_KEY].forEach(k => localStorage.removeItem(k));
      sessionStorage.removeItem('ped.sessionId');
    } catch {}
  }

  function clearIdentity() {
    try {
      localStorage.removeItem('ped.session');
      localStorage.removeItem(ACTIVITY_KEY);
      // Scores are on the server for account holders — don't leave them on screen.
      localStorage.removeItem('ped.scores');
      localStorage.removeItem('ped.completed');
      ['ped.userName', 'ped.userEmail', 'ped.sessionId'].forEach(k => sessionStorage.removeItem(k));
    } catch {}
  }

  async function signOut(reason) {
    stopIdleWatch();
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
  // Idle timeout — shared across tabs through localStorage.
  // -------------------------------------------------------------------------
  let lastWrite = 0;
  let timer = null;
  let dialog = null;

  function lastActivity() {
    try { return parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10) || 0; } catch { return 0; }
  }

  function touch(force) {
    const now = Date.now();
    if (!force && now - lastWrite < 10000) return;   // throttle writes
    lastWrite = now;
    try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch {}
  }

  function onActivity() {
    if (dialog && !dialog.hidden) return;   // only "Stay signed in" dismisses the warning
    touch(false);
  }

  // Inlined so the dialog also works on admin.html, which doesn't load main.css.
  const DIALOG_CSS = `
    .idle-dialog { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center;
      padding: 1.5rem; background: rgba(8,6,4,.72); backdrop-filter: blur(10px); }
    .idle-dialog[hidden] { display: none; }
    .idle-card { width: min(440px, 100%); background: #161310; border: 1px solid #2A2520;
      border-radius: 18px; padding: 1.75rem; color: #F5F0E8; font-family: 'Poppins', sans-serif;
      box-shadow: 0 40px 80px -30px rgba(0,0,0,.8); }
    .idle-card .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: .7rem; letter-spacing: .2em;
      text-transform: uppercase; color: #E8A84E; margin-bottom: .6rem; }
    .idle-card h2 { font-size: 1.4rem; font-weight: 800; letter-spacing: -.02em; line-height: 1.2; margin: 0 0 .6rem; }
    .idle-card p { color: #A39A8C; font-size: .9rem; line-height: 1.6; margin: 0 0 1.25rem; }
    .idle-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
    #idle-count { color: #E8A84E; font-variant-numeric: tabular-nums; }`;

  function ensureDialog() {
    if (dialog) return dialog;
    const style = document.createElement('style');
    style.textContent = DIALOG_CSS;
    document.head.appendChild(style);
    dialog = document.createElement('div');
    dialog.className = 'idle-dialog';
    dialog.hidden = true;
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'idle-title');
    dialog.innerHTML = `
      <div class="idle-card">
        <div class="eyebrow">Still there?</div>
        <h2 id="idle-title">You'll be signed out in <span id="idle-count">60</span>s</h2>
        <p>For your privacy, accounts sign out after 10 minutes without activity.
           Answers you've already given stay saved for when you sign back in.</p>
        <div class="idle-actions">
          <button type="button" class="btn btn-primary" id="idle-stay">Stay signed in</button>
          <button type="button" class="btn btn-ghost" id="idle-out">Sign out now</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('#idle-stay').addEventListener('click', () => {
      dialog.hidden = true;
      touch(true);
    });
    dialog.querySelector('#idle-out').addEventListener('click', () => signOut('manual'));
    return dialog;
  }

  function tick() {
    const idle = Date.now() - lastActivity();
    if (idle >= IDLE_LIMIT_MS) return signOut('idle');
    if (idle >= WARN_AT_MS) {
      const d = ensureDialog();
      const wasHidden = d.hidden;
      d.hidden = false;
      d.querySelector('#idle-count').textContent = Math.max(0, Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      if (wasHidden) d.querySelector('#idle-stay').focus();
    } else if (dialog && !dialog.hidden) {
      dialog.hidden = true;   // another tab kept the session alive
    }
  }

  const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

  function startIdleWatch() {
    if (timer) return;
    const last = lastActivity();
    if (last && Date.now() - last >= IDLE_LIMIT_MS) { signOut('idle'); return; }
    touch(true);
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    timer = setInterval(tick, 1000);
  }

  function stopIdleWatch() {
    clearInterval(timer);
    timer = null;
    ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, onActivity));
  }

  // -------------------------------------------------------------------------
  // Boot — idle watch for any real (non-anonymous) Supabase session, including
  // the admin dashboard, and signed-in state for [data-auth] elements.
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
    if (!sb) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      const live = session?.user && !session.user.is_anonymous;
      if (live) {
        startIdleWatch();
      } else if (isRegistered()) {
        // Profile says signed in but the auth session is gone (expired or
        // signed out elsewhere) — stop presenting them as signed in.
        clearIdentity();
        paintAuthState(null);
      }
    } catch {}
  });

  window.PED.identity = {
    current, isRegistered, begin, clearAssessmentData, requireAccount, signOut, startIdleWatch,
    markActive: () => touch(true),
  };
})();
