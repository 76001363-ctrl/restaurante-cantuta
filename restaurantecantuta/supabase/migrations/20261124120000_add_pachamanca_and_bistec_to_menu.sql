insert into public.menu_items (id, name, category, price, image)
values ('pachamanca', 'Pachamanca', 'Comidas', 35, '/img/pachamanca-plato.webp')
on conflict (id) do nothing;

insert into public.menu_items (id, name, category, price, image)
values ('bistec', 'Bistec', 'Comidas', 30, '/img/bistec6.webp')
on conflict (id) do nothing;

insert into public.menu_items (id, name, category, price, image)
values ('patasca', 'Patasca', 'Comidas', 28, '/img/patasca4.webp')
on conflict (id) do nothing;
