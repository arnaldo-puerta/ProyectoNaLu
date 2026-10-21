/* ==========================================================================
   NALU · Administración (Supabase)
   - Entrar con correo y contraseña (Supabase Auth)
   - Cada cambio se guarda al momento en la base de datos
   - Las fotos se comprimen en el navegador y se suben al bucket "fotos"
   Requiere ../js/config.js y ../js/supabase.js
   ========================================================================== */

(function(){

    const SESION = "nalu_admin_sesion";

    const TIPOS_ENLACE = {
        instagram: "Instagram",
        facebook:  "Facebook",
        tiktok:    "TikTok",
        whatsapp:  "WhatsApp",
        pinterest: "Pinterest",
        youtube:   "YouTube",
        web:       "Página web",
        ubicacion: "Ubicación",
        correo:    "Correo",
        telefono:  "Teléfono",
        otro:      "Otro"
    };

    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

    const esc = t => String(t ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const precio = n => "$" + Number(n || 0).toLocaleString("es-MX");

    function slug(t){
        return String(t || "")
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
            .slice(0, 50) || "item";
    }

    function idUnico(base, existentes){
        let id = slug(base), n = 2;
        while(existentes.includes(id)) id = slug(base) + "-" + n++;
        return id;
    }

    const clonar = o => JSON.parse(JSON.stringify(o));

    function textoError(e){
        if(!navigator.onLine) return "No hay conexión a internet.";
        if(e.status === 401 || e.status === 403) return "No tienes permiso para guardar. Vuelve a entrar o revisa que tu correo esté en la tabla admins.";
        if(e.codigo === "23503") return "Esa colección ya no existe. Recarga la página.";
        if(e.status === 413) return "La foto es demasiado grande.";
        return e.message || "Ocurrió un error inesperado.";
    }

    /* ----------------------------------------------------------------------
       Estado
       ---------------------------------------------------------------------- */

    const estado = {
        sesion: null,
        catalogo: null,
        guardadoEnlaces: null,   // copia de enlaces + tienda guardados, para detectar cambios
        tab: "productos",
        filtroCat: "todas",
        buscar: "",
        foto: null,              // { blob, dataURL } elegida en el formulario abierto
        ocupado: false
    };

    /* ----------------------------------------------------------------------
       Avisos y estado
       ---------------------------------------------------------------------- */

    let avisoTimer;
    function avisar(texto, ms = 3200){
        const a = $("#aviso");
        a.textContent = texto;
        a.classList.add("visible");
        clearTimeout(avisoTimer);
        avisoTimer = setTimeout(() => a.classList.remove("visible"), ms);
    }

    function pintarEstado(texto, tipo = ""){
        const e = $("#estado");
        if(!e) return;
        e.textContent = texto ?? (estado.sesion ? estado.sesion.email : "");
        e.className = "estado" + (tipo ? " estado--" + tipo : "");
    }

    // Ejecuta una operación de guardado mostrando el estado y los errores
    async function guardando(fn, ok){
        if(estado.ocupado) return false;
        estado.ocupado = true;
        pintarEstado("Guardando…", "trabajando");
        try{
            await fn();
            pintarEstado("Guardado ✓", "pendiente");
            setTimeout(() => pintarEstado(), 2500);
            if(ok) avisar(ok);
            return true;
        }catch(e){
            console.error(e);
            pintarEstado();
            if(e.status === 401) return expirada();
            alert("No se pudo guardar. " + textoError(e));
            return false;
        }finally{
            estado.ocupado = false;
        }
    }

    /* ----------------------------------------------------------------------
       Sesión
       ---------------------------------------------------------------------- */

    function guardarSesion(r){
        estado.sesion = {
            token: r.access_token,
            refresh: r.refresh_token,
            expira: Date.now() + (r.expires_in || 3600) * 1000,
            email: r.user?.email || estado.sesion?.email || ""
        };
        try{ localStorage.setItem(SESION, JSON.stringify(estado.sesion)); }catch(e){}
    }

    function borrarSesion(){
        estado.sesion = null;
        try{ localStorage.removeItem(SESION); }catch(e){}
    }

    // Token vigente (lo renueva si está por vencer)
    async function token(){
        const s = estado.sesion;
        if(!s) throw Object.assign(new Error("Sin sesión"), { status: 401 });
        if(s.expira - Date.now() < 90 * 1000){
            try{
                guardarSesion(await SB.renovar(s.refresh));
            }catch(e){
                if(e.status >= 400 && e.status < 500) e.status = 401;
                throw e;
            }
        }
        return estado.sesion.token;
    }

    function expirada(){
        borrarSesion();
        $("#dialogo").open && $("#dialogo").close();
        $("#app").hidden = true;
        $("#acceso").hidden = false;
        pantallaEntrar("Tu sesión terminó. Vuelve a entrar.");
        return false;
    }

    /* ----------------------------------------------------------------------
       Pantallas de acceso
       ---------------------------------------------------------------------- */

    const acceso = $("#acceso-contenido");

    function pantallaSinConfigurar(){
        acceso.innerHTML = `
            <h1>Conecta Supabase</h1>
            <p class="acceso-texto">El panel necesita la base de datos para guardar productos, colecciones y enlaces.</p>
            <ol class="pasos">
                <li>Crea un proyecto gratis en <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com</a>.</li>
                <li>En <em>SQL Editor</em> pega y corre el archivo <strong>supabase/esquema.sql</strong>, con tu correo en la línea marcada.</li>
                <li>En <em>Authentication → Users</em> crea tu usuario con ese mismo correo.</li>
                <li>En <em>Project Settings → API Keys</em> copia la URL y la <strong>Publishable key</strong> en <strong>js/config.js</strong> y vuelve a publicar.</li>
            </ol>`;
    }

    function pantallaEntrar(mensaje = ""){
        acceso.innerHTML = `
            <h1>Entrar</h1>
            <p class="acceso-texto">Entra con tu correo de admin para editar productos, colecciones y enlaces.</p>
            <form id="f-entrar">
                <div class="campo">
                    <label for="email">Correo</label>
                    <input type="email" id="email" autocomplete="username" required value="${esc(ultimoCorreo())}">
                </div>
                <div class="campo">
                    <label for="contrasena">Contraseña</label>
                    <input type="password" id="contrasena" autocomplete="current-password" required>
                </div>
                <p class="error" id="error" role="alert">${esc(mensaje)}</p>
                <button class="btn btn--primario btn--bloque" type="submit">Entrar</button>
            </form>
            <button class="enlace-texto" id="olvide" type="button">Olvidé mi contraseña</button>`;

        const email = $("#email");
        (email.value ? $("#contrasena") : email).focus();

        $("#f-entrar").addEventListener("submit", async e => {
            e.preventDefault();
            const btn = $("#f-entrar [type=submit]");
            const err = $("#error");
            err.textContent = "";
            btn.disabled = true;
            btn.textContent = "Entrando…";
            try{
                const r = await SB.entrar(email.value.trim(), $("#contrasena").value);
                guardarSesion(r);
                try{ localStorage.setItem("nalu_admin_correo", email.value.trim()); }catch(x){}
                await entrarAlPanel();
            }catch(e2){
                err.textContent = e2.status === 400
                    ? "Correo o contraseña incorrectos."
                    : textoError(e2);
                btn.disabled = false;
                btn.textContent = "Entrar";
            }
        });

        $("#olvide").addEventListener("click", pantallaRecuperar);
    }

    function ultimoCorreo(){
        try{ return localStorage.getItem("nalu_admin_correo") || ""; }catch(e){ return ""; }
    }

    function pantallaRecuperar(){
        acceso.innerHTML = `
            <h1>Recuperar acceso</h1>
            <p class="acceso-texto">Te enviamos un correo con un enlace para crear una contraseña nueva.</p>
            <form id="f-recuperar">
                <div class="campo">
                    <label for="email">Correo</label>
                    <input type="email" id="email" autocomplete="username" required value="${esc(ultimoCorreo())}">
                </div>
                <p class="error" id="error" role="alert"></p>
                <button class="btn btn--primario btn--bloque" type="submit">Enviar enlace</button>
            </form>
            <button class="enlace-texto" id="volver" type="button">Volver a entrar</button>`;

        $("#volver").addEventListener("click", () => pantallaEntrar());
        $("#f-recuperar").addEventListener("submit", async e => {
            e.preventDefault();
            const btn = $("#f-recuperar [type=submit]");
            btn.disabled = true;
            try{
                await SB.recuperar($("#email").value.trim(), location.origin + location.pathname);
                acceso.innerHTML = `
                    <h1>Revisa tu correo</h1>
                    <p class="acceso-texto">Si el correo es de un admin, te llegará un enlace para crear una contraseña nueva. Puede tardar unos minutos.</p>
                    <button class="btn btn--borde btn--bloque" id="volver">Volver a entrar</button>`;
                $("#volver").addEventListener("click", () => pantallaEntrar());
            }catch(e2){
                $("#error").textContent = textoError(e2);
                btn.disabled = false;
            }
        });
    }

    function pantallaNuevaContrasena(){
        acceso.innerHTML = `
            <h1>Contraseña nueva</h1>
            <p class="acceso-texto">Escribe la contraseña que usarás para entrar al panel.</p>
            <form id="f-nueva">
                <div class="campo">
                    <label for="p1">Contraseña nueva <small>(mínimo 8 caracteres)</small></label>
                    <input type="password" id="p1" minlength="8" autocomplete="new-password" required>
                </div>
                <div class="campo">
                    <label for="p2">Repite la contraseña</label>
                    <input type="password" id="p2" minlength="8" autocomplete="new-password" required>
                </div>
                <p class="error" id="error" role="alert"></p>
                <button class="btn btn--primario btn--bloque" type="submit">Guardar y entrar</button>
            </form>`;

        $("#f-nueva").addEventListener("submit", async e => {
            e.preventDefault();
            const err = $("#error");
            const p1 = $("#p1").value;
            if(p1.length < 8) return err.textContent = "Usa al menos 8 caracteres.";
            if(p1 !== $("#p2").value) return err.textContent = "Las contraseñas no coinciden.";
            try{
                await SB.cambiarContrasena(await token(), p1);
                await entrarAlPanel();
                avisar("Contraseña guardada.");
            }catch(e2){
                err.textContent = textoError(e2);
            }
        });
    }

    async function iniciar(){
        if(!SB.configurado) return pantallaSinConfigurar();

        // ¿Viene del enlace de recuperación del correo?
        const hash = new URLSearchParams(location.hash.slice(1));
        if(hash.get("access_token") && hash.get("type") === "recovery"){
            guardarSesion({
                access_token: hash.get("access_token"),
                refresh_token: hash.get("refresh_token"),
                expires_in: Number(hash.get("expires_in")) || 3600,
                user: {}
            });
            history.replaceState(null, "", location.pathname);
            return pantallaNuevaContrasena();
        }
        if(hash.get("error_description")){
            history.replaceState(null, "", location.pathname);
            return pantallaEntrar("El enlace ya no es válido. Pide uno nuevo.");
        }

        try{
            estado.sesion = JSON.parse(localStorage.getItem(SESION) || "null");
        }catch(e){ estado.sesion = null; }

        if(estado.sesion) return entrarAlPanel();
        pantallaEntrar();
    }

    function salir(){
        const t = estado.sesion?.token;
        borrarSesion();
        SB.salir(t);
        location.reload();
    }

    /* ----------------------------------------------------------------------
       Panel
       ---------------------------------------------------------------------- */

    async function entrarAlPanel(){
        acceso.innerHTML = `<p class="acceso-cargando">Cargando catálogo…</p>`;
        try{
            const t = await token();
            const esAdmin = await SB.consultar("rpc/es_admin", { metodo: "POST", datos: {}, token: t });
            if(esAdmin !== true){
                const correo = estado.sesion.email;
                borrarSesion();
                return pantallaEntrar(`${correo} no tiene permiso de admin. Agrégalo en la tabla admins de Supabase.`);
            }
            estado.catalogo = await SB.catalogo(t);
            estado.guardadoEnlaces = clonar({ enlaces: estado.catalogo.enlaces, tienda: estado.catalogo.tienda });
        }catch(e){
            if(e.status === 400 || e.status === 401) return expirada();
            acceso.innerHTML = `
                <h1>No se pudo cargar</h1>
                <p class="acceso-texto">${esc(textoError(e))}</p>
                <button class="btn btn--primario btn--bloque" onclick="location.reload()">Intentar de nuevo</button>`;
            return;
        }

        $("#acceso").hidden = true;
        $("#app").hidden = false;
        pintar();
    }

    function pintar(){
        $$(".pestanas [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === estado.tab));
        pintarEstado();
        pintarContenido();
    }

    function pintarContenido(){
        const c = $("#contenido");
        const pos = window.scrollY;
        if(estado.tab === "productos") c.innerHTML = vistaProductos();
        if(estado.tab === "colecciones") c.innerHTML = vistaColecciones();
        if(estado.tab === "enlaces") c.innerHTML = vistaEnlaces();
        if(estado.tab === "ajustes") c.innerHTML = vistaAjustes();
        window.scrollTo(0, pos);
    }

    // Imágenes: URL completa (Supabase) o ruta del sitio (img/…)
    function srcImagen(ruta){
        if(!ruta) return "";
        if(/^(https?:|data:|blob:)/.test(ruta)) return ruta;
        return "../" + ruta;
    }

    /* ----- Orden ----- */

    function filaProductoBD(p, orden){
        return {
            id: p.id, nombre: p.nombre, precio: p.precio, categoria: p.categoria,
            imagen: p.imagen, descripcion: p.descripcion || "",
            destacado: !!p.destacado, disponible: p.disponible !== false, orden
        };
    }

    function filaCategoriaBD(c, orden){
        return { id: c.id, nombre: c.nombre, descripcion: c.descripcion || "", imagen: c.imagen || "", orden };
    }

    async function mover(tipo, i, d){
        const lista = tipo === "productos" ? estado.catalogo.productos : estado.catalogo.categorias;
        const j = i + d;
        if(j < 0 || j >= lista.length) return;
        const antes = clonar(lista);
        [lista[i], lista[j]] = [lista[j], lista[i]];
        lista.forEach((x, n) => { x.orden = n + 1; });
        pintarContenido();
        const filas = tipo === "productos"
            ? lista.map((p, n) => filaProductoBD(p, n + 1))
            : lista.map((c, n) => filaCategoriaBD(c, n + 1));
        const ok = await guardando(async () => SB.guardar(tipo, filas, await token()));
        if(!ok){
            lista.splice(0, lista.length, ...antes);
            pintarContenido();
        }
    }

    /* ----- Productos ----- */

    function vistaProductos(){
        const { productos, categorias } = estado.catalogo;
        const q = estado.buscar.trim() ? slug(estado.buscar).replace(/-/g, " ") : "";
        const lista = productos
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => estado.filtroCat === "todas" || p.categoria === estado.filtroCat)
            .filter(({ p }) => !q || slug(p.nombre).replace(/-/g, " ").includes(q));
        const filtrando = estado.filtroCat !== "todas" || q;

        return `
        <section class="seccion-admin">
            <div class="cabeza">
                <div>
                    <h1>Productos</h1>
                    <p>${productos.length} en el catálogo · los favoritos aparecen en el inicio</p>
                </div>
                <button class="btn btn--primario" data-acc="nuevo-producto"${categorias.length ? "" : " disabled"}>
                    <i class="fa-solid fa-plus" aria-hidden="true"></i> Nuevo producto
                </button>
            </div>

            ${categorias.length ? "" : `<p class="nota-admin">Primero crea una colección en la pestaña <strong>Colecciones</strong>.</p>`}

            <div class="filtros">
                <select data-filtro="cat" aria-label="Filtrar por colección">
                    <option value="todas">Todas las colecciones</option>
                    ${categorias.map(c => `<option value="${esc(c.id)}"${c.id === estado.filtroCat ? " selected" : ""}>${esc(c.nombre)}</option>`).join("")}
                </select>
                <input type="search" data-filtro="buscar" placeholder="Buscar" value="${esc(estado.buscar)}" aria-label="Buscar producto">
            </div>

            <ul class="lista">
                ${lista.length ? lista.map(({ p, i }) => filaProducto(p, i, productos.length, filtrando)).join("") :
                    `<li class="lista-vacia">${productos.length ? "Ningún producto coincide con el filtro." : "Aún no hay productos. Agrega el primero."}</li>`}
            </ul>
        </section>`;
    }

    function filaProducto(p, i, total, filtrando){
        const cat = estado.catalogo.categorias.find(c => c.id === p.categoria);
        return `
        <li class="fila">
            <img src="${esc(srcImagen(p.imagen))}" alt="" class="fila-foto fila-foto--arco" loading="lazy">
            <div class="fila-texto">
                <strong>${esc(p.nombre)}</strong>
                <span>${precio(p.precio)} · ${esc(cat ? cat.nombre : "Sin colección")}</span>
                <span class="insignias">
                    ${p.destacado ? `<em class="insignia">Favorito</em>` : ""}
                    ${p.disponible === false ? `<em class="insignia insignia--gris">Agotado</em>` : ""}
                </span>
            </div>
            <div class="fila-acciones">
                ${filtrando ? "" : `
                <button class="icono-btn" data-acc="subir-producto" data-i="${i}" aria-label="Subir ${esc(p.nombre)}" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
                <button class="icono-btn" data-acc="bajar-producto" data-i="${i}" aria-label="Bajar ${esc(p.nombre)}" ${i === total - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>`}
                <button class="btn btn--borde btn--chico" data-acc="editar-producto" data-i="${i}">Editar</button>
            </div>
        </li>`;
    }

    function formProducto(i){
        const nuevo = i === undefined;
        const p = nuevo
            ? { nombre: "", precio: "", categoria: estado.filtroCat !== "todas" ? estado.filtroCat : estado.catalogo.categorias[0]?.id, descripcion: "", imagen: "", destacado: false, disponible: true }
            : estado.catalogo.productos[i];

        abrirDialogo(`
            <div class="dialogo-cabeza">
                <h2>${nuevo ? "Nuevo producto" : "Editar producto"}</h2>
                <button type="button" class="icono-btn" data-cerrar-dialogo aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="dialogo-cuerpo">
                ${campoFoto(p.imagen)}
                <div class="campo">
                    <label for="p-nombre">Nombre</label>
                    <input id="p-nombre" name="nombre" value="${esc(p.nombre)}" required maxlength="80">
                </div>
                <div class="dos">
                    <div class="campo">
                        <label for="p-precio">Precio (MXN)</label>
                        <input id="p-precio" name="precio" type="number" inputmode="decimal" min="0" step="0.5" value="${esc(p.precio)}" required>
                    </div>
                    <div class="campo">
                        <label for="p-cat">Colección</label>
                        <select id="p-cat" name="categoria" required>
                            ${estado.catalogo.categorias.map(c => `<option value="${esc(c.id)}"${c.id === p.categoria ? " selected" : ""}>${esc(c.nombre)}</option>`).join("")}
                        </select>
                    </div>
                </div>
                <div class="campo">
                    <label for="p-desc">Descripción <small>(opcional)</small></label>
                    <textarea id="p-desc" name="descripcion" maxlength="400">${esc(p.descripcion)}</textarea>
                </div>
                <label class="interruptor">
                    <input type="checkbox" name="destacado"${p.destacado ? " checked" : ""}>
                    <span>Mostrar en favoritos del inicio</span>
                </label>
                <label class="interruptor">
                    <input type="checkbox" name="disponible"${p.disponible !== false ? " checked" : ""}>
                    <span>Disponible para pedir</span>
                </label>
                <p class="error" role="alert"></p>
            </div>
            <div class="dialogo-pie">
                <button class="btn btn--primario" value="guardar">${nuevo ? "Agregar producto" : "Guardar cambios"}</button>
                ${nuevo ? "" : `<button class="btn btn--peligro" value="eliminar" formnovalidate>Eliminar</button>`}
            </div>`,
        async (accion, f) => {
            const lista = estado.catalogo.productos;

            if(accion === "eliminar"){
                if(!confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) return false;
                return guardando(async () => {
                    const t = await token();
                    await SB.borrar("productos", p.id, t);
                    await SB.borrarFoto(p.imagen, t);
                    lista.splice(lista.indexOf(p), 1);
                }, "Producto eliminado.");
            }

            const nombre = f.nombre.value.trim();
            const valorPrecio = parseFloat(f.precio.value);
            if(!nombre) return mostrarError(f, "Escribe el nombre del producto.");
            if(isNaN(valorPrecio) || valorPrecio < 0) return mostrarError(f, "Escribe un precio válido.");
            if(!p.imagen && !estado.foto) return mostrarError(f, "Agrega una foto del producto.");

            const id = nuevo ? idUnico(nombre, lista.map(x => x.id)) : p.id;
            const orden = nuevo ? Math.min(0, ...lista.map(x => x.orden || 0)) - 1 : p.orden;

            return guardando(async () => {
                const t = await token();
                let imagen = p.imagen;
                if(estado.foto){
                    imagen = await SB.subirFoto(`productos/${id}-${Date.now().toString(36)}.${estado.foto.ext}`, estado.foto.blob, t);
                }
                const fila = filaProductoBD({
                    id, nombre,
                    precio: Math.round(valorPrecio * 100) / 100,
                    categoria: f.categoria.value,
                    imagen,
                    descripcion: f.descripcion.value.trim(),
                    destacado: f.destacado.checked,
                    disponible: f.disponible.checked
                }, orden);
                const [guardado] = await SB.guardar("productos", [fila], t);
                if(estado.foto && p.imagen) await SB.borrarFoto(p.imagen, t);

                const limpio = { ...guardado, precio: Number(guardado.precio) };
                if(nuevo) lista.unshift(limpio);
                else Object.assign(p, limpio);
            }, nuevo ? "Producto agregado. Ya se ve en el sitio." : "Cambios guardados.");
        });
    }

    /* ----- Colecciones ----- */

    function vistaColecciones(){
        const { categorias, productos } = estado.catalogo;
        return `
        <section class="seccion-admin">
            <div class="cabeza">
                <div>
                    <h1>Colecciones</h1>
                    <p>Agrupan los productos y aparecen como filtros en el catálogo</p>
                </div>
                <button class="btn btn--primario" data-acc="nueva-coleccion">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i> Nueva colección
                </button>
            </div>
            <ul class="lista">
                ${categorias.length ? categorias.map((c, i) => {
                    const n = productos.filter(p => p.categoria === c.id).length;
                    return `
                    <li class="fila">
                        <img src="${esc(srcImagen(c.imagen))}" alt="" class="fila-foto fila-foto--arco" loading="lazy">
                        <div class="fila-texto">
                            <strong>${esc(c.nombre)}</strong>
                            <span>${n} ${n === 1 ? "producto" : "productos"}</span>
                        </div>
                        <div class="fila-acciones">
                            <button class="icono-btn" data-acc="subir-coleccion" data-i="${i}" aria-label="Subir ${esc(c.nombre)}" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
                            <button class="icono-btn" data-acc="bajar-coleccion" data-i="${i}" aria-label="Bajar ${esc(c.nombre)}" ${i === categorias.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
                            <button class="btn btn--borde btn--chico" data-acc="editar-coleccion" data-i="${i}">Editar</button>
                        </div>
                    </li>`;
                }).join("") : `<li class="lista-vacia">Aún no hay colecciones. Crea la primera.</li>`}
            </ul>
        </section>`;
    }

    function formColeccion(i){
        const nuevo = i === undefined;
        const c = nuevo ? { nombre: "", descripcion: "", imagen: "" } : estado.catalogo.categorias[i];
        const usados = nuevo ? [] : estado.catalogo.productos.filter(p => p.categoria === c.id);
        const otras = estado.catalogo.categorias.filter(x => x.id !== c.id);

        abrirDialogo(`
            <div class="dialogo-cabeza">
                <h2>${nuevo ? "Nueva colección" : "Editar colección"}</h2>
                <button type="button" class="icono-btn" data-cerrar-dialogo aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="dialogo-cuerpo">
                ${campoFoto(c.imagen)}
                <div class="campo">
                    <label for="c-nombre">Nombre</label>
                    <input id="c-nombre" name="nombre" value="${esc(c.nombre)}" required maxlength="50">
                </div>
                <div class="campo">
                    <label for="c-desc">Descripción <small>(opcional)</small></label>
                    <textarea id="c-desc" name="descripcion" maxlength="200">${esc(c.descripcion)}</textarea>
                </div>
                ${!nuevo && usados.length ? `
                <div class="campo">
                    <label for="c-mover">Si la eliminas, ${usados.length === 1 ? "su producto pasa" : `sus ${usados.length} productos pasan`} a</label>
                    <select id="c-mover" name="mover">
                        ${otras.map(o => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("")}
                        <option value="">${usados.length === 1 ? "Eliminar también su producto" : "Eliminar también sus productos"}</option>
                    </select>
                </div>` : ""}
                <p class="error" role="alert"></p>
            </div>
            <div class="dialogo-pie">
                <button class="btn btn--primario" value="guardar">${nuevo ? "Crear colección" : "Guardar cambios"}</button>
                ${nuevo ? "" : `<button class="btn btn--peligro" value="eliminar" formnovalidate>Eliminar</button>`}
            </div>`,
        async (accion, f) => {
            const cats = estado.catalogo.categorias;

            if(accion === "eliminar"){
                const destino = f.mover ? f.mover.value : "";
                const mensaje = usados.length
                    ? (destino
                        ? `¿Eliminar "${c.nombre}" y mover sus ${usados.length} productos?`
                        : `¿Eliminar "${c.nombre}" y sus ${usados.length} productos?`)
                    : `¿Eliminar la colección "${c.nombre}"?`;
                if(!confirm(mensaje)) return false;

                return guardando(async () => {
                    const t = await token();
                    if(usados.length && destino){
                        await SB.consultar(`productos?categoria=eq.${encodeURIComponent(c.id)}`, {
                            metodo: "PATCH", datos: { categoria: destino }, token: t
                        });
                        usados.forEach(p => { p.categoria = destino; });
                    }else if(usados.length){
                        await SB.consultar(`productos?categoria=eq.${encodeURIComponent(c.id)}`, { metodo: "DELETE", token: t });
                        for(const p of usados) await SB.borrarFoto(p.imagen, t);
                        estado.catalogo.productos = estado.catalogo.productos.filter(p => p.categoria !== c.id);
                    }
                    await SB.borrar("categorias", c.id, t);
                    await SB.borrarFoto(c.imagen, t);
                    cats.splice(cats.indexOf(c), 1);
                    if(estado.filtroCat === c.id) estado.filtroCat = "todas";
                }, "Colección eliminada.");
            }

            const nombre = f.nombre.value.trim();
            if(!nombre) return mostrarError(f, "Escribe el nombre de la colección.");
            if(!c.imagen && !estado.foto) return mostrarError(f, "Agrega una foto para la colección.");

            const id = nuevo ? idUnico(nombre, cats.map(x => x.id)) : c.id;
            const orden = nuevo ? Math.max(0, ...cats.map(x => x.orden || 0)) + 1 : c.orden;

            return guardando(async () => {
                const t = await token();
                let imagen = c.imagen;
                if(estado.foto){
                    imagen = await SB.subirFoto(`colecciones/${id}-${Date.now().toString(36)}.${estado.foto.ext}`, estado.foto.blob, t);
                }
                const [guardado] = await SB.guardar("categorias", [filaCategoriaBD({
                    id, nombre, imagen, descripcion: f.descripcion.value.trim()
                }, orden)], t);
                if(estado.foto && c.imagen) await SB.borrarFoto(c.imagen, t);

                if(nuevo) cats.push(guardado);
                else Object.assign(c, guardado);
            }, nuevo ? "Colección creada." : "Cambios guardados.");
        });
    }

    /* ----- Enlaces y WhatsApp ----- */

    const urlValida = u => !u || /^(https?:\/\/|mailto:|tel:)/.test(u);

    function ayudaWhatsApp(v){
        const n = String(v || "").replace(/\D/g, "");
        if(!n) return "Sin número, WhatsApp le pedirá al cliente elegir el contacto. En México: 52 + 10 dígitos.";
        if(n.length < 11) return "Parece incompleto. En México: 52 + 10 dígitos, sin espacios.";
        return "Los pedidos llegarán a +" + n + ".";
    }

    const enlacesCambiaron = () =>
        JSON.stringify({ enlaces: estado.catalogo.enlaces, tienda: estado.catalogo.tienda }) !== JSON.stringify(estado.guardadoEnlaces);

    function pintarBotonEnlaces(){
        const b = $("#guardar-enlaces");
        if(b) b.disabled = !enlacesCambiaron();
    }

    function vistaEnlaces(){
        const { tienda, enlaces } = estado.catalogo;
        return `
        <section class="seccion-admin">
            <div class="cabeza">
                <div>
                    <h1>Enlaces y WhatsApp</h1>
                    <p>Aparecen en Contacto, en el menú y en el pie de página</p>
                </div>
            </div>

            <div class="tarjeta">
                <h2>WhatsApp de pedidos</h2>
                <div class="campo">
                    <label for="t-wa">Número que recibe los pedidos</label>
                    <input id="t-wa" data-tienda="whatsapp" inputmode="tel" placeholder="526141234567" value="${esc(tienda.whatsapp)}">
                    <small class="ayuda">${ayudaWhatsApp(tienda.whatsapp)}</small>
                </div>
                <div class="campo">
                    <label for="t-msg">Primera línea del mensaje de pedido</label>
                    <input id="t-msg" data-tienda="mensajePedido" value="${esc(tienda.mensajePedido)}">
                </div>
            </div>

            <div class="tarjeta">
                <div class="tarjeta-cabeza">
                    <h2>Redes y enlaces</h2>
                    <button class="btn btn--borde btn--chico" data-acc="nuevo-enlace">
                        <i class="fa-solid fa-plus" aria-hidden="true"></i> Agregar enlace
                    </button>
                </div>
                <ul class="enlaces-admin">
                    ${enlaces.length ? enlaces.map((e, i) => `
                    <li class="enlace-admin">
                        <div class="dos">
                            <div class="campo">
                                <label for="e-tipo-${i}">Tipo</label>
                                <select id="e-tipo-${i}" data-enlace="${i}" data-campo="tipo">
                                    ${Object.entries(TIPOS_ENLACE).map(([k, v]) => `<option value="${k}"${k === e.tipo ? " selected" : ""}>${v}</option>`).join("")}
                                </select>
                            </div>
                            <div class="campo">
                                <label for="e-etq-${i}">Texto que se muestra</label>
                                <input id="e-etq-${i}" data-enlace="${i}" data-campo="etiqueta" value="${esc(e.etiqueta)}" placeholder="velasnalu_cuu">
                            </div>
                        </div>
                        <div class="campo">
                            <label for="e-url-${i}">Dirección (URL)</label>
                            <input id="e-url-${i}" data-enlace="${i}" data-campo="url" value="${esc(e.url)}" inputmode="url" placeholder="https://…">
                            <small class="ayuda ayuda--error" data-aviso-url${urlValida(e.url) ? " hidden" : ""}>Debe empezar con https://, mailto: o tel:</small>
                        </div>
                        <div class="enlace-admin-acciones">
                            <button class="icono-btn" data-acc="subir-enlace" data-i="${i}" aria-label="Subir" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
                            <button class="icono-btn" data-acc="bajar-enlace" data-i="${i}" aria-label="Bajar" ${i === enlaces.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
                            <button class="btn btn--peligro btn--chico" data-acc="quitar-enlace" data-i="${i}">Quitar</button>
                        </div>
                    </li>`).join("") : `<li class="lista-vacia">No hay enlaces. Agrega Instagram, Facebook o el que necesites.</li>`}
                </ul>
            </div>

            <div class="guardar-fijo">
                <button class="btn btn--primario" id="guardar-enlaces" data-acc="guardar-enlaces" ${enlacesCambiaron() ? "" : "disabled"}>Guardar cambios</button>
            </div>
        </section>`;
    }

    async function guardarEnlaces(){
        const { enlaces, tienda } = estado.catalogo;
        const malo = enlaces.find(e => !urlValida(e.url));
        if(malo){
            alert(`Revisa la dirección de "${malo.etiqueta || TIPOS_ENLACE[malo.tipo]}": debe empezar con https://, mailto: o tel:`);
            return;
        }
        const previos = estado.guardadoEnlaces.enlaces.map(e => e.id);
        const actuales = enlaces.map(e => e.id);

        await guardando(async () => {
            const t = await token();
            await SB.guardar("tienda", [{
                id: 1,
                nombre: tienda.nombre || "NALU Souvenirs",
                whatsapp: String(tienda.whatsapp || "").replace(/\D/g, ""),
                moneda: tienda.moneda || "MXN",
                mensaje_pedido: tienda.mensajePedido || ""
            }], t);
            if(enlaces.length){
                await SB.guardar("enlaces", enlaces.map((e, n) => ({
                    id: e.id, tipo: e.tipo, etiqueta: e.etiqueta.trim(), url: e.url.trim(), orden: n + 1
                })), t);
            }
            for(const id of previos.filter(x => !actuales.includes(x))){
                await SB.borrar("enlaces", id, t);
            }
            tienda.whatsapp = String(tienda.whatsapp || "").replace(/\D/g, "");
            estado.guardadoEnlaces = clonar({ enlaces, tienda });
        }, "Enlaces guardados. Ya se ven en el sitio.");
        pintarContenido();
    }

    /* ----- Ajustes ----- */

    function vistaAjustes(){
        return `
        <section class="seccion-admin">
            <div class="cabeza">
                <div>
                    <h1>Ajustes</h1>
                    <p>Tu acceso al panel</p>
                </div>
            </div>

            <form class="tarjeta" id="f-pass">
                <h2>Cambiar contraseña</h2>
                <p class="texto-tarjeta">Entras como <strong>${esc(estado.sesion?.email)}</strong>.</p>
                <div class="campo">
                    <label for="a-pass">Contraseña nueva <small>(mínimo 8 caracteres)</small></label>
                    <input type="password" id="a-pass" minlength="8" autocomplete="new-password" required>
                </div>
                <div class="campo">
                    <label for="a-pass2">Repite la contraseña</label>
                    <input type="password" id="a-pass2" minlength="8" autocomplete="new-password" required>
                </div>
                <p class="error" role="alert"></p>
                <button class="btn btn--primario" type="submit">Cambiar contraseña</button>
            </form>

            <div class="tarjeta">
                <h2>Sesión</h2>
                <p class="texto-tarjeta">Los cambios se guardan al momento en Supabase y se ven en el sitio al recargarlo.</p>
                <div class="botones">
                    <button class="btn btn--borde" data-acc="salir">Cerrar sesión</button>
                </div>
            </div>
        </section>`;
    }

    /* ----------------------------------------------------------------------
       Fotos
       ---------------------------------------------------------------------- */

    function campoFoto(ruta){
        return `
        <div class="foto-campo">
            <div class="foto-vista foto-vista--arco">
                ${ruta ? `<img src="${esc(srcImagen(ruta))}" alt="">` : `<span>Sin foto</span>`}
            </div>
            <div>
                <label class="btn btn--borde btn--chico foto-boton">
                    <i class="fa-solid fa-camera" aria-hidden="true"></i>
                    ${ruta ? "Cambiar foto" : "Elegir foto"}
                    <input type="file" accept="image/*" data-foto hidden>
                </label>
                <small class="ayuda">Se ajusta y comprime sola. Mejor vertical (4:5).</small>
            </div>
        </div>`;
    }

    function cargarImagen(archivo){
        return new Promise((ok, mal) => {
            const url = URL.createObjectURL(archivo);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); ok(img); };
            img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo leer la imagen. Prueba con JPG o PNG.")); };
            img.src = url;
        });
    }

    function aBlob(canvas, tipo, calidad){
        return new Promise(ok => canvas.toBlob(ok, tipo, calidad));
    }

    async function procesarFoto(archivo, max = 1200){
        const img = await cargarImagen(archivo);
        const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * escala);
        const h = Math.round(img.naturalHeight * escala);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let blob = await aBlob(canvas, "image/webp", .82);
        let ext = "webp";
        if(!blob || blob.type !== "image/webp"){
            blob = await aBlob(canvas, "image/jpeg", .85);
            ext = "jpg";
        }
        return { blob, ext, vista: URL.createObjectURL(blob) };
    }

    async function alElegirFoto(input){
        const archivo = input.files[0];
        if(!archivo) return;
        const vista = $(".foto-vista", input.form);
        vista.innerHTML = `<span>Procesando…</span>`;
        try{
            estado.foto = await procesarFoto(archivo);
            vista.innerHTML = `<img src="${estado.foto.vista}" alt="">`;
        }catch(e){
            estado.foto = null;
            vista.innerHTML = `<span>${esc(e.message)}</span>`;
        }
    }

    /* ----------------------------------------------------------------------
       Diálogo
       ---------------------------------------------------------------------- */

    let alGuardar = null;

    function abrirDialogo(html, callback){
        const d = $("#dialogo");
        const f = $("#dialogo-form");
        f.innerHTML = html;
        estado.foto = null;
        alGuardar = callback;
        d.showModal();
        $("input:not([type=file]), textarea", f)?.focus();
    }

    function mostrarError(f, texto){
        $(".error", f).textContent = texto;
        return false;
    }

    $("#dialogo-form").addEventListener("submit", async e => {
        e.preventDefault();
        if(estado.ocupado) return;
        const accion = e.submitter?.value || "guardar";
        const f = e.target;
        const botones = $$("button", f);
        botones.forEach(b => { b.disabled = true; });
        const ok = await alGuardar?.(accion, f);
        botones.forEach(b => { b.disabled = false; });
        if(ok){
            $("#dialogo").close();
            pintarContenido();
        }
    });

    $("#dialogo").addEventListener("close", () => {
        if(estado.foto?.vista) URL.revokeObjectURL(estado.foto.vista);
        estado.foto = null;
    });

    $("#dialogo").addEventListener("click", e => {
        if(estado.ocupado) return;
        if(e.target === $("#dialogo") || e.target.closest("[data-cerrar-dialogo]")) $("#dialogo").close();
    });

    /* ----------------------------------------------------------------------
       Eventos
       ---------------------------------------------------------------------- */

    function moverEnlace(i, d){
        const l = estado.catalogo.enlaces;
        const j = i + d;
        if(j < 0 || j >= l.length) return;
        [l[i], l[j]] = [l[j], l[i]];
        pintarContenido();
    }

    document.addEventListener("click", e => {
        const tab = e.target.closest(".pestanas [data-tab]");
        if(tab){
            if(estado.tab === "enlaces" && tab.dataset.tab !== "enlaces" && enlacesCambiaron()
               && !confirm("Tienes cambios sin guardar en Enlaces. ¿Salir sin guardar?")) return;
            if(estado.tab === "enlaces" && tab.dataset.tab !== "enlaces" && enlacesCambiaron()){
                Object.assign(estado.catalogo, clonar(estado.guardadoEnlaces));
            }
            estado.tab = tab.dataset.tab;
            pintar();
            window.scrollTo(0, 0);
            return;
        }

        const el = e.target.closest("[data-acc]");
        if(!el || el.disabled) return;
        const i = el.dataset.i !== undefined ? Number(el.dataset.i) : undefined;
        const cat = estado.catalogo;

        switch(el.dataset.acc){
            case "nuevo-producto":   formProducto(); break;
            case "editar-producto":  formProducto(i); break;
            case "subir-producto":   mover("productos", i, -1); break;
            case "bajar-producto":   mover("productos", i, 1); break;
            case "nueva-coleccion":  formColeccion(); break;
            case "editar-coleccion": formColeccion(i); break;
            case "subir-coleccion":  mover("categorias", i, -1); break;
            case "bajar-coleccion":  mover("categorias", i, 1); break;
            case "nuevo-enlace":
                cat.enlaces.push({ id: "enlace-" + Date.now().toString(36), tipo: "instagram", etiqueta: "", url: "" });
                pintarContenido();
                $$(".enlace-admin").pop()?.querySelector("input")?.focus();
                break;
            case "quitar-enlace":
                cat.enlaces.splice(i, 1);
                pintarContenido();
                break;
            case "subir-enlace":     moverEnlace(i, -1); break;
            case "bajar-enlace":     moverEnlace(i, 1); break;
            case "guardar-enlaces":  guardarEnlaces(); break;
            case "salir":            salir(); break;
        }
    });

    document.addEventListener("input", e => {
        const t = e.target;

        if(t.dataset.filtro === "buscar"){
            estado.buscar = t.value;
            const pos = t.selectionStart;
            pintarContenido();
            const nuevo = $("[data-filtro=buscar]");
            nuevo.focus();
            nuevo.setSelectionRange(pos, pos);
            return;
        }

        if(t.dataset.tienda){
            estado.catalogo.tienda[t.dataset.tienda] = t.value;
            if(t.dataset.tienda === "whatsapp"){
                t.parentElement.querySelector(".ayuda").textContent = ayudaWhatsApp(t.value);
            }
            pintarBotonEnlaces();
            return;
        }

        if(t.dataset.enlace !== undefined){
            const enlace = estado.catalogo.enlaces[Number(t.dataset.enlace)];
            enlace[t.dataset.campo] = t.dataset.campo === "url" ? t.value.trim() : t.value;
            if(t.dataset.campo === "url"){
                t.parentElement.querySelector("[data-aviso-url]").hidden = urlValida(enlace.url);
            }
            pintarBotonEnlaces();
        }
    });

    document.addEventListener("change", e => {
        const t = e.target;
        if(t.dataset.filtro === "cat"){
            estado.filtroCat = t.value;
            pintarContenido();
        }
        if(t.matches("[data-foto]")) alElegirFoto(t);
    });

    document.addEventListener("submit", async e => {
        if(e.target.id !== "f-pass") return;
        e.preventDefault();
        const f = e.target;
        const err = $(".error", f);
        const p1 = $("#a-pass").value;
        err.textContent = "";
        if(p1.length < 8) return err.textContent = "Usa al menos 8 caracteres.";
        if(p1 !== $("#a-pass2").value) return err.textContent = "Las contraseñas no coinciden.";
        const ok = await guardando(async () => SB.cambiarContrasena(await token(), p1), "Contraseña cambiada.");
        if(ok) f.reset();
    });

    window.addEventListener("beforeunload", e => {
        if(estado.catalogo && enlacesCambiaron()){
            e.preventDefault();
            e.returnValue = "";
        }
    });

    iniciar();

})();
