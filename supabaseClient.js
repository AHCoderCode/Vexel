// Vexel Supabase client – using anon key (safe for browser)
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // starts with eyJ...

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
