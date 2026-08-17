// Vexel Supabase client – using anon key (safe for browser)
const SUPABASE_URL = 'vexelai-zeta.vercel.app'; // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_DNFvnqkMtzuZX2ySAmmtTg_D1kLYO9G'; // starts with eyJ...

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
