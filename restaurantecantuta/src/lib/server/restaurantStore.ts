import { menuProducts, type MenuProduct, type RestaurantOrder } from '$lib/menu';
import type { StaffOrderAction } from '$lib/staffRoles';

const products = new Map(menuProducts.map((product) => [product.id, { ...product }]));
const orders: RestaurantOrder[] = [];

export function getLocalProducts(): MenuProduct[] {
  return [...products.values()].map((product) => ({ ...product }));
}

export function setLocalProductAvailability(id: string, available: boolean): MenuProduct | null {
  const product = products.get(id);
  if (!product) return null;
  product.available = available;
  return { ...product };
}

export function getLocalOrders(): RestaurantOrder[] {
  return orders.map((order) => ({ ...order, items: order.items.map((item) => ({ ...item })) }));
}

export function addLocalOrder(order: RestaurantOrder): void {
  orders.unshift(order);
}

export function updateLocalOrder(
  id: string,
  action: StaffOrderAction,
  payment?: { metodoPago: RestaurantOrder['metodoPago']; nombrePagador: string }
): RestaurantOrder | null {
  const order = orders.find((candidate) => candidate.id === id);
  if (!order || order.estado === 'completed') return null;

  if (action === 'start_preparing' && order.cocinaEstado === 'new') {
    order.cocinaEstado = 'preparing';
  } else if (action === 'ready' && order.cocinaEstado === 'preparing') {
    order.cocinaEstado = 'ready';
  } else if (action === 'serve' && order.cocinaEstado === 'ready' && order.salonEstado === 'active') {
    order.salonEstado = 'served';
    if (order.pagoEstado === 'paid') order.estado = 'completed';
  } else if (action === 'request_bill' && order.salonEstado === 'served') {
    order.salonEstado = 'bill_requested';
  } else if (action === 'confirm' && order.pagoEstado !== 'paid' && payment) {
    order.metodoPago = payment.metodoPago;
    order.nombrePagador = payment.nombrePagador;
    order.estado = 'paid';
    order.pagoEstado = 'paid';
    if (order.salonEstado === 'served' || order.salonEstado === 'bill_requested') {
      order.estado = 'completed';
    }
  } else if (
    action === 'complete' &&
    order.pagoEstado === 'paid' &&
    (order.salonEstado === 'served' || order.salonEstado === 'bill_requested')
  ) {
    order.estado = 'completed';
  } else {
    return null;
  }

  return { ...order, items: order.items.map((item) => ({ ...item })) };
}
