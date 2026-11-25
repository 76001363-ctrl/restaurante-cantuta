alter table public.restaurant_orders
  drop constraint if exists restaurant_orders_status_check;

alter table public.restaurant_orders
  add constraint restaurant_orders_status_check
  check (status in ('pending_confirmation', 'paid', 'completed'));
