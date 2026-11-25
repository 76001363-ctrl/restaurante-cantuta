insert into public.menu_items (id, name, category, price, image)
values ('jugo-pina', 'Jugo de Piña', 'Bebidas', 16, '/img/pina.jpg')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  image = excluded.image;
