import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  try {
    return { authMode: locals.authMode ?? 'unavailable' };
  } catch (error) {
    console.error('No se pudo leer el modo de autenticación; se mostrará el acceso sin conexión:', error);
    return { authMode: 'unavailable' };
  }
};
