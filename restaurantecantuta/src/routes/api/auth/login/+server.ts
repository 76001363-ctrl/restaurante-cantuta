import { redirect } from '@sveltejs/kit';
import { normalizeStaffRole } from '$lib/staffRoles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.supabase) {
    redirect(
      303,
      `/auth/login?error=${locals.authMode === 'demo' ? 'use_demo_login' : 'supabase_not_configured'}&role=${encodeURIComponent(url.searchParams.get('role') ?? '')}`
    );
  }

  const role = url.searchParams.get('role');
  if (!role) {
    redirect(303, '/auth/login?error=invalid_role');
  }
  if (!normalizeStaffRole(role)) {
    redirect(303, '/auth/login?error=invalid_role');
  }

  let data: Awaited<ReturnType<typeof locals.supabase.auth.signInWithOAuth>>['data'];
  let error: Awaited<ReturnType<typeof locals.supabase.auth.signInWithOAuth>>['error'];
  try {
    const result = await locals.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${url.origin}/api/auth/callback?role=${encodeURIComponent(role)}`
      }
    });
    data = result.data;
    error = result.error;
  } catch (caught) {
    console.error('Falló la solicitud OAuth de Google:', caught);
    redirect(303, `/auth/login?error=oauth_provider_error&role=${encodeURIComponent(role)}`);
  }

  if (error) {
    console.error('No se pudo iniciar el acceso OAuth de Google:', error.message);
    redirect(303, `/auth/login?error=oauth_provider_error&role=${encodeURIComponent(role)}`);
  }

  if (!data.url) {
    console.error('Supabase no devolvió la URL para iniciar el acceso con Google.');
    redirect(303, `/auth/login?error=oauth_provider_error&role=${encodeURIComponent(role)}`);
  }

  redirect(303, data.url);
};
