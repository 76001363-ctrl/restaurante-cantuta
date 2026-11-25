insert into public.menu_items (id, name, category, price, image)
values ('munya', 'Muña', 'Bebidas', 12, '/img/nuña.jpg')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  image = excluded.image;
