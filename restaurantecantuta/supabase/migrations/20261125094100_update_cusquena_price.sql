update public.menu_items
set price = 10,
    updated_at = now()
where id = 'cusquena';

update public.menu_items
set price = 9,
    updated_at = now()
where id = 'pilsen-callao';

update public.menu_items
set price = 8,
    updated_at = now()
where id = 'mazamorra-morada';

update public.menu_items
set price = 18,
    updated_at = now()
where id = 'chicha-morada';

update public.menu_items
set price = 13,
    updated_at = now()
where id in ('inka-kola', 'coca-cola');

insert into public.menu_items (id, name, category, price, image)
values ('chicha-frozen', 'Limonada Frozen', 'Bebidas', 18, '/img/limonada-frozen.png')
on conflict (id) do update set
  price = excluded.price,
  updated_at = now();

insert into public.menu_items (id, name, category, price, image)
values ('arroz-con-leche', 'Arroz con Leche', 'Postres', 8, '/img/arroz-con-leche.png')
on conflict (id) do update set
  price = excluded.price,
  updated_at = now();

insert into public.menu_items (id, name, category, price, image)
values
  ('torta-helada', 'Torta Helada', 'Postres', 8, '/img/torta-helada.png'),
  ('tartaletas-frutos-rojos', 'Mini Tartaletas de Frutos Rojos', 'Postres', 12, '/img/tartaletas-frutos-rojos.png')
on conflict (id) do update set
  price = excluded.price,
  updated_at = now();

insert into public.menu_items (id, name, category, price, image)
values ('cristal', 'Cristal', 'Cervezas', 8, '/img/cristal.jpg')
on conflict (id) do update set
  price = excluded.price,
  updated_at = now();

update public.menu_items
set price = 5,
    updated_at = now()
where id = 'mil-hojas';

insert into public.menu_items (id, name, category, price, image)
values
  ('nata', 'Nata', 'Postres', 5, '/img/nata.jpg'),
  ('pay-manzana', 'Pay de Manzana', 'Postres', 7, '/img/pay-de-manzana.png')
on conflict (id) do update set
  price = excluded.price,
  updated_at = now();
