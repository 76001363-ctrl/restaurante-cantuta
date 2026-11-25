insert into public.menu_items (id, name, category, price, image)
values ('jugo-papaya', 'Jugo de Papaya', 'Bebidas', 16, '/img/papaya.jpg')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  image = excluded.image;
