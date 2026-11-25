import { json } from '@sveltejs/kit';
import {
  menuProducts,
  normalizeTable,
  type OrderItem,
  type RestaurantOrder
} from '$lib/menu';
import { addLocalOrder, getLocalOrders, getLocalProducts } from '$lib/server/restaurantStore';
import { insertOrder, listOrders } from '$lib/server/db';
import { normalizeStaffRole } from '$lib/staffRoles';
import type { RequestHandler } from './$types';

function staffRole(locals: App.Locals) {
  return normalizeStaffRole(locals.user?.app_metadata.role) ??
    normalizeStaffRole(locals.demoRole);
}

function ordersForRole(orders: RestaurantOrder[], role: ReturnType<typeof staffRole>) {
  if (role === 'admin' || !role) return orders;
  if (role === 'cocina') {
    return orders.filter((order) => order.estado !== 'completed' && order.cocinaEstado !== 'ready');
  }
  if (role === 'mesero') {
    return orders.filter((order) =>
      order.estado !== 'completed' &&
      (order.tipoPedido === 'mesa' ||
        (order.tipoPedido === 'delivery' && order.cocinaEstado === 'ready' && order.salonEstado === 'active'))
    );
  }
  return orders.filter((order) =>
    order.estado !== 'completed' &&
    (order.pagoEstado === 'paid' ||
      order.salonEstado === 'served' ||
      order.salonEstado === 'bill_requested')
  );
}

function dbOrder(order: RestaurantOrder): Record<string, unknown> {
  return {
    id: order.id,
    created_at: order.createdAt,
    customer_name: order.cliente,
    table_name: order.mesa,
    order_type: order.tipoPedido,
    customer_phone: order.telefono,
    delivery_address: order.direccion,
    items: order.items,
    subtotal: order.subtotal,
    tax: order.impuestos,
    total: order.total,
    receipt_type: order.comprobante,
    tax_id: order.ruc,
    business_name: order.razonSocial,
    payment_method: order.metodoPago,
    payer_name: order.nombrePagador,
    status: order.estado,
    payment_status: order.pagoEstado,
    kitchen_status: order.cocinaEstado,
    service_status: order.salonEstado
  };
}

function mapDbOrder(row: Record<string, unknown>): RestaurantOrder {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    cliente: String(row.customer_name),
    mesa: String(row.table_name),
    tipoPedido: row.order_type === 'delivery' ? 'delivery' : 'mesa',
    telefono: typeof row.customer_phone === 'string' ? row.customer_phone : null,
    direccion: typeof row.delivery_address === 'string' ? row.delivery_address : null,
    items: Array.isArray(row.items) ? (row.items as OrderItem[]) : [],
    subtotal: Number(row.subtotal),
    impuestos: Number(row.tax),
    total: Number(row.total),
    comprobante: row.receipt_type === 'factura' ? 'factura' : 'boleta',
    ruc: typeof row.tax_id === 'string' ? row.tax_id : null,
    razonSocial: typeof row.business_name === 'string' ? row.business_name : null,
    metodoPago: row.payment_method === 'tarjeta' || row.payment_method === 'efectivo'
      ? row.payment_method
      : 'yape_plin',
    nombrePagador: String(row.payer_name),
    estado: row.status === 'completed' ? 'completed' : row.status === 'paid' ? 'paid' : 'pending_confirmation',
    pagoEstado: row.payment_status === 'paid' ? 'paid' : 'pending_confirmation',
    cocinaEstado: row.kitchen_status === 'preparing' || row.kitchen_status === 'ready'
      ? row.kitchen_status
      : 'new',
    salonEstado: row.service_status === 'served' || row.service_status === 'bill_requested'
      ? row.service_status
      : 'active'
  };
}

export const GET: RequestHandler = async ({ locals }) => {
  const role = staffRole(locals);
  if (!role) {
    return json({ message: 'Necesitas una sesión de personal para consultar pedidos.' }, { status: 403 });
  }

  if (!locals.supabase) {
    if (locals.authMode !== 'demo') {
      return json({ message: 'Supabase no está conectado; no se consultaron pedidos.' }, { status: 503 });
    }
    return json({ orders: ordersForRole(getLocalOrders(), role) });
  }

  try {
    const { data, error } = await listOrders(locals.supabase);

    if (error) {
      console.error('No se pudieron consultar pedidos en Supabase:', error.message);
      return json({ message: 'No se pudieron consultar los pedidos.' }, { status: 503 });
    }

    return json({ orders: ordersForRole((data ?? []).map(mapDbOrder), role) });
  } catch (error) {
    console.error('Falló la consulta de pedidos:', error);
    return json({ message: 'No se pudieron consultar los pedidos.' }, { status: 503 });
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.supabase && locals.authMode !== 'demo') {
    return json({ message: 'Supabase no está conectado; no se registró el pedido.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Revisa los datos del comprobante y el pago.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('items' in body) || !Array.isArray(body.items)) {
    return json({ message: 'El carrito está vacío o no es válido.' }, { status: 400 });
  }

  let submittedName = locals.customer?.nombre ?? '';
  let submittedTable = locals.customer?.mesa ?? '';
  if ('customer' in body) {
    const submittedCustomer: unknown = body.customer;
    if (
      typeof submittedCustomer === 'object' &&
      submittedCustomer !== null &&
      'nombre' in submittedCustomer &&
      typeof submittedCustomer.nombre === 'string' &&
      'mesa' in submittedCustomer
    ) {
      const nombre = submittedCustomer.nombre.trim();
      const mesa = normalizeTable(submittedCustomer.mesa);
      if (nombre.length >= 2 && nombre.length <= 100) {
        submittedName = nombre;
        if (mesa) submittedTable = mesa;
      }
    }
  }
  const orderType = 'tipoPedido' in body ? body.tipoPedido : null;
  if (orderType !== 'delivery' && orderType !== 'mesa') {
    return json({ message: 'Selecciona delivery o atención en mesa.' }, { status: 400 });
  }
  if ('modoMesero' in body && body.modoMesero === true &&
      (staffRole(locals) !== 'mesero' || orderType !== 'mesa')) {
    return json({ message: 'El registro privado de mesa requiere una sesión de mesero.' }, { status: 403 });
  }
  const customerName = submittedName.trim();
  if (customerName.length < 2 || customerName.length > 100) {
    return json({ message: 'Ingresa un nombre válido para el pedido.' }, { status: 400 });
  }

  let tableName = 'Delivery';
  let phone: string | null = null;
  let address: string | null = null;
  if (orderType === 'mesa') {
    const requestedTable = 'numeroMesa' in body ? normalizeTable(body.numeroMesa) : null;
    const table = requestedTable ?? normalizeTable(submittedTable);
    if (!table) return json({ message: 'Selecciona una mesa del 1 al 16.' }, { status: 400 });
    tableName = table;
  } else {
    phone = 'telefono' in body && typeof body.telefono === 'string' ? body.telefono.trim() : '';
    address = 'direccion' in body && typeof body.direccion === 'string' ? body.direccion.trim() : '';
    if (!/^[+0-9 ()-]{7,20}$/.test(phone) || address.length < 5 || address.length > 250) {
      return json({ message: 'Para delivery, ingresa un teléfono y una dirección válidos.' }, { status: 400 });
    }
  }

  const receipt = 'comprobante' in body ? body.comprobante : undefined;
  const paymentMethod = 'metodoPago' in body ? body.metodoPago : undefined;
  const payer = 'nombrePagador' in body && typeof body.nombrePagador === 'string'
    ? body.nombrePagador.trim()
    : '';
  const ruc = 'ruc' in body && typeof body.ruc === 'string' ? body.ruc.trim() : '';
  const razonSocial = 'razonSocial' in body && typeof body.razonSocial === 'string'
    ? body.razonSocial.trim()
    : '';
  if (receipt !== 'boleta' && receipt !== 'factura') {
    return json({ message: 'Selecciona boleta o factura.' }, { status: 400 });
  }
  if (paymentMethod !== 'yape_plin' && paymentMethod !== 'tarjeta' && paymentMethod !== 'efectivo') {
    return json({ message: 'Selecciona un método de pago válido.' }, { status: 400 });
  }
  if (payer.length < 2 || payer.length > 120) {
    return json({ message: 'Indica el nombre originario del pagador.' }, { status: 400 });
  }
  if (receipt === 'factura' && !/^\d{11}$/.test(ruc)) {
    return json({ message: 'Para emitir factura, el RUC debe tener 11 dígitos.' }, { status: 400 });
  }
  if (body.items.length === 0 || body.items.length > 30) {
    return json({ message: 'El carrito debe contener entre 1 y 30 platos.' }, { status: 400 });
  }

  const localProducts = locals.supabase ? null : new Map(getLocalProducts().map((product) => [product.id, product]));
  const items: OrderItem[] = [];

  for (const requested of body.items) {
    if (
      typeof requested !== 'object' ||
      requested === null ||
      !('productId' in requested) ||
      typeof requested.productId !== 'string' ||
      !('cantidad' in requested) ||
      typeof requested.cantidad !== 'number' ||
      !Number.isInteger(requested.cantidad) ||
      requested.cantidad < 1 ||
      requested.cantidad > 50 ||
      !('nota' in requested) ||
      typeof requested.nota !== 'string'
    ) {
      return json({ message: 'Uno de los productos del carrito no es válido.' }, { status: 400 });
    }

    let product = menuProducts.find((item) => item.id === requested.productId) ?? null;

    if (locals.supabase) {
      try {
        const { data, error } = await locals.supabase
          .from('menu_items')
          .select('id, name, category, price, image, available')
          .eq('id', requested.productId)
          .maybeSingle();
        if (error) {
          console.error('No se pudo consultar el producto en Supabase:', error.message);
          return json({ message: 'No se pudo consultar el menú en la base de datos.' }, { status: 503 });
        }
        if (!data || !data.available) {
          return json({ message: `${product?.nombre ?? 'Uno de los platos'} no existe o se agotó.` }, { status: 409 });
        }
        const category = data.category === 'Bebidas' || data.category === 'Postres' || data.category === 'Cervezas'
          ? data.category
          : 'Comidas';
        product = {
          ...(product ?? {
            id: data.id,
            nombre: data.name,
            precio: Number(data.price),
            imagen: data.image,
            categoria: 'Comidas' as const,
            tipoMenu: 'Fondos' as const,
            available: true
          }),
          id: data.id,
          nombre: data.name,
          precio: Number(data.price),
          imagen: data.image,
          categoria: category,
          tipoMenu: category === 'Postres' ? 'Postres' : category === 'Comidas' ? product?.tipoMenu ?? 'Fondos' : 'Bebidas',
          available: data.available
        };
      } catch (error) {
        console.error('Falló la verificación de disponibilidad:', error);
        return json({ message: 'No se pudo consultar el menú en la base de datos.' }, { status: 503 });
      }
    } else {
      product = localProducts?.get(requested.productId) ?? null;
      if (!product) return json({ message: 'Uno de los platos no existe.' }, { status: 409 });
    }

    if (!product) return json({ message: 'Uno de los platos no existe.' }, { status: 409 });
    if (!product.available) {
      return json({ message: `${product.nombre} se agotó. Actualiza el carrito.` }, { status: 409 });
    }

    items.push({
      productId: product.id,
      nombre: product.nombre,
      cantidad: requested.cantidad,
      precio: product.precio,
      nota: requested.nota.trim().slice(0, 250)
    });
  }

  const subtotal = Number(items.reduce((sum, item) => sum + item.precio * item.cantidad, 0).toFixed(2));
  const impuestos = Number((subtotal * 0.18).toFixed(2));
  const order: RestaurantOrder = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    cliente: customerName,
    mesa: tableName,
    tipoPedido: orderType,
    telefono: phone,
    direccion: address,
    items,
    subtotal,
    impuestos,
    total: Number((subtotal + impuestos).toFixed(2)),
    comprobante: receipt,
    ruc: receipt === 'factura' ? ruc : null,
    razonSocial: receipt === 'factura' && razonSocial ? razonSocial.slice(0, 160) : null,
    metodoPago: paymentMethod,
    nombrePagador: payer,
    estado: 'pending_confirmation',
    pagoEstado: 'pending_confirmation',
    cocinaEstado: 'new',
    salonEstado: 'active'
  };

  if (!locals.supabase) {
    addLocalOrder(order);
    return json({ order }, { status: 201 });
  }

  try {
    const { data, error } = await insertOrder(locals.supabase, dbOrder(order));

    if (error) {
      console.error('No se pudo guardar el pedido en Supabase:', error.message);
      return json({ message: 'No se pudo guardar el pedido. Inténtalo nuevamente.' }, { status: 503 });
    }

    return json({ order: mapDbOrder(data) }, { status: 201 });
  } catch (error) {
    console.error('Falló el guardado del pedido:', error);
    return json({ message: 'No se pudo guardar el pedido. Inténtalo nuevamente.' }, { status: 503 });
  }
};
