drop policy if exists "Restaurant staff can change menu availability" on public.menu_items;
create policy "Restaurant staff can change menu availability"
  on public.menu_items for update
  using (coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'mesero', 'mesera', 'moza', 'caja', 'cajas', 'cocina'))
  with check (coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'mesero', 'mesera', 'moza', 'caja', 'cajas', 'cocina'));

drop policy if exists "Restaurant staff can seed menu items" on public.menu_items;
create policy "Restaurant staff can seed menu items"
  on public.menu_items for insert
  with check (coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'mesero', 'mesera', 'moza', 'caja', 'cajas', 'cocina'));

drop policy if exists "Restaurant staff can view orders" on public.restaurant_orders;
create policy "Restaurant staff can view orders"
  on public.restaurant_orders for select
  using (coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'mesero', 'mesera', 'moza', 'caja', 'cajas', 'cocina'));

drop policy if exists "Restaurant staff can confirm orders" on public.restaurant_orders;
create policy "Restaurant staff can confirm orders"
  on public.restaurant_orders for update
  using (coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'mesero', 'mesera', 'moza', 'caja', 'cajas', 'cocina'))
  with check (coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'mesero', 'mesera', 'moza', 'caja', 'cajas', 'cocina'));
