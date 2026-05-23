// ===========================================================================
// Auth modal logic + real-time validation
// Works against Supabase if configured, otherwise local-only session.
// ===========================================================================

(function () {
  const $  = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // -----------------------------------------------------------------------
  // Toast
  // -----------------------------------------------------------------------
  function ensureToast() {
    let t = document.getElementById('ped-toast');
    if (t) return t;
    t = document.createElement('div');
    t.id = 'ped-toast';
    t.style.cssText = `
      position:fixed; left:50%; bottom:36px; transform:translate(-50%, 24px);
      background:#1C1914; border:1px solid #2A2520; color:#F5F0E8;
      padding:.85rem 1.15rem; border-radius:10px; font-family:'Poppins',sans-serif;
      font-size:.92rem; z-index:10000; opacity:0; transition:opacity .25s ease, transform .25s ease;
      box-shadow:0 30px 60px -20px rgba(0,0,0,0.65);
    `;
    document.body.appendChild(t);
    return t;
  }
  function showToast(msg, ms = 3200) {
    const t = ensureToast();
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translate(-50%, 0)'; });
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translate(-50%, 24px)'; }, ms);
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
    // Clear values + validation state
    $$('#auth-modal input[type="text"], #auth-modal input[type="email"], #auth-modal input[type="password"]').forEach(i => {
      i.value = '';
      i.dispatchEvent(new Event('input'));
    });
    $$('#auth-modal input[type="checkbox"]').forEach(c => { c.checked = false; });
    $$('#auth-modal .field').forEach(f => f.classList.remove('is-valid','is-invalid'));
    $$('#auth-modal .err').forEach(e => e.textContent = '');
    const sBars = $('#r-strength');
    if (sBars) {
      sBars.className = 'strength';
      const lbl = $('#r-strength-label');
      if (lbl) lbl.textContent = '';
    }
    syncSubmitButtons();
  }
  window.PED = window.PED || {};
  window.PED.openModal = openModal;
  window.PED.closeModal = closeModal;
  window.PED.toast = showToast;

  // -----------------------------------------------------------------------
  // Tabs
  // -----------------------------------------------------------------------
  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  }

  // -----------------------------------------------------------------------
  // Single delegated click handler (uses closest so child elements work)
  // -----------------------------------------------------------------------
  document.addEventListener('click', e => {
    // Open modal — works when clicking nested SVG/spans
    const openBtn = e.target.closest('[data-open-modal]');
    if (openBtn) {
      e.preventDefault();
      openModal(openBtn.dataset.openModal || 'signin');
      return;
    }

    // Tab switch (closest catches clicks on inner text/icon)
    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.tab) {
      switchTab(tab.dataset.tab);
      return;
    }

    // Explicit close trigger
    if (e.target.closest('[data-close-modal]')) {
      closeModal();
      return;
    }

    // Click directly on the backdrop (not bubbled from inside the modal)
    if (e.target.id === 'auth-modal') {
      closeModal();
      return;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // -----------------------------------------------------------------------
  // Validation helpers
  // -----------------------------------------------------------------------
  function setField(fieldId, ok, message) {
    const wrap = document.getElementById(fieldId)?.closest('.field');
    if (!wrap) return;
    wrap.classList.remove('is-valid', 'is-invalid');
    if (ok === true) wrap.classList.add('is-valid');
    if (ok === false) wrap.classList.add('is-invalid');
    const err = wrap.querySelector('.err');
    if (err) err.textContent = message || '';
  }
  function validEmail(v) { return emailRe.test((v || '').trim()); }
  function validPass(v) { return (v || '').length >= 8; }
  function validName(v) {
    const s = (v || '').trim();
    return s.includes(' ') && s.split(' ').filter(Boolean).length >= 2 && s.length >= 3;
  }

  function passwordStrength(p) {
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8)  score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p))     score++;
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
    el.addEventListener('blur', run);
  }

  function syncSubmitButtons() {
    const liEmail = $('#l-email')?.value || '';
    const liPass  = $('#l-pass')?.value || '';
    const liBtn   = $('#l-submit');
    if (liBtn) liBtn.disabled = !(validEmail(liEmail) && validPass(liPass));

    const rName    = $('#r-name')?.value || '';
    const rEmail   = $('#r-email')?.value || '';
    const rPass    = $('#r-pass')?.value || '';
    const rConsent = $('#r-consent')?.checked;
    const rBtn = $('#r-submit');
    if (rBtn) rBtn.disabled = !(validName(rName) && validEmail(rEmail) && validPass(rPass) && rConsent);

    const aConsent = $('#a-consent')?.checked;
    const aBtn = $('#a-submit');
    if (aBtn) aBtn.disabled = !aConsent;
  }

  function showFieldError(id, msg) {
    setField(id, false, msg);
  }

  // -----------------------------------------------------------------------
  // Form wiring
  // -----------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    attach('l-email', validEmail, 'Please enter a valid email address.');
    attach('l-pass',  validPass,  'Password must be at least 8 characters.');
    attach('r-name',  validName,  'Please enter your first and last name.');
    attach('r-email', validEmail, 'Please enter a valid email address.');

    const rPass = document.getElementById('r-pass');
    if (rPass) {
      const sBars = document.getElementById('r-strength');
      const sLbl  = document.getElementById('r-strength-label');
      const run = () => {
        const v = rPass.value;
        const ok = validPass(v);
        setField('r-pass', v ? ok : null, ok ? '' : 'Password must be at least 8 characters.');
        const s = passwordStrength(v);
        if (sBars) sBars.className = 'strength s' + s;
        if (sLbl)  sLbl.textContent = v ? STRENGTH_LABEL[s] : '';
        syncSubmitButtons();
      };
      rPass.addEventListener('input', run);
      rPass.addEventListener('blur', run);
    }

    document.getElementById('r-consent')?.addEventListener('change', syncSubmitButtons);
    document.getElementById('a-consent')?.addEventListener('change', syncSubmitButtons);

    document.getElementById('signin-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#l-email').value.trim();
      const pass  = $('#l-pass').value;
      if (!validEmail(email)) return showFieldError('l-email', 'Please enter a valid email address.');
      if (!validPass(pass))   return showFieldError('l-pass',  'Password must be at least 8 characters.');
      await doLogin(email, pass);
    });

    document.getElementById('register-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name  = $('#r-name').value.trim();
      const email = $('#r-email').value.trim();
      const pass  = $('#r-pass').value;
      if (!validName(name))   return showFieldError('r-name',  'Please enter your first and last name.');
      if (!validEmail(email)) return showFieldError('r-email', 'Please enter a valid email address.');
      if (!validPass(pass))   return showFieldError('r-pass',  'Password must be at least 8 characters.');
      await doRegister(name, email, pass);
    });

    document.getElementById('anon-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      await startAnonymous();
    });

    syncSubmitButtons();
  });

  // -----------------------------------------------------------------------
  // Session helpers
  // -----------------------------------------------------------------------
  function persistSession(profile) {
    try { localStorage.setItem('ped.session', JSON.stringify(profile)); } catch {}
  }

  function setSubmitting(btnId, on, restoreLabel) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (on) {
      btn._origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Working…';
    } else {
      btn.disabled = false;
      btn.innerHTML = restoreLabel ?? btn._origText ?? btn.innerHTML;
    }
  }

  // -----------------------------------------------------------------------
  // Auth flows
  // -----------------------------------------------------------------------
  async function doLogin(email, password) {
    const sb = window.PED.supabase;
    console.log('[auth] sign-in', { email, supabase: !!sb });
    setSubmitting('l-submit', true);
    try {
      if (sb) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          console.error('[auth] sign-in error:', error);
          showFieldError('l-pass', error.message?.toLowerCase().includes('invalid')
            ? 'Invalid email or password.'
            : (error.message || 'Sign-in failed.'));
          setSubmitting('l-submit', false);
          return;
        }
      }
      const displayName = email.split('@')[0];
      persistSession({ mode: 'email', email, displayName, ts: Date.now() });
      closeModal();
      window.location.href = 'questionnaire.html';
    } catch (err) {
      console.error('[auth] sign-in exception:', err);
      showFieldError('l-pass', 'Sign-in failed. Please try again.');
      setSubmitting('l-submit', false);
    }
  }

  async function doRegister(name, email, password) {
    const sb = window.PED.supabase;
    console.log('[auth] register', { name, email, supabase: !!sb });
    setSubmitting('r-submit', true);
    try {
      if (sb) {
        const { data, error } = await sb.auth.signUp({
          email, password, options: { data: { full_name: name } }
        });
        if (error) {
          console.error('[auth] signUp error:', error);
          // Surface meaningful Supabase errors against the right field
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('email')) showFieldError('r-email', error.message);
          else if (msg.includes('password')) showFieldError('r-pass', error.message);
          else showFieldError('r-email', error.message || 'Registration failed.');
          setSubmitting('r-submit', false);
          return;
        }
        // Supabase default requires email confirmation -> user exists but no session
        if (data?.user && !data?.session) {
          console.warn('[auth] email confirmation required — proceeding to local demo flow');
          showToast('Confirmation email sent. Continuing to assessment for this session.');
        } else {
          console.log('[auth] registered with active session');
        }
      } else {
        console.info('[auth] offline mode — local session only (Supabase not configured)');
      }

      const displayName = name.split(' ')[0];
      persistSession({ mode: 'register', email, displayName, fullName: name, ts: Date.now() });
      closeModal();
      // Tiny delay so the toast can show if email confirmation was needed
      setTimeout(() => { window.location.href = 'questionnaire.html'; }, sb ? 500 : 0);
    } catch (err) {
      console.error('[auth] register exception:', err);
      showFieldError('r-email', 'Registration failed. Please try again.');
      setSubmitting('r-submit', false);
    }
  }

  async function startAnonymous() {
    const sb = window.PED.supabase;
    console.log('[auth] anonymous', { supabase: !!sb });
    setSubmitting('a-submit', true);
    try {
      if (sb?.auth?.signInAnonymously) {
        try { await sb.auth.signInAnonymously(); }
        catch (e) { console.warn('[auth] anonymous Supabase fallback to local:', e); }
      }
    } finally {
      persistSession({ mode: 'anonymous', displayName: 'Anonymous Participant', ts: Date.now() });
      closeModal();
      window.location.href = 'questionnaire.html';
    }
  }
})();
