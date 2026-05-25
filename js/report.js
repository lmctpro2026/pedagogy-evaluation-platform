// ===========================================================================
// Report page — full written report, per-category interpretation, PDF export.
// ===========================================================================

(function () {
  const $  = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const CATEGORIES = window.PED.CATEGORIES;
  const scoring    = window.PED.scoring;

  function loadScores() {
    try {
      const s = JSON.parse(localStorage.getItem('ped.scores') || 'null');
      if (s && typeof s === 'object') return s;
    } catch {}
    try {
      const responses = JSON.parse(localStorage.getItem('ped.responses') || '{}');
      const flat = Object.entries(responses).map(([qid, v]) => ({ question_id: qid, answer_value: v }));
      if (flat.length === window.PED.QUESTIONS.length) {
        return scoring.calculateScores(flat, window.PED.QUESTIONS);
      }
    } catch {}
    return null;
  }

  function getName() {
    try {
      const s = JSON.parse(localStorage.getItem('ped.session') || 'null');
      return s?.displayName || s?.fullName || 'Anonymous Participant';
    } catch { return 'Anonymous Participant'; }
  }

  function fmtDate() {
    const c = localStorage.getItem('ped.completed');
    const d = c ? new Date(c) : new Date();
    return d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  }

  function renderHeader(scores) {
    $('#r-name').textContent = getName();
    $('#r-date').textContent = fmtDate();
    $('#r-framework').textContent = 'Firmin (2020)';
  }

  function renderOverview(scores) {
    const overall = scoring.overallScore(scores);
    const descriptor = scoring.getDescriptor(overall);
    $('#ov-num').innerHTML = `${overall}<span class="of">/100</span>`;
    $('#ov-desc').textContent = descriptor;
    $('#ov-para').textContent = scoring.getOverviewParagraph(scores);
  }

  function scoreWheel(score) {
    const radius = 28, circ = 2 * Math.PI * radius;
    const dash = (score / 100) * circ;
    return `
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="${radius}" stroke="rgba(255,255,255,0.08)" stroke-width="4" fill="none"/>
        <circle cx="32" cy="32" r="${radius}" stroke="currentColor" stroke-width="4" fill="none"
                stroke-linecap="round" stroke-dasharray="${dash} ${circ}" />
      </svg>
      <span class="val">${score}</span>
    `;
  }

  function renderInterpretations(scores) {
    const grid = $('#interp-grid');
    grid.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const score = scores[cat.code] ?? 0;
      const interp = scoring.getInterpretation(cat.code, score);
      const desc = scoring.getDescriptor(score);
      const card = document.createElement('article');
      card.className = `interp-card cat-${cat.code.toLowerCase()}`;
      card.innerHTML = `
        <div class="code">${cat.code}</div>
        <div class="body">
          <h3>${cat.name}</h3>
          <div class="meta">
            <span class="pct">${score} / 100</span>
            <span class="desc">${desc}</span>
          </div>
          <p>${interp}</p>
        </div>
        <div class="scorewheel" style="color:${cat.accent || cat.color};">${scoreWheel(score)}</div>
      `;
      grid.appendChild(card);
    });
  }

  function renderRecommendations(scores) {
    const recs = scoring.getRecommendations(scores);
    const wrap = $('#recs');
    wrap.innerHTML = '';
    recs.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'rec-row';
      row.innerHTML = `<span class="num">${String(i+1).padStart(2,'0')}</span><p>${r}</p>`;
      wrap.appendChild(row);
    });
  }

  // ---------------- PDF export ----------------
  async function exportPDF() {
    const btns = [document.getElementById('a-pdf'), document.getElementById('a-pdf-2')].filter(Boolean);
    const originals = btns.map(b => b.innerHTML);
    btns.forEach(b => { b.disabled = true; b.innerHTML = 'Preparing PDF…'; });

    const page = document.getElementById('report-page');
    page.classList.add('is-printing');
    document.body.classList.add('cursor-hidden');

    // Scroll to top so html2canvas sees the full page from y=0
    const prevScrollY = window.scrollY;
    window.scrollTo(0, 0);

    // Wait for all fonts (Poppins, JetBrains Mono) to be fully loaded,
    // then give the browser one rAF to repaint with is-printing styles applied.
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 350));

    try {
      const canvas = await html2canvas(page, {
        scale:           2,
        backgroundColor: '#ffffff',
        useCORS:         true,
        logging:         false,
        windowWidth:     900,   // fixed desktop width — avoids mobile reflow
        onclone: (_doc, el) => {
          // Guarantee Poppins is applied in the cloned document
          el.style.fontFamily = "'Poppins', Arial, Helvetica, sans-serif";
        },
      });

      const { jsPDF } = window.jspdf;
      const pdf    = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW  = pdf.internal.pageSize.getWidth();   // 595.28 pt
      const pageH  = pdf.internal.pageSize.getHeight();  // 841.89 pt
      const margin = 28; // pt — top/left/right/bottom white space
      const contentW  = pageW - 2 * margin;
      const contentH  = pageH - 2 * margin;

      // px ↔ pt scale: how many canvas pixels equal one pt of content width
      const pxPerPt   = canvas.width / contentW;
      // how many canvas pixels fill one page of content height
      const pxPerPage = Math.round(contentH * pxPerPt);

      let yPx       = 0;
      let firstPage = true;

      while (yPx < canvas.height) {
        if (!firstPage) pdf.addPage();

        // Slice exactly this page's strip from the master canvas
        const sliceH = Math.min(pxPerPage, canvas.height - yPx);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width  = canvas.width;
        sliceCanvas.height = sliceH;
        const ctx = sliceCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, sliceH);
        ctx.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

        // Convert slice height from px to pts for jsPDF
        const slicePtH  = sliceH / pxPerPt;
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(sliceData, 'JPEG', margin, margin, contentW, slicePtH);

        yPx      += sliceH;
        firstPage = false;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      pdf.save(`Pedagogy-Report_${stamp}.pdf`);

    } catch (err) {
      console.error('[report] PDF export failed:', err);
      alert('Sorry — PDF export failed. Please try again.');
    } finally {
      page.classList.remove('is-printing');
      document.body.classList.remove('cursor-hidden');
      window.scrollTo(0, prevScrollY);
      btns.forEach((b, i) => { b.disabled = false; b.innerHTML = originals[i]; });
    }
  }

  function noResults() {
    $('#report-root').innerHTML = `
      <section class="report-page">
        <div class="eyebrow" style="margin-bottom: 1rem;">No assessment found</div>
        <h1 class="h-1">Complete the assessment to generate your report.</h1>
        <p class="muted" style="margin: 1rem 0 2rem; max-width: 50ch;">
          The report draws directly on your responses to the 20-question Firmin (2020) instrument.
        </p>
        <a class="btn btn-primary btn-lg" href="questionnaire.html">Start assessment →</a>
      </section>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const scores = loadScores();
    if (!scores) return noResults();

    renderHeader(scores);
    renderOverview(scores);
    renderInterpretations(scores);
    renderRecommendations(scores);

    $('#a-pdf')?.addEventListener('click', exportPDF);
    $('#a-pdf-2')?.addEventListener('click', exportPDF);

    // Auto-print mode if ?print=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') === '1') {
      setTimeout(exportPDF, 600);
    }
  });
})();
