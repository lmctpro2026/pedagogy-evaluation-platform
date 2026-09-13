// ===========================================================================
// My results — a signed-in participant's yearly results (one per year, up to
// 3 years) with year-on-year comparison.
// ===========================================================================

(function () {
  const $ = sel => document.querySelector(sel);
  const CATEGORIES = window.PED.CATEGORIES;
  const scoring    = window.PED.scoring;
  const THIS_YEAR  = new Date().getFullYear();

  // Lighter tints for the chart — the category base colours are too dark on --bg.
  const YEAR_SHADES = ['#E8A84E', '#9C8E7A', '#5E554A'];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function deltaHtml(now, before) {
    if (before === undefined || before === null || Number.isNaN(before)) return '<span class="delta none">—</span>';
    const d = Math.round(now - before);
    if (d === 0) return '<span class="delta flat">No change</span>';
    const up = d > 0;
    return `<span class="delta ${up ? 'up' : 'down'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span>
            <span class="sr-only">${up ? 'Up' : 'Down'}</span> ${Math.abs(d)}</span>`;
  }

  function render(history) {
    const root = $('#mr-root');
    const profile = window.PED.identity.current();
    const latest = history[0];
    const previous = history[1];
    const hasThisYear = latest && latest.year === THIS_YEAR;

    const withOverall = history.map(h => ({ ...h, overall: scoring.overallScore(h.scores) }));

    root.innerHTML = `
      <header class="mr-head">
        <div class="eyebrow">My results · ${esc(profile?.fullName || profile?.displayName || profile?.email || '')}</div>
        <h1>Your practice, <span class="italic-accent">year by year.</span></h1>
        <p>One result counts per calendar year, and we keep the last 3 years so you can see how your practice changes.
           ${hasThisYear
             ? `Retaking the assessment replaces your ${THIS_YEAR} result.`
             : `You haven't taken the ${THIS_YEAR} assessment yet.`}</p>
        <div class="mr-actions">
          <a class="btn btn-primary" href="questionnaire.html">${hasThisYear ? `Retake ${THIS_YEAR} assessment` : `Take ${THIS_YEAR} assessment`} →</a>
          <button type="button" class="btn btn-ghost" id="mr-report">View ${latest.year} report</button>
        </div>
      </header>

      <section class="mr-years" aria-label="Results by year">
        ${withOverall.map((h, i) => `
          <article class="mr-year ${i === 0 ? 'is-latest' : ''}">
            <div class="mr-year-top">
              <span class="mr-year-num">${h.year}</span>
              ${i === 0 ? '<span class="mr-tag">Latest</span>' : ''}
            </div>
            <div class="mr-overall">${h.overall}<span>/100</span></div>
            <div class="mr-desc">${scoring.getDescriptor(h.overall)}</div>
            <div class="mr-change">${withOverall[i + 1]
              ? `${deltaHtml(h.overall, withOverall[i + 1].overall)} <span class="mr-vs">vs ${withOverall[i + 1].year}</span>`
              : '<span class="mr-vs">First result on record</span>'}</div>
            <div class="mr-date">Completed ${fmtDate(h.completedAt)}</div>
          </article>`).join('')}
      </section>

      <section class="mr-compare">
        <div class="mr-compare-head">
          <h2>Category comparison</h2>
          <p class="muted">${previous
            ? `Change shows ${latest.year} against ${previous.year}.`
            : 'Take the assessment again next year to see how each category changes.'}</p>
        </div>

        <div class="mr-table-wrap">
          <table class="mr-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                ${withOverall.map(h => `<th scope="col" class="num">${h.year}</th>`).join('')}
                ${previous ? '<th scope="col" class="num">Change</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${CATEGORIES.map(c => `
                <tr>
                  <th scope="row"><span class="cat-code ${c.code.toLowerCase()}">${c.code}</span> ${c.name}</th>
                  ${withOverall.map(h => `<td class="num">${h.scores[c.code]}</td>`).join('')}
                  ${previous ? `<td class="num">${deltaHtml(latest.scores[c.code], previous.scores[c.code])}</td>` : ''}
                </tr>`).join('')}
              <tr class="is-total">
                <th scope="row">Overall</th>
                ${withOverall.map(h => `<td class="num">${h.overall}</td>`).join('')}
                ${previous ? `<td class="num">${deltaHtml(withOverall[0].overall, withOverall[1].overall)}</td>` : ''}
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mr-chart"><canvas id="mr-chart" aria-label="Bar chart of category scores by year" role="img"></canvas></div>
      </section>
    `;

    $('#mr-report').addEventListener('click', () => {
      // report.html reads the local copy — load the latest result into it.
      try {
        localStorage.setItem('ped.scores', JSON.stringify(latest.scores));
        localStorage.setItem('ped.completed', latest.completedAt);
      } catch {}
      window.location.href = 'report.html';
    });

    renderChart(withOverall);
  }

  function renderChart(history) {
    if (typeof Chart === 'undefined') return;
    const ordered = [...history].reverse();   // oldest → newest, left to right in the legend
    new Chart($('#mr-chart'), {
      type: 'bar',
      data: {
        labels: CATEGORIES.map(c => c.code),
        datasets: ordered.map((h, i) => ({
          label: String(h.year),
          data: CATEGORIES.map(c => h.scores[c.code]),
          backgroundColor: YEAR_SHADES[ordered.length - 1 - i],
          borderRadius: 4,
          maxBarThickness: 36,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 100, ticks: { color: '#978E81', stepSize: 20 }, grid: { color: 'rgba(42,37,32,0.7)' } },
          x: { ticks: { color: '#F5F0E8', font: { family: 'JetBrains Mono' } }, grid: { display: false } },
        },
        plugins: {
          legend: { labels: { color: '#F5F0E8', font: { family: 'Poppins' }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              title: items => CATEGORIES[items[0].dataIndex].name,
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}/100`,
            },
          },
        },
      },
    });
  }

  function renderEmpty() {
    $('#mr-root').innerHTML = `
      <div class="mr-empty">
        <div class="eyebrow">My results</div>
        <h1>No results <span class="italic-accent">yet.</span></h1>
        <p>Take the assessment to record your ${THIS_YEAR} result. Come back next year to compare.</p>
        <a class="btn btn-primary btn-lg" href="questionnaire.html">Take ${THIS_YEAR} assessment →</a>
      </div>`;
  }

  function renderSignedOut() {
    $('#mr-root').innerHTML = `
      <div class="mr-empty">
        <div class="eyebrow">My results</div>
        <h1>Sign in to see <span class="italic-accent">your results.</span></h1>
        <p>Results are kept for people who take the assessment with an account. Anonymous results aren't linked to anyone, so they can't be shown here.</p>
        <a class="btn btn-primary btn-lg" href="index.html?signin=1&next=my-results">Sign in →</a>
      </div>`;
  }

  function renderError() {
    $('#mr-root').innerHTML = `
      <div class="mr-empty">
        <div class="eyebrow">My results</div>
        <h1>Results couldn't load.</h1>
        <p>We couldn't reach the server. Check your connection and try again.</p>
        <button type="button" class="btn btn-primary btn-lg" onclick="location.reload()">Try again</button>
      </div>`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const identity = window.PED.identity;
    if (!identity.isRegistered() || !window.PED.supabase) return renderSignedOut();
    const user = await identity.requireAccount();
    if (!user) return;
    const history = await window.PED.assessment.getHistory();
    if (history === null) return renderError();
    if (!history.length) return renderEmpty();
    render(history);
  });
})();
