/* ==========================================================================
   NALU · Cliente mínimo de Supabase (REST, Auth y Storage) sin dependencias
   Lo usan el sitio (lectura) y el admin (lectura y escritura).
   ========================================================================== */

window.SB = (function(){

    const cfg = window.NALU_SUPABASE || {};
    const URL_BASE = String(cfg.url || "").replace(/\/+$/, "");
    const CLAVE = String(cfg.clave || "").trim();
    const configurado = Boolean(URL_BASE && CLAVE);

    // Las claves "publishable" van solo en el header apikey; las anon (JWT)
    // antiguas también se aceptan como Bearer.
    function encabezados(token, extra = {}){
        const h = { apikey: CLAVE, ...extra };
        const bearer = token || (CLAVE.startsWith("eyJ") ? CLAVE : "");
        if(bearer) h.Authorization = "Bearer " + bearer;
        return h;
    }

    async function respuesta(r){
        const texto = await r.text();
        let json = null;
        try{ json = texto ? JSON.parse(texto) : null; }catch(e){}
        if(!r.ok){
            const msg = json?.msg || json?.message || json?.error_description || json?.error || ("Error " + r.status);
            const err = new Error(msg);
            err.status = r.status;
            err.codigo = json?.code || json?.error_code || json?.error;
            throw err;
        }
        return json;
    }

    /* ----- Base de datos (PostgREST) ----- */

    async function consultar(ruta, { metodo = "GET", datos, token, prefer } = {}){
        const extra = {};
        if(datos !== undefined) extra["Content-Type"] = "application/json";
        if(prefer) extra.Prefer = prefer;
        const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
            method: metodo,
            headers: encabezados(token, extra),
            body: datos !== undefined ? JSON.stringify(datos) : undefined,
            cache: "no-store"
        });
        return respuesta(r);
    }

    const leer = (tabla, consulta = "select=*", token) =>
        consultar(`${tabla}?${consulta}`, { token });

    const guardar = (tabla, filas, token) =>
        consultar(`${tabla}?on_conflict=id`, {
            metodo: "POST", datos: filas, token,
            prefer: "resolution=merge-duplicates,return=representation"
        });

    const borrar = (tabla, id, token) =>
        consultar(`${tabla}?id=eq.${encodeURIComponent(id)}`, { metodo: "DELETE", token });

    /* ----- Sesión (Auth) ----- */

    async function auth(ruta, { metodo = "POST", datos, token } = {}){
        const r = await fetch(`${URL_BASE}/auth/v1/${ruta}`, {
            method: metodo,
            headers: encabezados(token, { "Content-Type": "application/json" }),
            body: datos ? JSON.stringify(datos) : undefined
        });
        return respuesta(r);
    }

    const entrar = (email, password) =>
        auth("token?grant_type=password", { datos: { email, password } });

    const renovar = refresh_token =>
        auth("token?grant_type=refresh_token", { datos: { refresh_token } });

    const salir = token =>
        auth("logout", { token }).catch(() => null);

    const recuperar = (email, redirect_to) =>
        auth(`recover?redirect_to=${encodeURIComponent(redirect_to)}`, { datos: { email } });

    const cambiarContrasena = (token, password) =>
        auth("user", { metodo: "PUT", datos: { password }, token });

    /* ----- Fotos (Storage) ----- */

    const BUCKET = "fotos";

    async function subirFoto(ruta, blob, token){
        const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${ruta}`, {
            method: "POST",
            headers: encabezados(token, { "Content-Type": blob.type, "Cache-Control": "max-age=31536000", "x-upsert": "true" }),
            body: blob
        });
        await respuesta(r);
        return urlPublica(ruta);
    }

    function urlPublica(ruta){
        return `${URL_BASE}/storage/v1/object/public/${BUCKET}/${ruta}`;
    }

    // Devuelve la ruta dentro del bucket si la URL es una foto nuestra
    function rutaDeFoto(url){
        const prefijo = `${URL_BASE}/storage/v1/object/public/${BUCKET}/`;
        return url && url.startsWith(prefijo) ? url.slice(prefijo.length) : null;
    }

    async function borrarFoto(url, token){
        const ruta = rutaDeFoto(url);
        if(!ruta) return;
        const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}`, {
            method: "DELETE",
            headers: encabezados(token, { "Content-Type": "application/json" }),
            body: JSON.stringify({ prefixes: [ruta] })
        });
        await respuesta(r).catch(() => null);
    }

    /* ----- Catálogo completo con la forma que usa el sitio ----- */

    async function catalogo(token){
        const [tienda, categorias, productos, enlaces] = await Promise.all([
            leer("tienda", "select=*&id=eq.1", token),
            leer("categorias", "select=*&order=orden.asc,nombre.asc", token),
            leer("productos", "select=*&order=orden.asc,creado.desc", token),
            leer("enlaces", "select=*&order=orden.asc", token)
        ]);
        const t = tienda?.[0] || {};
        return {
            tienda: {
                nombre: t.nombre || "NALU Souvenirs",
                whatsapp: t.whatsapp || "",
                moneda: t.moneda || "MXN",
                mensajePedido: t.mensaje_pedido || ""
            },
            categorias: categorias || [],
            productos: (productos || []).map(p => ({ ...p, precio: Number(p.precio) })),
            enlaces: enlaces || []
        };
    }

    return {
        configurado, url: URL_BASE,
        consultar, leer, guardar, borrar,
        entrar, renovar, salir, recuperar, cambiarContrasena,
        subirFoto, borrarFoto, rutaDeFoto, urlPublica,
        catalogo
    };

})();
