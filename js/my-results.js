// ===========================================================================
// User dashboard — a signed-in participant's evaluation history (3 years),
// current vs previous comparison with category-wise progress, year-to-year
// charts, and management of previous attempts.
//
// Terms used on screen:
//   active result     — the newest attempt; the one that counts
//   previous attempt  — an earlier attempt kept for comparison (deletable)
//   {year} result     — the newest attempt within a calendar year
// ===========================================================================

(function () {
  const $ = sel => document.querySelector(sel);
  const CATEGORIES = window.PED.CATEGORIES;
  const scoring    = window.PED.scoring;
  const THIS_YEAR  = new Date().getFullYear();
  const SIMILAR_BAND = 2;   // a change of ±2 points or less reads as "stayed similar"

  // Chart.js can't read CSS variables — these mirror the tokens in css/main.css.
  const CAT_LINE = { TP: '#2F6DB5', PD: '#7A4BA8', TA: '#1E8560', TPP: '#C0480F' };
  const ACTIVE_BAR   = '#1F5A96';
  const BASELINE_BAR = '#AEB6C2';
  const OVERALL_LINE = '#17202C';
  const CHART_TEXT_2 = '#3F4957';
  const CHART_MUTED  = '#667080';
  const CHART_GRID   = '#EEF0F3';
  const FONT_SANS    = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const FONT_MONO    = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";

  let attempts = [];
  let baselineId = null;
  const charts = {};

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const fmtDate  = iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtShort = iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  function trend(now, before) {
    const d = Math.round(now - before);
    if (d > SIMILAR_BAND)  return { key: 'up',   label: 'Improved',       delta: d };
    if (d < -SIMILAR_BAND) return { key: 'down', label: 'Decreased',      delta: d };
    return                        { key: 'flat', label: 'Stayed similar', delta: d };
  }
  function deltaText(d) {
    return d === 0 ? '±0' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
  }
  function trendChip(t) {
    const icon = t.key === 'up' ? '▲' : t.key === 'down' ? '▼' : '●';
    return `<span class="trend trend--${t.key}"><span aria-hidden="true">${icon}</span> ${t.label} <span class="trend-delta">${deltaText(t.delta)}</span></span>`;
  }

  function purgeDate(a) {
    const d = new Date(a.completedAt);
    d.setFullYear(d.getFullYear() + 3);
    return d.toISOString();
  }

  function label(a) {
    if (a.isActive) return 'Active result';
    const sameYearAsNewer = attempts.some(o => o.year === a.year && new Date(o.completedAt) > new Date(a.completedAt));
    return sameYearAsNewer ? 'Previous attempt' : `${a.year} result`;
  }
  function optionLabel(a) {
    return `${label(a)} · ${fmtDate(a.completedAt)} · ${a.overall}/100`;
  }

  // Default comparison: the previous attempt this year if there is one,
  // otherwise the most recent attempt from an earlier year.
  function defaultBaseline() {
    const active = attempts[0];
    const others = attempts.slice(1);
    return (others.find(a => a.year === active.year) || others[0] || null)?.id || null;
  }

  function destroyCharts() {
    Object.values(charts).forEach(c => c?.destroy());
    Object.keys(charts).forEach(k => delete charts[k]);
  }

  // ---------- render ----------
  function render() {
    destroyCharts();
    const root = $('#mr-root');
    const profile = window.PED.identity.current();
    const active = attempts[0];
    const baseline = attempts.find(a => a.id === baselineId) || null;
    const years = [...new Set(attempts.map(a => a.year))];
    const hasThisYear = attempts.some(a => a.year === THIS_YEAR);
    const thisYearCount = attempts.filter(a => a.year === THIS_YEAR).length;
    const oldest = attempts[attempts.length - 1];
    const overallTrend = baseline ? trend(active.overall, baseline.overall) : null;

    root.innerHTML = `
      <header class="mr-head">
        <div>
          <div class="eyebrow">Dashboard · ${esc(profile?.fullName || profile?.displayName || profile?.email || '')}</div>
          <h1>Your practice, over time.</h1>
          <p>Your newest attempt is your active result. We keep up to two attempts a year for 3 years, so you can see
             whether your techno-pedagogical practice is improving.</p>
        </div>
        <div class="mr-actions">
          <a class="btn btn-primary" href="questionnaire.html">Start 10-minute session →</a>
          <button type="button" class="btn btn-ghost" data-report="${active.id}">View active report</button>
        </div>
      </header>

      ${thisYearCount >= 2 ? `
        <p class="mr-notice">You have two ${THIS_YEAR} attempts. A new attempt this year will replace the older of the two —
          or delete your previous attempt below so only your active result is kept.</p>` : ''}

      <section class="mr-stats" aria-label="Summary">
        <article class="mr-stat mr-stat--active">
          <div class="mr-stat-label">Active result</div>
          <div class="mr-stat-big">${active.overall}<span>/100</span></div>
          <div class="mr-stat-sub"><strong>${scoring.getDescriptor(active.overall)}</strong> · ${fmtDate(active.completedAt)}</div>
        </article>
        <article class="mr-stat">
          <div class="mr-stat-label">Overall progress</div>
          ${overallTrend
            ? `<div class="mr-stat-trend">${trendChip(overallTrend)}</div>
               <div class="mr-stat-sub">Compared with your ${label(baseline).toLowerCase()} (${fmtShort(baseline.completedAt)})</div>`
            : `<div class="mr-stat-empty">No comparison yet</div>
               <div class="mr-stat-sub">Complete another attempt to see your progress.</div>`}
        </article>
        <article class="mr-stat">
          <div class="mr-stat-label">History</div>
          <div class="mr-stat-big">${attempts.length}<span> attempt${attempts.length === 1 ? '' : 's'}</span></div>
          <div class="mr-stat-sub">${years.length} year${years.length === 1 ? '' : 's'} · oldest kept until ${fmtDate(purgeDate(oldest))}</div>
        </article>
      </section>

      <section class="mr-panel" aria-labelledby="cmp-title">
        <div class="mr-panel-head">
          <div>
            <h2 id="cmp-title">Current vs previous</h2>
            <p class="muted">Category-by-category change in your active result.</p>
          </div>
          ${attempts.length > 1 ? `
            <label class="mr-select">
              <span>Compare with</span>
              <select id="baseline-select">
                ${attempts.slice(1).map(a => `<option value="${a.id}" ${a.id === baselineId ? 'selected' : ''}>${esc(optionLabel(a))}</option>`).join('')}
              </select>
            </label>` : ''}
        </div>

        ${baseline ? `
          <div class="mr-compare-grid">
            <ul class="cat-progress">
              ${CATEGORIES.map(c => {
                const now = active.scores[c.code], before = baseline.scores[c.code];
                return `
                <li class="cp-row">
                  <div class="cp-name"><span class="cat-code ${c.code.toLowerCase()}">${c.code}</span> ${c.name}</div>
                  <div class="cp-bars" aria-hidden="true">
                    <div class="cp-bar cp-bar--before" style="--w:${before}%"></div>
                    <div class="cp-bar cp-bar--now" style="--w:${now}%"></div>
                  </div>
                  <div class="cp-nums"><span class="cp-before">${before}</span><span class="cp-arrow" aria-hidden="true">→</span><span class="cp-now">${now}</span>
                    <span class="sr-only">from ${before} to ${now}</span></div>
                  <div class="cp-trend">${trendChip(trend(now, before))}</div>
                </li>`;
              }).join('')}
              <li class="cp-row cp-row--overall">
                <div class="cp-name">Overall</div>
                <div class="cp-bars" aria-hidden="true">
                  <div class="cp-bar cp-bar--before" style="--w:${baseline.overall}%"></div>
                  <div class="cp-bar cp-bar--now" style="--w:${active.overall}%"></div>
                </div>
                <div class="cp-nums"><span class="cp-before">${baseline.overall}</span><span class="cp-arrow" aria-hidden="true">→</span><span class="cp-now">${active.overall}</span></div>
                <div class="cp-trend">${trendChip(overallTrend)}</div>
              </li>
            </ul>
            <div class="mr-chart mr-chart--bars">
              <canvas id="cmp-chart" role="img" aria-label="Bar chart comparing category scores of the active result and the selected earlier attempt"></canvas>
            </div>
          </div>
          <div class="cp-legend" aria-hidden="true">
            <span><i class="sw sw--before"></i>${esc(label(baseline))} · ${fmtShort(baseline.completedAt)}</span>
            <span><i class="sw sw--now"></i>Active result · ${fmtShort(active.completedAt)}</span>
          </div>
          ${!baseline.isActive && attempts.length > 1 ? `
            <div class="mr-panel-foot">
              <p>Only want your active result to count? Delete the ${label(baseline).toLowerCase()} you're comparing with.</p>
              <button type="button" class="btn btn-danger-ghost btn-sm" data-delete="${baseline.id}">Delete this ${label(baseline).toLowerCase()}</button>
            </div>` : ''}
        ` : `
          <div class="mr-empty-inline">
            <p>You have one attempt so far. Take the evaluation again — this year or next — and your category-by-category progress appears here.</p>
          </div>`}
      </section>

      <section class="mr-panel" aria-labelledby="yty-title">
        <div class="mr-panel-head">
          <div>
            <h2 id="yty-title">Year-to-year progress</h2>
            <p class="muted">Each year's result (the newest attempt in that year), for up to 3 years.</p>
          </div>
        </div>
        ${years.length > 1
          ? `<div class="mr-chart mr-chart--line"><canvas id="yty-chart" role="img" aria-label="Line chart of overall and category scores by year"></canvas></div>`
          : `<div class="mr-empty-inline"><p>Your year-to-year chart appears once you have results from two different years.
               ${hasThisYear ? `Come back in ${THIS_YEAR + 1} to add the next point.` : ''}</p></div>`}
        ${yearTableHtml()}
      </section>

      <section class="mr-panel" aria-labelledby="att-title">
        <div class="mr-panel-head">
          <div>
            <h2 id="att-title">All attempts</h2>
            <p class="muted">Your active result can't be deleted. Earlier attempts can — deleted attempts are removed permanently.</p>
          </div>
        </div>
        <div class="mr-table-wrap">
          <table class="mr-table">
            <thead>
              <tr>
                <th scope="col">Completed</th><th scope="col">Status</th>
                ${CATEGORIES.map(c => `<th scope="col" class="num">${c.code}</th>`).join('')}
                <th scope="col" class="num">Overall</th><th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              ${attempts.map(a => `
                <tr class="${a.isActive ? 'is-active' : ''}">
                  <th scope="row">${fmtDate(a.completedAt)}</th>
                  <td><span class="tag ${a.isActive ? 'tag--active' : label(a) === 'Previous attempt' ? 'tag--prev' : ''}">${label(a)}</span></td>
                  ${CATEGORIES.map(c => `<td class="num">${a.scores[c.code]}</td>`).join('')}
                  <td class="num"><strong>${a.overall}</strong></td>
                  <td class="row-actions">
                    <button type="button" class="link-btn" data-report="${a.id}">Report</button>
                    ${a.isActive ? '' : `<button type="button" class="link-btn link-btn--danger" data-delete="${a.id}">Delete</button>`}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="mr-status" id="mr-status" aria-live="polite"></p>
      </section>
    `;

    $('#baseline-select')?.addEventListener('change', e => { baselineId = e.target.value; render(); });
    root.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', () => openReport(b.dataset.report)));
    root.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => removeAttempt(b.dataset.delete, b)));

    if (baseline) renderCompareChart(active, baseline);
    if (years.length > 1) renderYearChart();
  }

  function yearResults() {
    return attempts.filter(a => a.isYearResult).sort((x, y) => x.year - y.year);
  }

  function yearTableHtml() {
    const rows = yearResults();
    return `
      <div class="mr-table-wrap">
        <table class="mr-table">
          <thead>
            <tr><th scope="col">Year</th>
              ${CATEGORIES.map(c => `<th scope="col" class="num">${c.code}</th>`).join('')}
              <th scope="col" class="num">Overall</th><th scope="col">Change from previous year</th></tr>
          </thead>
          <tbody>
            ${rows.slice().reverse().map(r => {
              const prev = rows.filter(p => p.year < r.year).pop();
              return `<tr>
                <th scope="row">${r.year}</th>
                ${CATEGORIES.map(c => `<td class="num">${r.scores[c.code]}</td>`).join('')}
                <td class="num"><strong>${r.overall}</strong></td>
                <td>${prev ? trendChip(trend(r.overall, prev.overall)) + ` <span class="muted">vs ${prev.year}</span>` : '<span class="muted">First year on record</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  const baseChartOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 600 },
    plugins: {
      legend: { labels: { color: CHART_TEXT_2, font: { family: FONT_SANS, size: 13 }, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: {
        backgroundColor: '#17202C', titleColor: '#FFFFFF', bodyColor: '#FFFFFF', borderWidth: 0,
        padding: 10, cornerRadius: 6, boxPadding: 4,
        titleFont: { family: FONT_SANS, weight: '600' }, bodyFont: { family: FONT_SANS },
      },
    },
    scales: {
      y: { min: 0, max: 100, border: { display: false },
           ticks: { color: CHART_MUTED, stepSize: 20, font: { family: FONT_MONO, size: 12 } }, grid: { color: CHART_GRID } },
      x: { border: { color: '#DCE0E6' },
           ticks: { color: CHART_TEXT_2, font: { family: FONT_MONO, size: 12 } }, grid: { display: false } },
    },
  });

  function renderCompareChart(active, baseline) {
    if (typeof Chart === 'undefined') return;
    const opts = baseChartOptions();
    opts.plugins.tooltip.callbacks = {
      title: items => CATEGORIES[items[0].dataIndex]?.name || 'Overall',
      label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}/100`,
    };
    charts.cmp = new Chart($('#cmp-chart'), {
      type: 'bar',
      data: {
        labels: [...CATEGORIES.map(c => c.code), 'Overall'],
        datasets: [
          { label: `${label(baseline)} (${fmtShort(baseline.completedAt)})`,
            data: [...CATEGORIES.map(c => baseline.scores[c.code]), baseline.overall],
            backgroundColor: BASELINE_BAR, borderRadius: 4, maxBarThickness: 30 },
          { label: `Active result (${fmtShort(active.completedAt)})`,
            data: [...CATEGORIES.map(c => active.scores[c.code]), active.overall],
            backgroundColor: ACTIVE_BAR, borderRadius: 4, maxBarThickness: 30 },
        ],
      },
      options: opts,
    });
  }

  function renderYearChart() {
    if (typeof Chart === 'undefined') return;
    const rows = yearResults();
    const opts = baseChartOptions();
    opts.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}/100` };
    charts.yty = new Chart($('#yty-chart'), {
      type: 'line',
      data: {
        labels: rows.map(r => String(r.year)),
        datasets: [
          { label: 'Overall', data: rows.map(r => r.overall), borderColor: OVERALL_LINE, backgroundColor: OVERALL_LINE,
            borderWidth: 3, pointRadius: 5, tension: 0.25 },
          ...CATEGORIES.map(c => ({
            label: c.name, data: rows.map(r => r.scores[c.code]),
            borderColor: CAT_LINE[c.code], backgroundColor: CAT_LINE[c.code],
            borderWidth: 2, pointRadius: 3.5, borderDash: [5, 4], tension: 0.25,
          })),
        ],
      },
      options: opts,
    });
  }

  // ---------- actions ----------
  function openReport(id) {
    const a = attempts.find(x => x.id === id);
    if (!a) return;
    // report.html reads the local copy — load the chosen attempt into it.
    try {
      localStorage.setItem('ped.scores', JSON.stringify(a.scores));
      localStorage.setItem('ped.completed', a.completedAt);
    } catch {}
    window.location.href = 'report.html';
  }

  async function removeAttempt(id, btn) {
    const a = attempts.find(x => x.id === id);
    if (!a || a.isActive) return;
    const what = label(a).toLowerCase();
    if (!window.confirm(`Delete your ${what} from ${fmtDate(a.completedAt)} (${a.overall}/100)?\n\nIts answers and scores are removed permanently. Your active result is not affected.`)) return;
    btn.disabled = true;
    const out = await window.PED.assessment.deletePreviousAttempt(id);
    if (!out.ok) {
      btn.disabled = false;
      const status = $('#mr-status');
      if (status) status.textContent = out.message;
      return;
    }
    await load(`Deleted your ${what} from ${fmtDate(a.completedAt)}.`);
  }

  // ---------- states ----------
  function renderMessage({ eyebrow, title, body, action }) {
    destroyCharts();
    $('#mr-root').innerHTML = `
      <div class="mr-empty">
        <div class="eyebrow">${eyebrow}</div>
        <h1>${title}</h1>
        <p>${body}</p>
        ${action}
      </div>`;
  }

  async function load(statusMsg) {
    const result = await window.PED.assessment.getAttempts();
    if (result === null) {
      return renderMessage({
        eyebrow: 'Dashboard', title: "Your results couldn't load.",
        body: "We couldn't reach the server. Check your connection and try again.",
        action: '<button type="button" class="btn btn-primary btn-lg" onclick="location.reload()">Try again</button>',
      });
    }
    attempts = result;
    if (!attempts.length) {
      return renderMessage({
        eyebrow: 'Dashboard', title: 'No results <span class="italic-accent">yet.</span>',
        body: `Complete a 10-minute evaluation to record your ${THIS_YEAR} result. Your progress over the years will build up here.`,
        action: '<a class="btn btn-primary btn-lg" href="questionnaire.html">Start 10-minute session →</a>',
      });
    }
    if (!attempts.some(a => a.id === baselineId) || baselineId === attempts[0].id) baselineId = defaultBaseline();
    render();
    if (statusMsg) { const s = $('#mr-status'); if (s) s.textContent = statusMsg; }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const identity = window.PED.identity;
    if (!identity.isRegistered() || !window.PED.supabase) {
      return renderMessage({
        eyebrow: 'Dashboard', title: 'Sign in to see <span class="italic-accent">your dashboard.</span>',
        body: "Results are kept for people who take the evaluation with an account. Anonymous results aren't linked to anyone, so they can't be shown here.",
        action: '<a class="btn btn-primary btn-lg" href="index.html?signin=1&next=my-results">Sign in →</a>',
      });
    }
    const user = await identity.requireAccount();
    if (!user) return;
    await load();
  });
})();
