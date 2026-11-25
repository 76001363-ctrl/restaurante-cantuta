import { json } from '@sveltejs/kit';
import { menuProducts, type MenuProduct } from '$lib/menu';
import { normalizeStaffRole } from '$lib/staffRoles';
import {
  getLocalProducts,
  setLocalProductAvailability
} from '$lib/server/restaurantStore';
import type { RequestHandler } from './$types';

function mapDbProduct(row: Record<string, unknown>, fallback: MenuProduct): MenuProduct {
  const category = row.category === 'Bebidas' || row.category === 'Postres' || row.category === 'Cervezas'
    ? row.category
    : 'Comidas';
  return {
    ...fallback,
    nombre: typeof row.name === 'string' ? row.name : fallback.nombre,
    precio: Number.isFinite(Number(row.price)) ? Number(row.price) : fallback.precio,
    imagen: typeof row.image === 'string' ? row.image : fallback.imagen,
    categoria: category,
    tipoMenu: category === 'Comidas' ? fallback.tipoMenu : category === 'Postres' ? 'Postres' : 'Bebidas',
    available: typeof row.available === 'boolean' ? row.available : fallback.available
  };
}

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.supabase) {
    if (locals.authMode !== 'demo') {
      return json({ message: 'Supabase no está conectado; no se consultó el menú.' }, { status: 503 });
    }
    return json({ products: getLocalProducts() });
  }

  try {
    const { data, error } = await locals.supabase
      .from('menu_items')
      .select('id, name, category, price, image, available');
    if (error) {
      console.error('No se pudo consultar la disponibilidad en Supabase:', error.message);
      return json({ message: 'No se pudo consultar la disponibilidad del menú.' }, { status: 503 });
    }

    const fallbacks = new Map(menuProducts.map((product) => [product.id, product]));
    return json({
      products: (data ?? []).map((row) => {
        const fallback = fallbacks.get(row.id) ?? {
          id: row.id,
          nombre: row.name,
          precio: Number(row.price),
          imagen: row.image,
          categoria: 'Comidas' as const,
          tipoMenu: 'Fondos' as const,
          available: Boolean(row.available)
        };
        return mapDbProduct(row, fallback);
      })
    });
  } catch (error) {
    console.error('Falló la consulta de disponibilidad:', error);
    return json({ message: 'No se pudo consultar la disponibilidad del menú.' }, { status: 503 });
  }
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  const role =
    normalizeStaffRole(locals.user?.app_metadata.role) ??
    normalizeStaffRole(locals.demoRole);
  if (role !== 'admin') {
    return json({ message: 'Solo administración puede cambiar la disponibilidad del menú.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'La solicitud de disponibilidad no es válida.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body) ||
    typeof body.id !== 'string' ||
    !('available' in body) ||
    typeof body.available !== 'boolean'
  ) {
    return json({ message: 'Indica el plato y su disponibilidad.' }, { status: 400 });
  }

  if (!locals.supabase) {
    if (locals.authMode !== 'demo') {
      return json({ message: 'Supabase no está configurado. No se guardaron cambios.' }, { status: 503 });
    }
    if (!menuProducts.some((item) => item.id === body.id)) {
      return json({ message: 'El plato indicado no existe.' }, { status: 404 });
    }
    const updated = setLocalProductAvailability(body.id, body.available);
    return json({ product: updated });
  }

  try {
    const { data, error } = await locals.supabase
      .from('menu_items')
      .update({ available: body.available })
      .eq('id', body.id)
      .select('id, name, category, price, image, available')
      .maybeSingle();

    if (error) {
      console.error('No se pudo actualizar disponibilidad en Supabase:', error.message);
      return json({ message: 'No se pudo actualizar el estado del plato.' }, { status: 503 });
    }
    if (!data) return json({ message: 'El plato indicado no existe.' }, { status: 404 });

    const fallback = menuProducts.find((item) => item.id === data.id) ?? {
      id: data.id,
      nombre: data.name,
      precio: Number(data.price),
      imagen: data.image,
      categoria: 'Comidas' as const,
      tipoMenu: 'Fondos' as const,
      available: data.available
    };
    return json({ product: mapDbProduct(data, fallback) });
  } catch (error) {
    console.error('Falló la actualización de disponibilidad:', error);
    return json({ message: 'No se pudo actualizar el estado del plato.' }, { status: 503 });
  }
};
