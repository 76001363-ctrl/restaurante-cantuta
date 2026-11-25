insert into public.menu_items (id, name, category, price, image)
values ('cuy-chactado', 'Cuy Chactado Entero', 'Comidas', 80, '/img/cuy.jpg')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  image = excluded.image;

insert into public.menu_items (id, name, category, price, image)
values ('trucha-frita', 'Trucha Frita', 'Comidas', 35, '/img/trucha-frita.png')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  image = excluded.image;

update public.menu_items
set name = 'Cuy Picante',
    category = 'Comidas',
    price = 45,
    image = '/img/cuy picante.jpg'
where id = 'cuy-picante';
