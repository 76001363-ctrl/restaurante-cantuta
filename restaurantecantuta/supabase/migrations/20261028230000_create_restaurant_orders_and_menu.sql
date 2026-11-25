create table if not exists public.menu_items (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(10, 2) not null check (price >= 0),
  image text not null,
  available boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.menu_items (id, name, category, price, image)
values
  ('lomo-saltado', 'Lomo Saltado', 'Comidas', 32, '/img/lomosaltado7.webp'),
  ('ceviche-mixto', 'Ceviche Mixto', 'Comidas', 38, '/img/ceviche8.webp'),
  ('chicharron-cerdo', 'Chicharrón de Cerdo', 'Comidas', 30, '/img/chicharron5.jpg'),
  ('papa-rellena', 'Papa Rellena Especial', 'Comidas', 18, '/img/paparellena3.webp'),
  ('chicha-morada', 'Chicha Morada (1.5L)', 'Bebidas', 18, '/img/chica morada.jpg'),
  ('inka-kola', 'Inka Kola (1.5L)', 'Bebidas', 13, '/img/inca cola.webp'),
  ('coca-cola', 'Coca Cola (1.5L)', 'Bebidas', 13, '/img/coca cola.jpg'),
  ('helado-artesanal', 'Helado Artesanal', 'Postres', 12, '/img/helados.jpg'),
  ('mazamorra-morada', 'Mazamorra Morada', 'Postres', 8, '/img/masamorra morada.jpg'),
  ('mil-hojas', 'Pastel Mil Hojas', 'Postres', 15, '/img/100 hojas.jpg'),
  ('cusquena', 'Cusqueña', 'Cervezas', 10, '/img/cusqueña.jpg'),
  ('pilsen-callao', 'Pilsen Callao', 'Cervezas', 9, '/img/pinsel.jpg'),
  ('corona-extra', 'Corona Extra', 'Cervezas', 18, '/img/corona.jpg'),
  ('cristal', 'Cristal', 'Cervezas', 8, '/img/cristal.jpg')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  image = excluded.image;

create table if not exists public.restaurant_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null,
  table_name text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  tax numeric(10, 2) not null check (tax >= 0),
  total numeric(10, 2) not null check (total >= 0),
  receipt_type text not null check (receipt_type in ('boleta', 'factura')),
  tax_id text,
  business_name text,
  payment_method text not null check (payment_method in ('yape_plin', 'tarjeta', 'efectivo')),
  payer_name text not null,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'paid', 'completed')),
  payment_status text not null default 'pending_confirmation' check (payment_status in ('pending_confirmation', 'paid')),
  constraint invoice_requires_tax_id check (receipt_type <> 'factura' or tax_id ~ '^[0-9]{11}$')
);

create index if not exists restaurant_orders_created_at_idx
  on public.restaurant_orders (created_at desc);
create index if not exists restaurant_orders_table_name_idx
  on public.restaurant_orders (table_name);

alter table public.menu_items enable row level security;
alter table public.restaurant_orders enable row level security;

drop policy if exists "Menu is visible to everyone" on public.menu_items;
create policy "Menu is visible to everyone"
  on public.menu_items for select
  using (true);

drop policy if exists "Restaurant staff can change menu availability" on public.menu_items;
create policy "Restaurant staff can change menu availability"
  on public.menu_items for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mesera', 'moza', 'cajas', 'cocina'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mesera', 'moza', 'cajas', 'cocina'));

drop policy if exists "Restaurant staff can seed menu items" on public.menu_items;
create policy "Restaurant staff can seed menu items"
  on public.menu_items for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mesera', 'moza', 'cajas', 'cocina'));

drop policy if exists "Customers can create pending orders" on public.restaurant_orders;
create policy "Customers can create pending orders"
  on public.restaurant_orders for insert
  with check (
    status = 'pending_confirmation'
    and payment_status = 'pending_confirmation'
    and customer_name <> ''
    and table_name ~ '^Mesa ([1-9]|1[0-6])$'
  );

drop policy if exists "Restaurant staff can view orders" on public.restaurant_orders;
create policy "Restaurant staff can view orders"
  on public.restaurant_orders for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mesera', 'moza', 'cajas', 'cocina'));

drop policy if exists "Restaurant staff can confirm orders" on public.restaurant_orders;
create policy "Restaurant staff can confirm orders"
  on public.restaurant_orders for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mesera', 'moza', 'cajas', 'cocina'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mesera', 'moza', 'cajas', 'cocina'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items'
    ) then
      alter publication supabase_realtime add table public.menu_items;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_orders'
    ) then
      alter publication supabase_realtime add table public.restaurant_orders;
    end if;
  end if;
end
$$;
