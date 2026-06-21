// ── Conversor de números a letras (español, Uruguay) ──────────────────────
// Se usa para redactar montos en los documentos APG, ej:
//   440  → "cuatrocientos cuarenta"
//   845398.40 → "ochocientos cuarenta y cinco mil trescientos noventa y ocho con 40/100"

const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"]
const DIECIS = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"]
const VEINTIS = ["veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"]
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"]

function tresDigitos(n) {
  if (n === 0) return ""
  if (n === 100) return "cien"
  const c = Math.floor(n / 100)
  const r = n % 100
  const out = []
  if (c > 0) out.push(CENTENAS[c])
  if (r > 0) {
    if (r < 10) out.push(UNIDADES[r])
    else if (r < 20) out.push(DIECIS[r - 10])
    else if (r < 30) out.push(VEINTIS[r - 20])
    else {
      const d = Math.floor(r / 10), u = r % 10
      out.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`)
    }
  }
  return out.join(" ")
}

// Convierte un entero (0 a 999.999.999) a letras, en minúsculas.
export function numeroALetras(nIn) {
  let n = Math.floor(Math.abs(Number(nIn) || 0))
  if (n === 0) return "cero"

  const millones = Math.floor(n / 1000000)
  const miles = Math.floor((n % 1000000) / 1000)
  const resto = n % 1000

  const partes = []
  if (millones > 0) {
    partes.push(millones === 1 ? "un millón" : `${tresDigitos(millones)} millones`)
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${tresDigitos(miles)} mil`)
  }
  if (resto > 0) {
    partes.push(tresDigitos(resto))
  }
  return partes.join(" ").trim()
}

// Convierte un monto con decimales a la frase legal completa, ej:
// montoEnLetras(929938.24, "pesos uruguayos") →
//   "novecientos veintinueve mil novecientos treinta y ocho con 24/100"
export function montoEnLetras(monto, moneda = "") {
  const n = Number(monto) || 0
  const entero = Math.floor(n)
  const centavos = Math.round((n - entero) * 100)
  const centavosStr = String(centavos).padStart(2, "0")
  const letras = numeroALetras(entero)
  return moneda ? `${moneda} ${letras} con ${centavosStr}/100` : `${letras} con ${centavosStr}/100`
}

// Capitaliza la primera letra de un string (útil al insertar en oraciones)
export function cap1(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
