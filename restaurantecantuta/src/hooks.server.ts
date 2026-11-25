import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';
import { normalizeTable, type CustomerSession } from '$lib/menu';
import { normalizeStaffRole } from '$lib/staffRoles';
import type { Handle } from '@sveltejs/kit';

function getSupabaseCredentials() {
  const url = env.PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url && !anonKey) return null;
  if (!url || !anonKey) return null;

  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
  } catch {
    return null;
  }

  return { url, anonKey };
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = null;
  event.locals.user = null;
  event.locals.authMode = 'unavailable';
  event.locals.authError = null;
  event.locals.demoRole = null;
  event.locals.customer = null;

  const credentials = getSupabaseCredentials();
  const hasPublicCredentials = Boolean(env.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_ANON_KEY);
  event.locals.authMode = credentials
    ? 'supabase'
    : !hasPublicCredentials && dev
      ? 'demo'
      : 'unavailable';

  try {
    const hasPartialCredentials =
      Boolean(env.PUBLIC_SUPABASE_URL) !== Boolean(env.PUBLIC_SUPABASE_ANON_KEY);

    if (hasPartialCredentials || (!credentials && (env.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_ANON_KEY))) {
      console.error(
        'Supabase no está disponible: revisa PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY. El modo demo no se habilitará con una configuración incompleta.'
      );
    }

    const savedDemoRole =
      (dev && event.cookies.get('cantuta_demo_role_client')) ||
      event.cookies.get('cantuta_demo_role');
    const getDemoRole = () =>
      normalizeStaffRole(savedDemoRole) ??
      normalizeStaffRole(event.url.searchParams.get('role')) ??
      'admin';
    event.locals.demoRole =
      dev && event.locals.authMode === 'demo' ? getDemoRole() : null;

    const savedCustomer = event.cookies.get('cantuta_customer');
    if (savedCustomer) {
      try {
        const customer: unknown = JSON.parse(savedCustomer);
        if (
          typeof customer === 'object' &&
          customer !== null &&
          'nombre' in customer &&
          typeof customer.nombre === 'string' &&
          'mesa' in customer
        ) {
          const nombre = customer.nombre.trim();
          const mesa = normalizeTable(customer.mesa);
          if (nombre.length >= 2 && nombre.length <= 100 && mesa) {
            event.locals.customer = { nombre, mesa } satisfies CustomerSession;
          } else {
            event.cookies.delete('cantuta_customer', { path: '/' });
          }
        } else {
          event.cookies.delete('cantuta_customer', { path: '/' });
        }
      } catch (error) {
        console.error('No se pudo leer la sesión del comensal:', error);
        event.cookies.delete('cantuta_customer', { path: '/' });
      }
    }

    if (!dev && savedDemoRole) {
      event.cookies.delete('cantuta_demo_role', { path: '/' });
    }

    if (credentials && event.locals.authMode === 'supabase') {
      event.locals.supabase = createServerClient(credentials.url, credentials.anonKey, {
        cookies: {
          getAll: () => event.cookies.getAll(),
          setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              event.cookies.set(name, value, { ...options, path: '/' });
            });
          }
        }
      });

      const { data, error } = await event.locals.supabase.auth.getUser();

      if (error) {
        if (error.name !== 'AuthSessionMissingError') {
          event.locals.authError = error.message;
          console.error('No se pudo recuperar el usuario de Supabase:', error.message);
        }
      } else if (data.user) {
        event.locals.user = data.user;
      }
    }
  } catch (error) {
    event.locals.authError = 'No se pudo preparar la conexión con Supabase.';
    console.error('No se pudo preparar la sesión:', error);
    event.locals.supabase = null;
    event.locals.user = null;
    event.locals.demoRole = null;
    event.locals.customer = null;
    event.locals.authMode = 'unavailable';
  }

  return resolve(event);
};
