// ── Cálculos compartidos para los documentos APG ──────────────────────────
// Replica la lógica vista en los anexos reales:
//  · Precio Total UR (por año) = precio_unitario_ur × cantidad × (1 + %IVA/100)
//  · Precio Total $ (por año)  = Precio Total UR (año) × cotización UR × (1 + %variación/100)
//  · El % de variación de cambio ya viene incluido en los montos en pesos por año.

export function itemTotalUR(item, anio) {
  const cant = Number(item.anios?.[anio]) || 0
  const precio = Number(item.precio_unitario_ur) || 0
  const iva = Number(item.iva_pct) || 0
  return precio * cant * (1 + iva / 100)
}

export function itemCantidadTotal(item, anios) {
  return anios.reduce((s, a) => s + (Number(item.anios?.[a]) || 0), 0)
}

export function itemTotalURTotal(item, anios) {
  return anios.reduce((s, a) => s + itemTotalUR(item, a), 0)
}

export function yearTotalUR(items, anio) {
  return items.reduce((s, it) => s + itemTotalUR(it, anio), 0)
}

export function grandTotalUR(items, anios) {
  return anios.reduce((s, a) => s + yearTotalUR(items, a), 0)
}

export function yearTotalPesos(items, anio, cotizacionUR, pctVariacion) {
  const cot = Number(cotizacionUR) || 0
  const pct = Number(pctVariacion) || 0
  return yearTotalUR(items, anio) * cot * (1 + pct / 100)
}

export function grandTotalPesos(items, anios, cotizacionUR, pctVariacion) {
  return anios.reduce((s, a) => s + yearTotalPesos(items, a, cotizacionUR, pctVariacion), 0)
}

export function basePesosSinVariacion(items, anios, cotizacionUR) {
  return grandTotalUR(items, anios) * (Number(cotizacionUR) || 0)
}

export const fmtUR = (n) => {
  const r = Math.round((Number(n) || 0) * 100) / 100
  return r.toLocaleString('es-UY', { maximumFractionDigits: 2, minimumFractionDigits: r % 1 === 0 ? 0 : 2 })
}
export const fmtPesos = (n) => Number(n||0).toLocaleString('es-UY', {minimumFractionDigits:2, maximumFractionDigits:2})
