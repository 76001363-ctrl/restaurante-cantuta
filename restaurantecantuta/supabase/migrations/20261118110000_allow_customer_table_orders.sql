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
      if current_role not in ('', 'mesero', 'mesera', 'moza')
        or new.table_name !~ '^Mesa ([1-9]|1[0-6])$'
        or new.customer_phone is not null
        or new.delivery_address is not null
      then
        raise exception 'Los datos del pedido en mesa no son válidos.';
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

drop policy if exists "Customers and waiters can create valid orders" on public.restaurant_orders;
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
        and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('', 'mesero', 'mesera', 'moza')
        and table_name ~ '^Mesa ([1-9]|1[0-6])$'
      )
    )
  );
