# ProyectoNaLu
Este es el proyecto de naty

Sitio catálogo de **NALU Souvenirs** (velas aromáticas artesanales) con pedidos por WhatsApp y panel de administración.

## Cómo funciona

- **Pedir ahora**: abre WhatsApp con el mensaje de ese producto.
- **Carrito**: junta varios productos en un solo mensaje con cantidades, total y datos de entrega.
- **Admin** (`/admin/`): con contraseña, permite agregar, editar y quitar productos, colecciones, enlaces y el número de WhatsApp. Al tocar **Publicar**, los cambios se guardan en este repositorio y GitHub Pages actualiza el sitio en uno o dos minutos.

## Primera vez en el admin

1. Publica el sitio con GitHub Pages (Settings → Pages → rama `main`, carpeta `/root`).
2. Entra a `https://<usuario>.github.io/ProyectoNaLu/admin/`.
3. Crea un token en GitHub: Settings → Developer settings → **Fine-grained tokens** → *Only select repositories* → `ProyectoNaLu` → *Repository permissions* → **Contents: Read and write**.
4. Pega el token, elige una contraseña (mínimo 10 caracteres) y listo.

El token se guarda **cifrado con tu contraseña** en `data/admin.json`; sin la contraseña no sirve de nada. Aun así, usa una contraseña larga, porque el archivo es público. Si olvidas la contraseña, entra con un token nuevo desde "Olvidé la contraseña".

## Archivos

| Ruta | Qué es |
| --- | --- |
| `index.html` | Inicio: portada, colecciones, favoritos, nosotros, contacto |
| `paginas/coleccion.html` | Catálogo con filtros (`?cat=<colección>`) y búsqueda |
| `paginas/carrito.html` | Carrito con datos de entrega |
| `data/catalogo.json` | Productos, colecciones, enlaces y WhatsApp (lo edita el admin) |
| `data/admin.json` | Acceso al admin (token cifrado). Lo crea el admin |
| `admin/` | Panel de administración |
| `js/app.js` | Carrito, vista de producto y mensajes de WhatsApp |
| `css/nalu.css` | Estilos del sitio |
| `img/subidas/` | Fotos subidas desde el admin |

## Probar en tu computadora

El sitio lee `data/catalogo.json`, así que no funciona abriendo el archivo con doble clic. Usa un servidor local, por ejemplo la extensión **Live Server** de VS Code, o `python -m http.server` en la carpeta del proyecto.
