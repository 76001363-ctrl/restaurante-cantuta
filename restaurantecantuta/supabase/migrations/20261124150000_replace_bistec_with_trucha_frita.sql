delete from public.menu_items
where id = 'bistec';

insert into public.menu_items (id, name, category, price, image)
values ('trucha-frita', 'Trucha Frita', 'Comidas', 35, '/img/food-fallback.svg')
on conflict (id) do nothing;
