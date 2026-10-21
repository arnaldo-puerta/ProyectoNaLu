-- =========================================================================
-- NALU · Base de datos en Supabase
-- Pega TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Antes de correrlo, cambia el correo de la línea marcada con  <<<  por el
-- correo con el que vas a entrar al admin.
-- Se puede volver a correr sin perder datos.
-- =========================================================================

-- ----- Tablas -------------------------------------------------------------

create table if not exists public.tienda (
    id              int primary key default 1 check (id = 1),
    nombre          text not null default 'NALU Souvenirs',
    whatsapp        text not null default '',
    moneda          text not null default 'MXN',
    mensaje_pedido  text not null default '¡Hola NALU! Me gustaría hacer el siguiente pedido:'
);

create table if not exists public.categorias (
    id           text primary key,
    nombre       text not null,
    descripcion  text not null default '',
    imagen       text not null default '',
    orden        int  not null default 0
);

create table if not exists public.productos (
    id           text primary key,
    nombre       text not null,
    precio       numeric(10,2) not null default 0 check (precio >= 0),
    categoria    text references public.categorias(id) on update cascade on delete set null,
    imagen       text not null default '',
    descripcion  text not null default '',
    destacado    boolean not null default false,
    disponible   boolean not null default true,
    orden        int  not null default 0,
    creado       timestamptz not null default now()
);

create table if not exists public.enlaces (
    id        text primary key,
    tipo      text not null default 'otro',
    etiqueta  text not null default '',
    url       text not null default '',
    orden     int  not null default 0
);

-- Correos que pueden usar el admin
create table if not exists public.admins (
    email text primary key
);

-- ----- ¿Quién es admin? ---------------------------------------------------

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.admins
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

-- ----- Seguridad (RLS): todos leen, solo el admin escribe ------------------

alter table public.tienda     enable row level security;
alter table public.categorias enable row level security;
alter table public.productos  enable row level security;
alter table public.enlaces    enable row level security;
alter table public.admins     enable row level security;

do $$
declare t text;
begin
    foreach t in array array['tienda', 'categorias', 'productos', 'enlaces'] loop
        execute format('drop policy if exists "leer %1$s" on public.%1$I', t);
        execute format('create policy "leer %1$s" on public.%1$I for select using (true)', t);

        execute format('drop policy if exists "admin %1$s" on public.%1$I', t);
        execute format('create policy "admin %1$s" on public.%1$I for all to authenticated using (public.es_admin()) with check (public.es_admin())', t);
    end loop;
end $$;

-- La tabla admins no se puede leer ni editar desde el sitio
drop policy if exists "admin ve admins" on public.admins;
create policy "admin ve admins" on public.admins for select to authenticated using (public.es_admin());

-- ----- Fotos (Storage) ----------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true;

drop policy if exists "admin sube fotos" on storage.objects;
create policy "admin sube fotos" on storage.objects for insert to authenticated
    with check (bucket_id = 'fotos' and public.es_admin());

drop policy if exists "admin cambia fotos" on storage.objects;
create policy "admin cambia fotos" on storage.objects for update to authenticated
    using (bucket_id = 'fotos' and public.es_admin());

drop policy if exists "admin borra fotos" on storage.objects;
create policy "admin borra fotos" on storage.objects for delete to authenticated
    using (bucket_id = 'fotos' and public.es_admin());

-- ----- Admin --------------------------------------------------------------

insert into public.admins (email)
values ('tu-correo@ejemplo.com')            -- <<< cambia este correo
on conflict do nothing;

-- ----- Datos iniciales (solo si las tablas están vacías) ------------------

insert into public.tienda (id) values (1) on conflict do nothing;

insert into public.categorias (id, nombre, descripcion, imagen, orden)
select * from (values
    ('velas',    'Velas aromáticas',   'Flores, mariposas y frascos de cera aromática para regalar o decorar.', 'img/categories/velas.webp',   1),
    ('aromas',   'Home sprays',        'Aromas para ambientes y textiles que se quedan en casa.',               'img/categories/aromas.webp',  2),
    ('arreglos', 'Regalos y arreglos', 'Cajas, canastas y ramos de flores de cera hechos bajo pedido.',          'img/categories/regalos.webp', 3)
) as v(id, nombre, descripcion, imagen, orden)
where not exists (select 1 from public.categorias);

insert into public.productos (id, nombre, precio, categoria, imagen, descripcion, destacado, disponible, orden)
select * from (values
    ('home-spray-250',     'Home Spray 250 ml',  259, 'aromas',   'img/products/home-spray-250ml.webp', 'Aromatizante en spray para ambientes y textiles. Llena tu hogar de frescura con una fragancia duradera.', true, true, 1),
    ('margarita',          'Margarita',           33, 'velas',    'img/products/margarita.webp',        'Vela aromática artesanal en forma de margarita. Ideal como souvenir o detalle para eventos.',             true, true, 2),
    ('ramo-margarita',     'Ramo Margarita',      40, 'velas',    'img/products/ramo-margarita.webp',   'Pequeño ramo de velas en forma de flor, envuelto a mano. Perfecto para recuerdos de fiesta.',            true, true, 3),
    ('mini-mariposa',      'Mini Mariposa',       20, 'velas',    'img/products/mini-mariposa.webp',    'Vela aromática en forma de mariposa. Disponible en distintos colores para combinar con tu evento.',     true, true, 4),
    ('canasta-floral',     'Canasta Floral',     375, 'arreglos', 'img/products/canasta-floral.webp',   'Canasta con flores de cera aromáticas y flor seca, decorada con listón. Un regalo que perfuma y emociona.', true, true, 5),
    ('caja-floral-grande', 'Caja Floral Grande', 265, 'arreglos', 'img/products/caja-floral-gr.webp',   'Caja con arreglo de flores de cera aromáticas. Se puede personalizar con tarjeta y colores.',            true, true, 6)
) as v(id, nombre, precio, categoria, imagen, descripcion, destacado, disponible, orden)
where not exists (select 1 from public.productos);

insert into public.enlaces (id, tipo, etiqueta, url, orden)
select * from (values
    ('instagram', 'instagram', 'velasnalu_cuu',         'https://www.instagram.com/velasnalu_cuu/',                1),
    ('facebook',  'facebook',  'NALU Velas aromáticas', 'https://www.facebook.com/profile.php?id=61572303993239', 2)
) as v(id, tipo, etiqueta, url, orden)
where not exists (select 1 from public.enlaces);
