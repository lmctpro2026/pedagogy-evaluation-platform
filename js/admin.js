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

  let allSessions = [];   // master copy for filtering/sorting
  let sortCol     = 'date';
  let sortDir     = 'desc';
  let chartInst   = null;

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

    // Logout
    $('#admin-logout')?.addEventListener('click', async () => {
      await window.PED.supabase.auth.signOut();
      window.location.href = 'index.html';
    });

    // Search
    $('#admin-search')?.addEventListener('input', () => renderTable());

    // CSV export
    $('#admin-export-csv')?.addEventListener('click', exportCSV);

    // Refresh
    $('#admin-refresh')?.addEventListener('click', () => loadData(window.PED.supabase));
  }

  // -------------------------------------------------------------------------
  // Load data from Supabase
  // -------------------------------------------------------------------------
  async function loadData(sb) {
    const tableBody = $('#admin-tbody');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="table-empty">Loading…</td></tr>';

    try {
      const { data: sessions, error } = await sb
        .from('sessions')
        .select('id, participant_email, score_tp, score_pd, score_ta, score_tpp, completed_at, created_at, users(full_name, is_anonymous)')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false });

      if (error) throw error;

      allSessions = (sessions || []).map(s => ({
        id:        s.id,
        name:      s.users?.full_name || 'Anonymous',
        email:     s.participant_email || s.users?.email || '—',
        anon:      s.users?.is_anonymous ?? true,
        tp:        +(s.score_tp  ?? 0).toFixed(1),
        pd:        +(s.score_pd  ?? 0).toFixed(1),
        ta:        +(s.score_ta  ?? 0).toFixed(1),
        tpp:       +(s.score_tpp ?? 0).toFixed(1),
        overall:   +((+s.score_tp + +s.score_pd + +s.score_ta + +s.score_tpp) / 4).toFixed(1),
        date:      s.completed_at || s.created_at,
      }));

      renderStats();
      renderChart();
      renderTable();
      updateLastUpdated();
    } catch (err) {
      console.error('[admin] loadData error:', err);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="9" class="table-empty" style="color:var(--danger);">Error loading data: ${err.message}</td></tr>`;
    }
  }

  // -------------------------------------------------------------------------
  // Stats cards
  // -------------------------------------------------------------------------
  function renderStats() {
    const total    = allSessions.length;
    const avgScore = total ? (allSessions.reduce((a, s) => a + s.overall, 0) / total).toFixed(1) : '—';
    const regPct   = total ? Math.round((allSessions.filter(s => !s.anon).length / total) * 100) : 0;
    const today    = allSessions.filter(s => {
      const d = new Date(s.date);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;

    const el = id => document.getElementById(id);
    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('stat-total',    total);
    set('stat-avg',      total ? `${avgScore}%` : '—');
    set('stat-reg',      total ? `${regPct}%` : '—');
    set('stat-today',    today);
    set('stat-reg-sub',  `${allSessions.filter(s => !s.anon).length} registered · ${allSessions.filter(s => s.anon).length} anonymous`);
  }

  // -------------------------------------------------------------------------
  // Category averages chart
  // -------------------------------------------------------------------------
  function renderChart() {
    const canvas = document.getElementById('admin-chart');
    if (!canvas || !window.Chart) return;

    const total = allSessions.length;
    const avg = key => total ? +(allSessions.reduce((a, s) => a + s[key], 0) / total).toFixed(1) : 0;
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
    const visible = allSessions.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.email.toLowerCase().includes(query)
    );

    // Sort
    visible.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'date') { va = new Date(va); vb = new Date(vb); }
      if (va < vb) return sortDir === 'asc' ? -1 :  1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    const tbody = $('#admin-tbody');
    const footer = $('#table-footer-count');
    if (!tbody) return;

    if (visible.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty">${allSessions.length === 0 ? 'No completed assessments yet.' : 'No results match your search.'}</td></tr>`;
      if (footer) footer.textContent = '0 sessions';
      return;
    }

    tbody.innerHTML = visible.map((s, i) => `
      <tr>
        <td class="td-score" style="color:var(--muted);">${String(i + 1).padStart(2, '0')}</td>
        <td class="td-name">
          ${s.name}
          ${s.anon ? '<span class="badge-anon">anon</span>' : ''}
        </td>
        <td class="td-email">${s.email}</td>
        <td class="td-score">${s.tp}%</td>
        <td class="td-score">${s.pd}%</td>
        <td class="td-score">${s.ta}%</td>
        <td class="td-score">${s.tpp}%</td>
        <td class="td-overall">${s.overall}%</td>
        <td class="td-date">${formatDate(s.date)}</td>
      </tr>
    `).join('');

    if (footer) footer.textContent = `${visible.length} of ${allSessions.length} session${allSessions.length !== 1 ? 's' : ''}`;
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
    const headers = ['#', 'Name', 'Email', 'Anonymous', 'TP', 'PD', 'TA', 'TPP', 'Overall', 'Completed At'];
    const rows = allSessions.map((s, i) => [
      i + 1, s.name, s.email, s.anon ? 'Yes' : 'No',
      s.tp, s.pd, s.ta, s.tpp, s.overall,
      new Date(s.date).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `PEP-sessions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
