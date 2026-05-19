// ===========================================================================
// Supabase client init
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your project's values.
// If left as placeholders the app falls back to a pure-client offline mode
// (localStorage) so the full flow still works without a backend.
// ===========================================================================

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

const isPlaceholder = (
  SUPABASE_URL === 'https://your-project.supabase.co' ||
  SUPABASE_ANON_KEY === 'your-anon-key'
);

let supabaseClient = null;
try {
  if (!isPlaceholder && window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (err) {
  console.warn('[supabase] init failed, running in offline mode:', err);
  supabaseClient = null;
}

window.PED = window.PED || {};
window.PED.supabase = supabaseClient;
window.PED.offlineMode = !supabaseClient;

if (window.PED.offlineMode) {
  console.info('[supabase] Offline mode — responses stored in localStorage only.');
}
