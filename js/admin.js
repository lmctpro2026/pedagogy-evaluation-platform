// ===========================================================================
// Admin Dashboard — Pedagogy Evaluation Platform
// Access: mushfiqurr@students.federation.edu.au | sally.firmin@federation.edu.au
// ===========================================================================

(function () {
  const ADMIN_EMAILS = [
    'mushfiqurr@students.federation.edu.au',
    'sally.firmin@federation.edu.au',
  ];

  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  let allRows   = [];   // master copy for filtering/sorting — one row per participant
  let sortCol   = 'date';
  let sortDir   = 'desc';
  let chartInst = null;
  let demoCharts = {};             // age / gender / level bar charts
  let demographicsAvailable = true; // false until sprint3-demographics.sql is applied

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    const sb = window.PED?.supabase;
    if (!sb) {
      showGate('Supabase is not configured. Update js/supabase.js with your credentials.');
      return;
    }

    const { data: { user } } = await sb.auth.getUser();
    if (!user) { showGate(); return; }
    if (!ADMIN_EMAILS.includes(user.email)) { showDenied(user.email); return; }

    // Admin confirmed — show dashboard
    showDashboard(user.email);
    await loadData(sb);
  });

  // -------------------------------------------------------------------------
  // Gate / denied states
  // -------------------------------------------------------------------------
  function showGate(msg) {
    const gate = $('#admin-gate');
    if (gate) gate.hidden = false;
    const dash = $('#admin-dashboard');
    if (dash) dash.hidden = true;
    // Hide nav-side admin chrome when on the gate
    const pill   = $('#admin-user-pill');
    if (pill)   { pill.textContent = ''; pill.style.display = 'none'; }
    const logout = $('#admin-logout');
    if (logout) logout.hidden = true;
    if (msg) {
      const errEl = $('#gate-err');
      if (errEl) errEl.textContent = msg;
    }

    const loginForm = $('#admin-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const email = $('#gate-email')?.value?.trim();
        const pass  = $('#gate-pass')?.value;
        const errEl = $('#gate-err');
        const btn   = $('#gate-submit');
        if (!email || !pass) return;

        const sb = window.PED?.supabase;
        if (!sb) { if (errEl) errEl.textContent = 'Supabase not configured.'; return; }

        if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

        if (error) {
          if (errEl) errEl.textContent = 'Invalid email or password.';
          if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
          return;
        }
        if (!ADMIN_EMAILS.includes(data.user?.email)) {
          await sb.auth.signOut();
          if (errEl) errEl.textContent = 'This account does not have admin access.';
          if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
          return;
        }
        // Success — reload page
        window.location.reload();
      });
    }
  }

  function showDenied(email) {
    const gate = $('#admin-gate');
    if (gate) {
      gate.hidden = false;
      gate.innerHTML = `
        <div class="gate-card">
          <div class="denied-card">
            <h2>Access denied</h2>
            <p>The account <strong>${email}</strong> does not have admin privileges.</p>
            <button class="btn btn-ghost" id="deny-logout" type="button">Sign out</button>
          </div>
        </div>
      `;
      document.getElementById('deny-logout')?.addEventListener('click', async () => {
        await window.PED.supabase.auth.signOut();
        window.location.href = 'index.html';
      });
    }
    const dash = $('#admin-dashboard');
    if (dash) dash.hidden = true;
  }

  function showDashboard(email) {
    const gate = $('#admin-gate');
    if (gate) gate.hidden = true;
    const dash = $('#admin-dashboard');
    if (dash) dash.hidden = false;

    const pill = $('#admin-user-pill');
    if (pill) { pill.textContent = email; pill.style.display = ''; }

    // Logout — reveal and wire
    const logoutBtn = $('#admin-logout');
    if (logoutBtn) logoutBtn.hidden = false;
    logoutBtn?.addEventListener('click', () => {
      if (window.PED.identity) return window.PED.identity.signOut('manual');
      window.PED.supabase.auth.signOut().finally(() => { window.location.href = 'admin.html'; });
    });

    // Search
    $('#admin-search')?.addEventListener('input', () => renderTable());

    // CSV export
    $('#admin-export-csv')?.addEventListener('click', exportCSV);

    // Refresh
    $('#admin-refresh')?.addEventListener('click', () => loadData(window.PED.supabase));

    // Reset all test data — only visible if ?debug=1 is in the URL
    const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
    const resetBtn  = $('#admin-reset-all');
    if (resetBtn && debugMode) {
      resetBtn.hidden = false;
      resetBtn.addEventListener('click', () => resetAllTestData());
    }
  }

  // -------------------------------------------------------------------------
  // Per-row participant delete — wipes the user row (cascades to sessions and
  // responses via FK). Auth.users is left in place; if needed, use the bigger
  // "Reset test data" button.
  // -------------------------------------------------------------------------
  async function deleteParticipant(userId, participantName) {
    if (!userId) return;
    const label = participantName || 'this participant';
    if (!window.confirm(`Delete "${label}" and all of their session data?\n\nRemoves their profile row, every session they have, and every question response. Cannot be undone.`)) return;

    const sb = window.PED?.supabase;
    if (!sb) return;
    try {
      const { error } = await sb.from('users').delete().eq('id', userId);
      if (error) throw error;
      // Re-read rather than patching local state — deleting a user cascades to
      // their sessions, responses and demographics, which every panel counts.
      await loadData(sb);
    } catch (err) {
      console.error('[admin] delete error:', err);
      window.alert(`Failed to delete participant: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Reset all test data (debug button — wipes everything except admin users)
  // -------------------------------------------------------------------------
  async function resetAllTestData() {
    const sb = window.PED?.supabase;
    if (!sb) return;

    if (!window.confirm(
      'RESET ALL TEST DATA?\n\n' +
      'This wipes every session, every response, and every non-admin user account from the database. Admin accounts are preserved.\n\n' +
      'This cannot be undone.'
    )) return;
    if (!window.confirm('Are you absolutely sure? Type-check failed accounts will be permanently deleted.')) return;

    const btn = document.getElementById('admin-reset-all');
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Resetting…'; }

    try {
      const { data, error } = await sb.rpc('admin_reset_test_data');
      if (error) throw error;
      window.alert(
        'Reset complete.\n' +
        `Sessions deleted: ${data?.deleted_sessions ?? '?'}\n` +
        `Profile rows deleted: ${data?.deleted_users ?? '?'}\n` +
        `Auth accounts deleted: ${data?.deleted_auth_users ?? '?'}`
      );
      await loadData(sb);
    } catch (err) {
      console.error('[admin] reset error:', err);
      window.alert(`Reset failed: ${err.message}`);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
  }

  // -------------------------------------------------------------------------
  // Load data from Supabase — one row per participant, with their most recent
  // session folded in. Parallel queries (users + sessions + demographics)
  // merged on user_id OR participant_email so historically-orphaned sessions
  // still attach to the right participant. Sessions that match no user row at
  // all become their own "unattached" participant rather than disappearing
  // from the counts.
  // -------------------------------------------------------------------------
  let allSessionsCache = [];   // full sessions list, used by the profile modal

  // Build the per-participant row from a set of sessions, newest first.
  function buildRow(base, sessions) {
    const sorted = sessions.slice().sort((a, b) => {
      const ad = new Date(a.completed_at || a.created_at).getTime();
      const bd = new Date(b.completed_at || b.created_at).getTime();
      return bd - ad;
    });

    const completed = sorted.find(s => s.completed_at);
    const latest    = completed || sorted[0] || null;
    const isDone    = !!(latest && latest.completed_at);
    const status    = !latest ? 'not-started' : latest.completed_at ? 'completed' : 'in-progress';

    const num = v => +(+v || 0).toFixed(1);

    return {
      ...base,
      sessionId:    latest?.id || null,
      status,
      tp:           isDone ? num(latest.score_tp)  : null,
      pd:           isDone ? num(latest.score_pd)  : null,
      ta:           isDone ? num(latest.score_ta)  : null,
      tpp:          isDone ? num(latest.score_tpp) : null,
      overall:      isDone
        ? +(((+latest.score_tp || 0) + (+latest.score_pd || 0) + (+latest.score_ta || 0) + (+latest.score_tpp || 0)) / 4).toFixed(1)
        : null,
      date:         latest?.completed_at || latest?.created_at || base.registered,
      demo:         latest?.demo || null,
      sessionCount: sorted.length,
      sessions:     sorted,
    };
  }

  async function loadData(sb) {
    const tableBody = $('#admin-tbody');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="10" class="table-empty">Loading…</td></tr>';

    try {
      const [usersRes, sessionsRes, demoRes] = await Promise.all([
        sb.from('users')
          .select('id, email, full_name, is_anonymous, created_at')
          .order('created_at', { ascending: false }),
        sb.from('sessions')
          .select('id, user_id, participant_email, score_tp, score_pd, score_ta, score_tpp, completed_at, created_at')
          .order('created_at', { ascending: false }),
        // Demographics is Sprint 3 — the dashboard must still load if the
        // migration has not been applied yet.
        sb.from('demographics')
          .select('session_id, provided, age_group, gender, gender_other, academic_level, created_at'),
      ]);

      if (usersRes.error)    throw usersRes.error;
      if (sessionsRes.error) throw sessionsRes.error;

      demographicsAvailable = !demoRes.error;
      if (demoRes.error) console.warn('[admin] demographics unavailable:', demoRes.error.message);

      const demoBySession = new Map(
        (demoRes.data || []).map(d => [d.session_id, d])
      );

      // Attach each session's demographics up front so every consumer sees it.
      allSessionsCache = (sessionsRes.data || []).map(s => ({
        ...s,
        demo: demoBySession.get(s.id) || null,
      }));

      const users = (usersRes.data || [])
        // Hide admin accounts from the participant list — they're not subjects
        .filter(u => !ADMIN_EMAILS.includes((u.email || '').toLowerCase()));

      const claimed = new Set();

      const userRows = users.map(u => {
        // Match by user_id OR by participant_email (case-insensitive)
        const userEmailLower = (u.email || '').toLowerCase();
        const sessions = allSessionsCache.filter(s =>
          s.user_id === u.id ||
          (userEmailLower && s.participant_email && s.participant_email.toLowerCase() === userEmailLower)
        );
        sessions.forEach(s => claimed.add(s.id));

        return buildRow({
          rowId:      u.id,
          userId:     u.id,
          name:       u.full_name || (u.is_anonymous ? 'Anonymous' : '—'),
          email:      u.email || '—',
          anon:       u.is_anonymous ?? false,
          registered: u.created_at,
          orphan:     false,
        }, sessions);
      });

      // Sessions belonging to no visible user row (e.g. the participant's auth
      // account was removed). They are still real assessments, so they count as
      // participants — one row per unattached session.
      const orphanRows = allSessionsCache
        .filter(s => !claimed.has(s.id))
        .map(s => buildRow({
          rowId:      `session:${s.id}`,
          userId:     null,
          name:       'Unattached session',
          email:      s.participant_email || '—',
          anon:       true,
          registered: s.created_at,
          orphan:     true,
        }, [s]));

      allRows = [...userRows, ...orphanRows];

      // Fill in the email column from a session when the user row has none.
      allRows.forEach(r => {
        if (r.email === '—') {
          r.email = r.sessions.find(s => s.participant_email)?.participant_email || '—';
        }
      });

      renderStats();
      renderChart();
      renderCategorySummary();
      renderDemographics();
      renderTable();
      updateLastUpdated();
    } catch (err) {
      console.error('[admin] loadData error:', err);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="10" class="table-empty is-error">Error loading data: ${err.message}</td></tr>`;
    }
  }

  // -------------------------------------------------------------------------
  // Stats cards
  //
  //   participants — every non-admin person known to the platform
  //   started      — participants with at least one session row
  //   completed    — participants with at least one finished session
  //   accounts     — participants who registered (not anonymous sign-ins)
  // -------------------------------------------------------------------------
  function renderStats() {
    const participants = allRows.length;
    const started      = allRows.filter(r => r.sessionCount > 0).length;
    const completed    = allRows.filter(r => r.status === 'completed');
    const inProgress   = allRows.filter(r => r.status === 'in-progress').length;
    const accounts     = allRows.filter(r => !r.anon).length;
    const anonymous    = participants - accounts;

    const avgScore = completed.length
      ? (completed.reduce((a, r) => a + r.overall, 0) / completed.length).toFixed(1)
      : null;

    const today = new Date().toDateString();
    const todayCompleted = completed.filter(r => new Date(r.date).toDateString() === today).length;

    // Demographics is measured per completed session, not per participant.
    const asked    = allSessionsCache.filter(s => s.completed_at && s.demo);
    const provided = asked.filter(s => s.demo.provided).length;
    const declined = asked.length - provided;

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const pct = (n, d) => d ? `${Math.round((n / d) * 100)}%` : '—';

    set('stat-participants',     participants);
    set('stat-participants-sub', `${accounts} registered · ${anonymous} anonymous`);

    set('stat-started',          started);
    set('stat-started-sub',      `${pct(started, participants)} of participants`);

    set('stat-completed',        completed.length);
    set('stat-completed-sub',    `${todayCompleted} today`);

    set('stat-accounts',         accounts);
    set('stat-accounts-sub',     `${pct(accounts, participants)} of participants`);

    set('stat-rate',             pct(completed.length, started));
    set('stat-rate-sub',         `${completed.length} of ${started} who started`);

    set('stat-inprogress',       inProgress);

    set('stat-avg',              avgScore != null ? `${avgScore}%` : '—');
    set('stat-avg-sub',          `across ${completed.length} completed`);

    set('stat-demographics',     demographicsAvailable ? provided : '—');
    set('stat-demographics-sub', demographicsAvailable
      ? `${declined} declined · ${pct(provided, asked.length)} opt-in`
      : 'migration not applied');
  }

  // -------------------------------------------------------------------------
  // TP / PD / TA / TPP numeric summary — computed across completed sessions
  // (every completed session, not just each participant's latest).
  // -------------------------------------------------------------------------
  const CATEGORY_META = [
    { key: 'score_tp',  code: 'TP',  name: 'Teaching Practice' },
    { key: 'score_pd',  code: 'PD',  name: 'Pedagogical Development' },
    { key: 'score_ta',  code: 'TA',  name: 'Technology Adoption' },
    { key: 'score_tpp', code: 'TPP', name: 'Techno-Pedagogical Practice' },
  ];

  function stats(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
      n:      sorted.length,
      mean:   +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1),
      median: +(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2).toFixed(1),
      min:    +sorted[0].toFixed(1),
      max:    +sorted[sorted.length - 1].toFixed(1),
    };
  }

  // Active attempts only. A signed-in participant may keep a previous attempt
  // alongside the current one in the same year; only the newest counts, so a
  // participant is never averaged in twice.
  function completedSessions() {
    const year = iso => new Date(iso).getFullYear();
    const newestByUserYear = new Map();
    for (const s of allSessionsCache) {
      if (!s.completed_at || !s.user_id) continue;
      const key = `${s.user_id}:${year(s.completed_at)}`;
      const prev = newestByUserYear.get(key);
      if (!prev || new Date(s.completed_at) > new Date(prev.completed_at)) newestByUserYear.set(key, s);
    }
    return allSessionsCache.filter(s =>
      s.completed_at && (!s.user_id || newestByUserYear.get(`${s.user_id}:${year(s.completed_at)}`) === s)
    );
  }

  function renderCategorySummary() {
    const body = $('#category-summary-body');
    if (!body) return;

    const done = completedSessions();
    if (!done.length) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">No completed assessments yet.</td></tr>';
      return;
    }

    const rows = CATEGORY_META.map(c => {
      const s = stats(done.map(x => +x[c.key]).filter(Number.isFinite));
      return { c, s };
    });

    const overall = stats(done.map(x =>
      (CATEGORY_META.reduce((a, c) => a + (+x[c.key] || 0), 0)) / CATEGORY_META.length
    ));

    const cell = v => v == null ? '—' : `${v}%`;
    const line = (label, code, s, cls = '') => `
      <tr class="${cls}">
        <td class="sum-name">${code ? `<span class="cat-pill cat-${code}">${code}</span>` : ''} ${label}</td>
        <td>${s ? s.n : 0}</td>
        <td class="sum-mean">${cell(s?.mean)}</td>
        <td>${cell(s?.median)}</td>
        <td>${cell(s?.min)}</td>
        <td>${cell(s?.max)}</td>
      </tr>`;

    body.innerHTML =
      rows.map(({ c, s }) => line(c.name, c.code, s)).join('') +
      line('Overall composite', null, overall, 'sum-total');
  }

  // -------------------------------------------------------------------------
  // Demographic summaries — bar charts over completed sessions whose
  // participant opted in.
  // -------------------------------------------------------------------------
  // Chart.js can't read CSS variables — these mirror the tokens in css/main.css.
  const CHART_FONT   = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, sans-serif";
  const CHART_COLORS = {
    text2:   '#3F4957',
    muted:   '#667080',
    border:  '#DCE0E6',
    grid:    '#EEF0F3',
    accent:  '#1F5A96',
    tooltip: '#17202C',
    categories: ['#2F6DB5', '#7A4BA8', '#1E8560', '#C0480F'], // TP, PD, TA, TPP
  };
  const CHART_TOOLTIP = {
    backgroundColor: CHART_COLORS.tooltip,
    titleColor:      '#FFFFFF',
    bodyColor:       '#FFFFFF',
    titleFont:       { family: CHART_FONT, weight: '600' },
    bodyFont:        { family: CHART_FONT },
    padding:         10,
    cornerRadius:    6,
    displayColors:   false,
  };

  const DEMO_CHARTS = [
    { canvas: 'demo-chart-age',    column: 'age_group',      optionsKey: 'AGE_GROUPS',      color: CHART_COLORS.accent },
    { canvas: 'demo-chart-gender', column: 'gender',         optionsKey: 'GENDERS',         color: CHART_COLORS.accent },
    { canvas: 'demo-chart-level',  column: 'academic_level', optionsKey: 'ACADEMIC_LEVELS', color: CHART_COLORS.accent },
  ];

  function renderDemographics() {
    const section = $('#demographics-section');
    const empty   = $('#demographics-empty');
    const note    = $('#demographics-note');
    const grid    = section?.querySelector('.demo-charts');
    if (!section || !window.Chart) return;

    const showMessage = msg => {
      if (grid)  grid.hidden  = true;
      if (empty) { empty.hidden = false; empty.textContent = msg; }
      Object.values(demoCharts).forEach(c => c.destroy());
      demoCharts = {};
    };

    if (!demographicsAvailable) {
      if (note) note.textContent = '';
      return showMessage('Demographics are not available yet — run sprint3-demographics.sql in the Supabase SQL Editor to create the table.');
    }

    const provided = completedSessions().filter(s => s.demo && s.demo.provided);
    if (note) note.textContent = `${provided.length} participant${provided.length === 1 ? '' : 's'} provided details`;

    if (!provided.length) {
      return showMessage('No demographic details collected yet. Participants are asked after completing the survey.');
    }

    if (grid)  grid.hidden  = false;
    if (empty) empty.hidden = true;

    DEMO_CHARTS.forEach(cfg => {
      const canvas = document.getElementById(cfg.canvas);
      if (!canvas) return;

      const options = window.PED.DEMOGRAPHICS[cfg.optionsKey];
      const counts  = options.map(o => provided.filter(s => s.demo[cfg.column] === o.value).length);

      // Drop always-empty buckets so small samples stay readable.
      const labels = [], data = [];
      options.forEach((o, i) => { if (counts[i] > 0) { labels.push(o.label); data.push(counts[i]); } });

      if (demoCharts[cfg.canvas]) demoCharts[cfg.canvas].destroy();
      demoCharts[cfg.canvas] = new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: cfg.color,
            borderWidth: 0,
            borderRadius: 3,
            maxBarThickness: 18,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { ...CHART_TOOLTIP, callbacks: { label: ctx => `${ctx.parsed.x} participant${ctx.parsed.x === 1 ? '' : 's'}` } },
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks:  { color: CHART_COLORS.muted, precision: 0, font: { family: CHART_FONT, size: 11 } },
              grid:   { color: CHART_COLORS.grid },
              border: { color: CHART_COLORS.border },
            },
            y: {
              ticks:  { color: CHART_COLORS.text2, font: { family: CHART_FONT, size: 12 } },
              grid:   { display: false },
              border: { color: CHART_COLORS.border },
            },
          },
        },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Category averages chart — across every COMPLETED session, so it always
  // matches the numeric summary table beneath it.
  // -------------------------------------------------------------------------
  function renderChart() {
    const canvas = document.getElementById('admin-chart');
    if (!canvas || !window.Chart) return;

    const done = completedSessions();
    const n = done.length;
    const avg = key => n ? +(done.reduce((a, s) => a + (+s[key] || 0), 0) / n).toFixed(1) : 0;
    const data = CATEGORY_META.map(c => avg(c.key));

    if (chartInst) chartInst.destroy();
    chartInst = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: CATEGORY_META.map(c => c.name),
        datasets: [{
          data,
          backgroundColor: CHART_COLORS.categories,
          borderWidth: 0,
          borderRadius: 3,
          maxBarThickness: 24,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...CHART_TOOLTIP, callbacks: { label: ctx => `${ctx.parsed.x}%` } } },
        scales: {
          x: {
            min: 0, max: 100,
            ticks:  { color: CHART_COLORS.muted, callback: v => `${v}%`, font: { family: CHART_FONT, size: 11 } },
            grid:   { color: CHART_COLORS.grid },
            border: { color: CHART_COLORS.border },
          },
          y: {
            ticks:  { color: CHART_COLORS.text2, font: { family: CHART_FONT, size: 13 } },
            grid:   { display: false },
            border: { color: CHART_COLORS.border },
          },
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Sessions table
  // -------------------------------------------------------------------------
  function renderTable() {
    const query   = ($('#admin-search')?.value || '').toLowerCase();
    const visible = allRows.filter(r =>
      r.name.toLowerCase().includes(query) ||
      (r.email || '').toLowerCase().includes(query)
    );

    // Sort. For numeric score columns, treat null as -Infinity so completed rows
    // sort above not-started rows when descending.
    visible.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'date') { va = new Date(va).getTime() || 0; vb = new Date(vb).getTime() || 0; }
      else if (['tp','pd','ta','tpp','overall'].includes(sortCol)) {
        va = (va == null) ? -Infinity : va;
        vb = (vb == null) ? -Infinity : vb;
      }
      if (va < vb) return sortDir === 'asc' ? -1 :  1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    const tbody = $('#admin-tbody');
    const footer = $('#table-footer-count');
    if (!tbody) return;

    if (visible.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="table-empty">${allRows.length === 0 ? 'No participants yet.' : 'No results match your search.'}</td></tr>`;
      if (footer) footer.textContent = '0 participants';
      return;
    }

    const score = v => (v == null) ? '<span class="cell-muted">—</span>' : `${v}%`;
    const overallCell = r =>
      r.status === 'completed' ? `${r.overall}%`
      : r.status === 'in-progress' ? '<span class="cell-muted">…</span>'
      : '<span class="cell-muted">—</span>';

    tbody.innerHTML = visible.map((r, i) => `
      <tr data-row-id="${r.rowId}">
        <td class="td-score td-index">${String(i + 1).padStart(2, '0')}</td>
        <td class="td-name">
          ${r.name}
          ${r.anon ? '<span class="badge badge-anon">Anonymous</span>' : ''}
          <span class="badge badge-status ${r.status}">${STATUS_LABELS[r.status]}</span>
          ${r.demo?.provided ? '<span class="badge badge-demo" title="Provided demographic details">Demographics</span>' : ''}
        </td>
        <td class="td-email">${r.email}</td>
        <td class="td-score">${score(r.tp)}</td>
        <td class="td-score">${score(r.pd)}</td>
        <td class="td-score">${score(r.ta)}</td>
        <td class="td-score">${score(r.tpp)}</td>
        <td class="td-overall">${overallCell(r)}</td>
        <td class="td-date">${formatDate(r.date)}</td>
        <td class="td-actions">
          ${r.orphan ? '' : `
          <button class="btn-row-delete" type="button" data-action="delete-participant" data-user-id="${r.userId}" data-participant-name="${(r.name || '').replace(/"/g, '&quot;')}" title="Delete this participant and all their data">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>`}
        </td>
      </tr>
    `).join('');

    // Delegated click handler (attached once). Handles both delete and
    // row-clicks that open the profile modal.
    if (!tbody._clickWired) {
      tbody.addEventListener('click', e => {
        const delBtn = e.target.closest('[data-action="delete-participant"]');
        if (delBtn) {
          e.preventDefault();
          e.stopPropagation();
          deleteParticipant(delBtn.dataset.userId, delBtn.dataset.participantName);
          return;
        }
        const row = e.target.closest('tr[data-row-id]');
        if (row) openParticipantModal(row.dataset.rowId);
      });
      tbody._clickWired = true;
    }

    if (footer) footer.textContent = `${visible.length} of ${allRows.length} participant${allRows.length !== 1 ? 's' : ''}`;
  }

  // Column sort wiring
  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (sortCol === col) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
        else { sortCol = col; sortDir = col === 'date' ? 'desc' : 'asc'; }
        $$('[data-sort]').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        th.classList.add(`sort-${sortDir}`);
        renderTable();
      });
    });
  });

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------
  function exportCSV() {
    const headers = [
      '#', 'Name', 'Email', 'Anonymous', 'Status', 'TP', 'PD', 'TA', 'TPP', 'Overall',
      'Age Group', 'Gender', 'Gender (specified)', 'Academic Level', 'Last Activity',
    ];
    const cell = v => v == null ? '' : v;
    const D    = window.PED.DEMOGRAPHICS;
    const rows = allRows.map((r, i) => [
      i + 1, r.name, r.email, r.anon ? 'Yes' : 'No', r.status,
      cell(r.tp), cell(r.pd), cell(r.ta), cell(r.tpp), cell(r.overall),
      demoCell(r.demo, D.AGE_GROUPS,      'age_group'),
      demoCell(r.demo, D.GENDERS,         'gender'),
      r.demo?.provided ? cell(r.demo.gender_other) : '',
      demoCell(r.demo, D.ACADEMIC_LEVELS, 'academic_level'),
      r.date ? new Date(r.date).toLocaleString() : '',
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `PEP-participants_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------------------
  // Participant profile modal — drilldown into one user
  // -------------------------------------------------------------------------
  const STATUS_LABELS = { 'completed': 'Completed', 'in-progress': 'In progress', 'not-started': 'Not started' };

  function questionByCode(code) {
    return (window.PED?.QUESTIONS || []).find(q => q.id === code) || null;
  }
  function likertLabel(v) {
    return ((window.PED?.LIKERT || []).find(l => l.value === v) || {}).label || String(v);
  }

  // One demographic value, resolved to its human label. Blank when the
  // participant declined or was never asked.
  function demoCell(demo, options, column) {
    if (!demo || !demo.provided || !demo[column]) return '';
    return window.PED.demographicLabel(options, demo[column]);
  }

  function demographicsHtml(demo) {
    if (!demographicsAvailable) return '';
    if (!demo) return '<div class="pm-demo none">Demographics: not asked</div>';
    if (!demo.provided) return '<div class="pm-demo none">Demographics: declined</div>';

    const D = window.PED.DEMOGRAPHICS;
    const gender = demo.gender === 'other' && demo.gender_other
      ? `Other — ${demo.gender_other}`
      : demoCell(demo, D.GENDERS, 'gender') || '—';

    return `
      <div class="pm-demo">
        <span class="pm-demo-title">Demographics</span>
        <span><span class="pm-score-label">Age</span> ${demoCell(demo, D.AGE_GROUPS, 'age_group') || '—'}</span>
        <span><span class="pm-score-label">Gender</span> ${gender}</span>
        <span><span class="pm-score-label">Academic</span> ${demoCell(demo, D.ACADEMIC_LEVELS, 'academic_level') || '—'}</span>
      </div>`;
  }

  function sessionCardHtml(s) {
    const isCompleted  = !!s.completed_at;
    const isInProgress = !isCompleted;
    const status       = isCompleted ? 'completed' : 'in-progress';
    const overall = isCompleted
      ? +(((+s.score_tp || 0) + (+s.score_pd || 0) + (+s.score_ta || 0) + (+s.score_tpp || 0)) / 4).toFixed(1)
      : null;

    const scores = isCompleted ? `
      <div class="pm-scores">
        <div class="pm-score cat-TP"><span class="pm-score-label">TP</span> ${(+s.score_tp).toFixed(1)}%</div>
        <div class="pm-score cat-PD"><span class="pm-score-label">PD</span> ${(+s.score_pd).toFixed(1)}%</div>
        <div class="pm-score cat-TA"><span class="pm-score-label">TA</span> ${(+s.score_ta).toFixed(1)}%</div>
        <div class="pm-score cat-TPP"><span class="pm-score-label">TPP</span> ${(+s.score_tpp).toFixed(1)}%</div>
        <div class="pm-score pm-score-overall"><span class="pm-score-label">Overall</span> ${overall}%</div>
      </div>
    ` : `<div class="pm-incomplete-note">Started but not finished — no scores recorded.</div>`;

    return `
      <div class="pm-session-card" data-session-id="${s.id}">
        <div class="pm-session-head">
          <div class="pm-session-meta">
            <span class="badge badge-status ${status}">${STATUS_LABELS[status]}</span>
            <span class="pm-session-date">Started ${formatDate(s.created_at)}</span>
            ${isCompleted ? `<span class="pm-session-date">· Completed ${formatDate(s.completed_at)}</span>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm pm-toggle-responses" type="button" data-session-id="${s.id}">View responses</button>
        </div>
        ${scores}
        ${isCompleted ? demographicsHtml(s.demo) : ''}
        <div class="pm-responses" data-loaded="0" hidden></div>
      </div>
    `;
  }

  async function openParticipantModal(rowId) {
    const row = allRows.find(r => r.rowId === rowId);
    if (!row) return;
    const modal = $('#participant-modal');
    if (!modal) return;

    $('#pm-title').textContent     = row.name;
    $('#pm-email').textContent     = row.email;
    const statusEl = $('#pm-status');
    statusEl.className   = `badge badge-status ${row.status}`;
    statusEl.textContent = STATUS_LABELS[row.status];
    $('#pm-anon').hidden     = !row.anon;
    $('#pm-registered').textContent = formatDate(row.registered);

    const list = $('#pm-sessions');
    list.innerHTML = row.sessions.length
      ? row.sessions.map(sessionCardHtml).join('')
      : '<p class="pm-empty">No sessions yet — this participant registered but has not started the assessment.</p>';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeParticipantModal() {
    const modal = $('#participant-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  async function fetchAndRenderResponses(sessionId, container) {
    if (container.dataset.loaded === '1') return;
    const sb = window.PED?.supabase;
    if (!sb) return;
    container.innerHTML = '<div class="pm-responses-status">Loading responses…</div>';
    try {
      const { data, error } = await sb.from('responses')
        .select('question_id, category, answer_value, answered_at')
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true });
      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="pm-responses-status">No responses recorded for this session.</div>';
      } else {
        container.innerHTML = '<table class="pm-responses-table"><thead><tr><th>#</th><th>Question</th><th>Category</th><th>Answer</th></tr></thead><tbody>'
          + data.map((r, i) => {
              const q = questionByCode(r.question_id);
              const text = q ? q.text : '(question text unavailable)';
              return `<tr>
                <td class="pm-resp-num">${String(i + 1).padStart(2, '0')}</td>
                <td class="pm-resp-q">${text}</td>
                <td class="pm-resp-cat"><span class="cat-pill cat-${r.category}">${r.category}</span></td>
                <td class="pm-resp-a">${r.answer_value} · ${likertLabel(r.answer_value)}</td>
              </tr>`;
            }).join('')
          + '</tbody></table>';
      }
      container.dataset.loaded = '1';
    } catch (err) {
      console.error('[admin] fetchResponses error:', err);
      container.innerHTML = `<div class="pm-responses-status is-error">Failed to load responses: ${err.message}</div>`;
    }
  }

  // Wire modal interactions once
  document.addEventListener('DOMContentLoaded', () => {
    const modal   = document.getElementById('participant-modal');
    const closeBtn = document.getElementById('pm-close');
    closeBtn?.addEventListener('click', closeParticipantModal);
    modal?.addEventListener('click', e => {
      // Click on backdrop (not the card itself) → close
      if (e.target === modal) closeParticipantModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal && !modal.hidden) closeParticipantModal();
    });
    // Toggle responses (delegated)
    modal?.addEventListener('click', e => {
      const tog = e.target.closest('.pm-toggle-responses');
      if (!tog) return;
      const card = tog.closest('.pm-session-card');
      const container = card?.querySelector('.pm-responses');
      if (!container) return;
      if (container.hidden) {
        container.hidden = false;
        tog.textContent = 'Hide responses';
        fetchAndRenderResponses(tog.dataset.sessionId, container);
      } else {
        container.hidden = true;
        tog.textContent = 'View responses';
      }
    });
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function updateLastUpdated() {
    const el = $('#last-updated');
    if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
})();
