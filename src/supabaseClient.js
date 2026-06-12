import { createClient } from '@supabase/supabase-js'

// ── CONFIGURACIÓN DE CONEXIÓN A SUPABASE ────────────────────────────────────
// Estos valores son públicos y seguros de compartir (no son contraseñas).
const supabaseUrl = 'https://vzkcwigqwqvpxuddoeij.supabase.co'
const supabaseAnonKey = 'sb_publishable_PhefoGcssEK9SUgdEe37eQ_w-0PaU6i'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
