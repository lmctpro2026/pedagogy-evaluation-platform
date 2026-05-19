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
    $('#overall-num').innerHTML = `${overall}<span class="of">/100</span>`;
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
      card.className = `score-card cat-${cat.code.toLowerCase()}`;
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      card.innerHTML = `
        <div class="top">
          <div>
            <div class="cat-code">${cat.code}</div>
            <div class="cat-name">${cat.name}</div>
          </div>
          <div class="score-num">${score}<span class="of">/100</span></div>
        </div>
        <div class="bar-wrap"><div class="bar-fill" data-pct="${score}"></div></div>
        <div class="descriptor">${descriptor}</div>
        <div class="desc-sub">${descriptorSub(score)}</div>
      `;
      grid.appendChild(card);

      // Stagger animate
      setTimeout(() => {
        card.style.transition = 'opacity .5s ease, transform .5s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        // Animate bar fill
        const bar = card.querySelector('.bar-fill');
        requestAnimationFrame(() => { bar.style.width = score + '%'; });
      }, 120 + i * 110);
    });

    // 3D tilt on score cards
    document.querySelectorAll('.score-card').forEach(card => {
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width  - 0.5;
        const y = (e.clientY - rect.top)  / rect.height - 0.5;
        card.style.transform = `perspective(700px) rotateY(${x*6}deg) rotateX(${-y*5}deg) translateY(-2px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
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

    const overall = scoring.overallScore(scores);
    $('#chart-overall').innerHTML = `${overall}<span class="of">/100</span>`;

    new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: CATEGORIES.map(c => c.name),
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: '#0D0B08',
          borderWidth: 3,
          hoverOffset: 12,
          spacing: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1C1914',
            borderColor: '#2A2520',
            borderWidth: 1,
            titleFont: { family: 'Poppins', weight: '700', size: 13 },
            bodyFont:  { family: 'JetBrains Mono', size: 12 },
            titleColor: '#F5F0E8',
            bodyColor:  '#F5E6CC',
            padding: 12,
            displayColors: true,
            callbacks: {
              label: (ctx) => ` ${ctx.parsed} / 100`,
            },
          },
        },
        animation: { animateRotate: true, duration: 1200, easing: 'easeOutCubic' },
      },
    });

    // Build legend
    const legend = $('#chart-legend');
    legend.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = `
        <span class="swatch" style="background:${cat.color}"></span>
        <span>
          <div class="name">${cat.name}</div>
          <div class="sub">${cat.code}</div>
        </span>
        <span class="val">${scores[cat.code]}</span>
      `;
      legend.appendChild(row);
    });
  }

  function noResults() {
    $('#results-root').innerHTML = `
      <section class="container section">
        <div class="eyebrow" style="margin-bottom:1rem;">No results yet</div>
        <h1 class="h-1">Complete the assessment first.</h1>
        <p class="muted" style="max-width:50ch; margin-block: 1rem 2rem;">
          We couldn't find a completed assessment on this device. Head back and run through the 20 questions to see your profile.
        </p>
        <a class="btn btn-primary btn-lg" href="questionnaire.html">Start assessment →</a>
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
