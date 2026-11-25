delete from public.menu_items
where id = 'patasca';

insert into public.menu_items (id, name, category, price, image)
values ('cuy-picante', 'Cuy Picante', 'Comidas', 45, '/img/cuy.jpg')
on conflict (id) do nothing;
