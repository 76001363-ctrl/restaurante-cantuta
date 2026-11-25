import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const demoEmail = 'demo@cantuta.pe';
const demoPassword = 'demo1234';
const demoRoles = new Set(['admin', 'mesera', 'mesero', 'moza', 'caja', 'cajas', 'cocina']);

export const POST: RequestHandler = async ({ cookies, locals, request, url }) => {
  if (!dev || locals.authMode !== 'demo') {
    return json({ message: 'El acceso demo solo está disponible en modo local.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'El contenido de la solicitud no es válido.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return json({ message: 'Completa tu correo, contraseña y perfil.' }, { status: 400 });
  }

  const email = 'email' in body ? body.email : undefined;
  const password = 'password' in body ? body.password : undefined;
  const role = 'role' in body ? body.role : undefined;

  if (
    email !== demoEmail ||
    password !== demoPassword ||
    typeof role !== 'string' ||
    !demoRoles.has(role)
  ) {
    return json({ message: 'Revisa las credenciales demo y el perfil seleccionado.' }, { status: 401 });
  }

  cookies.set('cantuta_demo_role', role, {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8
  });

  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
  cookies.delete('cantuta_demo_role', { path: '/' });
  return json({ success: true });
};
