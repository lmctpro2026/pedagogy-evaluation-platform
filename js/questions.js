// ===========================================================================
// Firmin (2020) techno-pedagogical practice framework — 20 questions
// Categories: TP (Teaching Practice), PD (Pedagogical Development),
//             TA (Technology Adoption), TPP (Techno-Pedagogical Practice)
// ===========================================================================

window.PED = window.PED || {};

window.PED.CATEGORIES = [
  { code: 'TP',  name: 'Teaching Practice',            color: '#2A4A7A', accent: '#BCD0EF' },
  { code: 'PD',  name: 'Pedagogical Development',      color: '#5A2E6E', accent: '#DCBDED' },
  { code: 'TA',  name: 'Technology Adoption',          color: '#2A5C44', accent: '#B6DCC4' },
  { code: 'TPP', name: 'Techno-Pedagogical Practice',  color: '#C17F3A', accent: '#E8A84E' },
];

window.PED.QUESTIONS = [
  // Teaching Practice (TP)
  { id: 'q01', category: 'TP',  weight: 1.0, order: 1,  text: 'I regularly reflect on my teaching practice to identify areas for improvement.' },
  { id: 'q02', category: 'TP',  weight: 1.0, order: 2,  text: 'I design learning experiences centred around the needs of my students.' },
  { id: 'q03', category: 'TP',  weight: 1.0, order: 3,  text: 'I adjust my teaching strategies in response to student feedback and performance.' },
  { id: 'q04', category: 'TP',  weight: 1.0, order: 4,  text: 'I create opportunities for active learning and student participation in my classes.' },
  { id: 'q05', category: 'TP',  weight: 1.0, order: 5,  text: 'I assess whether my teaching methods are achieving the intended learning outcomes.' },

  // Pedagogical Development (PD)
  { id: 'q06', category: 'PD',  weight: 1.0, order: 6,  text: 'I engage with current educational research and literature to inform my teaching.' },
  { id: 'q07', category: 'PD',  weight: 1.0, order: 7,  text: 'I participate in professional development activities related to pedagogy.' },
  { id: 'q08', category: 'PD',  weight: 1.0, order: 8,  text: 'I critically examine the theoretical underpinnings of my teaching philosophy.' },
  { id: 'q09', category: 'PD',  weight: 1.0, order: 9,  text: 'I collaborate with colleagues to develop and refine pedagogical approaches.' },
  { id: 'q10', category: 'PD',  weight: 1.0, order: 10, text: 'I seek feedback from peers or mentors on my pedagogical practice.' },

  // Technology Adoption (TA)
  { id: 'q11', category: 'TA',  weight: 1.0, order: 11, text: 'I regularly explore new technologies that could enhance my teaching.' },
  { id: 'q12', category: 'TA',  weight: 1.0, order: 12, text: 'I feel confident using digital tools and platforms in my teaching.' },
  { id: 'q13', category: 'TA',  weight: 1.0, order: 13, text: 'I integrate technology in ways that support rather than replace good pedagogy.' },
  { id: 'q14', category: 'TA',  weight: 1.0, order: 14, text: 'I evaluate the effectiveness of the technology tools I use in teaching.' },
  { id: 'q15', category: 'TA',  weight: 1.0, order: 15, text: 'I help students develop digital literacy skills through my teaching.' },

  // Techno-Pedagogical Practice (TPP)
  { id: 'q16', category: 'TPP', weight: 1.0, order: 16, text: 'I thoughtfully combine technology and pedagogy to create effective learning experiences.' },
  { id: 'q17', category: 'TPP', weight: 1.0, order: 17, text: 'My use of technology is guided by clear pedagogical goals and student needs.' },
  { id: 'q18', category: 'TPP', weight: 1.0, order: 18, text: 'I design technology-enhanced activities that promote higher-order thinking.' },
  { id: 'q19', category: 'TPP', weight: 1.0, order: 19, text: 'I reflect on the relationship between technology and my pedagogical practice.' },
  { id: 'q20', category: 'TPP', weight: 1.0, order: 20, text: 'Technology has meaningfully transformed my approach to teaching.' },
];

window.PED.LIKERT = [
  { value: 1, label: 'Strongly Disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neither Agree nor Disagree' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly Agree' },
];
