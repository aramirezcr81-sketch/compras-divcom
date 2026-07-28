import { createClient } from '@supabase/supabase-js'

// ── CONFIGURACIÓN DE CONEXIÓN A SUPABASE ────────────────────────────────────
// Estos valores son públicos y seguros de compartir (no son contraseñas).
const supabaseUrl = 'https://vzkcwigqwqvpxuddoeij.supabase.co'
const supabaseAnonKey = 'sb_publishable_PhefoGcssEK9SUgdEe37eQ_w-0PaU6i'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Evita que la sesión "se caiga" al volver de otra pestaña ────────────────
// Los navegadores frenan los temporizadores en segundo plano, así que el
// refresco automático del token de Supabase puede quedar pausado mientras la
// pestaña no está activa. Si pasa suficiente tiempo, al volver la sesión
// figura vencida y la app te manda al login como si hubiera que empezar de
// nuevo. Esto fuerza una renovación apenas la pestaña vuelve a estar visible.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}
