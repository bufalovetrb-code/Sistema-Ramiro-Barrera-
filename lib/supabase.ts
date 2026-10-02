import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | undefined;

export const getSupabase = () => {
  if (!url || !key)
    throw new Error('Falta la configuración local de Supabase.');
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
};
