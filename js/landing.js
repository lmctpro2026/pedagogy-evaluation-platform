// ===========================================================================
// Landing page — the answerable first statement in the hero, and page motion.
// The answer is written to ped.responses, so the assessment picks up at 02.
// ===========================================================================

(function () {
  const $ = sel => document.querySelector(sel);
  const QUESTIONS = window.PED.QUESTIONS;
  const LIKERT    = window.PED.LIKERT;
  const STORAGE_RESP = 'ped.responses';
  const first = QUESTIONS[0];

  // Answers left by a signed-out account holder stay for them to resume, but
  // they are not this visitor's — show a blank statement instead.
  function belongsToSomeoneElse() {
    const identity = window.PED.identity;
    let owner = '';
    try { owner = localStorage.getItem('ped.responsesOwner') || ''; } catch {}
    return owner.startsWith('user:') && !identity?.isRegistered();
  }

  function readResponses() {
    if (belongsToSomeoneElse()) return {};
    try { return JSON.parse(localStorage.getItem(STORAGE_RESP) || '{}') || {}; } catch { return {}; }
  }

  function answeredCount(responses) {
    return QUESTIONS.filter(q => Number.isInteger(responses[q.id])).length;
  }

  function renderStrip(responses) {
    const strip = $('#try-strip');
    strip.innerHTML = QUESTIONS.map(q =>
      `<span class="seg ${q.category.toLowerCase()} ${Number.isInteger(responses[q.id]) ? 'is-done' : ''}"></span>`
    ).join('');
  }

  function renderStatus(responses) {
    const value = responses[first.id];
    const status = $('#try-status');
    const cont = $('#try-continue');
    if (!Number.isInteger(value)) {
      status.textContent = 'Try it — your answer carries into the assessment.';
      cont.hidden = true;
      return;
    }
    const left = QUESTIONS.length - answeredCount(responses);
    const label = (LIKERT.find(l => l.value === value) || {}).label;
    status.innerHTML = left
      ? `<strong>${label}.</strong> Saved on this device · ${left} to go.`
      : `<strong>${label}.</strong> All 20 answered — continue to review and submit.`;
    cont.hidden = false;
  }

  function select(value) {
    if (belongsToSomeoneElse()) window.PED.identity.clearAssessmentData();
    const responses = readResponses();
    responses[first.id] = value;
    try { localStorage.setItem(STORAGE_RESP, JSON.stringify(responses)); } catch {}

    $('#try-scale').querySelectorAll('.try-opt').forEach(opt => {
      const on = Number(opt.dataset.value) === value;
      opt.classList.toggle('is-selected', on);
      opt.setAttribute('aria-checked', String(on));
      opt.tabIndex = on ? 0 : -1;
    });
    renderStrip(responses);
    renderStatus(responses);
  }

  function renderScale(responses) {
    const current = responses[first.id];
    const scale = $('#try-scale');
    scale.innerHTML = LIKERT.map(l => `
      <button type="button" class="try-opt ${current === l.value ? 'is-selected' : ''}"
              role="radio" aria-checked="${current === l.value}" data-value="${l.value}"
              aria-label="${l.value} — ${l.label}"
              tabindex="${current === l.value || (!current && l.value === 1) ? 0 : -1}">
        <span class="try-val">${l.value}</span>
        <span class="try-lbl">${l.label}</span>
      </button>`).join('');

    scale.addEventListener('click', e => {
      const opt = e.target.closest('.try-opt');
      if (opt) select(Number(opt.dataset.value));
    });

    // Radio-group keyboard pattern: arrows move and select, 1–5 jump.
    scale.addEventListener('keydown', e => {
      const opts = [...scale.querySelectorAll('.try-opt')];
      const i = opts.indexOf(document.activeElement);
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(opts.length - 1, i + 1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   next = Math.max(0, i - 1);
      if (e.key >= '1' && e.key <= '5') next = Number(e.key) - 1;
      if (next === null) return;
      e.preventDefault();
      select(next + 1);
      opts[next].focus();
    });
  }

  function onContinue() {
    if (window.PED.identity?.isRegistered()) {
      window.location.href = 'questionnaire.html';
    } else {
      window.PED.openModal('register');
    }
  }

  function animate() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!window.gsap || reduced) return;
    gsap.from('[data-animate]', { opacity: 0, y: 20, duration: 0.6, stagger: 0.08, ease: 'power3.out' });
    if (window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      gsap.utils.toArray('.reveal').forEach(el => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 88%' },
          opacity: 0, y: 24, duration: 0.6, ease: 'power3.out',
        });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const responses = readResponses();
    $('#try-text').textContent = first.text;
    renderScale(responses);
    renderStrip(responses);
    renderStatus(responses);
    $('#try-continue').addEventListener('click', onContinue);
    animate();
  });
})();
