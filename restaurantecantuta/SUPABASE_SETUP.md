# Conectar Restaurante Cantuta con Supabase

## 1. Configurar el proyecto local

Copia `.env.example` a `.env` y completa:

- `PUBLIC_SUPABASE_URL`: URL del proyecto Supabase.
- `PUBLIC_SUPABASE_ANON_KEY`: clave pública/anon del proyecto.
- `SUPABASE_SERVICE_ROLE_KEY`: clave secreta de servidor. Solo se usa para invitar cuentas y ejecutar la configuración inicial del administrador; nunca la publiques ni la uses en el navegador.
- `PUBLIC_SITE_URL` (opcional): URL base para enlaces de invitación; por defecto `http://localhost:5173`.

El `.env` está excluido de Git. No pegues claves en el código ni las compartas.

## 2. Crear el esquema

Desde la raíz del proyecto, aplica las migraciones de `supabase/migrations` en orden por fecha/nombre. La migración `20261118110000_allow_customer_table_orders.sql` permite pedidos válidos en mesa desde el menú público, además de los pedidos de mesero. Puedes hacerlo con Supabase CLI:

```powershell
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

O ejecuta el contenido de cada migración en orden desde **Supabase Dashboard → SQL Editor**. Las migraciones finales crean el modelo `pedidos` y `pedido_detalles`, sincronizan los pedidos existentes y aplican políticas RLS y transiciones por rol.

## 3. Crear el primer administrador

No existe registro público de personal. Con las variables privadas configuradas, crea la primera cuenta desde la raíz:

```powershell
npm run setup:admin -- administrador@ejemplo.com
```

Supabase enviará el correo de invitación. En **Authentication → URL Configuration**, permite `http://localhost:5173/auth/login` como URL de redirección; configura también el dominio de producción cuando se despliegue. El administrador inicial y los siguientes miembros del personal quedan con su rol en `app_metadata`, no en metadatos editables por el usuario.

Después, el administrador invita meseros, cocina, caja u otros administradores desde **Panel → Cuentas del personal**.

## 4. Ejecutar y comprobar

```powershell
npm run dev
npm run check
npm run build
```

El menú y los precios se leen desde `menu_items`. Los pedidos se guardan en `restaurant_orders`; un trigger transaccional calcula precios y totales con el menú de la base y crea las filas correspondientes en `pedidos` y `pedido_detalles`. Los paneles consultan los pedidos cada tres segundos, con lectura limitada por RLS/rol.

Si faltan credenciales, en desarrollo se puede usar el modo demo, pero los pedidos solo se comparten dentro del proceso local y se pierden al reiniciarlo. No representa una conexión a una base de datos.

## 5. Publicar el enlace para cualquier dispositivo

El proyecto está configurado para Cloudflare Pages. Autoriza Wrangler con `npx wrangler login`, crea el proyecto Pages `restaurante-cantuta` en tu cuenta y publica desde la raíz:

```powershell
npm run deploy
```

En **Cloudflare → Workers & Pages → restaurante-cantuta → Settings → Variables and Secrets**, configura `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` y `PUBLIC_SITE_URL` con los valores del proyecto y la URL pública asignada. Añade `SUPABASE_SERVICE_ROLE_KEY` como secreto solo si necesitas invitar personal. No subas el archivo `.env`. Agrega la URL pública del sitio a las URL permitidas de redirección en Supabase Authentication.
