create or replace function public.guard_restaurant_order_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  requested jsonb;
  menu_product public.menu_items%rowtype;
  priced_items jsonb := '[]'::jsonb;
  item_subtotal numeric(10, 2) := 0;
  item_quantity integer;
begin
  if tg_op = 'INSERT' then
    if new.order_type = 'delivery' then
      if coalesce(new.customer_phone, '') !~ '^[+0-9 ()-]{7,20}$'
        or length(trim(coalesce(new.delivery_address, ''))) not between 5 and 250
        or new.table_name <> 'Delivery'
      then
        raise exception 'Los datos del pedido delivery no son válidos.';
      end if;
    elsif new.order_type = 'mesa' then
      if current_role not in ('mesero', 'mesera', 'moza')
        or new.table_name !~ '^Mesa ([1-9]|1[0-6])$'
        or new.customer_phone is not null
        or new.delivery_address is not null
      then
        raise exception 'Solo un mesero puede crear pedidos de mesa.';
      end if;
    else
      raise exception 'El tipo de pedido no es válido.';
    end if;

    if new.status <> 'pending_confirmation'
      or new.payment_status <> 'pending_confirmation'
      or new.kitchen_status <> 'new'
      or new.service_status <> 'active'
      or length(trim(new.customer_name)) not between 2 and 100
      or jsonb_typeof(new.items) <> 'array'
      or jsonb_array_length(new.items) not between 1 and 30
    then
      raise exception 'Los datos iniciales del pedido no son válidos.';
    end if;

    for requested in select value from jsonb_array_elements(new.items)
    loop
      if jsonb_typeof(requested) <> 'object'
        or jsonb_typeof(requested -> 'productId') <> 'string'
        or jsonb_typeof(requested -> 'cantidad') <> 'number'
        or jsonb_typeof(requested -> 'nota') <> 'string'
      then
        raise exception 'Una línea del pedido no es válida.';
      end if;

      item_quantity := (requested ->> 'cantidad')::integer;
      if item_quantity < 1 or item_quantity > 50 then
        raise exception 'La cantidad del producto debe estar entre 1 y 50.';
      end if;

      select * into menu_product
      from public.menu_items
      where id = requested ->> 'productId'
        and available = true;
      if not found then
        raise exception 'Un producto no existe o ya no está disponible.';
      end if;

      item_subtotal := item_subtotal + menu_product.price * item_quantity;
      priced_items := priced_items || jsonb_build_array(jsonb_build_object(
        'productId', menu_product.id,
        'nombre', menu_product.name,
        'cantidad', item_quantity,
        'precio', menu_product.price,
        'nota', left(trim(requested ->> 'nota'), 250)
      ));
    end loop;

    new.items := priced_items;
    new.subtotal := round(item_subtotal, 2);
    new.tax := round(new.subtotal * 0.18, 2);
    new.total := new.subtotal + new.tax;
    return new;
  end if;

  if current_role = 'admin' then
    return new;
  end if;

  if current_role = 'cocina'
    and old.status <> 'completed'
    and old.kitchen_status in ('new', 'preparing')
    and (
      (old.kitchen_status = 'new' and new.kitchen_status = 'preparing')
      or (old.kitchen_status = 'preparing' and new.kitchen_status = 'ready')
    )
    and (to_jsonb(new) - 'kitchen_status') = (to_jsonb(old) - 'kitchen_status')
  then
    return new;
  end if;

  if current_role in ('mesero', 'mesera', 'moza')
    and old.status = 'pending_confirmation'
    and old.kitchen_status = 'ready'
    and old.service_status = 'active'
    and new.service_status = 'served'
    and (to_jsonb(new) - 'service_status') = (to_jsonb(old) - 'service_status')
  then
    return new;
  end if;

  if current_role in ('mesero', 'mesera', 'moza')
    and old.order_type = 'mesa'
    and old.status = 'pending_confirmation'
    and old.kitchen_status = 'ready'
    and old.service_status = 'served'
    and new.service_status = 'bill_requested'
    and (to_jsonb(new) - 'service_status') = (to_jsonb(old) - 'service_status')
  then
    return new;
  end if;

  if current_role in ('caja', 'cajas')
    and old.status = 'pending_confirmation'
    and old.kitchen_status = 'ready'
    and old.service_status in ('served', 'bill_requested')
    and new.status = 'paid'
    and new.payment_status = 'paid'
    and new.payment_method in ('yape_plin', 'tarjeta', 'efectivo')
    and length(trim(new.payer_name)) between 2 and 120
    and (to_jsonb(new) - 'status' - 'payment_status' - 'payment_method' - 'payer_name')
      = (to_jsonb(old) - 'status' - 'payment_status' - 'payment_method' - 'payer_name')
  then
    return new;
  end if;

  if current_role in ('caja', 'cajas')
    and old.status = 'paid'
    and old.payment_status = 'paid'
    and new.status = 'completed'
    and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status')
  then
    return new;
  end if;

  raise exception 'El rol o el estado actual no permite esta transición del pedido.';
end
$$;

drop trigger if exists restaurant_orders_guard_write on public.restaurant_orders;
create trigger restaurant_orders_guard_write
  before insert or update on public.restaurant_orders
  for each row execute function public.guard_restaurant_order_write();

drop policy if exists "Restaurant staff can change menu availability" on public.menu_items;
create policy "Admins can change menu availability"
  on public.menu_items for update
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

drop policy if exists "Restaurant staff can seed menu items" on public.menu_items;
create policy "Admins can seed menu items"
  on public.menu_items for insert
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

drop policy if exists "Customers can create pending orders" on public.restaurant_orders;
create policy "Customers and waiters can create valid orders"
  on public.restaurant_orders for insert
  with check (
    status = 'pending_confirmation'
    and payment_status = 'pending_confirmation'
    and (
      (
        order_type = 'delivery'
        and customer_phone ~ '^[+0-9 ()-]{7,20}$'
        and length(trim(delivery_address)) between 5 and 250
      )
      or (
        order_type = 'mesa'
        and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('mesero', 'mesera', 'moza')
        and table_name ~ '^Mesa ([1-9]|1[0-6])$'
      )
    )
  );

drop policy if exists "Restaurant staff can view orders" on public.restaurant_orders;
create policy "Staff can view orders for their role" on public.restaurant_orders
  for select using (
    case coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
      when 'admin' then true
      when 'cocina' then status <> 'completed' and kitchen_status in ('new', 'preparing')
      when 'mesero' then status <> 'completed' and (
        order_type = 'mesa'
        or (order_type = 'delivery' and kitchen_status = 'ready' and service_status = 'active')
      )
      when 'mesera' then status <> 'completed' and (
        order_type = 'mesa'
        or (order_type = 'delivery' and kitchen_status = 'ready' and service_status = 'active')
      )
      when 'moza' then status <> 'completed' and (
        order_type = 'mesa'
        or (order_type = 'delivery' and kitchen_status = 'ready' and service_status = 'active')
      )
      when 'caja' then status <> 'completed' and (
        payment_status = 'paid' or service_status in ('served', 'bill_requested')
      )
      when 'cajas' then status <> 'completed' and (
        payment_status = 'paid' or service_status in ('served', 'bill_requested')
      )
      else false
    end
  );

drop policy if exists "Restaurant staff can confirm orders" on public.restaurant_orders;
create policy "Staff can update orders" on public.restaurant_orders
  for update
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in (
    'admin', 'cocina', 'mesero', 'mesera', 'moza', 'caja', 'cajas'
  ))
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in (
    'admin', 'cocina', 'mesero', 'mesera', 'moza', 'caja', 'cajas'
  ));

drop policy if exists "Restaurant staff can view pedidos" on public.pedidos;
create policy "Staff can view pedidos for their role"
  on public.pedidos for select
  using (
    case coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
      when 'admin' then true
      when 'cocina' then estado in ('pendiente', 'en_preparacion')
      when 'mesero' then tipo_pedido = 'mesa' or (tipo_pedido = 'delivery' and estado = 'listo')
      when 'mesera' then tipo_pedido = 'mesa' or (tipo_pedido = 'delivery' and estado = 'listo')
      when 'moza' then tipo_pedido = 'mesa' or (tipo_pedido = 'delivery' and estado = 'listo')
      when 'caja' then estado = 'pagado' or exists (
        select 1 from public.restaurant_orders o
        where o.id = pedidos.id and o.service_status in ('served', 'bill_requested') and o.status <> 'completed'
      )
      when 'cajas' then estado = 'pagado' or exists (
        select 1 from public.restaurant_orders o
        where o.id = pedidos.id and o.service_status in ('served', 'bill_requested') and o.status <> 'completed'
      )
      else false
    end
  );

drop policy if exists "Restaurant staff can view order details" on public.pedido_detalles;
create policy "Staff can view details for their role"
  on public.pedido_detalles for select
  using (exists (
    select 1
    from public.restaurant_orders o
    where o.id = pedido_detalles.pedido_id
  ));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
    ) then
      alter publication supabase_realtime add table public.pedidos;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedido_detalles'
    ) then
      alter publication supabase_realtime add table public.pedido_detalles;
    end if;
  end if;
end
$$;
