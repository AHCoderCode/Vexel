// Vexel Supabase client – using anon key (safe for browser)
const SUPABASE_URL = 'const SUPABASE_URL = const SUPABASE_URL = 'https://fevlfmlcfdwgpvabjzql.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZldmxmbWxjZmR3Z3B2YWJqenFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NzQ2MjksImV4cCI6MjEwMjU1MDYyOX0.Fs0r4pwWPxfvHiMGDMyw5AFnjDo__iMY3ib49yMfLZM'; // starts with eyJ...

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
