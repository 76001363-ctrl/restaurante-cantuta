import { redirect } from '@sveltejs/kit';
import { normalizeStaffRole } from '$lib/staffRoles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.supabase) {
    redirect(303, '/auth/login?error=supabase_not_configured');
  }

  if (url.searchParams.has('error')) {
    redirect(303, '/auth/login?error=oauth_provider_error');
  }

  const code = url.searchParams.get('code');
  if (!code) {
    redirect(303, '/auth/login?error=oauth_callback_failed');
  }

  const role = url.searchParams.get('role');
  const requestedRole = normalizeStaffRole(role);
  if (!role || !requestedRole) {
    redirect(303, '/auth/login?error=invalid_role');
  }

  let data: Awaited<ReturnType<typeof locals.supabase.auth.exchangeCodeForSession>>['data'];
  let error: Awaited<ReturnType<typeof locals.supabase.auth.exchangeCodeForSession>>['error'];
  try {
    const result = await locals.supabase.auth.exchangeCodeForSession(code);
    data = result.data;
    error = result.error;
  } catch (caught) {
    console.error('Falló el intercambio del código OAuth:', caught);
    redirect(303, `/auth/login?error=oauth_callback_failed&role=${encodeURIComponent(role)}`);
  }

  if (error) {
    console.error('No se pudo intercambiar el código OAuth:', error.message);
    redirect(303, '/auth/login?error=oauth_callback_failed');
  }

  if (!data.user) {
    console.error('Supabase completó el callback OAuth sin devolver un usuario.');
    redirect(303, `/auth/login?error=oauth_callback_failed&role=${encodeURIComponent(role)}`);
  }

  const assignedRole = normalizeStaffRole(data.user.app_metadata.role);

  if (!assignedRole || assignedRole !== requestedRole) {
    try {
      const { error: signOutError } = await locals.supabase.auth.signOut();
      if (signOutError) {
        console.error('No se pudo cerrar la sesión OAuth sin permisos:', signOutError.message);
      }
    } catch (caught) {
      console.error('Falló el cierre de sesión OAuth sin permisos:', caught);
    }
    redirect(303, `/auth/login?error=staff_not_authorized&role=${encodeURIComponent(role)}`);
  }

  redirect(303, '/dashboard');
};
