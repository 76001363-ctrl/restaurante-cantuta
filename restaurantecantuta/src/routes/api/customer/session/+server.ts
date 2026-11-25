import { json } from '@sveltejs/kit';
import { normalizeTable } from '$lib/menu';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, request, url }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Completa tu nombre y número de mesa.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('nombre' in body) || !('mesa' in body)) {
    return json({ message: 'Completa tu nombre y número de mesa.' }, { status: 400 });
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const mesa = normalizeTable(body.mesa);
  if (nombre.length < 2 || nombre.length > 100 || !mesa) {
    return json({ message: 'Ingresa un nombre válido y una mesa del 1 al 16.' }, { status: 400 });
  }

  cookies.set('cantuta_customer', JSON.stringify({ nombre, mesa }), {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12
  });

  return json({ success: true, customer: { nombre, mesa } });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
  cookies.delete('cantuta_customer', { path: '/' });
  return json({ success: true });
};
