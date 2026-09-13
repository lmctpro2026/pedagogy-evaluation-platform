// ===========================================================================
// Demographics page — optional details collected after the survey completes.
// The row is written against the same session id as the survey responses, so
// demographics and scores stay joined for analysis.
// ===========================================================================

(function () {
  const $ = sel => document.querySelector(sel);

  const D = window.PED.DEMOGRAPHICS;
  const GROUPS = {
    ageGroup:      { list: D.AGE_GROUPS,      field: '#field-age',    label: 'age group' },
    gender:        { list: D.GENDERS,         field: '#field-gender', label: 'gender' },
    academicLevel: { list: D.ACADEMIC_LEVELS, field: '#field-level',  label: 'academic level' },
  };

  const answers = { ageGroup: null, gender: null, academicLevel: null };
  let submitting = false;

  // -------------------------------------------------------------------------
  // Render option buttons
  // -------------------------------------------------------------------------
  function renderOptions() {
    document.querySelectorAll('.opt-grid').forEach(grid => {
      const key = grid.dataset.group;
      const { list } = GROUPS[key];
      grid.innerHTML = list.map(o => `
        <button type="button" class="opt" role="radio" aria-checked="false"
                data-group="${key}" data-value="${o.value}">
          <span class="opt-label">${o.label}</span>
          ${o.hint ? `<span class="opt-hint">${o.hint}</span>` : ''}
        </button>
      `).join('');

      grid.querySelectorAll('.opt').forEach(btn => {
        btn.addEventListener('click', () => select(key, btn.dataset.value));
      });
    });
  }

  function select(key, value) {
    answers[key] = value;
    document.querySelectorAll(`.opt[data-group="${key}"]`).forEach(b => {
      const on = b.dataset.value === value;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', String(on));
    });
    clearFieldError(key);

    if (key === 'gender') {
      const wrap = $('#gender-other-wrap');
      const input = $('#gender-other');
      const isOther = value === 'other';
      wrap.hidden = !isOther;
      if (isOther) input.focus();
      else input.value = '';
    }
  }

  // -------------------------------------------------------------------------
  // Validation — every question has a "Prefer not to say" option, so requiring
  // an explicit choice never forces anyone to disclose anything.
  // -------------------------------------------------------------------------
  function fieldError(key, msg) {
    const el = document.querySelector(`${GROUPS[key].field} .demo-error`);
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    document.querySelector(GROUPS[key].field)?.classList.add('invalid');
  }
  function clearFieldError(key) {
    const el = document.querySelector(`${GROUPS[key].field} .demo-error`);
    if (el) { el.hidden = true; el.textContent = ''; }
    document.querySelector(GROUPS[key].field)?.classList.remove('invalid');
  }

  function validate() {
    const problems = [];
    Object.keys(GROUPS).forEach(clearFieldError);

    Object.entries(GROUPS).forEach(([key, meta]) => {
      if (!answers[key]) {
        fieldError(key, `Please choose an option — “Prefer not to say” is fine.`);
        problems.push(meta.label);
      }
    });

    if (answers.gender === 'other') {
      const val = $('#gender-other').value.trim();
      if (!val) {
        fieldError('gender', 'Please describe your gender, or choose another option above.');
        problems.push('gender description');
      } else if (val.length > D.GENDER_OTHER_MAX) {
        fieldError('gender', `Please keep this under ${D.GENDER_OTHER_MAX} characters.`);
        problems.push('gender description');
      }
    }
    return problems;
  }

  function showSummaryError(problems) {
    const el = $('#demo-summary-error');
    el.innerHTML = `<strong>Not saved yet.</strong> Please complete the highlighted
      ${problems.length === 1 ? 'question' : 'questions'}: ${problems.join(', ')}.`;
    el.hidden = false;
    document.querySelector('.demo-field.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  function sessionId() {
    return sessionStorage.getItem('ped.sessionId') || null;
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;

    const problems = validate();
    if (problems.length) return showSummaryError(problems);
    $('#demo-summary-error').hidden = true;

    submitting = true;
    const btn = $('#demo-submit');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const payload = {
      provided:      true,
      ageGroup:      answers.ageGroup,
      gender:        answers.gender,
      genderOther:   answers.gender === 'other' ? $('#gender-other').value.trim() : null,
      academicLevel: answers.academicLevel,
    };

    const saved = await window.PED.assessment.saveDemographics(sessionId(), payload);
    if (!saved) {
      // Same posture as the rest of the app: never trap the participant on a
      // network error — say so plainly, then let them continue to their results.
      btn.textContent = 'Continuing…';
      $('#demo-note').textContent =
        'We could not reach the server, so these optional details were not saved. Your assessment results are safe — continuing…';
      await new Promise(r => setTimeout(r, 2500));
    }
    window.location.href = 'results.html';
  }

  async function skip() {
    if (submitting) return;
    submitting = true;
    const btn = $('#demo-skip');
    btn.disabled = true;
    await window.PED.assessment.saveDemographics(sessionId(), { provided: false }).catch(() => {});
    window.location.href = 'results.html';
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    // This page only makes sense after a completed assessment.
    if (!localStorage.getItem('ped.completed')) {
      window.location.replace('questionnaire.html');
      return;
    }

    renderOptions();
    $('#demo-form').addEventListener('submit', submit);
    $('#demo-skip').addEventListener('click', skip);
    $('#gender-other').addEventListener('input', () => clearFieldError('gender'));

    if (!sessionId()) {
      // No session row means the assessment itself never reached the server, so
      // there is nothing for these answers to attach to. Say so rather than
      // implying they were recorded.
      $('#demo-note').textContent =
        'Note: this assessment was not linked to a server session, so these details cannot be recorded. Your results are still available on this device.';
    }
  });
})();
