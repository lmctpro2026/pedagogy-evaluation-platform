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
            <h2>Access Denied</h2>
            <p>The account <strong>${email}</strong> does not have admin privileges.</p>
            <button class="btn btn-ghost" id="deny-logout" style="margin:0 auto;">Sign out</button>
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
    if (pill) { pill.textContent = email; pill.style.display = 'block'; }

    // Logout — reveal and wire
    const logoutBtn = $('#admin-logout');
    if (logoutBtn) logoutBtn.hidden = false;
    logoutBtn?.addEventListener('click', async () => {
      await window.PED.supabase.auth.signOut();
      window.location.href = 'index.html';
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
      allRows = allRows.filter(r => r.userId !== userId);
      renderStats();
      renderChart();
      renderTable();
      updateLastUpdated();
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
  // session folded in. Two parallel queries (users + sessions) merged on
  // user_id OR participant_email so historically-orphaned sessions still
  // attach to the right participant.
  // -------------------------------------------------------------------------
  let allSessionsCache = [];   // full sessions list, used by the profile modal

  async function loadData(sb) {
    const tableBody = $('#admin-tbody');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="10" class="table-empty">Loading…</td></tr>';

    try {
      const [usersRes, sessionsRes] = await Promise.all([
        sb.from('users')
          .select('id, email, full_name, is_anonymous, created_at')
          .order('created_at', { ascending: false }),
        sb.from('sessions')
          .select('id, user_id, participant_email, score_tp, score_pd, score_ta, score_tpp, completed_at, created_at')
          .order('created_at', { ascending: false }),
      ]);

      if (usersRes.error)    throw usersRes.error;
      if (sessionsRes.error) throw sessionsRes.error;

      allSessionsCache = sessionsRes.data || [];
      const users      = usersRes.data || [];

      allRows = users
        // Hide admin accounts from the participant list — they're not subjects
        .filter(u => !ADMIN_EMAILS.includes((u.email || '').toLowerCase()))
        .map(u => {
          // Match by user_id OR by participant_email (case-insensitive)
          const userEmailLower = (u.email || '').toLowerCase();
          const sessions = allSessionsCache.filter(s =>
            s.user_id === u.id ||
            (userEmailLower && s.participant_email && s.participant_email.toLowerCase() === userEmailLower)
          ).slice().sort((a, b) => {
            const ad = new Date(a.completed_at || a.created_at).getTime();
            const bd = new Date(b.completed_at || b.created_at).getTime();
            return bd - ad;
          });

          const completed = sessions.find(s => s.completed_at);
          const latest    = completed || sessions[0] || null;
          const status    = !latest ? 'not-started'
                          : latest.completed_at ? 'completed'
                          : 'in-progress';

          const overall = (latest && latest.completed_at)
            ? +(((+latest.score_tp || 0) + (+latest.score_pd || 0) + (+latest.score_ta || 0) + (+latest.score_tpp || 0)) / 4).toFixed(1)
            : null;

          return {
            userId:       u.id,
            sessionId:    latest?.id || null,
            name:         u.full_name || (u.is_anonymous ? 'Anonymous' : '—'),
            email:        u.email || latest?.participant_email || '—',
            anon:         u.is_anonymous ?? false,
            registered:   u.created_at,
            status,
            tp:           (latest && latest.completed_at) ? +(+latest.score_tp  ?? 0).toFixed(1) : null,
            pd:           (latest && latest.completed_at) ? +(+latest.score_pd  ?? 0).toFixed(1) : null,
            ta:           (latest && latest.completed_at) ? +(+latest.score_ta  ?? 0).toFixed(1) : null,
            tpp:          (latest && latest.completed_at) ? +(+latest.score_tpp ?? 0).toFixed(1) : null,
            overall,
            date:         latest?.completed_at || latest?.created_at || u.created_at,
            sessionCount: sessions.length,
            sessions,
          };
        });

      renderStats();
      renderChart();
      renderTable();
      updateLastUpdated();
    } catch (err) {
      console.error('[admin] loadData error:', err);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="10" class="table-empty" style="color:var(--danger);">Error loading data: ${err.message}</td></tr>`;
    }
  }

  // -------------------------------------------------------------------------
  // Stats cards
  // -------------------------------------------------------------------------
  function renderStats() {
    const totalUsers     = allRows.length;
    const completed      = allRows.filter(r => r.status === 'completed');
    const inProgress     = allRows.filter(r => r.status === 'in-progress').length;
    const registered     = allRows.filter(r => !r.anon).length;
    const anonymous      = allRows.filter(r => r.anon).length;
    const avgScore       = completed.length
      ? (completed.reduce((a, r) => a + r.overall, 0) / completed.length).toFixed(1)
      : null;
    const todayCompleted = completed.filter(r => {
      const d = new Date(r.date);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;

    const el  = id => document.getElementById(id);
    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };

    // Total card: "users · completed" — still surfaces completion count
    set('stat-total',    totalUsers);
    const totalLabel = el('stat-total')?.parentElement?.querySelector('.stat-label');
    if (totalLabel) totalLabel.textContent = 'Total Users';
    const totalSub = el('stat-total')?.parentElement?.querySelector('.stat-sub');
    if (totalSub)   totalSub.textContent   = `${completed.length} completed · ${inProgress} in progress`;

    set('stat-avg',      avgScore != null ? `${avgScore}%` : '—');
    set('stat-reg',      totalUsers ? `${Math.round((registered / totalUsers) * 100)}%` : '—');
    set('stat-today',    todayCompleted);
    set('stat-reg-sub',  `${registered} registered · ${anonymous} anonymous`);
  }

  // -------------------------------------------------------------------------
  // Category averages chart — only across COMPLETED sessions
  // -------------------------------------------------------------------------
  function renderChart() {
    const canvas = document.getElementById('admin-chart');
    if (!canvas || !window.Chart) return;

    const completed = allRows.filter(r => r.status === 'completed');
    const n = completed.length;
    const avg = key => n ? +(completed.reduce((a, r) => a + (r[key] || 0), 0) / n).toFixed(1) : 0;
    const data = [avg('tp'), avg('pd'), avg('ta'), avg('tpp')];

    if (chartInst) chartInst.destroy();
    chartInst = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Teaching Practice', 'Pedagogical Development', 'Technology Adoption', 'Techno-Pedagogical Practice'],
        datasets: [{
          data,
          backgroundColor: ['rgba(42,74,122,0.6)', 'rgba(90,46,110,0.6)', 'rgba(42,92,68,0.6)', 'rgba(193,127,58,0.6)'],
          borderColor:     ['#BCD0EF', '#DCBDED', '#B6DCC4', '#E8A84E'],
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}%` } } },
        scales: {
          x: { min: 0, max: 100, ticks: { color: '#6B6459', callback: v => `${v}%` }, grid: { color: 'rgba(42,37,32,0.5)' } },
          y: { ticks: { color: '#F5F0E8', font: { family: 'Poppins', size: 12 } }, grid: { display: false } },
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

    const score = v => (v == null) ? '<span style="color:var(--muted);">—</span>' : `${v}%`;
    const overallCell = r =>
      r.status === 'completed' ? `${r.overall}%`
      : r.status === 'in-progress' ? '<span style="color:var(--copper-light);">…</span>'
      : '<span style="color:var(--muted);">—</span>';

    tbody.innerHTML = visible.map((r, i) => `
      <tr data-user-id="${r.userId}">
        <td class="td-score" style="color:var(--muted);">${String(i + 1).padStart(2, '0')}</td>
        <td class="td-name">
          ${r.name}
          ${r.anon ? '<span class="badge-anon">anon</span>' : ''}
          <span class="badge-status ${r.status}">${r.status === 'in-progress' ? 'in progress' : r.status === 'not-started' ? 'not started' : 'completed'}</span>
        </td>
        <td class="td-email">${r.email}</td>
        <td class="td-score">${score(r.tp)}</td>
        <td class="td-score">${score(r.pd)}</td>
        <td class="td-score">${score(r.ta)}</td>
        <td class="td-score">${score(r.tpp)}</td>
        <td class="td-overall">${overallCell(r)}</td>
        <td class="td-date">${formatDate(r.date)}</td>
        <td class="td-actions">
          <button class="btn-row-delete" type="button" data-action="delete-participant" data-user-id="${r.userId}" data-participant-name="${(r.name || '').replace(/"/g, '&quot;')}" title="Delete this participant and all their data">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
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
        const row = e.target.closest('tr[data-user-id]');
        if (row) openParticipantModal(row.dataset.userId);
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
    const headers = ['#', 'Name', 'Email', 'Anonymous', 'Status', 'TP', 'PD', 'TA', 'TPP', 'Overall', 'Last Activity'];
    const cell    = v => v == null ? '' : v;
    const rows    = allRows.map((r, i) => [
      i + 1, r.name, r.email, r.anon ? 'Yes' : 'No', r.status,
      cell(r.tp), cell(r.pd), cell(r.ta), cell(r.tpp), cell(r.overall),
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
  const STATUS_LABELS = { 'completed': 'completed', 'in-progress': 'in progress', 'not-started': 'not started' };

  function questionByCode(code) {
    return (window.PED?.QUESTIONS || []).find(q => q.id === code) || null;
  }
  function likertLabel(v) {
    return ((window.PED?.LIKERT || []).find(l => l.value === v) || {}).label || String(v);
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
        <div><span class="pm-score-label">TP</span> ${(+s.score_tp).toFixed(1)}%</div>
        <div><span class="pm-score-label">PD</span> ${(+s.score_pd).toFixed(1)}%</div>
        <div><span class="pm-score-label">TA</span> ${(+s.score_ta).toFixed(1)}%</div>
        <div><span class="pm-score-label">TPP</span> ${(+s.score_tpp).toFixed(1)}%</div>
        <div class="pm-score-overall"><span class="pm-score-label">Overall</span> ${overall}%</div>
      </div>
    ` : `<div class="pm-incomplete-note">Started but not finished — no scores recorded.</div>`;

    return `
      <div class="pm-session-card" data-session-id="${s.id}">
        <div class="pm-session-head">
          <div class="pm-session-meta">
            <span class="badge-status ${status}">${STATUS_LABELS[status]}</span>
            <span class="pm-session-date">Started ${formatDate(s.created_at)}</span>
            ${isCompleted ? `<span class="pm-session-date">· Completed ${formatDate(s.completed_at)}</span>` : ''}
          </div>
          <button class="btn btn-ghost pm-toggle-responses" type="button" data-session-id="${s.id}">View responses</button>
        </div>
        ${scores}
        <div class="pm-responses" data-loaded="0" hidden></div>
      </div>
    `;
  }

  async function openParticipantModal(userId) {
    const row = allRows.find(r => r.userId === userId);
    if (!row) return;
    const modal = $('#participant-modal');
    if (!modal) return;

    $('#pm-title').textContent     = row.name;
    $('#pm-email').textContent     = row.email;
    const statusEl = $('#pm-status');
    statusEl.className   = `badge-status ${row.status}`;
    statusEl.textContent = STATUS_LABELS[row.status];
    $('#pm-anon').hidden     = !row.anon;
    $('#pm-registered').textContent = formatDate(row.registered);

    const list = $('#pm-sessions');
    list.innerHTML = row.sessions.length
      ? row.sessions.map(sessionCardHtml).join('')
      : '<p style="color:var(--muted);padding:1rem 0;">No sessions yet — this participant registered but has not started the assessment.</p>';

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
    container.innerHTML = '<div style="color:var(--muted);padding:.5rem 0;">Loading responses…</div>';
    try {
      const { data, error } = await sb.from('responses')
        .select('question_id, category, answer_value, answered_at')
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true });
      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = '<div style="color:var(--muted);padding:.5rem 0;">No responses recorded for this session.</div>';
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
      container.innerHTML = `<div style="color:var(--danger);padding:.5rem 0;">Failed to load responses: ${err.message}</div>`;
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
