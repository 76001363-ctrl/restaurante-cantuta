import { isRedirect, redirect } from '@sveltejs/kit';
import { normalizeTable } from '$lib/menu';
import { normalizeStaffRole } from '$lib/staffRoles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  try {
    const requestedWaiterMode = url.searchParams.get('modo') === 'mesero';
    const staffRole =
      normalizeStaffRole(locals.user?.app_metadata.role) ??
      normalizeStaffRole(locals.demoRole);
    if (requestedWaiterMode && staffRole !== 'mesero') {
      redirect(303, '/auth/login?error=staff_not_authorized');
    }

    return {
      customer: requestedWaiterMode ? locals.customer ?? null : null,
      mesaInicial: normalizeTable(url.searchParams.get('mesa')),
      meseroMode: requestedWaiterMode && staffRole === 'mesero'
    };
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error('No se pudieron cargar los datos de comensal:', error);
    throw error;
  }
};
