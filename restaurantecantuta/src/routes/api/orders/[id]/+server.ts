import { json } from '@sveltejs/kit';
import { updateLocalOrder } from '$lib/server/restaurantStore';
import { updateOrder as updateDatabaseOrder } from '$lib/server/db';
import {
  canPerformStaffOrderAction,
  normalizeStaffRole,
  type StaffOrderAction
} from '$lib/staffRoles';
import type { RestaurantOrder } from '$lib/menu';
import type { RequestHandler } from './$types';

const orderActions = new Set<StaffOrderAction>([
  'start_preparing',
  'ready',
  'serve',
  'request_bill',
  'confirm',
  'complete'
]);

function mapDbOrder(row: Record<string, unknown>): RestaurantOrder {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    cliente: String(row.customer_name),
    mesa: String(row.table_name),
    tipoPedido: row.order_type === 'delivery' ? 'delivery' : 'mesa',
    telefono: typeof row.customer_phone === 'string' ? row.customer_phone : null,
    direccion: typeof row.delivery_address === 'string' ? row.delivery_address : null,
    items: Array.isArray(row.items) ? row.items as RestaurantOrder['items'] : [],
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

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const role =
    normalizeStaffRole(locals.user?.app_metadata.role) ??
    normalizeStaffRole(locals.demoRole);
  if (!role) {
    return json({ message: 'Necesitas una sesión de personal para actualizar pedidos.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'La solicitud de actualización no es válida.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('action' in body) ||
      typeof body.action !== 'string' || !orderActions.has(body.action as StaffOrderAction)) {
    return json({ message: 'La acción solicitada no es válida.' }, { status: 400 });
  }

  const action = body.action as StaffOrderAction;
  if (!canPerformStaffOrderAction(role, action)) {
    return json({ message: 'Tu perfil no tiene permisos para realizar esta acción.' }, { status: 403 });
  }

  let payment: { metodoPago: RestaurantOrder['metodoPago']; nombrePagador: string } | undefined;
  if (action === 'confirm') {
    const metodoPago = 'metodoPago' in body ? body.metodoPago : null;
    const nombrePagador = 'nombrePagador' in body && typeof body.nombrePagador === 'string'
      ? body.nombrePagador.trim()
      : '';
    if (
      (metodoPago !== 'yape_plin' && metodoPago !== 'tarjeta' && metodoPago !== 'efectivo') ||
      nombrePagador.length < 2 ||
      nombrePagador.length > 120
    ) {
      return json({ message: 'Indica el método de pago y el titular originario de la transferencia.' }, { status: 400 });
    }
    payment = { metodoPago, nombrePagador };
  }

  if (!locals.supabase) {
    if (locals.authMode !== 'demo') {
      return json({ message: 'Supabase no está conectado; no se actualizó el pedido.' }, { status: 503 });
    }
    const order = updateLocalOrder(params.id, action, payment);
    if (!order) {
      return json({ message: 'El pedido no existe o no permite esta transición de estado.' }, { status: 409 });
    }
    return json({ order });
  }

  try {
    const { data, error } = await updateDatabaseOrder(locals.supabase, params.id, action, payment);
    if (error) {
      console.error('No se pudo actualizar el estado del pedido en Supabase:', error.message);
      return json({ message: 'No se pudo actualizar el pedido o su estado ya cambió.' }, {
        status: error.code === 'PGRST116' ? 409 : 503
      });
    }
    if (action === 'confirm' && (data.service_status === 'served' || data.service_status === 'bill_requested')) {
      const { data: completedOrder, error: completionError } = await updateDatabaseOrder(
        locals.supabase,
        params.id,
        'complete'
      );
      if (completionError) {
        console.error('Se confirmó el pago, pero no se pudo liberar la mesa:', completionError.message);
        return json({ message: 'Pago confirmado, pero no se pudo liberar la mesa. Inténtalo otra vez.' }, { status: 503 });
      }
      return json({ order: mapDbOrder(completedOrder) });
    }
    return json({ order: mapDbOrder(data) });
  } catch (error) {
    console.error('Falló la actualización del pedido:', error);
    return json({ message: 'No se pudo actualizar el pedido.' }, { status: 503 });
  }
};
