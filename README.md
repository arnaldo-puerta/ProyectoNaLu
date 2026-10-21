# ProyectoNaLu
Este es el proyecto de naty

Sitio catálogo de **NALU Souvenirs** (velas aromáticas artesanales) con pedidos por WhatsApp, base de datos en **Supabase** y alojamiento en **Netlify**. Ambos en plan gratuito.

## Cómo funciona

- **Pedir ahora**: abre WhatsApp con el mensaje de ese producto.
- **Carrito**: junta varios productos en un solo mensaje con cantidades, total y datos de entrega.
- **Admin** (`/admin/`): entras con correo y contraseña. Agregas, editas y quitas productos, colecciones, enlaces y el número de WhatsApp. Cada cambio se guarda al momento y se ve en el sitio al recargar.

## Puesta en marcha

### 1. Supabase (base de datos y fotos)

1. Crea una cuenta y un proyecto en [supabase.com](https://supabase.com/dashboard). Elige la región más cercana (por ejemplo `us-west`).
2. Abre **SQL Editor → New query**, pega todo `supabase/esquema.sql`, **cambia el correo** de la línea marcada con `<<<` y presiona **Run**. Crea las tablas, la seguridad, el bucket de fotos y los productos actuales.
3. En **Authentication → Users → Add user → Create new user**, crea tu usuario con ese mismo correo y una contraseña. Marca *Auto Confirm User*.
4. En **Authentication → Sign In / Providers**, desactiva **Allow new users to sign up**, para que nadie más pueda crear cuenta.
5. En **Project Settings → API Keys** copia la **URL del proyecto** y la **Publishable key** y pégalas en `js/config.js`.

### 2. Netlify (alojamiento)

1. Crea una cuenta en [netlify.com](https://app.netlify.com) con tu GitHub.
2. **Add new site → Import an existing project →** elige el repositorio `ProyectoNaLu`. No hay que configurar nada más: `netlify.toml` ya lo trae.
3. Cuando tengas la dirección del sitio (por ejemplo `https://velasnalu.netlify.app`), ve en Supabase a **Authentication → URL Configuration** y ponla en *Site URL*. Agrega `https://velasnalu.netlify.app/admin/` en *Redirect URLs*, para que funcione "Olvidé mi contraseña".

Cada vez que subas cambios de código a GitHub, Netlify publica solo. Los productos ya no dependen de eso: viven en Supabase.

### Para que Supabase no se pause

Los proyectos gratis de Supabase se pausan tras una semana sin actividad. La función `netlify/functions/mantener-activo.mjs` hace una consulta diaria para evitarlo. Funciona sola, porque toma los datos de `js/config.js`.

## Agregar otro admin

En Supabase:
1. Crea el usuario en **Authentication → Users**.
2. Agrega su correo en **Table Editor → admins**.

## Archivos

| Ruta | Qué es |
| --- | --- |
| `index.html` | Inicio: portada, colecciones, favoritos, nosotros, contacto |
| `paginas/coleccion.html` | Catálogo con filtros (`?cat=<colección>`) y búsqueda |
| `paginas/carrito.html` | Carrito con datos de entrega |
| `admin/` | Panel de administración |
| `js/config.js` | URL y clave pública de Supabase |
| `js/supabase.js` | Conexión con la base de datos, el login y las fotos |
| `js/app.js` | Carrito, vista de producto y mensajes de WhatsApp |
| `css/nalu.css` | Estilos del sitio |
| `supabase/esquema.sql` | Tablas, seguridad y datos iniciales |
| `data/catalogo.json` | Respaldo: lo que muestra el sitio mientras `js/config.js` esté vacío |
| `netlify.toml` | Configuración de Netlify |

## Seguridad

La clave de `js/config.js` es pública por diseño. Lo que protege los datos son las reglas de `supabase/esquema.sql`: cualquiera puede **leer** el catálogo, pero solo los correos de la tabla `admins`, con sesión iniciada, pueden **modificarlo** o subir fotos. Nunca pongas la *secret key* (o `service_role`) en el sitio.

## Probar en tu computadora

Usa un servidor local, por ejemplo la extensión **Live Server** de VS Code, o `python -m http.server` en la carpeta del proyecto. Abrir el HTML con doble clic no funciona.
