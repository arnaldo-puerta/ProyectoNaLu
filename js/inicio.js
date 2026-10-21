/* NALU · Página de inicio */

(function(){

    const { $, $$, esc, ruta } = NALU;

    /* ----- Portada: fotos que cambian solas, puntos y deslizar ----- */

    const fotos = $$(".portada-fotos img");
    const puntos = $(".portada-puntos");
    let actual = 0;
    let timer;

    function mostrar(i){
        actual = (i + fotos.length) % fotos.length;
        fotos.forEach((f, n) => f.classList.toggle("activa", n === actual));
        $$("button", puntos).forEach((b, n) => b.setAttribute("aria-current", n === actual));
    }

    function iniciar(){
        clearInterval(timer);
        if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        timer = setInterval(() => mostrar(actual + 1), 6500);
    }

    if(fotos.length > 1){
        puntos.innerHTML = fotos.map((_, n) =>
            `<button type="button" aria-label="Foto ${n + 1} de ${fotos.length}"></button>`
        ).join("");

        puntos.addEventListener("click", e => {
            const b = e.target.closest("button");
            if(!b) return;
            mostrar($$("button", puntos).indexOf(b));
            iniciar();
        });

        // Deslizar con el dedo
        let x0 = null;
        const portada = $(".portada");
        portada.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
        portada.addEventListener("touchend", e => {
            if(x0 === null) return;
            const dx = e.changedTouches[0].clientX - x0;
            if(Math.abs(dx) > 50){ mostrar(actual + (dx < 0 ? 1 : -1)); iniciar(); }
            x0 = null;
        });

        mostrar(0);
        iniciar();
    }

    /* ----- Colecciones y destacados (desde el catálogo) ----- */

    NALU.listo.then(datos => {

        const cont = $("#colecciones");
        if(cont){
            cont.innerHTML = datos.categorias.map(c => `
                <a class="coleccion" href="paginas/coleccion.html?cat=${encodeURIComponent(c.id)}">
                    <figure><img src="${esc(ruta(c.imagen))}" alt="" loading="lazy" decoding="async"></figure>
                    <h3>${esc(c.nombre)}</h3>
                    ${c.descripcion ? `<p>${esc(c.descripcion)}</p>` : ""}
                </a>`).join("");
        }

        const dest = $("#destacados");
        if(dest){
            let lista = datos.productos.filter(p => p.destacado);
            if(!lista.length) lista = datos.productos.slice(0, 8);
            dest.innerHTML = lista.length
                ? lista.map(NALU.tarjeta).join("")
                : `<p class="vacio">Muy pronto verás aquí nuestros productos.</p>`;
        }

    }).catch(() => {});

})();
