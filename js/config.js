// Supabase-project voor accounts. Beide waarden zijn openbaar: ze staan in elke browser die
// de app laadt. De beveiliging zit in de regels in supabase/migrations (Row Level Security).
// Laat ze leeg om de app zonder accounts te gebruiken.
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';

// Zet op true zodra Google als provider is ingesteld in Supabase (zie de README).
export const GOOGLE_LOGIN = false;
