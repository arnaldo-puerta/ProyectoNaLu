/* ==========================================================================
   NALU · Conexión con Supabase
   Copia estos dos valores de Supabase → Project Settings → API Keys.
   Ambos son públicos por diseño: la seguridad la dan las reglas (RLS)
   de supabase/esquema.sql, que solo dejan escribir al correo admin.

   Mientras estén vacíos, el sitio muestra data/catalogo.json y el admin
   indica cómo configurarlo.
   ========================================================================== */

window.NALU_SUPABASE = {
  url: "https://ggmpcfgrsatiuvlbmguf.supabase.co", // ej. "https://abcdefghijkl.supabase.co"
  clave: "sb_publishable_3MdRt2AB77n-8d1Gov0RHw_ePWvNa22", // la "Publishable key" (sb_publishable_…) o la "anon key"
};
