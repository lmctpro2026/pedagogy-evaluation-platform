// ===========================================================================
// Questionnaire flow — one question at a time, slide transitions,
// auto-save to localStorage, persists to Supabase if configured.
// ===========================================================================

(function () {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const QUESTIONS = window.PED.QUESTIONS;
  const CATEGORIES = window.PED.CATEGORIES;
  const LIKERT = window.PED.LIKERT;
  const STORAGE_RESP = 'ped.responses';
  const STORAGE_SESS = 'ped.session';

  // Load existing responses (if user is returning mid-assessment)
  let responses = {};
  try { responses = JSON.parse(localStorage.getItem(STORAGE_RESP) || '{}') || {}; } catch { responses = {}; }

  let index = 0;
  let lastDirection = 'right';
  const total = QUESTIONS.length;

  // ---------- Render helpers ----------
  function categoryMeta(code) {
    return CATEGORIES.find(c => c.code === code) || { code, name: code };
  }

  function renderQuestion(i, direction) {
    const q = QUESTIONS[i];
    const cat = categoryMeta(q.category);
    const stage = $('#q-stage');
    const old = $('.q-card');
    if (old) {
      old.classList.add(direction === 'right' ? 'exit-left' : 'exit-right');
    }

    const node = document.createElement('article');
    node.className = 'q-card ' + (direction === 'right' ? 'enter-left' : 'enter-right');
    node.innerHTML = `
      <div class="q-meta">
        <span class="badge ${q.category.toLowerCase()}"><span class="dot"></span> ${q.category} · ${cat.name}</span>
        <span class="q-num">${String(i+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span>
      </div>
      <h2 class="q-text">${q.text}</h2>
      <div class="likert" role="radiogroup" aria-label="Likert response">
        ${LIKERT.map(l => `
          <button type="button" class="likert-option ${responses[q.id] === l.value ? 'selected' : ''}" data-value="${l.value}" role="radio" aria-checked="${responses[q.id] === l.value}">
            <span class="val">${l.value}</span>
            <span class="lbl">${l.label}</span>
          </button>
        `).join('')}
      </div>
      <div class="q-actions">
        <button type="button" class="btn btn-ghost" id="q-prev" ${i === 0 ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Previous
        </button>
        <span class="hint">Press <span class="kbd">1</span>–<span class="kbd">5</span> · <span class="kbd">↵</span> Next</span>
        <button type="button" class="btn btn-primary" id="q-next" ${responses[q.id] ? '' : 'disabled'}>
          ${i === total - 1 ? 'See Your Results' : 'Next'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    `;
    stage.appendChild(node);

    requestAnimationFrame(() => {
      node.classList.remove('enter-left', 'enter-right');
    });
    setTimeout(() => { if (old && old.parentNode) old.parentNode.removeChild(old); }, 430);

    // Wire up
    node.querySelectorAll('.likert-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const v = parseInt(opt.dataset.value, 10);
        node.querySelectorAll('.likert-option').forEach(o => {
          o.classList.remove('selected');
          o.setAttribute('aria-checked', 'false');
        });
        opt.classList.add('selected');
        opt.setAttribute('aria-checked', 'true');
        responses[q.id] = v;
        try { localStorage.setItem(STORAGE_RESP, JSON.stringify(responses)); } catch {}
        node.querySelector('#q-next').disabled = false;
      });
    });

    node.querySelector('#q-next').addEventListener('click', () => goNext());
    node.querySelector('#q-prev').addEventListener('click', () => goPrev());

    updateProgress();
  }

  function updateProgress() {
    const answered = Object.keys(responses).filter(k => responses[k]).length;
    const pct = Math.max(((index) / total) * 100, (answered / total) * 100);
    $('#q-bar-fill').style.width = pct + '%';
    $('#q-now').textContent = String(index + 1).padStart(2, '0');
    $('#q-total').textContent = String(total).padStart(2, '0');
    const cat = categoryMeta(QUESTIONS[index].category);
    $('#q-section-label').textContent = cat.name;
  }

  function goNext() {
    const q = QUESTIONS[index];
    if (!responses[q.id]) return;
    if (index === total - 1) return finish();
    index++;
    lastDirection = 'right';
    renderQuestion(index, 'right');
  }
  function goPrev() {
    if (index === 0) return;
    index--;
    lastDirection = 'left';
    renderQuestion(index, 'left');
  }

  async function finish() {
    // Build payload
    const payload = {
      responses: QUESTIONS.map(q => ({ question_id: q.id, answer_value: responses[q.id] })),
      completed_at: new Date().toISOString(),
    };

    // Calculate scores via shared engine
    const scores = window.PED.scoring.calculateScores(payload.responses, QUESTIONS);
    payload.scores = scores;
    try { localStorage.setItem('ped.scores', JSON.stringify(scores)); } catch {}
    try { localStorage.setItem('ped.completed', payload.completed_at); } catch {}

    // Best-effort persistence to Supabase
    const sb = window.PED.supabase;
    if (sb) {
      try {
        const session = JSON.parse(localStorage.getItem(STORAGE_SESS) || 'null');
        const { data: sessRow, error: sessErr } = await sb.from('sessions').insert([{
          completed_at: payload.completed_at,
          score_tp:  scores.TP,
          score_pd:  scores.PD,
          score_ta:  scores.TA,
          score_tpp: scores.TPP,
        }]).select().single();
        if (!sessErr && sessRow) {
          await sb.from('responses').insert(payload.responses.map(r => ({
            session_id: sessRow.id, question_id: r.question_id, answer_value: r.answer_value,
          })));
        }
      } catch (e) {
        console.warn('[questionnaire] Supabase persist failed (offline-safe):', e);
      }
    }

    // Show completion screen briefly, then navigate
    showDone();
    setTimeout(() => { window.location.href = 'results.html'; }, 900);
  }

  function showDone() {
    const stage = $('#q-stage');
    stage.innerHTML = `
      <div class="q-done fade-in">
        <div class="check">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1>All done. Compiling your profile…</h1>
        <p>Calculating weighted scores across the four Firmin (2020) categories.</p>
      </div>
    `;
    $('#q-bar-fill').style.width = '100%';
    $('#q-now').textContent = String(total).padStart(2,'0');
  }

  // ---------- Welcome / resume / start ----------
  function showWelcome() {
    const session = JSON.parse(localStorage.getItem(STORAGE_SESS) || 'null');
    const name = session?.displayName || 'there';
    const answeredCount = Object.keys(responses).filter(k => responses[k]).length;

    const stage = $('#q-stage');
    stage.innerHTML = `
      <div class="q-welcome fade-in">
        <div class="eyebrow" style="margin-bottom:1.25rem;">Welcome${name === 'there' ? '' : ','} ${name}</div>
        <h1>Twenty questions. <span class="italic-accent">Five minutes.</span></h1>
        <p>Answer each statement on a five-point scale, from Strongly Disagree to Strongly Agree. There are no right answers — this is a reflective profile.</p>
        ${answeredCount > 0 ? `<p class="muted" style="margin-bottom:1.5rem;">You have ${answeredCount} of ${total} questions answered from a previous session.</p>` : ''}
        <div style="display:flex; gap:.75rem; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn-primary btn-lg" id="q-begin">${answeredCount > 0 ? 'Resume assessment' : 'Begin assessment'} →</button>
          ${answeredCount > 0 ? `<button class="btn btn-ghost btn-lg" id="q-restart">Start over</button>` : ''}
        </div>
      </div>
    `;

    $('#q-begin').addEventListener('click', () => {
      // Jump to first unanswered (or last seen)
      const firstUnanswered = QUESTIONS.findIndex(q => !responses[q.id]);
      index = firstUnanswered === -1 ? 0 : firstUnanswered;
      stage.innerHTML = '';
      renderQuestion(index, 'right');
    });
    const restart = $('#q-restart');
    if (restart) restart.addEventListener('click', () => {
      responses = {};
      try { localStorage.removeItem(STORAGE_RESP); } catch {}
      index = 0;
      stage.innerHTML = '';
      renderQuestion(0, 'right');
      updateProgress();
    });
  }

  // ---------- Keyboard ----------
  document.addEventListener('keydown', e => {
    if (!$('.likert')) return;
    if (e.key >= '1' && e.key <= '5') {
      const v = parseInt(e.key, 10);
      const opt = document.querySelector(`.likert-option[data-value="${v}"]`);
      if (opt) opt.click();
    } else if (e.key === 'Enter') {
      const next = $('#q-next');
      if (next && !next.disabled) next.click();
    } else if (e.key === 'ArrowLeft') {
      const prev = $('#q-prev');
      if (prev && !prev.disabled) prev.click();
    } else if (e.key === 'ArrowRight') {
      const next = $('#q-next');
      if (next && !next.disabled) next.click();
    }
  });

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    // Update header progress placeholders
    $('#q-total').textContent = String(total).padStart(2,'0');
    showWelcome();
  });
})();
