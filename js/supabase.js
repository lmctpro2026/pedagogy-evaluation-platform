// ===========================================================================
// Supabase client — replace the two placeholder values below, then push.
//
// WHERE TO FIND YOUR VALUES:
//   Supabase Dashboard → Settings → API
//   • "Project URL"        → SUPABASE_URL
//   • "anon / public" key  → SUPABASE_ANON_KEY  (safe to expose in frontend)
//
// The RESEND_API_KEY lives only in the Edge Function (server-side secret).
// ===========================================================================

const SUPABASE_URL      = 'https://your-project.supabase.co';  // ← replace
const SUPABASE_ANON_KEY = 'your-anon-key';                     // ← replace

const _isPlaceholder = SUPABASE_URL.includes('your-project') ||
                       SUPABASE_ANON_KEY === 'your-anon-key';

let supabaseClient = null;
if (!_isPlaceholder) {
  try {
    if (window.supabase?.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession:    true,
          autoRefreshToken:  true,
          detectSessionInUrl: true,
        },
      });
    }
  } catch (err) {
    console.warn('[supabase] Init failed — offline mode:', err);
  }
}

window.PED = window.PED || {};
window.PED.supabase      = supabaseClient;
window.PED.supabaseUrl   = SUPABASE_URL;
window.PED.supabaseKey   = SUPABASE_ANON_KEY;
window.PED.offlineMode   = !supabaseClient;

if (window.PED.offlineMode) {
  console.info('[supabase] Offline mode — responses stored in localStorage only.');
} else {
  console.info('[supabase] Connected:', SUPABASE_URL);
}
