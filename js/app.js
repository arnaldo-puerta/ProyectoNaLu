/* ==========================================================================
   NALU · Lógica compartida del sitio
   - Carga el catálogo desde Supabase (o data/catalogo.json de respaldo)
   - Carrito guardado en el navegador
   - Pedidos por WhatsApp (carrito completo o "Pedir ahora")
   ========================================================================== */

(function(){

    const BASE = document.body.dataset.base || "";
    const CLAVE_CARRITO = "nalu_carrito";
    const CLAVE_DATOS = "nalu_datos_pedido";

    const ICONOS = {
        instagram: "fa-brands fa-instagram",
        facebook:  "fa-brands fa-facebook-f",
        tiktok:    "fa-brands fa-tiktok",
        whatsapp:  "fa-brands fa-whatsapp",
        pinterest: "fa-brands fa-pinterest-p",
        youtube:   "fa-brands fa-youtube",
        web:       "fa-solid fa-globe",
        ubicacion: "fa-solid fa-location-dot",
        correo:    "fa-regular fa-envelope",
        telefono:  "fa-solid fa-phone",
        otro:      "fa-solid fa-link"
    };

    let datos = { tienda: {}, enlaces: [], categorias: [], productos: [] };

    /* ----------------------------------------------------------------------
       Utilidades
       ---------------------------------------------------------------------- */

    const $  = (sel, raiz = document) => raiz.querySelector(sel);
    const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

    function leer(clave, porDefecto){
        try{
            const v = localStorage.getItem(clave);
            return v ? JSON.parse(v) : porDefecto;
        }catch(e){
            return porDefecto;
        }
    }

    function guardar(clave, valor){
        try{ localStorage.setItem(clave, JSON.stringify(valor)); }catch(e){}
    }

    function esc(t){
        return String(t ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function precio(n){
        return "$" + Number(n || 0).toLocaleString("es-MX") + " " + (datos.tienda.moneda || "MXN");
    }

    // Rutas relativas del catálogo -> rutas para la página actual
    function ruta(src){
        if(!src) return "";
        if(/^(https?:|data:|blob:)/.test(src)) return src;
        return BASE + src;
    }

    const producto  = id => datos.productos.find(p => p.id === id);
    const categoria = id => datos.categorias.find(c => c.id === id);
    const disponible = p => p && p.disponible !== false;

    function icono(tipo){
        return ICONOS[tipo] || ICONOS.otro;
    }

    /* ----------------------------------------------------------------------
       Carrito  [{ id, cantidad }]
       ---------------------------------------------------------------------- */

    let carrito = leer(CLAVE_CARRITO, []);

    function limpiarCarrito(){
        carrito = carrito.filter(i => disponible(producto(i.id)) && i.cantidad > 0);
    }

    function cambio(){
        guardar(CLAVE_CARRITO, carrito);
        pintarContadores();
        pintarPanel();
        document.dispatchEvent(new CustomEvent("carrito:cambio"));
    }

    function agregar(id, cantidad = 1){
        if(!disponible(producto(id))) return;
        const item = carrito.find(i => i.id === id);
        if(item) item.cantidad += cantidad;
        else carrito.push({ id, cantidad });
        cambio();
    }

    function fijarCantidad(id, cantidad){
        if(cantidad <= 0) return quitar(id);
        const item = carrito.find(i => i.id === id);
        if(item){ item.cantidad = cantidad; cambio(); }
    }

    function quitar(id){
        carrito = carrito.filter(i => i.id !== id);
        cambio();
    }

    function vaciar(){
        carrito = [];
        cambio();
    }

    function items(){
        return carrito
            .map(i => ({ ...producto(i.id), cantidad: i.cantidad }))
            .filter(i => i.id);
    }

    const piezas = () => carrito.reduce((s, i) => s + i.cantidad, 0);
    const total  = () => items().reduce((s, i) => s + i.precio * i.cantidad, 0);

    const datosCliente = () => leer(CLAVE_DATOS, {});
    const guardarDatosCliente = d => guardar(CLAVE_DATOS, d);

    /* ----------------------------------------------------------------------
       WhatsApp
       ---------------------------------------------------------------------- */

    function numeroWhatsApp(){
        return String(datos.tienda.whatsapp || "").replace(/\D/g, "");
    }

    function urlWhatsApp(texto){
        // encodeURIComponent (no URLSearchParams) para que los espacios
        // viajen como %20 y no como "+", que algunas versiones muestran literal
        const partes = [];
        const n = numeroWhatsApp();
        if(n) partes.push("phone=" + n);
        if(texto) partes.push("text=" + encodeURIComponent(texto));
        return "https://api.whatsapp.com/send?" + partes.join("&");
    }

    function abrirWhatsApp(texto){
        window.open(urlWhatsApp(texto), "_blank", "noopener");
    }

    function lineas(lista){
        return lista.map(i => `• ${i.cantidad} x ${i.nombre} — ${precio(i.precio * i.cantidad)}`);
    }

    function mensajeCarrito(d = datosCliente()){
        const partes = [
            datos.tienda.mensajePedido || "¡Hola! Me gustaría hacer el siguiente pedido:",
            "",
            ...lineas(items()),
            "",
            `*Total: ${precio(total())}*`
        ];
        const extra = [];
        if(d.nombre)  extra.push(`*Nombre:* ${d.nombre}`);
        if(d.entrega) extra.push(`*Entrega:* ${d.entrega}`);
        if(d.direccion) extra.push(`*Dirección:* ${d.direccion}`);
        if(d.fecha)   extra.push(`*Fecha deseada:* ${d.fecha}`);
        if(d.notas)   extra.push(`*Notas:* ${d.notas}`);
        if(extra.length) partes.push("", ...extra);
        return partes.join("\n");
    }

    function mensajeProducto(id, cantidad = 1){
        const p = producto(id);
        if(!disponible(p)){
            return `¡Hola NALU! Me interesa *${p.nombre}*. ¿Cuándo vuelve a estar disponible?`;
        }
        return [
            "¡Hola NALU! Me gustaría pedir:",
            "",
            ...lineas([{ ...p, cantidad }]),
            "",
            `*Total: ${precio(p.precio * cantidad)}*`,
            "",
            "¿Me confirman disponibilidad y tiempo de entrega?"
        ].join("\n");
    }

    function enviarCarrito(d){
        if(!carrito.length) return;
        abrirWhatsApp(mensajeCarrito(d));
    }

    function pedirAhora(id, cantidad = 1){
        if(!producto(id)) return;
        abrirWhatsApp(mensajeProducto(id, cantidad));
    }

    /* ----------------------------------------------------------------------
       Plantillas
       ---------------------------------------------------------------------- */

    function tarjeta(p){
        const ok = disponible(p);
        return `
        <article class="producto${ok ? "" : " producto-agotado"}">
            <button class="producto-foto" data-accion="ver" data-id="${esc(p.id)}" aria-label="Ver ${esc(p.nombre)}">
                <img src="${esc(ruta(p.imagen))}" alt="${esc(p.nombre)}" loading="lazy" decoding="async">
                ${ok ? "" : `<span class="etiqueta">Agotado</span>`}
            </button>
            <div class="producto-datos">
                <h3>${esc(p.nombre)}</h3>
                <span class="producto-precio">${precio(p.precio)}</span>
            </div>
            <div class="producto-acciones">
                <button class="btn btn--primario" data-accion="pedir" data-id="${esc(p.id)}">
                    ${ok ? "Pedir ahora" : "Consultar"}
                </button>
                ${ok ? `
                <button class="icono-btn" data-accion="agregar" data-id="${esc(p.id)}" aria-label="Agregar ${esc(p.nombre)} al carrito" title="Agregar al carrito">
                    <i class="fa-solid fa-bag-shopping"></i>
                </button>` : ""}
            </div>
        </article>`;
    }

    function renglon(i){
        return `
        <div class="renglon">
            <img src="${esc(ruta(i.imagen))}" alt="">
            <div>
                <h3>${esc(i.nombre)}</h3>
                <span class="unitario">${precio(i.precio)} c/u</span>
                <div class="cantidad">
                    <button type="button" data-accion="menos" data-id="${esc(i.id)}" aria-label="Quitar uno de ${esc(i.nombre)}">−</button>
                    <output>${i.cantidad}</output>
                    <button type="button" data-accion="mas" data-id="${esc(i.id)}" aria-label="Agregar uno de ${esc(i.nombre)}">+</button>
                </div>
            </div>
            <div class="renglon-lado">
                <strong>${precio(i.precio * i.cantidad)}</strong>
                <button type="button" class="quitar" data-accion="quitar" data-id="${esc(i.id)}">Quitar</button>
            </div>
        </div>`;
    }

    function carritoVacio(){
        return `
        <div class="carrito-vacio">
            <h3>Tu carrito está vacío</h3>
            <p>Agrega velas, aromas o arreglos y envía tu pedido en un solo mensaje.</p>
            <a class="btn btn--primario" href="${BASE}paginas/coleccion.html">Ver colección</a>
        </div>`;
    }

    function enlaceHTML(e, clase = "enlace"){
        const externo = /^https?:/.test(e.url);
        return `<a class="${clase}" href="${esc(e.url)}"${externo ? ' target="_blank" rel="noopener"' : ""}>
            <i class="${icono(e.tipo)}" aria-hidden="true"></i>
            <span>${esc(e.etiqueta || e.tipo)}</span>
        </a>`;
    }

    // Enlaces + WhatsApp (si hay número y no está ya en la lista)
    function todosLosEnlaces(){
        const lista = (datos.enlaces || []).filter(e => e.url);
        if(numeroWhatsApp() && !lista.some(e => e.tipo === "whatsapp")){
            lista.unshift({ tipo: "whatsapp", etiqueta: "WhatsApp", url: urlWhatsApp("") });
        }
        return lista;
    }

    /* ----------------------------------------------------------------------
       Encabezado, menú y enlaces
       ---------------------------------------------------------------------- */

    function prepararEncabezado(){
        const enc = $(".encabezado");
        if(!enc) return;

        if(document.body.hasAttribute("data-portada")){
            const actualizar = () => enc.classList.toggle("sobre-portada", window.scrollY < 40 && !document.body.classList.contains("menu-abierto"));
            actualizar();
            window.addEventListener("scroll", actualizar, { passive: true });
            document.addEventListener("menu:cambio", actualizar);
        }

        const menu = $(".menu-movil");
        if(menu){
            const abrir = v => {
                menu.classList.toggle("abierto", v);
                document.body.classList.toggle("bloqueado", v);
                document.body.classList.toggle("menu-abierto", v);
                $(".btn-menu")?.setAttribute("aria-expanded", v);
                document.dispatchEvent(new Event("menu:cambio"));
            };
            $(".btn-menu")?.addEventListener("click", () => abrir(true));
            $(".menu-movil .cerrar")?.addEventListener("click", () => abrir(false));
            $$(".menu-movil a").forEach(a => a.addEventListener("click", () => abrir(false)));
            document.addEventListener("keydown", e => { if(e.key === "Escape") abrir(false); });
        }
    }

    function pintarEnlaces(){
        const lista = todosLosEnlaces();

        $$("[data-enlaces]").forEach(el => {
            el.innerHTML = lista.map(e => enlaceHTML(e)).join("");
        });

        $$("[data-redes]").forEach(el => {
            el.innerHTML = lista.map(e => {
                const externo = /^https?:/.test(e.url);
                return `<a href="${esc(e.url)}"${externo ? ' target="_blank" rel="noopener"' : ""} aria-label="${esc(e.etiqueta || e.tipo)}">
                    <i class="${icono(e.tipo)}" aria-hidden="true"></i>
                </a>`;
            }).join("");
        });

        // Enlace de Instagram del encabezado
        const ig = lista.find(e => e.tipo === "instagram");
        $$("[data-instagram]").forEach(a => {
            if(ig){ a.href = ig.url; a.hidden = false; }
            else a.hidden = true;
        });
    }

    /* ----------------------------------------------------------------------
       Contadores y barra flotante
       ---------------------------------------------------------------------- */

    function pintarContadores(){
        const n = piezas();
        $$(".contador").forEach(el => {
            el.textContent = n > 99 ? "99+" : n;
            el.classList.toggle("visible", n > 0);
        });

        const barra = $(".barra-pedido");
        if(barra){
            const ver = n > 0 && !document.body.hasAttribute("data-sin-barra");
            barra.classList.toggle("visible", ver);
            document.body.classList.toggle("con-barra", ver);
            $(".barra-pedido [data-resumen]").textContent =
                `${n} ${n === 1 ? "pieza" : "piezas"} · ${precio(total())}`;
        }
    }

    /* ----------------------------------------------------------------------
       Panel del carrito
       ---------------------------------------------------------------------- */

    const velo = document.createElement("div");
    velo.className = "velo";

    const panel = document.createElement("aside");
    panel.className = "panel panel--carrito";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Carrito");
    panel.innerHTML = `
        <div class="asa" aria-hidden="true"></div>
        <div class="panel-cabeza">
            <h2>Tu carrito</h2>
            <button class="icono-btn" data-accion="cerrar" aria-label="Cerrar carrito">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="panel-cuerpo"></div>
        <div class="panel-pie"></div>`;

    const vista = document.createElement("aside");
    vista.className = "panel panel--producto";
    vista.setAttribute("role", "dialog");
    vista.setAttribute("aria-modal", "true");

    const aviso = document.createElement("div");
    aviso.className = "aviso";
    aviso.setAttribute("role", "status");

    const barra = document.createElement("div");
    barra.className = "barra-pedido";
    barra.innerHTML = `
        <span data-resumen></span>
        <button class="btn btn--claro" data-accion="abrir-carrito">Ver pedido</button>`;

    document.body.append(velo, panel, vista, aviso, barra);

    let ultimoFoco = null;

    function abrirPanel(el){
        cerrarTodo(false);
        ultimoFoco = document.activeElement;
        el.classList.add("abierto");
        velo.classList.add("abierto");
        document.body.classList.add("bloqueado");
        setTimeout(() => el.querySelector("[data-accion=cerrar]")?.focus({ preventScroll: true }), 50);
    }

    function cerrarTodo(devolverFoco = true){
        const habia = panel.classList.contains("abierto") || vista.classList.contains("abierto");
        panel.classList.remove("abierto");
        vista.classList.remove("abierto");
        velo.classList.remove("abierto");
        if(!document.body.classList.contains("menu-abierto")){
            document.body.classList.remove("bloqueado");
        }
        if(habia && devolverFoco && ultimoFoco) ultimoFoco.focus?.({ preventScroll: true });
    }

    function pintarPanel(){
        const cuerpo = $(".panel-cuerpo", panel);
        const pie = $(".panel-pie", panel);
        const lista = items();

        if(!lista.length){
            cuerpo.innerHTML = carritoVacio();
            pie.innerHTML = "";
            return;
        }

        cuerpo.innerHTML = lista.map(renglon).join("");
        pie.innerHTML = `
            <div class="total"><span>Total</span><strong>${precio(total())}</strong></div>
            <button class="btn btn--wa btn--bloque" data-accion="enviar">
                <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
                Enviar pedido por WhatsApp
            </button>
            <a class="btn btn--borde btn--bloque" href="${BASE}paginas/carrito.html">Agregar datos de entrega</a>`;
    }

    /* ----------------------------------------------------------------------
       Vista de producto
       ---------------------------------------------------------------------- */

    let vistaId = null;
    let vistaCant = 1;

    function pintarVista(){
        const p = producto(vistaId);
        const ok = disponible(p);
        const cat = categoria(p.categoria);
        vista.setAttribute("aria-label", p.nombre);
        vista.innerHTML = `
        <div class="vista">
            <figure>
                <img src="${esc(ruta(p.imagen))}" alt="${esc(p.nombre)}">
                <button class="icono-btn cerrar" data-accion="cerrar" aria-label="Cerrar">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </figure>
            <div class="vista-texto">
                ${cat ? `<span class="vista-cat">${esc(cat.nombre)}</span>` : ""}
                <h2>${esc(p.nombre)}</h2>
                <span class="vista-precio">${precio(p.precio)}</span>
                ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ""}
                ${ok ? `
                <div class="vista-fila">
                    <div class="cantidad cantidad--grande" aria-label="Cantidad">
                        <button type="button" data-accion="vista-menos" aria-label="Menos">−</button>
                        <output>${vistaCant}</output>
                        <button type="button" data-accion="vista-mas" aria-label="Más">+</button>
                    </div>
                </div>
                <div class="vista-fila">
                    <button class="btn btn--borde" data-accion="vista-agregar">Agregar al carrito</button>
                    <button class="btn btn--primario" data-accion="vista-pedir">Pedir ahora</button>
                </div>` : `
                <p class="aviso-agotado">Por ahora está agotado. Pregúntanos cuándo vuelve.</p>
                <div class="vista-fila">
                    <button class="btn btn--wa" data-accion="vista-pedir">
                        <i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Consultar
                    </button>
                </div>`}
            </div>
        </div>`;
    }

    function abrirVista(id){
        if(!producto(id)) return;
        vistaId = id;
        vistaCant = 1;
        pintarVista();
        vista.scrollTop = 0;
        abrirPanel(vista);
    }

    /* ----------------------------------------------------------------------
       Aviso
       ---------------------------------------------------------------------- */

    let avisoTimer;

    function avisar(html){
        aviso.innerHTML = html;
        aviso.classList.add("visible");
        clearTimeout(avisoTimer);
        avisoTimer = setTimeout(() => aviso.classList.remove("visible"), 3000);
    }

    function avisoAgregado(id, cant){
        const p = producto(id);
        avisar(`<span>${esc(p.nombre)}${cant > 1 ? " x" + cant : ""} en tu carrito</span>
            <button class="btn btn--claro" data-accion="abrir-carrito">Ver carrito</button>`);
        $$(`.icono-btn[data-accion=agregar][data-id="${CSS.escape(id)}"]`).forEach(b => {
            b.classList.add("agregado");
            setTimeout(() => b.classList.remove("agregado"), 900);
        });
    }

    /* ----------------------------------------------------------------------
       Eventos
       ---------------------------------------------------------------------- */

    document.addEventListener("click", e => {

        if(e.target.closest("[data-abrir-carrito]")){
            e.preventDefault();
            abrirPanel(panel);
            return;
        }

        if(e.target === velo){
            cerrarTodo();
            return;
        }

        const el = e.target.closest("[data-accion]");
        if(!el) return;
        const id = el.dataset.id;
        const item = carrito.find(i => i.id === id);

        switch(el.dataset.accion){
            case "agregar":       agregar(id); avisoAgregado(id, 1); break;
            case "pedir":         pedirAhora(id); break;
            case "ver":           abrirVista(id); break;
            case "mas":           fijarCantidad(id, (item?.cantidad || 0) + 1); break;
            case "menos":         fijarCantidad(id, (item?.cantidad || 0) - 1); break;
            case "quitar":        quitar(id); break;
            case "enviar":        enviarCarrito(); break;
            case "cerrar":        cerrarTodo(); break;
            case "abrir-carrito": aviso.classList.remove("visible"); abrirPanel(panel); break;
            case "vista-mas":     vistaCant = Math.min(999, vistaCant + 1); $("output", vista).textContent = vistaCant; break;
            case "vista-menos":   vistaCant = Math.max(1, vistaCant - 1); $("output", vista).textContent = vistaCant; break;
            case "vista-agregar": agregar(vistaId, vistaCant); cerrarTodo(); avisoAgregado(vistaId, vistaCant); break;
            case "vista-pedir":   pedirAhora(vistaId, vistaCant); break;
        }
    });

    document.addEventListener("keydown", e => {
        if(e.key === "Escape") cerrarTodo();
    });

    window.addEventListener("storage", e => {
        if(e.key === CLAVE_CARRITO){
            carrito = leer(CLAVE_CARRITO, []);
            limpiarCarrito();
            pintarContadores();
            pintarPanel();
            document.dispatchEvent(new CustomEvent("carrito:cambio"));
        }
    });

    /* ----------------------------------------------------------------------
       Carga del catálogo
       ---------------------------------------------------------------------- */

    prepararEncabezado();

    // Con Supabase configurado (js/config.js) se lee la base de datos;
    // si no, el respaldo data/catalogo.json.
    function cargarCatalogo(){
        if(window.SB && SB.configurado) return SB.catalogo();
        return fetch(BASE + "data/catalogo.json?v=" + Date.now(), { cache: "no-store" })
            .then(r => {
                if(!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            });
    }

    const listo = cargarCatalogo()
        .then(json => {
            datos = {
                tienda: json.tienda || {},
                enlaces: json.enlaces || [],
                categorias: json.categorias || [],
                productos: json.productos || []
            };
            limpiarCarrito();
            guardar(CLAVE_CARRITO, carrito);
            pintarEnlaces();
            pintarContadores();
            pintarPanel();
            return datos;
        })
        .catch(err => {
            console.error("No se pudo cargar el catálogo", err);
            $$("[data-error-catalogo]").forEach(el => {
                el.innerHTML = `<p class="vacio">No pudimos cargar los productos. Recarga la página o escríbenos por WhatsApp.</p>`;
            });
            pintarPanel();
            throw err;
        });

    /* ----------------------------------------------------------------------
       API para las páginas
       ---------------------------------------------------------------------- */

    window.NALU = {
        listo,
        get datos(){ return datos; },
        BASE, $, $$, esc, precio, ruta, producto, categoria, disponible, tarjeta, renglon, carritoVacio,
        items, total, piezas, agregar, fijarCantidad, quitar, vaciar,
        datosCliente, guardarDatosCliente, enviarCarrito, pedirAhora, abrirWhatsApp,
        abrirCarrito: () => abrirPanel(panel)
    };

})();
