// ===========================================================================
// Auth modal — UI, validation, and all three Supabase auth flows.
//
// The modal is rendered by this file, so any page that loads auth.js (with
// css/modal.css) can open it. Open it with [data-open-modal="signin|register"]
// or PED.openModal(tab, { intent }).
//
// Intents decide what happens after a successful sign-in or registration:
//   start (default) — the participant is taken to the questionnaire
//   claim           — a page keeps the participant where they are and attaches
//                     their anonymous result to the new account: the page
//                     listens for the 'ped:signed-in' event and calls
//                     preventDefault() to take over (see js/results.js)
// ===========================================================================

(function () {
  const $  = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const MODAL_HTML = `
<div class="modal-backdrop" id="auth-modal">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <button type="button" class="modal-close" aria-label="Close">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>

    <p class="eyebrow modal-eyebrow" id="modal-eyebrow">Access</p>
    <h2 id="modal-title" class="modal-title">Start the assessment</h2>
    <p class="modal-sub" id="modal-sub">Sign in, create an account, or continue anonymously.</p>

    <div class="tabs" role="group" aria-label="Access options">
      <button type="button" class="tab active" data-tab="signin">Sign in</button>
      <button type="button" class="tab" data-tab="register">Create account</button>
      <button type="button" class="tab" data-tab="anonymous">Anonymous</button>
    </div>

    <!-- Sign in -->
    <form class="panel active" data-panel="signin" id="signin-form" novalidate>
      <div class="field">
        <label for="l-email">Email</label>
        <input id="l-email" type="email" placeholder="you@university.edu" autocomplete="email" />
        <span class="err"></span>
      </div>
      <div class="field">
        <label for="l-pass">Password</label>
        <input id="l-pass" type="password" placeholder="Your password" autocomplete="current-password" />
        <span class="err"></span>
      </div>
      <div class="alt-line forgot-line"><button type="button" data-open-modal="forgot">Forgot password?</button></div>
      <button class="btn btn-primary" id="l-submit" type="submit" disabled>Sign in &amp; continue</button>
      <div class="alt-line">New here? <button type="button" data-open-modal="register">Create an account</button></div>
    </form>

    <!-- Register -->
    <form class="panel" data-panel="register" id="register-form" novalidate>
      <div class="field">
        <label for="r-name">Full name</label>
        <input id="r-name" type="text" placeholder="First Last" autocomplete="name" />
        <span class="err"></span>
      </div>
      <div class="field">
        <label for="r-email">Email</label>
        <input id="r-email" type="email" placeholder="you@university.edu" autocomplete="email" />
        <span class="err"></span>
      </div>
      <div class="field">
        <label for="r-pass">Password</label>
        <input id="r-pass" type="password" placeholder="At least 6 characters" autocomplete="new-password" />
        <span class="err"></span>
        <div class="strength" id="r-strength" aria-hidden="true">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </div>
        <span class="strength-label" id="r-strength-label"></span>
      </div>
      <label class="consent">
        <input id="r-consent" type="checkbox" />
        <span>I consent to my completed evaluations being stored for up to 3 years to generate my report and show my progress over time. No data is shared with third parties.</span>
      </label>
      <button class="btn btn-primary" id="r-submit" type="submit" disabled>Create account &amp; begin</button>
      <div class="alt-line">Already registered? <button type="button" data-open-modal="signin">Sign in instead</button></div>
    </form>

    <!-- Email verification code (shown after register) -->
    <div class="panel otp-panel" data-panel="verify" id="verify-panel">
      <div class="otp-intro">
        <svg class="otp-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/></svg>
        <p>We sent a <strong>6-digit code</strong> to</p>
        <p class="otp-email" id="otp-email-display">your email address</p>
        <p class="otp-hint">Check your inbox and spam folder. Code expires in 1 hour.</p>
      </div>
      <div class="field">
        <label for="otp-code">Verification code</label>
        <input id="otp-code" type="text" inputmode="numeric" placeholder="000000" maxlength="6" autocomplete="one-time-code" />
        <span class="err" id="otp-code-err"></span>
      </div>
      <button class="btn btn-primary" id="otp-submit" type="button" disabled>Verify &amp; begin →</button>
      <div class="alt-line">Didn't receive it? <button type="button" id="otp-resend">Resend code</button></div>
    </div>

    <!-- Forgot password: ask for a reset code -->
    <form class="panel" data-panel="forgot" id="forgot-form" novalidate>
      <div class="field">
        <label for="f-email">Email</label>
        <input id="f-email" type="email" placeholder="you@university.edu" autocomplete="email" />
        <span class="err"></span>
      </div>
      <button class="btn btn-primary" id="f-submit" type="submit" disabled>Email me a code</button>
      <div class="alt-line">Remembered it? <button type="button" data-open-modal="signin">Back to sign in</button></div>
    </form>

    <!-- Forgot password: enter the code and choose a new password -->
    <form class="panel otp-panel reset-panel" data-panel="reset" id="reset-form" novalidate>
      <div class="otp-intro">
        <svg class="otp-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2"/></svg>
        <p>If an account exists for</p>
        <p class="otp-email" id="reset-email-display">your email address</p>
        <p class="otp-hint">a <strong>6-digit code</strong> is on its way. Check your inbox and spam folder. Code expires in 1 hour.</p>
      </div>
      <div class="field">
        <label for="reset-code">Reset code</label>
        <input id="reset-code" type="text" inputmode="numeric" placeholder="000000" maxlength="6" autocomplete="one-time-code" />
        <span class="err"></span>
      </div>
      <div class="field field-text">
        <label for="n-pass">New password</label>
        <input id="n-pass" type="password" placeholder="At least 6 characters" autocomplete="new-password" />
        <span class="err"></span>
        <div class="strength" id="n-strength" aria-hidden="true">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </div>
        <span class="strength-label" id="n-strength-label"></span>
      </div>
      <button class="btn btn-primary" id="reset-submit" type="submit" disabled>Set password &amp; sign in</button>
      <div class="alt-line">Didn't receive it? <button type="button" id="reset-resend">Resend code</button></div>
    </form>

    <!-- Anonymous -->
    <form class="panel anon-panel" data-panel="anonymous" id="anon-form" novalidate>
      <div class="anon-card">
        <h4>One click, no account</h4>
        <p>Take the full assessment, see your scores and export a PDF without registering. Nothing is stored until you submit — then your answers are saved without your name.</p>
      </div>
      <label class="consent">
        <input id="a-consent" type="checkbox" />
        <span>I understand my completed answers are stored anonymously for research, for up to 3 years.</span>
      </label>
      <button class="btn btn-primary" id="a-submit" type="submit" disabled>Continue anonymously →</button>
      <div class="alt-line">Want to compare years? <button type="button" data-open-modal="register">Create an account</button></div>
    </form>
  </div>
</div>`;

  if (!document.getElementById('auth-modal')) document.body.insertAdjacentHTML('beforeend', MODAL_HTML);

  // Copy per intent. The verify panel keeps its own title.
  const COPY = {
    start: {
      eyebrow: 'Access', title: 'Start the assessment',
      sub: 'Sign in, create an account, or continue anonymously.',
      signin: 'Sign in &amp; continue', register: 'Create account &amp; begin', verify: 'Verify &amp; begin →',
      reset: 'Set password &amp; sign in',
    },
    claim: {
      eyebrow: 'Keep this result', title: 'Save your results',
      sub: 'Create an account or sign in — this result is saved to it and appears on your dashboard.',
      signin: 'Sign in &amp; save results', register: 'Create account &amp; save', verify: 'Verify &amp; save results →',
      reset: 'Set password &amp; save results',
    },
  };
  let modalIntent = 'start';

  function applyIntent(intent) {
    modalIntent = COPY[intent] ? intent : 'start';
    const c = COPY[modalIntent];
    $('#modal-eyebrow').textContent = c.eyebrow;
    $('#modal-sub').textContent = c.sub;
    $('#l-submit').innerHTML   = c.signin;
    $('#r-submit').innerHTML   = c.register;
    $('#otp-submit').innerHTML = c.verify;
    $('#reset-submit').innerHTML = c.reset;
    $('#auth-modal .modal').classList.toggle('is-claim', modalIntent === 'claim');
  }

  // Pending OTP state — set when registration needs email verification.
  // Persisted to sessionStorage so an accidental refresh doesn't strand the
  // user halfway through verification.
  let pendingEmail = '';
  let pendingName  = '';

  const PENDING_KEY = 'ped.pendingVerify';
  function savePending() {
    try {
      if (pendingEmail) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ email: pendingEmail, name: pendingName, intent: modalIntent, ts: Date.now() }));
      else              sessionStorage.removeItem(PENDING_KEY);
    } catch {}
  }
  function loadPending() {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      // Expire after 60 minutes — same as Supabase OTP expiry
      if (!obj?.email || (Date.now() - (obj.ts || 0)) > 60 * 60 * 1000) {
        sessionStorage.removeItem(PENDING_KEY);
        return null;
      }
      return obj;
    } catch { return null; }
  }

  // Pending password reset — the address a reset code was sent to. Kept for
  // the tab like the verification state, so a refresh returns to the code step.
  let resetEmail = '';
  const RESET_KEY = 'ped.pendingReset';
  function saveReset() {
    try {
      if (resetEmail) sessionStorage.setItem(RESET_KEY, JSON.stringify({ email: resetEmail, intent: modalIntent, ts: Date.now() }));
      else            sessionStorage.removeItem(RESET_KEY);
    } catch {}
  }
  function loadReset() {
    try {
      const raw = sessionStorage.getItem(RESET_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.email || (Date.now() - (obj.ts || 0)) > 60 * 60 * 1000) {
        sessionStorage.removeItem(RESET_KEY);
        return null;
      }
      return obj;
    } catch { return null; }
  }
  function showResetStep(email) {
    resetEmail = email;
    saveReset();
    const el = document.getElementById('reset-email-display');
    if (el) el.textContent = email;
    switchTab('reset');
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const OFFLINE_MSG = "Can't reach the sign-in service right now. Check your connection, or continue anonymously.";
  const isNetworkError = err => /fetch|network|load failed|timed? ?out/i.test(err?.message || String(err || ''));
  const normEmail = v => (v || '').trim().toLowerCase();

  // -----------------------------------------------------------------------
  // Toast
  // -----------------------------------------------------------------------
  function ensureToast() {
    let t = document.getElementById('ped-toast');
    if (t) return t;
    t = document.createElement('div');
    t.id = 'ped-toast';
    t.style.cssText = `
      position:fixed; left:50%; bottom:28px; transform:translate(-50%,16px);
      max-width:min(92vw,480px); background:#17202C; color:#fff;
      padding:.7rem 1rem; border-radius:8px; font-family:'IBM Plex Sans',system-ui,sans-serif;
      font-size:.9rem; line-height:1.45; z-index:10000; opacity:0;
      transition:opacity .2s ease, transform .2s ease;
      box-shadow:0 8px 24px rgba(23,32,44,.25); pointer-events:none;
    `;
    document.body.appendChild(t);
    return t;
  }
  function showToast(msg, ms = 3200) {
    const t = ensureToast();
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translate(-50%,0)'; });
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.opacity='0'; t.style.transform='translate(-50%,24px)'; }, ms);
  }

  // -----------------------------------------------------------------------
  // Modal open/close
  // -----------------------------------------------------------------------
  function openModal(initialTab, { intent } = {}) {
    const backdrop = $('#auth-modal');
    if (!backdrop) return;
    applyIntent(intent || modalIntent);
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (initialTab) switchTab(initialTab);
  }
  function closeModal() {
    const backdrop = $('#auth-modal');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    applyIntent('start');
    document.body.style.overflow = '';
    $$('#auth-modal input[type="text"],#auth-modal input[type="email"],#auth-modal input[type="password"]')
      .forEach(i => { i.value = ''; i.dispatchEvent(new Event('input')); });
    $$('#auth-modal input[type="checkbox"]').forEach(c => { c.checked = false; });
    $$('#auth-modal .field').forEach(f => f.classList.remove('is-valid','is-invalid'));
    $$('#auth-modal .err').forEach(e => { e.textContent = ''; });
    $$('#auth-modal .strength').forEach(b => { b.className = 'strength'; });
    $$('#auth-modal .strength-label').forEach(l => { l.textContent = ''; });
    // Reset OTP and password-reset state (in-memory AND persisted)
    pendingEmail = '';
    pendingName  = '';
    savePending();
    resetEmail = '';
    saveReset();
    switchTab('signin');
    syncSubmitButtons();
  }
  window.PED = window.PED || {};
  window.PED.openModal  = openModal;
  window.PED.closeModal = closeModal;
  window.PED.toast      = showToast;

  // -----------------------------------------------------------------------
  // Tabs
  // -----------------------------------------------------------------------
  // Steps that are not one of the three tabs: the tab row is hidden and the
  // step carries its own title (and sub-copy where it differs from the intent's).
  const STEP_COPY = {
    verify: { title: 'Verify your email' },
    forgot: { title: 'Reset your password', sub: "Enter the address you registered with and we'll email you a 6-digit code." },
    reset:  { title: 'Choose a new password', sub: 'Enter the code from the email, then choose a new password.' },
  };
  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    const step = STEP_COPY[name];
    const tabsEl = $('.tabs');
    if (tabsEl) tabsEl.style.display = step ? 'none' : '';
    const titleEl = $('#modal-title');
    if (titleEl) titleEl.textContent = step?.title || COPY[modalIntent].title;
    const subEl = $('#modal-sub');
    if (subEl) subEl.textContent = step?.sub || COPY[modalIntent].sub;
  }

  // -----------------------------------------------------------------------
  // Delegated click handler
  // -----------------------------------------------------------------------
  document.addEventListener('click', e => {
    // Direct anonymous start — no modal required
    if (e.target.closest('[data-anon-start]')) {
      e.preventDefault();
      startAnonymous();
      return;
    }

    const openBtn = e.target.closest('[data-open-modal]');
    if (openBtn) { e.preventDefault(); openModal(openBtn.dataset.openModal || 'signin', { intent: openBtn.dataset.intent }); return; }

    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.tab) { switchTab(tab.dataset.tab); return; }

    // Close only when the × button is clicked, or the backdrop itself is clicked
    // (not an element inside it — `closest` would bubble up to the backdrop).
    if (e.target.closest('.modal-close')) { closeModal(); return; }
    if (e.target.id === 'auth-modal')    { closeModal(); return; }
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // -----------------------------------------------------------------------
  // Validation helpers
  // -----------------------------------------------------------------------
  function setField(fieldId, ok, message) {
    const wrap = document.getElementById(fieldId)?.closest('.field');
    if (!wrap) return;
    wrap.classList.remove('is-valid','is-invalid');
    if (ok === true)  wrap.classList.add('is-valid');
    if (ok === false) wrap.classList.add('is-invalid');
    const err = wrap.querySelector('.err');
    if (err) err.textContent = message || '';
  }
  function showFieldError(id, msg) { setField(id, false, msg); }
  function validEmail(v) { return emailRe.test((v||'').trim()); }
  function validPass(v)  { return (v||'').length >= 6; }
  function validName(v)  {
    const s = (v||'').trim();
    return s.includes(' ') && s.split(' ').filter(Boolean).length >= 2 && s.length >= 3;
  }

  function passwordStrength(p) {
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8)  score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p))   score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    return Math.min(score, 5);
  }
  const STRENGTH_LABEL = ['','Weak','Fair','Moderate','Strong','Very Strong'];

  function attach(id, validator, errMsg) {
    const el = document.getElementById(id);
    if (!el) return;
    const run = () => {
      const v = el.value;
      if (!v) { setField(id, null, ''); syncSubmitButtons(); return; }
      const ok = validator(v);
      setField(id, ok, ok ? '' : errMsg);
      syncSubmitButtons();
    };
    el.addEventListener('input', run);
    el.addEventListener('blur',  run);
  }

  function syncSubmitButtons() {
    const liBtn = $('#l-submit');
    if (liBtn) liBtn.disabled = !(validEmail($('#l-email')?.value||'') && validPass($('#l-pass')?.value||''));

    const rBtn = $('#r-submit');
    if (rBtn) rBtn.disabled = !(
      validName($('#r-name')?.value||'') &&
      validEmail($('#r-email')?.value||'') &&
      validPass($('#r-pass')?.value||'') &&
      $('#r-consent')?.checked
    );

    const aBtn = $('#a-submit');
    if (aBtn) aBtn.disabled = !$('#a-consent')?.checked;

    const fBtn = $('#f-submit');
    if (fBtn) fBtn.disabled = !validEmail($('#f-email')?.value||'');

    const nBtn = $('#reset-submit');
    if (nBtn) nBtn.disabled = !(($('#reset-code')?.value||'').length === 6 && validPass($('#n-pass')?.value||''));
  }

  // Password field with the strength meter (register and reset).
  function wirePassword(inputId, barsId, labelId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const bars  = document.getElementById(barsId);
    const label = document.getElementById(labelId);
    const run = () => {
      const v = input.value;
      const ok = validPass(v);
      setField(inputId, v ? ok : null, ok ? '' : 'Password must be at least 6 characters.');
      const s = passwordStrength(v);
      if (bars)  bars.className = 'strength s' + s;
      if (label) label.textContent = v ? STRENGTH_LABEL[s] : '';
      syncSubmitButtons();
    };
    input.addEventListener('input', run);
    input.addEventListener('blur',  run);
  }

  // -----------------------------------------------------------------------
  // Form wiring
  // -----------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    attach('l-email', validEmail, 'Please enter a valid email address.');
    attach('l-pass',  validPass,  'Password must be at least 6 characters.');
    attach('r-name',  validName,  'Please enter your first and last name.');
    attach('r-email', validEmail, 'Please enter a valid email address.');
    attach('f-email', validEmail, 'Please enter a valid email address.');
    wirePassword('r-pass', 'r-strength', 'r-strength-label');
    wirePassword('n-pass', 'n-strength', 'n-strength-label');

    document.getElementById('r-consent')?.addEventListener('change', syncSubmitButtons);
    document.getElementById('a-consent')?.addEventListener('change', syncSubmitButtons);

    document.getElementById('signin-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#l-email').value.trim();
      const pass  = $('#l-pass').value;
      if (!validEmail(email)) return showFieldError('l-email','Please enter a valid email address.');
      if (!validPass(pass))   return showFieldError('l-pass','Password must be at least 6 characters.');
      await doLogin(email, pass);
    });

    document.getElementById('register-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name  = $('#r-name').value.trim();
      const email = $('#r-email').value.trim();
      const pass  = $('#r-pass').value;
      if (!validName(name))   return showFieldError('r-name','Please enter your first and last name.');
      if (!validEmail(email)) return showFieldError('r-email','Please enter a valid email address.');
      if (!validPass(pass))   return showFieldError('r-pass','Password must be at least 6 characters.');
      await doRegister(name, email, pass);
    });

    document.getElementById('anon-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      await startAnonymous();
    });

    // ---- Forgot password ----
    document.getElementById('forgot-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#f-email').value.trim();
      if (!validEmail(email)) return showFieldError('f-email', 'Please enter a valid email address.');
      await doForgot(email);
    });

    const resetCode = document.getElementById('reset-code');
    if (resetCode) {
      resetCode.addEventListener('input', () => {
        resetCode.value = resetCode.value.replace(/\D/g, '').slice(0, 6);
        setField('reset-code', null, '');
        syncSubmitButtons();
      });
    }

    document.getElementById('reset-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const code = ($('#reset-code').value || '').trim();
      const pass = $('#n-pass').value;
      if (code.length !== 6) return showFieldError('reset-code', 'Enter the 6-digit code from the email.');
      if (!validPass(pass))  return showFieldError('n-pass', 'Password must be at least 6 characters.');
      await doReset(code, pass);
    });

    document.getElementById('reset-resend')?.addEventListener('click', async () => {
      const sb = window.PED.supabase;
      if (!sb || !resetEmail) return;
      try {
        const { error } = await sb.auth.resetPasswordForEmail(resetEmail);
        if (error) { console.error('[auth] reset resend error:', error); showToast(`Could not resend: ${error.message}`); }
        else      { showToast('New code sent — check your inbox.'); }
      } catch (err) {
        console.error('[auth] reset resend exception:', err);
        showToast('Could not resend. Please try again.');
      }
    });

    // ---- OTP panel wiring ----
    const otpInput  = document.getElementById('otp-code');
    const otpSubmit = document.getElementById('otp-submit');
    const otpResend = document.getElementById('otp-resend');
    const otpErr    = document.getElementById('otp-code-err');

    if (otpInput) {
      otpInput.addEventListener('input', () => {
        // Allow digits only, auto-enable submit at 6 chars
        otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
        if (otpSubmit) otpSubmit.disabled = otpInput.value.length !== 6;
        if (otpErr) otpErr.textContent = '';
      });
    }

    if (otpSubmit) {
      otpSubmit.addEventListener('click', async () => {
        const code = (otpInput?.value || '').trim();
        if (code.length !== 6) return;
        if (!pendingEmail) {
          if (otpErr) otpErr.textContent = 'Lost track of your email — please register again.';
          console.error('[auth] OTP submit but pendingEmail is empty');
          return;
        }
        const sb = window.PED.supabase;
        const origText = otpSubmit.innerHTML;
        otpSubmit.disabled = true;
        otpSubmit.innerHTML = 'Verifying…';
        try {
          if (sb) {
            console.log('[auth] verifyOtp →', { email: pendingEmail, token: code, type: 'signup' });
            const { data, error } = await sb.auth.verifyOtp({
              email: normEmail(pendingEmail),
              token: code,
              type:  'signup',
            });
            console.log('[auth] verifyOtp ←', { error, user: data?.user, hasSession: !!data?.session });

            if (error) {
              const msg = (error.message || '').toLowerCase();
              let display;
              if (msg.includes('expired')) display = 'Code expired — click "Resend" below.';
              else if (msg.includes('invalid') || msg.includes('otp') || msg.includes('token')) {
                display = 'Incorrect code. Note: if you clicked Resend, only the newest code works.';
              } else {
                display = error.message || 'Verification failed.';
              }
              if (otpErr) otpErr.textContent = display;
              otpSubmit.disabled = false;
              otpSubmit.innerHTML = origText;
              return;
            }

            // verifyOtp success should also establish a session. If it didn't,
            // try to refresh it explicitly so questionnaire.html sees the user.
            if (!data?.session) {
              console.warn('[auth] verifyOtp succeeded but no session returned — fetching');
              await sb.auth.getSession();
            }

            if (data?.user) {
              await upsertUserProfile(data.user.id, {
                email: normEmail(pendingEmail), full_name: pendingName,
                is_anonymous: false, consent_given: true,
              });
            }
          }
          const displayName = (pendingName || '').split(' ')[0] || 'You';
          const profile = { mode: 'register', email: normEmail(pendingEmail), displayName, fullName: pendingName, ts: Date.now() };
          pendingEmail = ''; pendingName = ''; savePending();
          finishSignIn(profile, 'questionnaire.html', 400);
        } catch (err) {
          console.error('[auth] OTP verify exception:', err);
          if (otpErr) otpErr.textContent = `Verification failed: ${err.message || err}`;
          otpSubmit.disabled = false;
          otpSubmit.innerHTML = origText;
        }
      });
    }

    if (otpResend) {
      otpResend.addEventListener('click', async () => {
        const sb = window.PED.supabase;
        if (!sb || !pendingEmail) return;
        try {
          console.log('[auth] resend OTP →', { email: pendingEmail });
          const { error } = await sb.auth.resend({ type: 'signup', email: normEmail(pendingEmail) });
          if (error) { console.error('[auth] resend error:', error); showToast(`Could not resend: ${error.message}`); }
          else      { showToast('New code sent — check your inbox.'); }
        } catch (err) {
          console.error('[auth] resend exception:', err);
          showToast('Could not resend. Please try again.');
        }
      });
    }

    // If sessionStorage has a pending verification (e.g., user refreshed mid-flow),
    // restore it and auto-open the OTP panel so they can finish.
    const pend = loadPending();
    if (pend) {
      pendingEmail = pend.email;
      pendingName  = pend.name || '';
      const otpEmailEl = document.getElementById('otp-email-display');
      if (otpEmailEl) otpEmailEl.textContent = pendingEmail;
      console.log('[auth] Restored pending verification for', pendingEmail);
      openModal('verify', { intent: pend.intent });
    } else {
      const reset = loadReset();
      if (reset) {
        openModal(null, { intent: reset.intent });
        showResetStep(reset.email);
      }
    }

    syncSubmitButtons();
  });

  // -----------------------------------------------------------------------
  // Session storage helpers
  // -----------------------------------------------------------------------
  // Hand the chosen identity to session.js, which also clears a previous
  // participant's answers from this device.
  function enterAs(profile) {
    if (window.PED.identity) { window.PED.identity.begin(profile); return; }
    try {
      localStorage.setItem('ped.session', JSON.stringify(profile));
      sessionStorage.setItem('ped.userName',  profile.displayName || '');
      sessionStorage.setItem('ped.userEmail', profile.email || '');
    } catch {}
  }

  // Signed in or registered. With the default intent the participant becomes
  // the current identity and moves on to `next`. A page that opened the modal
  // with another intent (results.js: 'claim') takes over by cancelling the
  // event — it decides what to do with the profile and where to go.
  function finishSignIn(profile, next, delayMs) {
    const event = new CustomEvent('ped:signed-in', { detail: { profile, intent: modalIntent }, cancelable: true });
    const handled = !document.dispatchEvent(event);
    if (handled) { closeModal(); return; }
    enterAs(profile);
    closeModal();
    setTimeout(() => { window.location.href = next; }, delayMs);
  }

  function setSubmitting(btnId, on) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (on) { btn._orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Working…'; }
    else    { btn.disabled = false; btn.innerHTML = btn._orig ?? btn.innerHTML; }
  }

  // -----------------------------------------------------------------------
  // Upsert user profile row in public.users
  // -----------------------------------------------------------------------
  async function upsertUserProfile(userId, { email, full_name, is_anonymous, consent_given }) {
    const sb = window.PED.supabase;
    if (!sb || !userId) return;
    try {
      await sb.from('users').upsert({
        id: userId,
        ...(email       ? { email }       : {}),
        ...(full_name   ? { full_name }   : {}),
        is_anonymous:  is_anonymous  ?? true,
        consent_given: consent_given ?? false,
      }, { onConflict: 'id' });
    } catch (e) {
      console.warn('[auth] upsertUserProfile failed (non-fatal):', e);
    }
  }

  // -----------------------------------------------------------------------
  // Auth flows
  // -----------------------------------------------------------------------
  async function doLogin(email, password) {
    const sb = window.PED.supabase;
    let fullName = '';
    setSubmitting('l-submit', true);
    try {
      if (sb) {
        console.log('[auth] signInWithPassword →', { email: normEmail(email) });
        const { data, error } = await sb.auth.signInWithPassword({ email: normEmail(email), password });
        console.log('[auth] signInWithPassword ←', { error, hasSession: !!data?.session });

        if (error) {
          const msg = (error.message || '').toLowerCase();

          // "Email not confirmed" — user registered but never finished OTP.
          // Drop them back on the verify panel and resend a fresh code.
          if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
            console.warn('[auth] sign-in blocked — email not confirmed, restoring OTP panel');
            pendingEmail = normEmail(email);
            pendingName  = '';
            savePending();
            const otpEmailEl = document.getElementById('otp-email-display');
            if (otpEmailEl) otpEmailEl.textContent = pendingEmail;
            setSubmitting('l-submit', false);
            switchTab('verify');
            // Auto-resend a fresh code
            try {
              await sb.auth.resend({ type: 'signup', email: pendingEmail });
              showToast('A new verification code was sent to your inbox.');
            } catch (resendErr) {
              console.warn('[auth] resend after not-confirmed error:', resendErr);
              showToast('Please check your inbox for the verification code, or click Resend.');
            }
            return;
          }

          showFieldError('l-pass', isNetworkError(error) ? OFFLINE_MSG
            : msg.includes('invalid') || msg.includes('credentials')
            ? 'Invalid email or password.' : (error.message || 'Sign-in failed.'));
          setSubmitting('l-submit', false);
          return;
        }
        if (data?.user) {
          await upsertUserProfile(data.user.id, { email: normEmail(email), is_anonymous: false, consent_given: true });
          fullName = await fetchFullName(data.user.id);
        }
      }
      const ne = normEmail(email);
      const displayName = (fullName || '').split(' ')[0] || ne.split('@')[0];
      finishSignIn({ mode: 'email', email: ne, displayName, fullName, ts: Date.now() }, nextPage(), 0);
    } catch (err) {
      console.error('[auth] login error:', err);
      showFieldError('l-pass', isNetworkError(err) ? OFFLINE_MSG : 'Sign-in failed. Please try again.');
      setSubmitting('l-submit', false);
    }
  }

  // Forgot password, step 1: ask Supabase for a recovery code. The response is
  // the same whether or not the address has an account, so addresses cannot be
  // enumerated from this form; the next step says "if an account exists".
  async function doForgot(rawEmail) {
    const sb = window.PED.supabase;
    const email = normEmail(rawEmail);
    if (!sb) return showFieldError('f-email', OFFLINE_MSG);
    setSubmitting('f-submit', true);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email);
      if (error) {
        const msg = (error.message || '').toLowerCase();
        showFieldError('f-email', isNetworkError(error) ? OFFLINE_MSG
          : /rate limit|too many/.test(msg) ? 'Too many requests — wait a minute and try again.'
          : (error.message || 'Could not send the code.'));
        return;
      }
      showResetStep(email);
    } catch (err) {
      console.error('[auth] forgot error:', err);
      showFieldError('f-email', isNetworkError(err) ? OFFLINE_MSG : 'Could not send the code. Please try again.');
    } finally {
      setSubmitting('f-submit', false);
    }
  }

  // Forgot password, step 2: the recovery code signs the participant in, the
  // new password is set on that session, and sign-in finishes as usual (so a
  // reset started from the results page still saves the result).
  async function doReset(code, password) {
    const sb = window.PED.supabase;
    if (!sb) return showFieldError('reset-code', OFFLINE_MSG);
    if (!resetEmail) return showFieldError('reset-code', 'Lost track of your email — request a new code.');
    setSubmitting('reset-submit', true);
    try {
      const { data, error } = await sb.auth.verifyOtp({ email: resetEmail, token: code, type: 'recovery' });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        // Supabase answers "Token has expired or is invalid" for both cases.
        showFieldError('reset-code', isNetworkError(error) ? OFFLINE_MSG
          : /expired|invalid|otp|token/.test(msg)
            ? 'Incorrect or expired code. If you clicked Resend, only the newest code works.'
          : (error.message || 'Verification failed.'));
        return;
      }
      const { error: updateError } = await sb.auth.updateUser({ password });
      if (updateError) {
        showFieldError('n-pass', updateError.message || 'Could not set the new password.');
        return;
      }
      const user = data?.user;
      const fullName = user ? await fetchFullName(user.id) : '';
      const displayName = (fullName || '').split(' ')[0] || resetEmail.split('@')[0];
      const profile = { mode: 'email', email: resetEmail, displayName, fullName, ts: Date.now() };
      resetEmail = ''; saveReset();
      showToast('Password updated — you are signed in.');
      finishSignIn(profile, nextPage(), 400);
    } catch (err) {
      console.error('[auth] reset error:', err);
      showFieldError('reset-code', isNetworkError(err) ? OFFLINE_MSG : `Could not reset the password: ${err.message || err}`);
    } finally {
      setSubmitting('reset-submit', false);
    }
  }

  async function doRegister(name, rawEmail, password) {
    const sb = window.PED.supabase;
    const email = normEmail(rawEmail);
    setSubmitting('r-submit', true);
    try {
      if (sb) {
        console.log('[auth] signUp →', { email });
        const { data, error } = await sb.auth.signUp({
          email, password, options: { data: { full_name: name } }
        });
        console.log('[auth] signUp ←', { error, user: data?.user, identities: data?.user?.identities, hasSession: !!data?.session });

        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (isNetworkError(error)) {
            showFieldError('r-email', OFFLINE_MSG);
          } else if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
            showFieldError('r-email', 'An account with this email already exists. Click "Sign in" above.');
          } else if (msg.includes('email')) {
            showFieldError('r-email', error.message);
          } else if (msg.includes('password')) {
            showFieldError('r-pass', error.message);
          } else {
            showFieldError('r-email', error.message || 'Registration failed.');
          }
          setSubmitting('r-submit', false);
          return;
        }

        const user = data?.user;

        // Anti-enumeration check: Supabase returns a fake user object with
        // an empty identities array when the email already exists and is
        // confirmed. There's no real signup, no email sent — verifyOtp would
        // never succeed. Tell the user to sign in instead.
        if (user && Array.isArray(user.identities) && user.identities.length === 0) {
          console.warn('[auth] signUp returned fake user (email already exists, identities empty)');
          showFieldError('r-email', 'An account with this email already exists. Click "Sign in" above to use it.');
          setSubmitting('r-submit', false);
          return;
        }

        // Confirmation required — show OTP panel, persist state for refresh recovery
        if (user && !user.email_confirmed_at) {
          pendingEmail = email;
          pendingName  = name;
          savePending();
          const otpEmailEl = document.getElementById('otp-email-display');
          if (otpEmailEl) otpEmailEl.textContent = email;
          setSubmitting('r-submit', false);
          switchTab('verify');
          console.log('[auth] Showing OTP panel for', email);
          return;
        }

        // Email already confirmed (autoconfirm enabled) — create profile and proceed
        if (user) {
          await upsertUserProfile(user.id, {
            email, full_name: name, is_anonymous: false, consent_given: true
          });
        }
      }
      const displayName = name.split(' ')[0];
      finishSignIn({ mode: 'register', email, displayName, fullName: name, ts: Date.now() }, 'questionnaire.html', sb ? 400 : 0);
    } catch (err) {
      console.error('[auth] register error:', err);
      showFieldError('r-email', isNetworkError(err) ? OFFLINE_MSG : `Registration failed: ${err.message || err}`);
      setSubmitting('r-submit', false);
    }
  }

  // Anonymous participants are not signed in to Supabase and nothing is
  // written until they submit a complete assessment (submit_assessment()).
  async function startAnonymous() {
    const sb = window.PED.supabase;
    setSubmitting('a-submit', true);
    try {
      // Never attach an anonymous attempt to whoever last signed in here.
      if (sb) await sb.auth.signOut().catch(() => {});
    } finally {
      enterAs({ mode: 'anonymous', displayName: 'Anonymous Participant', ts: Date.now() });
      closeModal();
      window.location.href = 'questionnaire.html';
    }
  }

  async function fetchFullName(userId) {
    const sb = window.PED.supabase;
    try {
      const { data } = await sb.from('users').select('full_name').eq('id', userId).maybeSingle();
      return data?.full_name || '';
    } catch { return ''; }
  }

  // Where to go after signing in: ?next=my-results returns people to their results.
  function nextPage() {
    const next = new URLSearchParams(window.location.search).get('next');
    return next === 'my-results' ? 'my-results.html' : 'questionnaire.html';
  }

  // Arrivals from elsewhere: ?signin=1|register|expired opens the modal,
  // ?signedout=idle|manual explains what just happened.
  function handleArrivalParams() {
    const params = new URLSearchParams(window.location.search);
    const signin = params.get('signin');
    const signedOut = params.get('signedout');
    if (!signin && !signedOut) return;

    if (signedOut === 'manual') showToast('You are signed out.');
    if (signin === 'expired')        showToast('Your session ended — please sign in again.', 5000);

    if (signin) openModal(signin === 'register' ? 'register' : 'signin');

    // Keep ?next, drop the one-off flags so a refresh doesn't repeat them.
    params.delete('signin'); params.delete('signedout');
    const qs = params.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  }
  document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('auth-modal')) handleArrivalParams(); });
})();
