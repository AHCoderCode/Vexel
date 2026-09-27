(() => {
  const SUPABASE_URL = 'https://fevlfmlcfdwgpvabjzql.supabase.co';

  // PASTE YOUR CURRENT SUPABASE PUBLISHABLE KEY HERE
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DNFvnqkMtzuZX2ySAmmtTg_D1kLYO9G';

  if (!window.supabase) {
    console.error('Supabase JS was not loaded.');
    return;
  }

  if (!window.vexelSupabase) {
    window.vexelSupabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'vexel-supabase-auth'
        }
      }
    );
  }
})();
