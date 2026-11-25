alter table public.restaurant_orders
  add column if not exists order_type text not null default 'mesa'
    check (order_type in ('delivery', 'mesa')),
  add column if not exists customer_phone text,
  add column if not exists delivery_address text;

drop policy if exists "Customers can create pending orders" on public.restaurant_orders;
create policy "Customers can create pending orders"
  on public.restaurant_orders for insert
  with check (
    status = 'pending_confirmation'
    and payment_status = 'pending_confirmation'
    and customer_name <> ''
    and (
      (order_type = 'mesa' and table_name ~ '^Mesa ([1-9]|1[0-6])$')
      or (
        order_type = 'delivery'
        and customer_phone ~ '^[+0-9 ()-]{7,20}$'
        and length(trim(delivery_address)) between 5 and 250
      )
    )
  );

create table if not exists public.pedidos (
  id uuid primary key references public.restaurant_orders(id) on delete cascade,
  cliente_nombre text not null,
  telefono text,
  direccion text,
  tipo_pedido text not null check (tipo_pedido in ('delivery', 'mesa')),
  numero_mesa integer check (numero_mesa between 1 and 16),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_preparacion', 'listo', 'pagado')),
  total numeric(10, 2) not null check (total >= 0),
  fecha_creacion timestamptz not null default now(),
  constraint pedido_tipo_ubicacion check (
    (tipo_pedido = 'mesa' and numero_mesa is not null)
    or (tipo_pedido = 'delivery' and telefono is not null and direccion is not null)
  )
);

create index if not exists pedidos_fecha_creacion_idx
  on public.pedidos (fecha_creacion desc);
create index if not exists pedidos_estado_idx
  on public.pedidos (estado);
create index if not exists pedidos_tipo_fecha_idx
  on public.pedidos (tipo_pedido, fecha_creacion desc);

create table if not exists public.pedido_detalles (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id text not null references public.menu_items(id),
  cantidad integer not null check (cantidad between 1 and 50),
  precio_unitario numeric(10, 2) not null check (precio_unitario >= 0),
  producto_nombre text not null,
  nota text not null default ''
);

create index if not exists pedido_detalles_pedido_id_idx
  on public.pedido_detalles (pedido_id);

alter table public.pedidos enable row level security;
alter table public.pedido_detalles enable row level security;

drop policy if exists "Restaurant staff can view pedidos" on public.pedidos;
create policy "Restaurant staff can view pedidos"
  on public.pedidos for select
  using (
    coalesce(
      nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) in ('admin', 'mesero', 'mesera', 'moza', 'caja', 'cajas', 'cocina')
  );

drop policy if exists "Restaurant staff can view order details" on public.pedido_detalles;
create policy "Restaurant staff can view order details"
  on public.pedido_detalles for select
  using (
    coalesce(
      nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) in ('admin', 'mesero', 'mesera', 'moza', 'caja', 'cajas', 'cocina')
  );

insert into public.pedidos (
  id, cliente_nombre, telefono, direccion, tipo_pedido, numero_mesa, estado, total, fecha_creacion
)
select
  id,
  customer_name,
  customer_phone,
  delivery_address,
  order_type,
  case when order_type = 'mesa' then nullif(regexp_replace(table_name, '[^0-9]', '', 'g'), '')::integer end,
  case
    when status in ('paid', 'completed') then 'pagado'
    when kitchen_status = 'ready' then 'listo'
    when kitchen_status = 'preparing' then 'en_preparacion'
    else 'pendiente'
  end,
  total,
  created_at
from public.restaurant_orders
on conflict (id) do nothing;

insert into public.pedido_detalles (
  pedido_id, producto_id, cantidad, precio_unitario, producto_nombre, nota
)
select
  orders.id,
  item ->> 'productId',
  (item ->> 'cantidad')::integer,
  (item ->> 'precio')::numeric(10, 2),
  item ->> 'nombre',
  coalesce(item ->> 'nota', '')
from public.restaurant_orders as orders
cross join lateral jsonb_array_elements(orders.items) as item
where not exists (
  select 1 from public.pedido_detalles as detail where detail.pedido_id = orders.id
);

create or replace function public.sync_restaurant_order_model()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_status text;
begin
  next_status := case
    when new.status in ('paid', 'completed') then 'pagado'
    when new.kitchen_status = 'ready' then 'listo'
    when new.kitchen_status = 'preparing' then 'en_preparacion'
    else 'pendiente'
  end;

  if tg_op = 'INSERT' then
    insert into public.pedidos (
      id, cliente_nombre, telefono, direccion, tipo_pedido, numero_mesa, estado, total, fecha_creacion
    ) values (
      new.id,
      new.customer_name,
      new.customer_phone,
      new.delivery_address,
      new.order_type,
      case when new.order_type = 'mesa' then nullif(regexp_replace(new.table_name, '[^0-9]', '', 'g'), '')::integer end,
      next_status,
      new.total,
      new.created_at
    );

    insert into public.pedido_detalles (
      pedido_id, producto_id, cantidad, precio_unitario, producto_nombre, nota
    )
    select
      new.id,
      item ->> 'productId',
      (item ->> 'cantidad')::integer,
      (item ->> 'precio')::numeric(10, 2),
      item ->> 'nombre',
      coalesce(item ->> 'nota', '')
    from jsonb_array_elements(new.items) as item;
  else
    update public.pedidos
    set estado = next_status, total = new.total
    where id = new.id;
  end if;
  return new;
end
$$;

drop trigger if exists restaurant_orders_sync_pedido_model on public.restaurant_orders;
create trigger restaurant_orders_sync_pedido_model
  after insert or update of status, kitchen_status, total on public.restaurant_orders
  for each row execute function public.sync_restaurant_order_model();

comment on table public.pedidos is
  'Modelo normalizado de pedidos, sincronizado con restaurant_orders para compatibilidad con la aplicación actual.';
comment on table public.pedido_detalles is
  'Líneas normalizadas de cada pedido; se escriben en la misma transacción al crear un pedido.';
