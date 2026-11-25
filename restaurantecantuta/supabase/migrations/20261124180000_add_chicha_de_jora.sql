insert into public.menu_items (id, name, category, price, image)
values ('chicha-jora', 'Chicha de Jora', 'Bebidas', 18, '/img/jora.jpg')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  image = excluded.image;
