import { createBrowserClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const url = env.PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
    supabaseClient = createBrowserClient(url, anonKey);
    return supabaseClient;
  } catch (error) {
    console.error('No se pudo inicializar el cliente de Supabase en el navegador:', error);
    return null;
  }
}