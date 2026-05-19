// ===========================================================================
// Auth modal logic + real-time validation
// Works against Supabase if configured, otherwise local-only session.
// ===========================================================================

(function () {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // ----- Modal open/close -----
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
    // Clear fields
    $$('#auth-modal input').forEach(i => { i.value = ''; i.dispatchEvent(new Event('input')); });
    $$('#auth-modal .field').forEach(f => f.classList.remove('is-valid','is-invalid'));
    $$('#auth-modal .err').forEach(e => e.textContent = '');
    const sBars = $('#r-strength');
    if (sBars) { sBars.className = 'strength'; const lbl = $('#r-strength-label'); if (lbl) lbl.textContent = ''; }
    syncSubmitButtons();
  }
  window.PED = window.PED || {};
  window.PED.openModal = openModal;
  window.PED.closeModal = closeModal;

  // ----- Tab switching -----
  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (t) switchTab(t.dataset.tab);
    if (e.target.matches('[data-open-modal]')) openModal(e.target.dataset.openModal || 'signin');
    if (e.target.matches('[data-close-modal]') || e.target.id === 'auth-modal') {
      if (e.target.id === 'auth-modal' && e.target !== e.currentTarget && !e.target.classList.contains('modal-backdrop')) return;
      if (e.target.matches('[data-close-modal]') || e.target.id === 'auth-modal') closeModal();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ----- Validation helpers -----
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
    // Sign in
    const liEmail = $('#l-email')?.value || '';
    const liPass  = $('#l-pass')?.value || '';
    const liBtn   = $('#l-submit');
    if (liBtn) liBtn.disabled = !(validEmail(liEmail) && validPass(liPass));

    // Register
    const rName   = $('#r-name')?.value || '';
    const rEmail  = $('#r-email')?.value || '';
    const rPass   = $('#r-pass')?.value || '';
    const rConsent = $('#r-consent')?.checked;
    const rBtn = $('#r-submit');
    if (rBtn) rBtn.disabled = !(validName(rName) && validEmail(rEmail) && validPass(rPass) && rConsent);

    // Anonymous
    const aConsent = $('#a-consent')?.checked;
    const aBtn = $('#a-submit');
    if (aBtn) aBtn.disabled = !aConsent;
  }

  function showFieldError(id, msg) {
    setField(id, false, msg);
  }

  // ----- Wire up -----
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

    const rConsent = document.getElementById('r-consent');
    if (rConsent) rConsent.addEventListener('change', syncSubmitButtons);
    const aConsent = document.getElementById('a-consent');
    if (aConsent) aConsent.addEventListener('change', syncSubmitButtons);

    const liForm = document.getElementById('signin-form');
    if (liForm) liForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#l-email').value.trim();
      const pass  = $('#l-pass').value;
      if (!validEmail(email)) return showFieldError('l-email', 'Please enter a valid email address.');
      if (!validPass(pass))   return showFieldError('l-pass',  'Password must be at least 8 characters.');
      await doLogin(email, pass);
    });

    const rForm = document.getElementById('register-form');
    if (rForm) rForm.addEventListener('submit', async e => {
      e.preventDefault();
      const name  = $('#r-name').value.trim();
      const email = $('#r-email').value.trim();
      const pass  = $('#r-pass').value;
      if (!validName(name))   return showFieldError('r-name',  'Please enter your first and last name.');
      if (!validEmail(email)) return showFieldError('r-email', 'Please enter a valid email address.');
      if (!validPass(pass))   return showFieldError('r-pass',  'Password must be at least 8 characters.');
      await doRegister(name, email, pass);
    });

    const aForm = document.getElementById('anon-form');
    if (aForm) aForm.addEventListener('submit', async e => {
      e.preventDefault();
      await startAnonymous();
    });

    syncSubmitButtons();
  });

  // ----- Session helpers -----
  function persistSession(profile) {
    try { localStorage.setItem('ped.session', JSON.stringify(profile)); } catch {}
  }

  async function doLogin(email, password) {
    const sb = window.PED.supabase;
    try {
      if (sb) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return showFieldError('l-pass', 'Invalid email or password.');
      }
      const displayName = email.split('@')[0];
      persistSession({ mode: 'email', email, displayName, ts: Date.now() });
      window.PED.closeModal();
      window.location.href = 'questionnaire.html';
    } catch (err) {
      console.error(err);
      showFieldError('l-pass', 'Sign-in failed. Please try again.');
    }
  }

  async function doRegister(name, email, password) {
    const sb = window.PED.supabase;
    try {
      if (sb) {
        const { data, error } = await sb.auth.signUp({
          email, password, options: { data: { full_name: name } }
        });
        if (error) return showFieldError('r-email', error.message || 'Registration failed.');
      }
      const displayName = name.split(' ')[0];
      persistSession({ mode: 'register', email, displayName, fullName: name, ts: Date.now() });
      window.PED.closeModal();
      window.location.href = 'questionnaire.html';
    } catch (err) {
      console.error(err);
      showFieldError('r-email', 'Registration failed. Please try again.');
    }
  }

  async function startAnonymous() {
    const sb = window.PED.supabase;
    try {
      if (sb && sb.auth.signInAnonymously) {
        try { await sb.auth.signInAnonymously(); } catch (e) { /* not fatal in offline mode */ }
      }
      persistSession({ mode: 'anonymous', displayName: 'Anonymous Participant', ts: Date.now() });
      window.PED.closeModal();
      window.location.href = 'questionnaire.html';
    } catch (err) {
      console.error(err);
      // Fall back regardless
      persistSession({ mode: 'anonymous', displayName: 'Anonymous Participant', ts: Date.now() });
      window.PED.closeModal();
      window.location.href = 'questionnaire.html';
    }
  }
})();
