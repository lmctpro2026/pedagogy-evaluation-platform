// ===========================================================================
// Questionnaire flow — one question at a time, slide transitions,
// auto-save to localStorage, persists to Supabase if configured.
//
// Completion is gated: the last question leads to a review screen, and the
// assessment is only scored and saved once all 20 questions are answered.
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
  let returnToReview = false;   // set when a question was opened from the review screen
  // The card currently accepting input. Two cards coexist during the 430ms
  // slide transition, so every in-card lookup must be scoped to this node
  // rather than to document — otherwise errors and clicks can land on the
  // card that is on its way out.
  let currentCard = null;
  const total = QUESTIONS.length;

  // ---------- Validation helpers ----------
  const isAnswered = q => Number.isInteger(responses[q.id]) && responses[q.id] >= 1 && responses[q.id] <= 5;

  // Every unanswered question, in order. Empty array === ready to submit.
  function missingQuestions() {
    return QUESTIONS.filter(q => !isAnswered(q));
  }
  function answeredCount() {
    return total - missingQuestions().length;
  }
  function likertLabel(v) {
    return (LIKERT.find(l => l.value === v) || {}).label || '';
  }

  // ---------- Render helpers ----------
  function categoryMeta(code) {
    return CATEGORIES.find(c => c.code === code) || { code, name: code };
  }

  function nextLabel(i) {
    if (returnToReview) return 'Back to review';
    return i === total - 1 ? 'Review answers' : 'Next';
  }

  function renderQuestion(i, direction) {
    const q = QUESTIONS[i];
    const cat = categoryMeta(q.category);
    const stage = $('#q-stage');
    const old = currentCard;
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
      <p class="q-error" role="alert" hidden></p>
      <div class="q-actions">
        <button type="button" class="btn btn-ghost" data-nav="prev" ${i === 0 ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Previous
        </button>
        <span class="hint">Press <span class="kbd">1</span>–<span class="kbd">5</span> · <span class="kbd">↵</span> Next</span>
        <button type="button" class="btn btn-primary" data-nav="next">
          ${nextLabel(i)}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    `;
    stage.appendChild(node);
    currentCard = node;

    // Double-rAF: first frame paints the initial opacity:0 state,
    // second frame removes the class so the CSS transition fires correctly.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        node.classList.remove('enter-left', 'enter-right');
      });
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
        clearQuestionError();
        updateProgress();
      });
    });

    node.querySelector('[data-nav="next"]').addEventListener('click', goNext);
    node.querySelector('[data-nav="prev"]').addEventListener('click', goPrev);

    setReviewLink(true);
    updateProgress();
  }

  // Inline "you skipped this one" message under the Likert scale.
  function showQuestionError(msg) {
    const el = currentCard?.querySelector('.q-error');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    currentCard.querySelector('.likert')?.classList.add('needs-answer');
  }
  function clearQuestionError() {
    const el = currentCard?.querySelector('.q-error');
    if (el) { el.hidden = true; el.textContent = ''; }
    currentCard?.querySelector('.likert')?.classList.remove('needs-answer');
  }

  // The review shortcut is available from the moment the first question is on
  // screen — participants can check their progress at any point, and the
  // submit-time completeness check is reachable without answering all 20 first.
  function setReviewLink(visible) {
    const link = $('#q-review-link');
    if (link) link.hidden = !visible;
  }

  function updateProgress() {
    const answered = answeredCount();
    const pct = Math.max((index / total) * 100, (answered / total) * 100);
    $('#q-bar-fill').style.width = pct + '%';
    $('#q-now').textContent = String(index + 1).padStart(2, '0');
    $('#q-total').textContent = String(total).padStart(2, '0');
    const cat = categoryMeta(QUESTIONS[index].category);
    $('#q-section-label').textContent = cat.name;
  }

  function goNext() {
    const q = QUESTIONS[index];
    if (!isAnswered(q)) {
      showQuestionError('Please select a response before continuing — every question is required.');
      return;
    }
    if (returnToReview) { returnToReview = false; return showReview(); }
    if (index === total - 1) return showReview();
    index++;
    renderQuestion(index, 'right');
  }
  function goPrev() {
    if (index === 0) return;
    returnToReview = false;
    index--;
    renderQuestion(index, 'left');
  }

  // Leave the review screen for a question card.
  function openQuestion(i, { fromReview }) {
    if (i < 0 || i >= total) return;
    returnToReview = !!fromReview;
    index = i;
    currentCard = null;
    $('#q-stage').innerHTML = '';
    renderQuestion(index, fromReview ? 'right' : 'left');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Review & submit ----------
  function reviewRowHtml(q, i) {
    const answered = isAnswered(q);
    return `
      <li class="review-row ${answered ? '' : 'missing'}">
        <span class="review-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="review-q">${q.text}</span>
        <span class="review-a">
          ${answered
            ? `<span class="review-a-val">${responses[q.id]}</span><span class="review-a-lbl">${likertLabel(responses[q.id])}</span>`
            : '<span class="review-a-lbl none">Not answered</span>'}
        </span>
        <button type="button" class="review-jump" data-q-index="${i}">${answered ? 'Change' : 'Answer'}</button>
      </li>`;
  }

  // Questions are grouped by Firmin category so a 20-row list stays scannable
  // and each group carries its own completeness count.
  function reviewGroupHtml(cat) {
    const items = QUESTIONS
      .map((q, i) => ({ q, i }))
      .filter(x => x.q.category === cat.code);
    const done = items.filter(x => isAnswered(x.q)).length;
    const complete = done === items.length;

    return `
      <section class="review-group">
        <header class="review-group-head">
          <span class="badge ${cat.code.toLowerCase()}"><span class="dot"></span> ${cat.code} · ${cat.name}</span>
          <span class="review-group-count ${complete ? 'ok' : 'warn'}">${done} of ${items.length}</span>
        </header>
        <ol class="review-list">
          ${items.map(x => reviewRowHtml(x.q, x.i)).join('')}
        </ol>
      </section>`;
  }

  function showReview() {
    const stage = $('#q-stage');
    const missing = missingQuestions();
    const answered = answeredCount();
    const resumeIndex = index;   // where "Back to questions" should return to

    currentCard = null;
    stage.innerHTML = `
      <div class="q-review fade-in">
        <div class="eyebrow">Final step</div>
        <h1>Review your <span class="italic-accent">answers.</span></h1>
        <p>Check your responses below. All ${total} questions must be answered before your results can be calculated.</p>

        <div class="review-meter">
          <div class="review-meter-head">
            <span class="review-status ${missing.length ? 'incomplete' : 'complete'}">
              <strong>${answered} of ${total}</strong> answered${missing.length ? ` · ${missing.length} still incomplete` : ' · ready to submit'}
            </span>
          </div>
          <div class="review-meter-bar">
            <div class="review-meter-fill ${missing.length ? '' : 'complete'}" style="width:${(answered / total) * 100}%"></div>
          </div>
        </div>

        <div class="review-error" role="alert" id="review-error" hidden></div>

        ${CATEGORIES.map(reviewGroupHtml).join('')}

        <div class="review-actions">
          <button type="button" class="btn btn-ghost btn-lg" id="review-back">← Back to questions</button>
          <button type="button" class="btn btn-primary btn-lg" id="review-submit">Submit assessment →</button>
        </div>
      </div>
    `;

    setReviewLink(false);
    $('#q-bar-fill').style.width = (answered / total) * 100 + '%';
    // On review the counter reports answers, not position.
    $('#q-now').textContent = String(answered).padStart(2, '0');
    $('#q-section-label').textContent = 'Review';

    stage.querySelectorAll('.review-jump').forEach(btn => {
      btn.addEventListener('click', () => openQuestion(parseInt(btn.dataset.qIndex, 10), { fromReview: true }));
    });
    // Return to wherever they left off, not blindly to the last question.
    $('#review-back').addEventListener('click', () => openQuestion(resumeIndex, { fromReview: false }));
    $('#review-submit').addEventListener('click', submitAssessment);
  }

  // The single completion gate: nothing is scored, stored or sent unless all
  // 20 questions carry a valid 1–5 answer.
  function submitAssessment() {
    if (evalSession.isExpired()) return expireSession();
    const missing = missingQuestions();
    const errEl = $('#review-error');

    if (missing.length) {
      const numbers = missing.map(q => QUESTIONS.indexOf(q) + 1);
      errEl.innerHTML = `
        <strong>Your assessment is incomplete.</strong>
        You still need to answer ${missing.length} question${missing.length === 1 ? '' : 's'}
        (${numbers.join(', ')}). Your results cannot be calculated or saved until every
        question has a response.
        <button type="button" class="review-error-jump" id="review-goto-first">Go to question ${numbers[0]} →</button>
      `;
      errEl.hidden = false;
      $('#review-goto-first').addEventListener('click', () => openQuestion(numbers[0] - 1, { fromReview: true }));
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Pulse every incomplete row so they're findable in a 20-row list.
      $$('.review-row.missing').forEach(row => {
        row.classList.remove('flash');
        void row.offsetWidth;          // restart the animation on repeat submits
        row.classList.add('flash');
      });
      return;
    }

    errEl.hidden = true;
    finish();
  }

  async function finish() {
    // Defence in depth — finish() is only reachable through submitAssessment(),
    // but never score a partial set.
    if (missingQuestions().length) return showReview();

    const completedAt = new Date().toISOString();
    const startedAt = evalSession.startedAt() || completedAt;
    stopTimer();

    // Build enriched response list (includes category for the responses table)
    const responseList = QUESTIONS.map(q => ({
      question_id:  q.id,
      category:     q.category,
      answer_value: responses[q.id],
    }));

    // Calculate scores via shared engine
    const scores = window.PED.scoring.calculateScores(responseList, QUESTIONS);
    try { localStorage.setItem('ped.scores', JSON.stringify(scores)); } catch {}
    try { localStorage.setItem('ped.completed', completedAt); } catch {}
    // This session is over — its answers are captured above. Clearing them means
    // the next visit starts a fresh 10-minute session instead of resubmitting.
    try { localStorage.removeItem(STORAGE_RESP); } catch {}
    responses = {};

    // Show the completion screen immediately — but hold the buttons that
    // navigate away until the session write has settled, otherwise leaving the
    // page can abort the in-flight scores/responses insert.
    showDone();

    const notSaved = { saved: false };
    const write = window.PED.assessment
      ? window.PED.assessment.completeSession(responseList, scores, { startedAt }).catch(() => notSaved)
      : Promise.resolve(notSaved);

    // Never trap the participant behind a hung request.
    const result = await Promise.race([write, new Promise(r => setTimeout(() => r(notSaved), 8000))]);
    evalSession.clear();

    if (result.expired) {
      // The server's clock says the 10 minutes ran out before submission.
      try { ['ped.scores', 'ped.completed'].forEach(k => localStorage.removeItem(k)); } catch {}
      return showExpired();
    }
    releaseDoneScreen(result);
    if (result.saved && result.previousId) offerPreviousAttemptChoice(result);
  }

  // ---------- Completion + optional demographics ----------
  function showDone() {
    const stage = $('#q-stage');
    currentCard = null;
    stage.innerHTML = `
      <div class="q-done fade-in">
        <div class="check">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1>All done. Your profile is ready.</h1>
        <p>Weighted scores have been calculated across the four Firmin (2020) categories.</p>

        <div id="attempt-choice"></div>

        <div class="consent-card">
          <div class="consent-head">
            <span class="consent-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            <span class="eyebrow">Optional · one more question</span>
          </div>
          <h2>Are you happy to provide demographic information?</h2>
          <p>A few optional details — age group, gender and academic level — help Dr Firmin
             analyse the results across groups. It takes under a minute, every question offers
             a “prefer not to say” option, and your answers stay linked to this response only,
             never to your name.</p>
          <div class="consent-actions">
            <button type="button" class="btn btn-primary btn-lg" id="demo-yes" disabled>Yes, I'm happy to →</button>
            <button type="button" class="btn btn-ghost btn-lg" id="demo-no" disabled>No thanks, show my results</button>
          </div>
          <p class="consent-status" id="consent-status" aria-live="polite">
            <span class="spinner" aria-hidden="true"></span> Saving your results…
          </p>
        </div>
      </div>
    `;
    setReviewLink(false);
    $('#q-bar-fill').style.width = '100%';
    $('#q-now').textContent = String(total).padStart(2,'0');
    $('#q-section-label').textContent = 'Complete';

    $('#demo-yes').addEventListener('click', () => {
      window.location.href = 'demographics.html';
    });

    $('#demo-no').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      $('#demo-yes').disabled = true;
      setConsentStatus('<span class="spinner" aria-hidden="true"></span> One moment…');
      // Record the decline so the opt-in rate on the admin dashboard is honest.
      const sessionId = sessionStorage.getItem('ped.sessionId') || null;
      if (window.PED.assessment) {
        await window.PED.assessment.saveDemographics(sessionId, { provided: false }).catch(() => {});
      }
      window.location.href = 'results.html';
    });
  }

  function setConsentStatus(html) {
    const el = $('#consent-status');
    if (el) el.innerHTML = html;
  }

  // Session write has settled (or timed out) — safe to navigate away.
  // Says what actually happened: the scores are always readable on this device,
  // but only claim they reached the server when they did.
  function releaseDoneScreen(result) {
    const yes = $('#demo-yes');
    const no  = $('#demo-no');
    if (!yes || !no) return;          // participant already moved on
    yes.disabled = false;
    no.disabled  = false;

    // Demographics attach to a stored session — without one there is nothing to link them to.
    if (!result.saved) yes.disabled = true;

    let msg;
    if (!result.saved) {
      msg = '<span class="warn" aria-hidden="true">!</span> Saved on this device only — we could not reach the server.';
    } else if (window.PED.identity?.isRegistered()) {
      msg = `<span class="tick" aria-hidden="true">✓</span> Saved — this is now your active ${result.year || new Date().getFullYear()} result.`;
    } else {
      msg = '<span class="tick" aria-hidden="true">✓</span> Your results are saved anonymously.';
    }
    setConsentStatus(msg);
  }

  // ---------- Two attempts: keep or delete the previous one ----------
  async function offerPreviousAttemptChoice(result) {
    const slot = $('#attempt-choice');
    if (!slot) return;
    const attempts = await window.PED.assessment.getAttempts();
    const prev = (attempts || []).find(a => a.id === result.previousId);
    const when = prev ? new Date(prev.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : '';
    const current = (attempts || []).find(a => a.id === result.sessionId);

    slot.innerHTML = `
      <div class="attempt-card fade-in" role="region" aria-labelledby="attempt-title">
        <div class="eyebrow">Two ${result.year} attempts</div>
        <h2 id="attempt-title">Keep your previous attempt?</h2>
        <p>This attempt${current ? ` (${current.overall}/100)` : ''} is now your active result.
           Your previous attempt${prev ? ` from ${when} (${prev.overall}/100)` : ''} is kept so you can compare them —
           or delete it so only this attempt counts.</p>
        <div class="attempt-actions">
          <button type="button" class="btn btn-ghost" id="attempt-keep">Keep both</button>
          <button type="button" class="btn btn-danger-ghost" id="attempt-delete">Delete previous attempt</button>
        </div>
        <p class="attempt-status" id="attempt-status" aria-live="polite"></p>
      </div>`;

    const status = $('#attempt-status');
    $('#attempt-keep').addEventListener('click', () => {
      slot.querySelector('.attempt-actions').remove();
      status.innerHTML = 'Both attempts kept. <a href="my-results.html">Compare them on your dashboard →</a>';
    });
    $('#attempt-delete').addEventListener('click', async e => {
      if (!window.confirm('Delete your previous attempt? Only this attempt will be kept. This can’t be undone.')) return;
      e.currentTarget.disabled = true;
      $('#attempt-keep').disabled = true;
      status.textContent = 'Deleting…';
      const out = await window.PED.assessment.deletePreviousAttempt(result.previousId);
      if (out.ok) {
        slot.querySelector('.attempt-actions').remove();
        status.textContent = 'Previous attempt deleted — this attempt is now your only result for the year.';
      } else {
        e.currentTarget.disabled = false;
        $('#attempt-keep').disabled = false;
        status.textContent = out.message;
      }
    });
  }

  // ---------- 10-minute session ----------
  const evalSession = window.PED.evalSession;
  let timerHandle = null;
  let announced = { 120: false, 60: false };

  function fmtClock(ms) {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function startTimer() {
    evalSession.start();
    const el = $('#q-timer');
    el.hidden = false;
    announced = { 120: false, 60: false };
    clearInterval(timerHandle);
    const tick = () => {
      const left = evalSession.remainingMs();
      if (left === null) return stopTimer();
      if (left <= 0) return expireSession();
      el.textContent = fmtClock(left);
      el.classList.toggle('is-warn',   left <= 120000 && left > 60000);
      el.classList.toggle('is-danger', left <= 60000);
      for (const mark of [120, 60]) {
        if (!announced[mark] && left <= mark * 1000) {
          announced[mark] = true;
          $('#q-timer-alert').textContent = `${mark / 60} minute${mark === 60 ? '' : 's'} left in this session.`;
          window.PED.toast?.(`${mark / 60} minute${mark === 60 ? '' : 's'} left — submit before the session ends.`);
        }
      }
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function stopTimer() {
    clearInterval(timerHandle);
    timerHandle = null;
    const el = $('#q-timer');
    if (el) { el.hidden = true; el.classList.remove('is-warn', 'is-danger'); }
  }

  // Time ran out before submission: nothing is stored, and the unsubmitted
  // answers are cleared from this device.
  function expireSession() {
    stopTimer();
    evalSession.clear();
    responses = {};
    try { localStorage.removeItem(STORAGE_RESP); } catch {}
    showExpired();
  }

  function showExpired() {
    const stage = $('#q-stage');
    currentCard = null;
    setReviewLink(false);
    $('#q-bar-fill').style.width = '0%';
    $('#q-now').textContent = '00';
    $('#q-section-label').textContent = 'Session expired';
    stage.innerHTML = `
      <div class="q-welcome q-expired fade-in" role="alert">
        <div class="expired-icon" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/></svg>
        </div>
        <div class="eyebrow" style="margin-bottom:1rem;">Session expired</div>
        <h1>Your 10 minutes <span class="italic-accent">ran out.</span></h1>
        <p>The session ended before you submitted, so nothing from it was stored and your answers
           have been cleared from this device.</p>
        <div class="expired-actions">
          <button class="btn btn-primary btn-lg" id="q-new-session">Start a new session →</button>
          <a class="btn btn-ghost btn-lg" href="index.html">Back to home</a>
        </div>
      </div>`;
    $('#q-new-session').addEventListener('click', () => {
      startTimer();
      openQuestion(0, { fromReview: false });
    });
  }

  // ---------- Welcome / resume / start ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // What happens to this attempt, in the participant's terms.
  function attemptNoteHtml(session, attempts) {
    const year = new Date().getFullYear();
    if (!window.PED.identity?.isRegistered(session)) {
      return `<p class="q-rule">Anonymous — nothing is stored while you answer. Your responses are saved, without your name,
              only when you submit. <a href="index.html?signin=register">Create an account</a> to track progress over the years.</p>`;
    }
    const fmt = a => `${a.overall}/100, ${new Date(a.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    const thisYear = (attempts || []).filter(a => a.year === year);
    if (thisYear.length >= 2) {
      return `<p class="q-rule">You have two ${year} attempts. If you submit a new one, it becomes your active result,
              your latest attempt (${fmt(thisYear[0])}) is kept as the previous one, and your oldest
              (${fmt(thisYear[1])}) is removed. <a href="my-results.html">Open dashboard</a></p>`;
    }
    if (thisYear.length === 1) {
      return `<p class="q-rule">You already have a ${year} attempt (${fmt(thisYear[0])}). A new attempt becomes your
              <strong>active result</strong>; the earlier one is kept as your previous attempt, and you can delete it afterwards.
              <a href="my-results.html">Open dashboard</a></p>`;
    }
    return `<p class="q-rule">Signed in — this becomes your ${year} result. We keep up to 3 years of results so you can track your progress.</p>`;
  }

  function showWelcome(attempts) {
    const session = JSON.parse(localStorage.getItem(STORAGE_SESS) || 'null');
    const name = session?.displayName || 'there';
    const answered = answeredCount();
    const left = evalSession.remainingMs();          // null = no session running
    const running = left !== null && left > 0;

    const stage = $('#q-stage');
    currentCard = null;
    stage.innerHTML = `
      <div class="q-welcome fade-in">
        <div class="eyebrow" style="margin-bottom:1.25rem;">Welcome${name === 'there' ? '' : ','} ${escapeHtml(name)}</div>
        <h1>Twenty questions. <span class="italic-accent">Ten minutes.</span></h1>
        <p>Answer each statement on a five-point scale, from Strongly Disagree to Strongly Agree. There are no right answers — this is a reflective profile.</p>
        <p class="q-session-note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/></svg>
          ${running
            ? `Your session is running — <strong>${fmtClock(left)} left</strong>.`
            : 'You have <strong>10 minutes</strong> once you begin. If time runs out before you submit, the session ends and nothing is saved.'}
        </p>
        ${answered > 0 ? `<p class="muted" style="margin-bottom:1.5rem;">You've already answered ${answered} of ${total} — pick up where you left off.</p>` : ''}
        ${attemptNoteHtml(session, attempts)}
        <div style="display:flex; gap:.75rem; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn-primary btn-lg" id="q-begin">${answered > 0 || running ? 'Resume session' : 'Start 10-minute session'} →</button>
          ${answered > 0 ? `<button class="btn btn-ghost btn-lg" id="q-restart">Start over</button>` : ''}
        </div>
      </div>
    `;

    $('#q-begin').addEventListener('click', () => {
      startTimer();
      const firstUnanswered = QUESTIONS.findIndex(q => !isAnswered(q));
      if (firstUnanswered === -1) return showReview();
      openQuestion(firstUnanswered, { fromReview: false });
    });
    const restart = $('#q-restart');
    if (restart) restart.addEventListener('click', () => {
      responses = {};
      try { localStorage.removeItem(STORAGE_RESP); } catch {}
      evalSession.clear();
      startTimer();
      openQuestion(0, { fromReview: false });
    });
  }

  // ---------- Keyboard ----------
  document.addEventListener('keydown', e => {
    if (!currentCard) return;
    if (e.key >= '1' && e.key <= '5') {
      currentCard.querySelector(`.likert-option[data-value="${e.key}"]`)?.click();
    } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
      currentCard.querySelector('[data-nav="next"]')?.click();
    } else if (e.key === 'ArrowLeft') {
      const prev = currentCard.querySelector('[data-nav="prev"]');
      if (prev && !prev.disabled) prev.click();
    }
  });

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', async () => {
    // Update header progress placeholders
    $('#q-total').textContent = String(total).padStart(2,'0');
    $('#q-review-link').addEventListener('click', () => { returnToReview = false; showReview(); });

    const identity = window.PED.identity;
    // Arrived without choosing (e.g. a direct link) — continue anonymously.
    if (identity && !identity.current()) {
      identity.begin({ mode: 'anonymous', displayName: 'Anonymous Participant', ts: Date.now() });
      try { responses = JSON.parse(localStorage.getItem(STORAGE_RESP) || '{}') || {}; } catch { responses = {}; }
    }

    // A session that ran out while the participant was away.
    if (evalSession.isExpired()) return expireSession();

    let attempts = [];
    if (identity?.isRegistered() && window.PED.supabase) {
      const user = await identity.requireAccount();
      if (!user) return;   // redirecting to sign in
      attempts = await window.PED.assessment.getAttempts();
    }
    showWelcome(attempts);
  });
})();
