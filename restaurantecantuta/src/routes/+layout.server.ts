import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  try {
    return {
      session: null,
      user: locals.user ? { id: locals.user.id, email: locals.user.email ?? null } : null,
      authMode: locals.authMode ?? 'unavailable',
      authError: locals.authError
    };
  } catch (error) {
    console.error('No se pudo leer la sesión global; se continuará sin usuario:', error);
    return { session: null, user: null, authMode: 'unavailable', authError: 'No se pudo leer la sesión.' };
  }
};
