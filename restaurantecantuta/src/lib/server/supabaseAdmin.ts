import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdminClient() {
  const url = publicEnv.PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKeyValue: unknown = Reflect.get(privateEnv, 'SUPABASE_SERVICE_ROLE_KEY');
  const serviceRoleKey =
    typeof serviceRoleKeyValue === 'string' ? serviceRoleKeyValue.trim() : undefined;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
