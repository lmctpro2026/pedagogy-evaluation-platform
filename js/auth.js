// ===========================================================================
// Auth modal — UI, validation, and all three Supabase auth flows.
// ===========================================================================

(function () {
  const $  = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  // Pending OTP state — set when registration needs email verification.
  // Persisted to sessionStorage so an accidental refresh doesn't strand the
  // user halfway through verification.
  let pendingEmail = '';
  let pendingName  = '';

  const PENDING_KEY = 'ped.pendingVerify';
  function savePending() {
    try {
      if (pendingEmail) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ email: pendingEmail, name: pendingName, ts: Date.now() }));
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

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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
      position:fixed; left:50%; bottom:36px; transform:translate(-50%,24px);
      background:#1C1914; border:1px solid #2A2520; color:#F5F0E8;
      padding:.85rem 1.15rem; border-radius:10px; font-family:'Poppins',sans-serif;
      font-size:.92rem; z-index:10000; opacity:0;
      transition:opacity .25s ease, transform .25s ease;
      box-shadow:0 30px 60px -20px rgba(0,0,0,0.65); pointer-events:none;
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
  function openModal(initialTab) {
    const backdrop = $('#auth-modal');
    if (!backdrop) return;
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (initialTab) switchTab(initialTab);
  }
  function closeModal() {
    const backdrop = $('#auth-modal');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
    $$('#auth-modal input[type="text"],#auth-modal input[type="email"],#auth-modal input[type="password"]')
      .forEach(i => { i.value = ''; i.dispatchEvent(new Event('input')); });
    $$('#auth-modal input[type="checkbox"]').forEach(c => { c.checked = false; });
    $$('#auth-modal .field').forEach(f => f.classList.remove('is-valid','is-invalid'));
    $$('#auth-modal .err').forEach(e => { e.textContent = ''; });
    const sBars = $('#r-strength');
    if (sBars) { sBars.className = 'strength'; }
    const sLbl = $('#r-strength-label');
    if (sLbl) sLbl.textContent = '';
    // Reset OTP state (in-memory AND persisted)
    pendingEmail = '';
    pendingName  = '';
    savePending();
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
  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    // Hide the tab row when showing the OTP verification step
    const tabsEl = $('.tabs');
    if (tabsEl) tabsEl.style.display = name === 'verify' ? 'none' : '';
    const titleEl = $('#modal-title');
    if (titleEl) titleEl.textContent = name === 'verify' ? 'Verify your email' : 'Start the assessment';
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
    if (openBtn) { e.preventDefault(); openModal(openBtn.dataset.openModal || 'signin'); return; }

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
  }

  // -----------------------------------------------------------------------
  // Form wiring
  // -----------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    attach('l-email', validEmail, 'Please enter a valid email address.');
    attach('l-pass',  validPass,  'Password must be at least 6 characters.');
    attach('r-name',  validName,  'Please enter your first and last name.');
    attach('r-email', validEmail, 'Please enter a valid email address.');

    const rPass = document.getElementById('r-pass');
    if (rPass) {
      const sBars = document.getElementById('r-strength');
      const sLbl  = document.getElementById('r-strength-label');
      const run = () => {
        const v = rPass.value;
        const ok = validPass(v);
        setField('r-pass', v ? ok : null, ok ? '' : 'Password must be at least 6 characters.');
        const s = passwordStrength(v);
        if (sBars) sBars.className = 'strength s' + s;
        if (sLbl)  sLbl.textContent = v ? STRENGTH_LABEL[s] : '';
        syncSubmitButtons();
      };
      rPass.addEventListener('input', run);
      rPass.addEventListener('blur',  run);
    }

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
          storeUser(displayName, normEmail(pendingEmail));
          persistLocal({ mode: 'register', email: normEmail(pendingEmail), displayName, fullName: pendingName, ts: Date.now() });
          pendingEmail = ''; pendingName = ''; savePending();
          closeModal();
          setTimeout(() => { window.location.href = 'questionnaire.html'; }, 400);
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
      openModal();
      switchTab('verify');
    }

    syncSubmitButtons();
  });

  // -----------------------------------------------------------------------
  // Session storage helpers
  // -----------------------------------------------------------------------
  function persistLocal(profile) {
    try { localStorage.setItem('ped.session', JSON.stringify(profile)); } catch {}
  }
  function storeUser(name, email) {
    try {
      sessionStorage.setItem('ped.userName',  name);
      sessionStorage.setItem('ped.userEmail', email);
    } catch {}
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

          showFieldError('l-pass', msg.includes('invalid') || msg.includes('credentials')
            ? 'Invalid email or password.' : (error.message || 'Sign-in failed.'));
          setSubmitting('l-submit', false);
          return;
        }
        if (data?.user) {
          await upsertUserProfile(data.user.id, { email: normEmail(email), is_anonymous: false, consent_given: true });
        }
      }
      const ne = normEmail(email);
      const displayName = ne.split('@')[0];
      storeUser(displayName, ne);
      persistLocal({ mode: 'email', email: ne, displayName, ts: Date.now() });
      closeModal();
      window.location.href = 'questionnaire.html';
    } catch (err) {
      console.error('[auth] login error:', err);
      showFieldError('l-pass', 'Sign-in failed. Please try again.');
      setSubmitting('l-submit', false);
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
          if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
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
      storeUser(displayName, email);
      persistLocal({ mode: 'register', email, displayName, fullName: name, ts: Date.now() });
      closeModal();
      setTimeout(() => { window.location.href = 'questionnaire.html'; }, sb ? 400 : 0);
    } catch (err) {
      console.error('[auth] register error:', err);
      showFieldError('r-email', `Registration failed: ${err.message || err}`);
      setSubmitting('r-submit', false);
    }
  }

  async function startAnonymous() {
    const sb = window.PED.supabase;
    setSubmitting('a-submit', true);
    try {
      if (sb?.auth?.signInAnonymously) {
        try {
          const { data } = await sb.auth.signInAnonymously();
          if (data?.user) {
            await upsertUserProfile(data.user.id, { is_anonymous: true, consent_given: true });
          }
        } catch (e) {
          console.warn('[auth] anonymous Supabase sign-in failed (using local):', e);
        }
      }
    } finally {
      storeUser('Anonymous Participant', '');
      persistLocal({ mode: 'anonymous', displayName: 'Anonymous Participant', ts: Date.now() });
      closeModal();
      window.location.href = 'questionnaire.html';
    }
  }
})();
