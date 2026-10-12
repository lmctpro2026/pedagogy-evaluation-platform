// ===========================================================================
// Question bank — the wording of the 20 statements lives in the database
// (public.questions, editable by administrators) and js/questions.js is the
// fallback copy that ships with the site.
//
//   PED.questionBank.sync()           → overlay database wording onto PED.QUESTIONS
//   PED.questionBank.fetchAll()       → rows for the admin panel
//   PED.questionBank.update(code, t)  → save new wording (admins only)
//   PED.questionBank.defaultText(code)→ the shipped wording
//
// sync() changes the objects in PED.QUESTIONS in place, so modules that took
// a reference at load time see the new wording. Only `text` is ever changed:
// category, weight and order stay with the JS copy, which the scoring model
// depends on (and which the database locks with a trigger).
// ===========================================================================

(function () {
  const BASE    = 'code, text, category, weight, order_index';
  const COLUMNS = `${BASE}, updated_at, updated_by`;   // audit columns from question-bank.sql
  const MIN = 10;
  const MAX = 400;

  const questions = window.PED.QUESTIONS;
  const DEFAULTS = Object.fromEntries(questions.map(q => [q.id, q.text]));
  let syncing = null;

  function apply(rows) {
    const byCode = new Map((rows || []).map(r => [r.code, r]));
    questions.forEach(q => {
      const row = byCode.get(q.id);
      if (row && typeof row.text === 'string' && row.text.trim()) q.text = row.text.trim();
    });
  }

  async function select(columns) {
    const { data, error } = await window.PED.supabase.from('questions').select(columns).order('order_index');
    if (error) throw error;
    return data || [];
  }

  // Rows for the admin panel. `editable` is false until question-bank.sql has
  // been run (the audit columns are missing), in which case the rows are shown
  // read-only.
  async function fetchAll() {
    if (!window.PED.supabase) throw new Error('Not connected.');
    try {
      return { rows: await select(COLUMNS), editable: true };
    } catch (e) {
      if (e?.code !== '42703') throw e;            // anything but "column does not exist"
      return { rows: await select(BASE), editable: false };
    }
  }

  // Resolves true when database wording was applied, false when the site is
  // running on the shipped copy (offline, slow network, or no client).
  function sync(timeoutMs = 2500) {
    if (syncing) return syncing;
    syncing = (async () => {
      if (!window.PED.supabase) return false;
      try {
        const rows = await Promise.race([
          select(BASE),
          new Promise(resolve => setTimeout(() => resolve(null), timeoutMs)),
        ]);
        if (!rows) return false;
        apply(rows);
        return true;
      } catch {
        return false;
      }
    })();
    return syncing;
  }

  function validate(text) {
    const t = (text || '').trim();
    if (t.length < MIN) return `Wording must be at least ${MIN} characters.`;
    if (t.length > MAX) return `Wording must be ${MAX} characters or fewer.`;
    return '';
  }

  // Saves new wording. Resolves { ok, row } or { ok: false, message }.
  async function update(code, text) {
    const sb = window.PED.supabase;
    if (!sb) return { ok: false, message: 'Not connected.' };
    const problem = validate(text);
    if (problem) return { ok: false, message: problem };
    try {
      const { data, error } = await sb.from('questions')
        .update({ text: text.trim() })
        .eq('code', code)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      // RLS hides the row from a caller who may not edit: no error, no row.
      if (!data) return { ok: false, message: 'Your account is not permitted to edit questions.' };
      apply([data]);
      return { ok: true, row: data };
    } catch (e) {
      const m = e?.message || '';
      const message = /questions_text_length/.test(m) ? `Wording must be ${MIN}–${MAX} characters.`
        : /Only the wording/.test(m)                  ? 'Only the wording of a question can be edited.'
        : /column .* does not exist|updated_at/.test(m) ? 'Editing questions needs the question-bank database update (question-bank.sql).'
        : (m || 'Could not save this question.');
      return { ok: false, message };
    }
  }

  window.PED.questionBank = {
    sync, fetchAll, apply, update, validate,
    defaultText: code => DEFAULTS[code] || '',
    MIN, MAX,
  };
})();
