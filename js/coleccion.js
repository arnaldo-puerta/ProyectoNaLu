/* NALU · Catálogo con filtros y búsqueda */

(function(){

    const { $, esc } = NALU;

    const chips = $("#chips");
    const grid = $("#catalogo");
    const buscador = $("#buscar");
    const titulo = $("#titulo-coleccion");
    const subtitulo = $("#subtitulo-coleccion");

    const params = new URLSearchParams(location.search);
    let activa = params.get("cat") || "todo";
    let texto = "";

    const sinAcentos = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    NALU.listo.then(datos => {

        if(activa !== "todo" && !datos.categorias.some(c => c.id === activa)) activa = "todo";

        function pintarChips(){
            const opciones = [{ id: "todo", nombre: "Todo" }, ...datos.categorias];
            chips.innerHTML = opciones.map(c =>
                `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="${c.id === activa}">${esc(c.nombre)}</button>`
            ).join("");
        }

        function pintarEncabezado(){
            const cat = datos.categorias.find(c => c.id === activa);
            titulo.textContent = cat ? cat.nombre : "Colección";
            subtitulo.textContent = cat?.descripcion
                || "Velas aromáticas, home sprays y arreglos hechos a mano. Pide uno o arma tu carrito y envíalo en un solo mensaje.";
            document.title = (cat ? cat.nombre : "Colección") + " | NALU";
        }

        function pintarProductos(){
            const q = sinAcentos(texto.trim());
            const lista = datos.productos.filter(p =>
                (activa === "todo" || p.categoria === activa) &&
                (!q || sinAcentos(p.nombre + " " + (p.descripcion || "")).includes(q))
            );

            grid.innerHTML = lista.length
                ? lista.map(NALU.tarjeta).join("")
                : `<p class="vacio">${q
                    ? `No encontramos “${esc(texto.trim())}”. Prueba con otra palabra o pregúntanos por WhatsApp.`
                    : "Pronto agregaremos productos en esta colección."}</p>`;
        }

        chips.addEventListener("click", e => {
            const b = e.target.closest("[data-cat]");
            if(!b) return;
            activa = b.dataset.cat;
            history.replaceState(null, "", activa === "todo" ? location.pathname : "?cat=" + encodeURIComponent(activa));
            pintarChips();
            pintarEncabezado();
            pintarProductos();
            b.scrollIntoView?.({ inline: "center", block: "nearest" });
        });

        buscador.addEventListener("input", () => {
            texto = buscador.value;
            pintarProductos();
        });

        pintarChips();
        pintarEncabezado();
        pintarProductos();

    }).catch(() => {});

    $("#encargo")?.addEventListener("click", () => {
        NALU.abrirWhatsApp("¡Hola NALU! Me gustaría cotizar un pedido personalizado.");
    });

})();
