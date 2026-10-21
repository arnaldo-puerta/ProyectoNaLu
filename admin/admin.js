/* ==========================================================================
   NALU · Administración
   Guarda los cambios directamente en el repositorio de GitHub, de donde
   GitHub Pages publica el sitio. El token de GitHub se guarda cifrado con
   la contraseña del admin en data/admin.json (AES-GCM + PBKDF2).
   ========================================================================== */

(function(){

    /* Repositorio por defecto. Si el sitio está en <usuario>.github.io/<repo>
       se detecta solo; si usas un dominio propio, ajusta estos valores. */
    const REPO_POR_DEFECTO = {
        owner: "arnaldo-puerta",
        repo: "ProyectoNaLu",
        branch: "main"
    };

    const RUTA_CATALOGO = "data/catalogo.json";
    const RUTA_ADMIN = "data/admin.json";
    const CARPETA_SUBIDAS = "img/subidas/";
    const ITERACIONES = 310000;
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

    /* ----------------------------------------------------------------------
       Base64 y cifrado
       ---------------------------------------------------------------------- */

    function bytesA64(bytes){
        let bin = "";
        const paso = 0x8000;
        for(let i = 0; i < bytes.length; i += paso){
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
        }
        return btoa(bin);
    }

    function b64ABytes(b64){
        const bin = atob(b64.replace(/\s/g, ""));
        const out = new Uint8Array(bin.length);
        for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    const textoA64 = t => bytesA64(new TextEncoder().encode(t));
    const b64ATexto = b => new TextDecoder().decode(b64ABytes(b));

    async function clave(contrasena, sal, iteraciones){
        const base = await crypto.subtle.importKey(
            "raw", new TextEncoder().encode(contrasena), "PBKDF2", false, ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: sal, iterations: iteraciones, hash: "SHA-256" },
            base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    }

    async function cifrar(texto, contrasena){
        const sal = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const k = await clave(contrasena, sal, ITERACIONES);
        const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(texto));
        return { sal: bytesA64(sal), iv: bytesA64(iv), iteraciones: ITERACIONES, datos: bytesA64(new Uint8Array(datos)) };
    }

    async function descifrar(c, contrasena){
        const k = await clave(contrasena, b64ABytes(c.sal), c.iteraciones);
        const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ABytes(c.iv) }, k, b64ABytes(c.datos));
        return new TextDecoder().decode(plano);
    }

    /* ----------------------------------------------------------------------
       GitHub
       ---------------------------------------------------------------------- */

    class GitHub{
        constructor({ owner, repo, branch }, token){
            Object.assign(this, { owner, repo, branch, token });
        }

        async pedir(ruta, opciones = {}){
            const r = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${ruta}`, {
                ...opciones,
                headers: {
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    ...(this.token ? { "Authorization": "Bearer " + this.token } : {}),
                    ...(opciones.body ? { "Content-Type": "application/json" } : {})
                },
                cache: "no-store"
            });
            if(r.status === 404) return null;
            const json = await r.json().catch(() => ({}));
            if(!r.ok){
                const e = new Error(json.message || "Error " + r.status);
                e.status = r.status;
                throw e;
            }
            return json;
        }

        repoInfo(){
            return this.pedir("");
        }

        async leer(ruta){
            const j = await this.pedir(`/contents/${ruta}?ref=${encodeURIComponent(this.branch)}`);
            if(!j) return null;
            // Archivos de más de 1 MB no traen contenido: se pide como blob
            let contenido = j.content;
            if(!contenido && j.sha){
                const blob = await this.pedir(`/git/blobs/${j.sha}`);
                contenido = blob.content;
            }
            return { sha: j.sha, texto: b64ATexto(contenido || "") };
        }

        escribir(ruta, base64, mensaje, sha){
            return this.pedir(`/contents/${ruta}`, {
                method: "PUT",
                body: JSON.stringify({ message: mensaje, content: base64, branch: this.branch, ...(sha ? { sha } : {}) })
            });
        }

        async borrar(ruta, mensaje){
            const j = await this.pedir(`/contents/${ruta}?ref=${encodeURIComponent(this.branch)}`);
            if(!j) return;
            return this.pedir(`/contents/${ruta}`, {
                method: "DELETE",
                body: JSON.stringify({ message: mensaje, sha: j.sha, branch: this.branch })
            });
        }
    }

    function repoDetectado(){
        const host = location.hostname;
        const m = host.match(/^([^.]+)\.github\.io$/i);
        if(m){
            const primera = location.pathname.split("/").filter(Boolean)[0];
            if(primera && primera !== "admin"){
                return { owner: m[1], repo: primera, branch: REPO_POR_DEFECTO.branch };
            }
            return { owner: m[1], repo: `${m[1]}.github.io`, branch: REPO_POR_DEFECTO.branch };
        }
        return { ...REPO_POR_DEFECTO };
    }

    function textoError(e){
        if(!navigator.onLine) return "No hay conexión a internet.";
        if(e.status === 401) return "GitHub rechazó el token. Puede estar vencido o mal copiado.";
        if(e.status === 403) return "El token no tiene permiso para escribir en el repositorio (Contents: Read and write).";
        if(e.status === 409) return "Alguien más guardó cambios al mismo tiempo. Recarga la página e intenta de nuevo.";
        if(e.status === 422) return "GitHub no aceptó el archivo: " + e.message;
        return e.message || "Ocurrió un error inesperado.";
    }

    /* ----------------------------------------------------------------------
       Estado
       ---------------------------------------------------------------------- */

    const estado = {
        repo: repoDetectado(),
        admin: null,          // contenido de data/admin.json
        adminSha: null,
        gh: null,
        catalogo: null,       // copia de trabajo
        catalogoSha: null,
        original: "",         // JSON publicado, para saber si hay cambios
        imagenes: new Map(),  // ruta -> dataURL de imágenes nuevas aún sin subir
        tab: "productos",
        filtroCat: "todas",
        buscar: "",
        publicando: false
    };

    /* ----------------------------------------------------------------------
       Avisos
       ---------------------------------------------------------------------- */

    let avisoTimer;
    function avisar(texto, ms = 3200){
        const a = $("#aviso");
        a.textContent = texto;
        a.classList.add("visible");
        clearTimeout(avisoTimer);
        avisoTimer = setTimeout(() => a.classList.remove("visible"), ms);
    }

    /* ----------------------------------------------------------------------
       Acceso
       ---------------------------------------------------------------------- */

    const acceso = $("#acceso-contenido");

    async function cargarAdminJson(){
        // 1) Desde la API pública de GitHub (lo más reciente)
        try{
            const gh = new GitHub(estado.repo);
            const r = await gh.leer(RUTA_ADMIN);
            if(r) return { json: JSON.parse(r.texto), sha: r.sha };
            return null;
        }catch(e){
            // 2) Respaldo: el archivo publicado en el sitio
            const r = await fetch("../" + RUTA_ADMIN + "?v=" + Date.now(), { cache: "no-store" });
            if(r.ok) return { json: await r.json(), sha: null };
            if(r.status === 404) return null;
            throw e;
        }
    }

    async function iniciar(){
        try{
            const sesion = sessionStorage.getItem(SESION);
            const res = await cargarAdminJson();

            if(res){
                estado.admin = res.json;
                estado.adminSha = res.sha;
                estado.repo = {
                    owner: res.json.owner || estado.repo.owner,
                    repo: res.json.repo || estado.repo.repo,
                    branch: res.json.branch || estado.repo.branch
                };
            }

            if(sesion){
                estado.gh = new GitHub(estado.repo, sesion);
                return entrarAlPanel();
            }

            res ? pantallaContrasena() : pantallaConfiguracion();
        }catch(e){
            acceso.innerHTML = `
                <h1>No se pudo cargar</h1>
                <p class="acceso-texto">${esc(textoError(e))}</p>
                <button class="btn btn--primario btn--bloque" onclick="location.reload()">Intentar de nuevo</button>`;
        }
    }

    function pantallaContrasena(){
        acceso.innerHTML = `
            <h1>Entrar</h1>
            <p class="acceso-texto">Escribe la contraseña del panel para editar productos, colecciones y enlaces.</p>
            <form id="f-entrar">
                <div class="campo">
                    <label for="contrasena">Contraseña</label>
                    <input type="password" id="contrasena" autocomplete="current-password" required autofocus>
                </div>
                <p class="error" id="error" role="alert"></p>
                <button class="btn btn--primario btn--bloque" type="submit">Entrar</button>
            </form>
            <button class="enlace-texto" id="olvide" type="button">Olvidé la contraseña</button>`;

        $("#f-entrar").addEventListener("submit", async e => {
            e.preventDefault();
            const btn = e.submitter || $("#f-entrar button");
            btn.disabled = true;
            btn.textContent = "Comprobando…";
            $("#error").textContent = "";
            try{
                const token = await descifrar(estado.admin.token, $("#contrasena").value);
                sessionStorage.setItem(SESION, token);
                estado.gh = new GitHub(estado.repo, token);
                await entrarAlPanel();
            }catch(err){
                $("#error").textContent = err.name === "OperationError"
                    ? "Contraseña incorrecta."
                    : textoError(err);
                btn.disabled = false;
                btn.textContent = "Entrar";
            }
        });

        $("#olvide").addEventListener("click", () => {
            pantallaConfiguracion(true);
        });
    }

    function pantallaConfiguracion(reconfigurar = false){
        const r = estado.repo;
        acceso.innerHTML = `
            <h1>${reconfigurar ? "Nueva contraseña" : "Configurar el panel"}</h1>
            <p class="acceso-texto">
                ${reconfigurar
                    ? "Para crear una contraseña nueva necesitas un token de GitHub con permiso sobre el repositorio."
                    : "Se hace una sola vez. El panel guarda los cambios directo en GitHub y el sitio se actualiza solo."}
            </p>

            <ol class="pasos">
                <li>Abre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → crear token</a> con la cuenta dueña del repositorio.</li>
                <li>En <em>Repository access</em> elige <em>Only select repositories</em> y marca <strong>${esc(r.repo)}</strong>.</li>
                <li>En <em>Permissions → Repository permissions</em> pon <strong>Contents: Read and write</strong>.</li>
                <li>Genera el token, cópialo y pégalo aquí.</li>
            </ol>

            <form id="f-config">
                <details class="detalles">
                    <summary>Repositorio: ${esc(r.owner)}/${esc(r.repo)} (${esc(r.branch)})</summary>
                    <div class="campo"><label for="c-owner">Usuario u organización</label><input id="c-owner" value="${esc(r.owner)}" required></div>
                    <div class="campo"><label for="c-repo">Repositorio</label><input id="c-repo" value="${esc(r.repo)}" required></div>
                    <div class="campo"><label for="c-branch">Rama</label><input id="c-branch" value="${esc(r.branch)}" required></div>
                </details>

                <div class="campo">
                    <label for="c-token">Token de GitHub</label>
                    <input type="password" id="c-token" placeholder="github_pat_…" autocomplete="off" required>
                </div>
                <div class="campo">
                    <label for="c-pass">Contraseña del panel <small>(mínimo 10 caracteres)</small></label>
                    <input type="password" id="c-pass" minlength="10" autocomplete="new-password" required>
                </div>
                <div class="campo">
                    <label for="c-pass2">Repite la contraseña</label>
                    <input type="password" id="c-pass2" minlength="10" autocomplete="new-password" required>
                </div>

                <p class="error" id="error" role="alert"></p>
                <button class="btn btn--primario btn--bloque" type="submit">Guardar y entrar</button>
            </form>
            ${reconfigurar ? `<button class="enlace-texto" id="volver" type="button">Volver a entrar con contraseña</button>` : ""}`;

        $("#volver")?.addEventListener("click", pantallaContrasena);

        $("#f-config").addEventListener("submit", async e => {
            e.preventDefault();
            const err = $("#error");
            const btn = $("#f-config [type=submit]");
            const pass = $("#c-pass").value;
            const token = $("#c-token").value.trim();
            const repo = {
                owner: $("#c-owner").value.trim(),
                repo: $("#c-repo").value.trim(),
                branch: $("#c-branch").value.trim() || "main"
            };

            err.textContent = "";
            if(pass.length < 10) return err.textContent = "La contraseña debe tener al menos 10 caracteres.";
            if(pass !== $("#c-pass2").value) return err.textContent = "Las contraseñas no coinciden.";
            if(!token) return err.textContent = "Pega el token de GitHub.";

            btn.disabled = true;
            btn.textContent = "Comprobando token…";

            try{
                const gh = new GitHub(repo, token);
                const info = await gh.repoInfo();
                if(!info) throw Object.assign(new Error(`No se encontró el repositorio ${repo.owner}/${repo.repo}, o el token no tiene acceso a él.`), {});
                if(info.permissions && !info.permissions.push){
                    throw Object.assign(new Error(""), { status: 403 });
                }

                btn.textContent = "Guardando…";
                const admin = {
                    version: 1,
                    owner: repo.owner,
                    repo: repo.repo,
                    branch: repo.branch,
                    token: await cifrar(token, pass)
                };

                const previo = await gh.leer(RUTA_ADMIN);
                await gh.escribir(RUTA_ADMIN, textoA64(JSON.stringify(admin, null, 2) + "\n"),
                    "Admin: configurar acceso", previo?.sha);

                estado.repo = repo;
                estado.admin = admin;
                estado.gh = gh;
                sessionStorage.setItem(SESION, token);
                await entrarAlPanel();
                avisar("Panel configurado. Usa tu contraseña para entrar la próxima vez.");
            }catch(e2){
                err.textContent = textoError(e2);
                btn.disabled = false;
                btn.textContent = "Guardar y entrar";
            }
        });
    }

    function salir(){
        if(hayCambios() && !confirm("Tienes cambios sin publicar. ¿Salir de todos modos?")) return;
        sessionStorage.removeItem(SESION);
        estado.imagenes.clear();
        estado.original = JSON.stringify(estado.catalogo);
        location.reload();
    }

    /* ----------------------------------------------------------------------
       Panel
       ---------------------------------------------------------------------- */

    async function entrarAlPanel(){
        acceso.innerHTML = `<p class="acceso-cargando">Cargando catálogo…</p>`;
        try{
            const r = await estado.gh.leer(RUTA_CATALOGO);
            const json = r ? JSON.parse(r.texto) : {};
            estado.catalogo = normalizar(json);
            estado.catalogoSha = r?.sha || null;
            estado.original = JSON.stringify(estado.catalogo);
        }catch(e){
            if(e.status === 401){
                sessionStorage.removeItem(SESION);
                acceso.innerHTML = `
                    <h1>El token ya no funciona</h1>
                    <p class="acceso-texto">GitHub rechazó el token guardado. Crea uno nuevo para seguir usando el panel.</p>
                    <button class="btn btn--primario btn--bloque" id="nuevo-token">Configurar token nuevo</button>`;
                $("#nuevo-token").onclick = () => pantallaConfiguracion(true);
                return;
            }
            acceso.innerHTML = `
                <h1>No se pudo cargar el catálogo</h1>
                <p class="acceso-texto">${esc(textoError(e))}</p>
                <button class="btn btn--primario btn--bloque" onclick="location.reload()">Intentar de nuevo</button>`;
            return;
        }

        $("#acceso").hidden = true;
        $("#app").hidden = false;
        pintar();
    }

    function normalizar(j){
        return {
            tienda: { nombre: "NALU Souvenirs", whatsapp: "", moneda: "MXN", mensajePedido: "¡Hola NALU! Me gustaría hacer el siguiente pedido:", ...(j.tienda || {}) },
            enlaces: (j.enlaces || []).map(e => ({ id: e.id || slug(e.tipo + "-" + Math.random().toString(36).slice(2, 6)), tipo: e.tipo || "otro", etiqueta: e.etiqueta || "", url: e.url || "" })),
            categorias: j.categorias || [],
            productos: (j.productos || []).map(p => ({ destacado: false, disponible: true, descripcion: "", ...p }))
        };
    }

    const hayCambios = () => estado.catalogo && JSON.stringify(estado.catalogo) !== estado.original;

    function contarCambios(){
        if(!hayCambios()) return 0;
        const a = JSON.parse(estado.original);
        const b = estado.catalogo;
        let n = 0;
        const comparar = (x = [], y = []) => {
            const mx = new Map(x.map(i => [i.id, JSON.stringify(i)]));
            const my = new Map(y.map(i => [i.id, JSON.stringify(i)]));
            my.forEach((v, k) => { if(mx.get(k) !== v) n++; });
            mx.forEach((_, k) => { if(!my.has(k)) n++; });
            if(n === 0 && x.map(i => i.id).join() !== y.map(i => i.id).join()) n++;
        };
        comparar(a.productos, b.productos);
        comparar(a.categorias, b.categorias);
        if(JSON.stringify(a.enlaces) !== JSON.stringify(b.enlaces)) n++;
        if(JSON.stringify(a.tienda) !== JSON.stringify(b.tienda)) n++;
        return Math.max(n, 1);
    }

    function pintarEstado(){
        const n = contarCambios();
        const est = $("#estado");
        const btn = $("#publicar");
        if(estado.publicando){
            est.textContent = "Publicando…";
            est.className = "estado estado--trabajando";
            btn.disabled = true;
            return;
        }
        est.textContent = n ? `${n} ${n === 1 ? "cambio" : "cambios"} sin publicar` : "Todo publicado";
        est.className = "estado" + (n ? " estado--pendiente" : "");
        btn.disabled = !n;
    }

    function cambio(){
        pintarEstado();
        pintarContenido();
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

    // Imagen para mostrar: nueva (aún no subida) o publicada en el sitio
    function srcImagen(ruta){
        if(!ruta) return "";
        if(estado.imagenes.has(ruta)) return estado.imagenes.get(ruta);
        if(/^(https?:|data:)/.test(ruta)) return ruta;
        return "../" + ruta;
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
                <button class="icono-btn" data-acc="subir-producto" data-i="${i}" aria-label="Subir" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
                <button class="icono-btn" data-acc="bajar-producto" data-i="${i}" aria-label="Bajar" ${i === total - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>`}
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
                ${campoFoto(p.imagen, "arco")}
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
            if(accion === "eliminar"){
                if(!confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) return false;
                estado.catalogo.productos.splice(i, 1);
                avisar("Producto eliminado. Publica para que se vea en el sitio.");
                return true;
            }

            const nombre = f.nombre.value.trim();
            const valorPrecio = parseFloat(f.precio.value);
            const imagen = f.dataset.imagen || p.imagen;

            if(!nombre) return mostrarError(f, "Escribe el nombre del producto.");
            if(isNaN(valorPrecio) || valorPrecio < 0) return mostrarError(f, "Escribe un precio válido.");
            if(!imagen) return mostrarError(f, "Agrega una foto del producto.");

            const datos = {
                nombre,
                precio: Math.round(valorPrecio * 100) / 100,
                categoria: f.categoria.value,
                imagen,
                descripcion: f.descripcion.value.trim(),
                destacado: f.destacado.checked,
                disponible: f.disponible.checked
            };

            if(nuevo){
                datos.id = idUnico(nombre, estado.catalogo.productos.map(x => x.id));
                estado.catalogo.productos.unshift(datos);
                avisar("Producto agregado. Publica para que se vea en el sitio.");
            }else{
                Object.assign(estado.catalogo.productos[i], datos);
                avisar("Cambios guardados. Publica para que se vean en el sitio.");
            }
            return true;
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
                            <button class="icono-btn" data-acc="subir-coleccion" data-i="${i}" aria-label="Subir" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
                            <button class="icono-btn" data-acc="bajar-coleccion" data-i="${i}" aria-label="Bajar" ${i === categorias.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
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
                ${campoFoto(c.imagen, "arco")}
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
                    <label for="c-mover">Al eliminar, mover sus ${usados.length} productos a</label>
                    <select id="c-mover" name="mover">
                        ${otras.map(o => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("")}
                        <option value="">Eliminar también sus productos</option>
                    </select>
                </div>` : ""}
                <p class="error" role="alert"></p>
            </div>
            <div class="dialogo-pie">
                <button class="btn btn--primario" value="guardar">${nuevo ? "Crear colección" : "Guardar cambios"}</button>
                ${nuevo ? "" : `<button class="btn btn--peligro" value="eliminar" formnovalidate>Eliminar</button>`}
            </div>`,
        async (accion, f) => {
            if(accion === "eliminar"){
                const destino = f.mover ? f.mover.value : "";
                const mensaje = usados.length
                    ? (destino
                        ? `¿Eliminar "${c.nombre}" y mover sus ${usados.length} productos?`
                        : `¿Eliminar "${c.nombre}" y sus ${usados.length} productos?`)
                    : `¿Eliminar la colección "${c.nombre}"?`;
                if(!confirm(mensaje)) return false;
                if(destino){
                    estado.catalogo.productos.forEach(p => { if(p.categoria === c.id) p.categoria = destino; });
                }else{
                    estado.catalogo.productos = estado.catalogo.productos.filter(p => p.categoria !== c.id);
                }
                estado.catalogo.categorias.splice(i, 1);
                if(estado.filtroCat === c.id) estado.filtroCat = "todas";
                avisar("Colección eliminada. Publica para que se vea en el sitio.");
                return true;
            }

            const nombre = f.nombre.value.trim();
            const imagen = f.dataset.imagen || c.imagen;
            if(!nombre) return mostrarError(f, "Escribe el nombre de la colección.");
            if(!imagen) return mostrarError(f, "Agrega una foto para la colección.");

            const datos = { nombre, descripcion: f.descripcion.value.trim(), imagen };
            if(nuevo){
                datos.id = idUnico(nombre, estado.catalogo.categorias.map(x => x.id));
                estado.catalogo.categorias.push(datos);
                avisar("Colección creada. Publica para que se vea en el sitio.");
            }else{
                Object.assign(estado.catalogo.categorias[i], datos);
                avisar("Cambios guardados. Publica para que se vean en el sitio.");
            }
            return true;
        });
    }

    /* ----- Enlaces y WhatsApp ----- */

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
        </section>`;
    }

    const urlValida = u => !u || /^(https?:\/\/|mailto:|tel:)/.test(u);

    function ayudaWhatsApp(v){
        const n = String(v || "").replace(/\D/g, "");
        if(!n) return "Sin número, WhatsApp le pedirá al cliente elegir el contacto. En México: 52 + 10 dígitos.";
        if(n.length < 11) return "Parece incompleto. En México: 52 + 10 dígitos, sin espacios.";
        return "Los pedidos llegarán a +" + n + ".";
    }

    /* ----- Ajustes ----- */

    function vistaAjustes(){
        const r = estado.repo;
        return `
        <section class="seccion-admin">
            <div class="cabeza">
                <div>
                    <h1>Ajustes</h1>
                    <p>Acceso al panel y conexión con GitHub</p>
                </div>
            </div>

            <form class="tarjeta" id="f-pass">
                <h2>Cambiar contraseña</h2>
                <div class="campo">
                    <label for="a-pass">Contraseña nueva <small>(mínimo 10 caracteres)</small></label>
                    <input type="password" id="a-pass" minlength="10" autocomplete="new-password" required>
                </div>
                <div class="campo">
                    <label for="a-pass2">Repite la contraseña</label>
                    <input type="password" id="a-pass2" minlength="10" autocomplete="new-password" required>
                </div>
                <p class="error" role="alert"></p>
                <button class="btn btn--primario" type="submit">Cambiar contraseña</button>
            </form>

            <div class="tarjeta">
                <h2>Conexión</h2>
                <p class="texto-tarjeta">Los cambios se guardan en
                    <a href="https://github.com/${esc(r.owner)}/${esc(r.repo)}" target="_blank" rel="noopener">${esc(r.owner)}/${esc(r.repo)}</a>
                    (rama ${esc(r.branch)}). Después de publicar, GitHub Pages tarda uno o dos minutos en actualizar el sitio.</p>
                <div class="botones">
                    <button class="btn btn--borde" data-acc="cambiar-token">Usar otro token</button>
                    <button class="btn btn--borde" data-acc="salir">Cerrar sesión</button>
                </div>
            </div>
        </section>`;
    }

    async function guardarAdmin(token, pass){
        const admin = { ...estado.admin, version: 1, ...estado.repo, token: await cifrar(token, pass) };
        const previo = await estado.gh.leer(RUTA_ADMIN);
        await estado.gh.escribir(RUTA_ADMIN, textoA64(JSON.stringify(admin, null, 2) + "\n"),
            "Admin: cambiar contraseña", previo?.sha);
        estado.admin = admin;
    }

    /* ----------------------------------------------------------------------
       Fotos
       ---------------------------------------------------------------------- */

    function campoFoto(ruta, forma){
        return `
        <div class="foto-campo">
            <div class="foto-vista foto-vista--${forma}">
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
        let dataURL = canvas.toDataURL("image/webp", .82);
        let ext = "webp";
        if(!dataURL.startsWith("data:image/webp")){
            dataURL = canvas.toDataURL("image/jpeg", .85);
            ext = "jpg";
        }
        return { dataURL, ext };
    }

    async function alElegirFoto(input){
        const archivo = input.files[0];
        if(!archivo) return;
        const form = input.form;
        const vista = $(".foto-vista", form);
        vista.innerHTML = `<span>Procesando…</span>`;
        try{
            const { dataURL, ext } = await procesarFoto(archivo);
            const nombre = slug(form.nombre?.value || archivo.name.replace(/\.[^.]+$/, ""));
            const ruta = `${CARPETA_SUBIDAS}${nombre}-${Date.now().toString(36)}.${ext}`;
            estado.imagenes.set(ruta, dataURL);
            form.dataset.imagen = ruta;
            vista.innerHTML = `<img src="${dataURL}" alt="">`;
        }catch(e){
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
        delete f.dataset.imagen;
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
        const accion = e.submitter?.value || "guardar";
        const f = e.target;
        if(accion === "cancelar"){
            $("#dialogo").close();
            return;
        }
        const ok = await alGuardar?.(accion, f);
        if(ok){
            $("#dialogo").close();
            limpiarImagenesSinUso();
            cambio();
        }
    });

    $("#dialogo").addEventListener("close", () => {
        limpiarImagenesSinUso();
    });

    $("#dialogo").addEventListener("click", e => {
        if(e.target === $("#dialogo") || e.target.closest("[data-cerrar-dialogo]")) $("#dialogo").close();
    });

    function rutasEnUso(cat = estado.catalogo){
        return new Set([
            ...cat.productos.map(p => p.imagen),
            ...cat.categorias.map(c => c.imagen)
        ].filter(Boolean));
    }

    function limpiarImagenesSinUso(){
        const usadas = rutasEnUso();
        const formImg = $("#dialogo").open ? $("#dialogo-form").dataset.imagen : null;
        [...estado.imagenes.keys()].forEach(r => {
            if(!usadas.has(r) && r !== formImg) estado.imagenes.delete(r);
        });
    }

    /* ----------------------------------------------------------------------
       Publicar
       ---------------------------------------------------------------------- */

    async function publicar(){
        if(estado.publicando || !hayCambios()) return;
        estado.publicando = true;
        pintarEstado();

        const gh = estado.gh;
        try{
            // ¿Alguien publicó desde otro dispositivo mientras editabas?
            const remoto = await gh.leer(RUTA_CATALOGO);
            if(remoto && estado.catalogoSha && remoto.sha !== estado.catalogoSha){
                const seguir = confirm("El catálogo se cambió desde otro dispositivo después de que abriste el panel. Si publicas, se reemplazará con tu versión. ¿Continuar?");
                if(!seguir){
                    estado.publicando = false;
                    pintarEstado();
                    return;
                }
            }

            // 1. Subir fotos nuevas que sí se usan
            const usadas = rutasEnUso();
            const nuevas = [...estado.imagenes.entries()].filter(([r]) => usadas.has(r));
            let n = 0;
            for(const [ruta, dataURL] of nuevas){
                n++;
                $("#estado").textContent = `Subiendo fotos ${n} de ${nuevas.length}…`;
                await gh.escribir(ruta, dataURL.split(",")[1], `Admin: subir foto ${ruta.split("/").pop()}`);
            }

            // 2. Guardar el catálogo
            $("#estado").textContent = "Guardando catálogo…";
            const texto = JSON.stringify(estado.catalogo, null, 2) + "\n";
            const res = await gh.escribir(RUTA_CATALOGO, textoA64(texto),
                "Admin: actualizar catálogo", remoto?.sha);

            // 3. Borrar fotos subidas por el panel que ya nadie usa
            const antes = rutasEnUso(JSON.parse(estado.original));
            const sobran = [...antes].filter(r => r.startsWith(CARPETA_SUBIDAS) && !usadas.has(r));
            for(const ruta of sobran){
                try{ await gh.borrar(ruta, `Admin: borrar foto ${ruta.split("/").pop()}`); }catch(e){}
            }

            estado.catalogoSha = res.content.sha;
            estado.original = JSON.stringify(estado.catalogo);
            nuevas.forEach(([r]) => estado.imagenes.delete(r));
            estado.publicando = false;
            cambio();
            avisar("Publicado. El sitio se actualiza en uno o dos minutos.", 5000);
        }catch(e){
            estado.publicando = false;
            pintarEstado();
            if(e.status === 401) sessionStorage.removeItem(SESION);
            alert("No se pudo publicar. " + textoError(e) + "\n\nTus cambios siguen aquí; puedes intentar de nuevo.");
        }
    }

    /* ----------------------------------------------------------------------
       Eventos
       ---------------------------------------------------------------------- */

    function mover(lista, i, d){
        const j = i + d;
        if(j < 0 || j >= lista.length) return;
        [lista[i], lista[j]] = [lista[j], lista[i]];
        cambio();
    }

    document.addEventListener("click", e => {
        const tab = e.target.closest(".pestanas [data-tab]");
        if(tab){
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
            case "subir-producto":   mover(cat.productos, i, -1); break;
            case "bajar-producto":   mover(cat.productos, i, 1); break;
            case "nueva-coleccion":  formColeccion(); break;
            case "editar-coleccion": formColeccion(i); break;
            case "subir-coleccion":  mover(cat.categorias, i, -1); break;
            case "bajar-coleccion":  mover(cat.categorias, i, 1); break;
            case "nuevo-enlace":
                cat.enlaces.push({ id: "enlace-" + Date.now().toString(36), tipo: "instagram", etiqueta: "", url: "" });
                cambio();
                $$(".enlace-admin").pop()?.querySelector("input")?.focus();
                break;
            case "quitar-enlace":
                if(cat.enlaces[i].url && !confirm("¿Quitar este enlace?")) break;
                cat.enlaces.splice(i, 1);
                cambio();
                break;
            case "subir-enlace":     mover(cat.enlaces, i, -1); break;
            case "bajar-enlace":     mover(cat.enlaces, i, 1); break;
            case "cambiar-token":
                if(hayCambios()){ alert("Publica o descarta tus cambios antes de cambiar el token."); break; }
                $("#app").hidden = true;
                $("#acceso").hidden = false;
                pantallaConfiguracion(true);
                break;
            case "salir":            salir(); break;
        }
    });

    $("#publicar").addEventListener("click", publicar);

    // Campos que se editan en línea (filtros, enlaces, WhatsApp)
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
            pintarEstado();
            if(t.dataset.tienda === "whatsapp"){
                t.parentElement.querySelector(".ayuda").textContent = ayudaWhatsApp(t.value);
            }
            return;
        }

        if(t.dataset.enlace !== undefined){
            const enlace = estado.catalogo.enlaces[Number(t.dataset.enlace)];
            enlace[t.dataset.campo] = t.dataset.campo === "url" ? t.value.trim() : t.value;
            if(t.dataset.campo === "url"){
                t.parentElement.querySelector("[data-aviso-url]").hidden = urlValida(enlace.url);
            }
            pintarEstado();
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
        if(p1.length < 10) return err.textContent = "La contraseña debe tener al menos 10 caracteres.";
        if(p1 !== $("#a-pass2").value) return err.textContent = "Las contraseñas no coinciden.";
        const btn = $("[type=submit]", f);
        btn.disabled = true;
        try{
            await guardarAdmin(estado.gh.token, p1);
            f.reset();
            avisar("Contraseña cambiada.");
        }catch(e2){
            err.textContent = textoError(e2);
        }
        btn.disabled = false;
    });

    window.addEventListener("beforeunload", e => {
        if(hayCambios()){
            e.preventDefault();
            e.returnValue = "";
        }
    });

    iniciar();

})();
