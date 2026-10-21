// Función programada de Netlify: una consulta diaria a Supabase para que el
// proyecto gratuito no se pause por inactividad.
// Toma la URL y la clave de js/config.js del sitio publicado, así que no
// necesita configuración. Si prefieres, define SUPABASE_URL y SUPABASE_KEY
// en Netlify → Site configuration → Environment variables.

async function leerConfig(){
    if(process.env.SUPABASE_URL && process.env.SUPABASE_KEY){
        return { url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_KEY };
    }
    const sitio = process.env.URL;
    const js = await (await fetch(`${sitio}/js/config.js`)).text();
    const url = js.match(/url:\s*["']([^"']+)["']/)?.[1];
    const clave = js.match(/clave:\s*["']([^"']+)["']/)?.[1];
    return { url, clave };
}

export default async () => {
    const { url, clave } = await leerConfig();
    if(!url || !clave){
        console.log("Supabase aún no está configurado en js/config.js");
        return;
    }

    const headers = { apikey: clave };
    if(clave.startsWith("eyJ")) headers.Authorization = `Bearer ${clave}`;

    const r = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/tienda?select=id&limit=1`, { headers });
    console.log(`Supabase respondió ${r.status}`);
};

export const config = {
    schedule: "@daily"
};
