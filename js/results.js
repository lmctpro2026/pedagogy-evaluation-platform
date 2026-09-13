// ===========================================================================
// Results page — score cards, doughnut chart, actions
// ===========================================================================

(function () {
  const $ = sel => document.querySelector(sel);

  const CATEGORIES = window.PED.CATEGORIES;
  const scoring = window.PED.scoring;

  function loadScores() {
    try {
      const s = JSON.parse(localStorage.getItem('ped.scores') || 'null');
      if (s && typeof s === 'object') return s;
    } catch {}
    // Try to compute from responses if scores missing
    try {
      const responses = JSON.parse(localStorage.getItem('ped.responses') || '{}');
      const flat = Object.entries(responses).map(([qid, v]) => ({ question_id: qid, answer_value: v }));
      if (flat.length === window.PED.QUESTIONS.length) {
        return scoring.calculateScores(flat, window.PED.QUESTIONS);
      }
    } catch {}
    return null;
  }

  function renderHero(scores) {
    const overall = scoring.overallScore(scores);
    const descriptor = scoring.getDescriptor(overall);
    $('#overall-num').innerHTML = `${overall}<span class="of"> / 100</span>`;
    $('#overall-desc').textContent = descriptor;
    const completedAt = localStorage.getItem('ped.completed');
    if (completedAt) {
      const d = new Date(completedAt);
      $('#overall-when').textContent = 'Completed ' + d.toLocaleString(undefined, {
        dateStyle: 'long', timeStyle: 'short'
      });
    } else {
      $('#overall-when').textContent = 'Live results';
    }
  }

  function renderScoreCards(scores) {
    const grid = $('#scores-grid');
    grid.innerHTML = '';
    CATEGORIES.forEach((cat, i) => {
      const score = scores[cat.code] ?? 0;
      const descriptor = scoring.getDescriptor(score);
      const card = document.createElement('article');
      card.className = `score-card cat-${cat.code.toLowerCase()} is-entering`;
      card.innerHTML = `
        <div class="score-card-head">
          <span class="cat-code">${cat.code}</span>
          <span class="score-num">${score}<span class="of"> / 100</span></span>
        </div>
        <h3 class="cat-name">${cat.name}</h3>
        <div class="bar-wrap" aria-hidden="true"><div class="bar-fill" data-pct="${score}" style="width:${score}%"></div></div>
        <div class="descriptor">${descriptor}</div>
        <p class="desc-sub">${descriptorSub(score)}</p>
      `;
      grid.appendChild(card);

      // Quick staggered fade-in (transition defined in css/results.css)
      setTimeout(() => card.classList.remove('is-entering'), 40 + i * 60);
    });
  }

  function descriptorSub(s) {
    if (s >= 80) return 'Continue extending leadership and mentoring others.';
    if (s >= 60) return 'A strong foundation with room to deepen practice.';
    if (s >= 40) return 'Emerging — targeted reflection will accelerate growth.';
    return 'A clear opportunity for focused development.';
  }

  function renderChart(scores) {
    const canvas = $('#scores-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const data = CATEGORIES.map(c => scores[c.code] ?? 0);
    const colors = CATEGORIES.map(c => c.color);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const overall = scoring.overallScore(scores);
    $('#chart-overall').innerHTML = `${overall}<span class="of"> / 100</span>`;

    new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: CATEGORIES.map(c => c.name),
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: '#FFFFFF',
          borderWidth: 2,
          hoverBorderColor: '#FFFFFF',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#17202C',
            borderWidth: 0,
            cornerRadius: 6,
            titleFont: { family: 'IBM Plex Sans', weight: '600', size: 13 },
            bodyFont:  { family: 'IBM Plex Mono', size: 12 },
            titleColor: '#FFFFFF',
            bodyColor:  '#FFFFFF',
            padding: 10,
            displayColors: true,
            boxPadding: 4,
            callbacks: {
              label: (ctx) => ` ${ctx.parsed} / 100`,
            },
          },
        },
        animation: { duration: reduceMotion ? 0 : 200 },
      },
    });

    // Build legend
    const legend = $('#chart-legend');
    legend.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const row = document.createElement('li');
      row.className = `legend-row cat-${cat.code.toLowerCase()}`;
      row.innerHTML = `
        <span class="swatch" aria-hidden="true"></span>
        <span class="legend-name">${cat.name}</span>
        <span class="legend-code">${cat.code}</span>
        <span class="legend-val">${scores[cat.code] ?? 0}</span>
      `;
      legend.appendChild(row);
    });
  }

  function noResults() {
    $('#results-root').innerHTML = `
      <section class="container empty-state">
        <p class="eyebrow">No results yet</p>
        <h1>Complete the assessment first</h1>
        <p class="empty-state-text">
          We couldn't find a completed assessment on this device. Head back and run through the 20 questions to see your profile.
        </p>
        <a class="btn btn-primary btn-lg" href="questionnaire.html">Start assessment</a>
      </section>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const scores = loadScores();
    if (!scores) return noResults();
    renderHero(scores);
    renderScoreCards(scores);
    renderChart(scores);

    $('#a-retake')?.addEventListener('click', e => {
      e.preventDefault();
      if (window.PED.identity?.isRegistered() &&
          !window.confirm('Start a new 10-minute session?\n\nIf you submit it, the new attempt becomes your active result and this one is kept as your previous attempt (you can delete it from your dashboard).')) {
        return;
      }
      try {
        localStorage.removeItem('ped.responses');
        localStorage.removeItem('ped.scores');
        localStorage.removeItem('ped.completed');
      } catch {}
      window.location.href = 'questionnaire.html';
    });

    $('#a-pdf')?.addEventListener('click', () => {
      window.location.href = 'report.html?print=1';
    });
  });
})();
