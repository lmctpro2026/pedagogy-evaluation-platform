// ===========================================================================
// Scoring engine — weighted percentages per Firmin (2020) framework category.
// ===========================================================================

window.PED = window.PED || {};

(function () {
  const CATEGORY_CODES = ['TP', 'PD', 'TA', 'TPP'];

  function calculateScores(responses, questions) {
    const scores = {};
    for (const cat of CATEGORY_CODES) {
      const catQs = questions.filter(q => q.category === cat);
      const weightedSum = responses.reduce((sum, r) => {
        const q = catQs.find(q => q.id === r.question_id);
        return q ? sum + r.answer_value * q.weight : sum;
      }, 0);
      const maxPossible = catQs.reduce((sum, q) => sum + 5 * q.weight, 0);
      scores[cat] = maxPossible ? Math.round((weightedSum / maxPossible) * 100) : 0;
    }
    return scores;
  }

  function overallScore(scores) {
    const vals = CATEGORY_CODES.map(c => scores[c] ?? 0);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  function getDescriptor(score) {
    if (score >= 80) return 'Highly Developed';
    if (score >= 60) return 'Developing Well';
    if (score >= 40) return 'Emerging';
    return 'Needs Attention';
  }

  function getInterpretation(category, score) {
    const level = score >= 70 ? 'high' : score >= 45 ? 'mid' : 'low';
    const interpretations = {
      TP: {
        high: 'Your teaching practice demonstrates a strong commitment to student-centred learning and ongoing reflection. You consistently design engaging experiences and adapt your methods based on feedback.',
        mid:  'Your teaching practice shows solid foundations. You engage in reflective practice and are developing increasingly student-centred approaches, with scope to deepen your pedagogical responsiveness.',
        low:  'Focusing on regular reflection and seeking student feedback can significantly strengthen your teaching practice, which is currently in an early stage of development.',
      },
      PD: {
        high: 'You are highly engaged with professional development and educational research. Your commitment to continuous learning and peer collaboration reflects a mature, evolving pedagogical identity.',
        mid:  'You demonstrate a growing engagement with pedagogical development. Increasing your engagement with current research and peer collaboration could further strengthen your practice.',
        low:  'Engaging more actively with professional development opportunities and educational research literature would help build your pedagogical foundations considerably.',
      },
      TA: {
        high: 'You demonstrate confident and purposeful technology integration. Your approach is characterised by critical evaluation of digital tools and a focus on developing student digital literacy.',
        mid:  'You have a growing comfort with technology in teaching. Deepening your critical evaluation of the pedagogical value of tools you use would strengthen your practice.',
        low:  'Building confidence with educational technologies and focusing on pedagogically purposeful integration would be valuable areas for your development.',
      },
      TPP: {
        high: 'Your techno-pedagogical practice is highly integrated and reflective. You successfully synthesise technology and pedagogy to create meaningful, aligned learning experiences.',
        mid:  'You are developing a coherent techno-pedagogical approach. Focusing on the intentional alignment of technology choices with specific pedagogical goals will advance your practice.',
        low:  'Developing a more deliberate approach to connecting technology use with pedagogical goals is a key growth area. The Firmin (2020) framework offers a useful lens for this reflection.',
      },
    };
    return interpretations[category][level];
  }

  function getRecommendations(scores) {
    const recs = [];
    if (scores.TP  < 70) recs.push('Keep a reflective teaching journal to document and analyse your practice regularly.');
    if (scores.PD  < 70) recs.push('Engage with at least one peer-reviewed educational research article per month.');
    if (scores.TA  < 70) recs.push('Identify one new digital tool each semester and evaluate its pedagogical impact rigorously.');
    if (scores.TPP < 70) recs.push('Revisit the Firmin (2020) framework to guide intentional alignment of technology and pedagogy.');
    recs.push('Discuss your results with a mentor or colleague to identify collaborative development opportunities.');
    recs.push('Retake this assessment in six months to track your development over time.');
    return recs;
  }

  function getOverviewParagraph(scores) {
    const overall = overallScore(scores);
    const descriptor = getDescriptor(overall).toLowerCase();
    const strongest = [...Object.entries(scores)].sort((a,b)=>b[1]-a[1])[0];
    const weakest   = [...Object.entries(scores)].sort((a,b)=>a[1]-b[1])[0];
    const nameOf = code => (window.PED.CATEGORIES.find(c => c.code === code) || {}).name || code;
    return `Your overall techno-pedagogical practice sits in the “${descriptor}” range with a composite score of ${overall}/100. ` +
           `Your strongest area is ${nameOf(strongest[0])} (${strongest[1]}/100), while ${nameOf(weakest[0])} (${weakest[1]}/100) ` +
           `presents the clearest opportunity for focused growth. The interpretations below draw on the four dimensions of the ` +
           `Firmin (2020) framework to contextualise your scores and inform reflective practice.`;
  }

  window.PED.scoring = {
    CATEGORY_CODES,
    calculateScores,
    overallScore,
    getDescriptor,
    getInterpretation,
    getRecommendations,
    getOverviewParagraph,
  };
})();
