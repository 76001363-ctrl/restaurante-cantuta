import { dev } from '$app/environment';
import { isRedirect, redirect } from '@sveltejs/kit';
import { normalizeStaffRole } from '$lib/staffRoles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  try {
    const rolSolicitado = url.searchParams.get('role');

    if (!locals.user && !locals.demoRole && !(dev && locals.authMode === 'demo')) {
      redirect(303, '/auth/login?error=authentication_required');
    }

    const authenticatedRole =
      normalizeStaffRole(locals.user?.app_metadata.role);
    const cookieRole = normalizeStaffRole(locals.demoRole);
    const requestedRole = normalizeStaffRole(rolSolicitado);
    const rol =
      authenticatedRole ??
      cookieRole ??
      (dev && locals.authMode === 'demo' ? requestedRole ?? 'admin' : null);

    if (!rol) redirect(303, '/auth/login?error=staff_not_authorized');

    if (authenticatedRole && rolSolicitado && requestedRole !== authenticatedRole) {
      redirect(303, '/auth/login?error=role_mismatch');
    }
    if (cookieRole && rolSolicitado && requestedRole !== cookieRole) {
      redirect(303, '/auth/login?error=role_mismatch');
    }

    return {
      usuario: locals.user?.email ?? 'Demo Cantuta',
      rol,
      roleLabel: rol === 'mesero' ? 'Mesero / Moza' : rol === 'caja' ? 'Caja' : rol === 'cocina' ? 'Cocina' : 'Administrador',
      demoMode: !locals.user,
      authMode: locals.authMode,
      authError: locals.authError
    };
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error('No se pudo cargar el panel:', error);
    throw error;
  }
};