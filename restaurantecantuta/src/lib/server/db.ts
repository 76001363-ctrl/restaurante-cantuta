import type { SupabaseClient } from '@supabase/supabase-js';
import type { RestaurantOrder } from '$lib/menu';
import type { StaffOrderAction } from '$lib/staffRoles';

type Payment = {
  metodoPago: RestaurantOrder['metodoPago'];
  nombrePagador: string;
};

export function listOrders(client: SupabaseClient) {
  return client.from('restaurant_orders').select('*').order('created_at', { ascending: false });
}

export function insertOrder(client: SupabaseClient, order: Record<string, unknown>) {
  return client.from('restaurant_orders').insert(order).select('*').single();
}

export function updateOrder(
  client: SupabaseClient,
  id: string,
  action: StaffOrderAction,
  payment?: Payment
) {
  const values: Record<StaffOrderAction, Record<string, unknown>> = {
    start_preparing: { kitchen_status: 'preparing' },
    ready: { kitchen_status: 'ready' },
    serve: { service_status: 'served' },
    request_bill: { service_status: 'bill_requested' },
    confirm: {
      status: 'paid',
      payment_status: 'paid',
      payment_method: payment?.metodoPago,
      payer_name: payment?.nombrePagador
    },
    complete: { status: 'completed' }
  };

  let query = client.from('restaurant_orders').update(values[action]).eq('id', id);
  switch (action) {
    case 'start_preparing':
      query = query.eq('kitchen_status', 'new').neq('status', 'completed');
      break;
    case 'ready':
      query = query.eq('kitchen_status', 'preparing').neq('status', 'completed');
      break;
    case 'serve':
      query = query.eq('kitchen_status', 'ready').eq('service_status', 'active').neq('status', 'completed');
      break;
    case 'request_bill':
      query = query.neq('service_status', 'bill_requested').neq('status', 'completed');
      break;
    case 'confirm':
      query = query.eq('status', 'pending_confirmation');
      break;
    case 'complete':
      query = query
        .eq('status', 'paid')
        .eq('payment_status', 'paid')
        .in('service_status', ['served', 'bill_requested']);
      break;
  }
  return query.select('*').single();
}
