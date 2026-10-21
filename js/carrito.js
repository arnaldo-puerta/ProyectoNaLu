/* NALU · Página del carrito */

(function(){

    const { $ } = NALU;

    const lista = $("#lista");
    const totalEl = $("#total");
    const vaciarBtn = $("#vaciar");
    const form = $("#pedido");
    const enviarBtn = $("#enviar");
    const campoDireccion = $("#campo-direccion");

    const campos = ["nombre", "entrega", "direccion", "fecha", "notas"];

    function valor(nombre){
        const el = form.elements[nombre];
        if(!el) return "";
        if(el instanceof RadioNodeList) return el.value || "";
        return el.value.trim();
    }

    function leerFormulario(){
        const d = {};
        campos.forEach(c => { d[c] = valor(c); });
        if(d.entrega !== "Envío a domicilio") d.direccion = "";
        if(d.fecha){
            const [a, m, dia] = d.fecha.split("-");
            d.fecha = `${dia}/${m}/${a}`;
        }
        return d;
    }

    function restaurar(){
        const g = NALU.datosCliente();
        campos.forEach(c => {
            if(!g[c]) return;
            let v = g[c];
            if(c === "fecha" && v.includes("/")){
                const [dia, m, a] = v.split("/");
                v = `${a}-${m}-${dia}`;
            }
            const el = form.elements[c];
            if(el instanceof RadioNodeList){
                [...el].forEach(r => { r.checked = r.value === v; });
            }else if(el){
                el.value = v;
            }
        });
    }

    function mostrarDireccion(){
        campoDireccion.hidden = valor("entrega") !== "Envío a domicilio";
    }

    function pintar(){
        const items = NALU.items();
        lista.innerHTML = items.length ? items.map(NALU.renglon).join("") : NALU.carritoVacio();
        totalEl.textContent = NALU.precio(NALU.total());
        vaciarBtn.hidden = !items.length;
        enviarBtn.disabled = !items.length;
    }

    // Fecha mínima: hoy
    const hoy = new Date();
    hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
    form.elements.fecha.min = hoy.toISOString().slice(0, 10);

    restaurar();
    mostrarDireccion();

    form.addEventListener("input", () => {
        mostrarDireccion();
        NALU.guardarDatosCliente(leerFormulario());
    });

    form.addEventListener("submit", e => {
        e.preventDefault();
        const d = leerFormulario();
        NALU.guardarDatosCliente(d);
        NALU.enviarCarrito(d);
    });

    vaciarBtn.addEventListener("click", () => {
        if(confirm("¿Quitar todos los productos del carrito?")) NALU.vaciar();
    });

    document.addEventListener("carrito:cambio", pintar);

    NALU.listo.then(pintar).catch(() => {});

})();
