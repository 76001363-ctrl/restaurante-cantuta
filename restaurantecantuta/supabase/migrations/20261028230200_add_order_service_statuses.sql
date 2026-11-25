alter table public.restaurant_orders
  add column if not exists kitchen_status text not null default 'new'
    check (kitchen_status in ('new', 'preparing', 'ready')),
  add column if not exists service_status text not null default 'active'
    check (service_status in ('active', 'served', 'bill_requested'));
