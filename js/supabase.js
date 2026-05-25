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

const SUPABASE_URL      = 'https://ipmrufgdykvjvejvquin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwbXJ1ZmdkeWt2anZlanZxdWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjE1MzEsImV4cCI6MjA5NTIzNzUzMX0.yf0BUfjRPJw-0eE2eKDKyx1CoISA5d431rxMV6P8Zq4';

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
