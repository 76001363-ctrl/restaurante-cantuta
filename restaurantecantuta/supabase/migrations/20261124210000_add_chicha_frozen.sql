insert into public.menu_items (id, name, category, price, image)
values ('chicha-frozen', 'Chicha Frozen', 'Bebidas', 20, '/img/chica morada.jpg')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  image = excluded.image;
