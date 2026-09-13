// ===========================================================================
// Optional demographic fields — shared vocabulary.
// Loaded by demographics.html (to render the form) and admin.html (to label
// the summary charts), so both always agree on the stored values.
//
// The `value` strings are what land in public.demographics and are mirrored by
// the CHECK constraints in sprint3-demographics.sql — changing one without the
// other will make inserts fail.
// ===========================================================================

window.PED = window.PED || {};

window.PED.DEMOGRAPHICS = {
  AGE_GROUPS: [
    { value: 'under-25',    label: 'Under 25' },
    { value: '25-34',       label: '25–34' },
    { value: '35-44',       label: '35–44' },
    { value: '45-54',       label: '45–54' },
    { value: '55-64',       label: '55–64' },
    { value: '65-plus',     label: '65 or over' },
    { value: 'undisclosed', label: 'Prefer not to say' },
  ],

  GENDERS: [
    { value: 'male',        label: 'Male' },
    { value: 'female',      label: 'Female' },
    { value: 'other',       label: 'Other' },
    { value: 'undisclosed', label: 'Prefer not to say' },
  ],

  // Australian academic classification levels A–E (Level A Associate Lecturer
  // through Level E Professor).
  ACADEMIC_LEVELS: [
    { value: 'A',           label: 'Level A',  hint: 'Associate Lecturer' },
    { value: 'B',           label: 'Level B',  hint: 'Lecturer' },
    { value: 'C',           label: 'Level C',  hint: 'Senior Lecturer' },
    { value: 'D',           label: 'Level D',  hint: 'Associate Professor' },
    { value: 'E',           label: 'Level E',  hint: 'Professor' },
    { value: 'other',       label: 'Other',    hint: 'Not on the A–E scale' },
    { value: 'undisclosed', label: 'Prefer not to say' },
  ],

  // Free-text length cap — mirrors demographics_gender_other_chk.
  GENDER_OTHER_MAX: 60,
};

// value → label lookup for a given option list.
window.PED.demographicLabel = function (list, value) {
  if (!value) return '—';
  const hit = (list || []).find(o => o.value === value);
  return hit ? hit.label : value;
};
