import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

const TIPOS_PREV = ["CD","CDA","CDE","CDNC","CPA","LA","LAA","LP","OTRO"]
const ESTADOS_PREV = [
  { v: "BORRADOR", label: "Borrador", color: "#999", bg: "#f0f0f0" },
  { v: "ELEVADA_AE", label: "Elevada al A.E.", color: "#8e44ad", bg: "#ede7f6" },
  { v: "CONSOLIDADA", label: "Consolidada", color: "#2e75b6", bg: "#e3f0fd" },
  { v: "AUTORIZADA", label: "Autorizada", color: "#27ae60", bg: "#e8f8f0" },
  { v: "DESCARTADA", label: "Descartada", color: "#c0392b", bg: "#fde8e8" },
]
const estadoPrevInfo = (v) => ESTADOS_PREV.find(e => e.v === v) || ESTADOS_PREV[0]

const emptyForm = (anioDefault) => ({
  anio_ejercicio: anioDefault, servicio: "", rubro_id: "", sub_rubro_id: "",
  codigo_arce: "", descripcion_arce: "", detalle: "", unidad: "UNIDAD",
  cantidad_solicitada: "", precio_unitario_referencia: "", anio_precio_referencia: "",
  es_recambio: false, es_nunca_adquirido: false, justificacion: "",
  tipo_compra_estimado: "CD", trimestre_estimado: "", pac: "PAC",
  estado: "BORRADOR", observaciones: "",
})

const calcPrecioActualizado = (precioRef, anioRef, anioEjercicio) => {
  const p = Number(precioRef) || 0
  const aR = Number(anioRef), aE = Number(anioEjercicio)
  if (!aR || !aE || aE <= aR) return p
  return p * Math.pow(1.10, aE - aR)
}

const fmt = (n) => n || n === 0 ? `$ ${Number(n).toLocaleString('es-UY', { maximumFractionDigits: 0 })}` : "-"
const inputStyle = { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }
const labelStyle = { fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: .5, display: "block", marginBottom: 4 }

export default function PrevisionesView({ rubros, subRubros, isAdmin }) {
  const anioActual = new Date().getFullYear()
  const [previsiones, setPrevisiones] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState("")
  const [filterAnio, setFilterAnio] = useState(anioActual + 1)
  const [filterServicio, setFilterServicio] = useState("")
  const [filterEstado, setFilterEstado] = useState("")
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm(anioActual + 1))
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const fetchPrevisiones = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('previsiones').select('*').order('servicio').order('descripcion_arce')
    if (error) setErrMsg(error.message)
    else setPrevisiones(data || [])
    setLoading(false)
  }
  useEffect(() => { fetchPrevisiones() }, [])

  useEffect(() => {
    const channel = supabase
      .channel('previsiones-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'previsiones' }, () => fetchPrevisiones())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const subRubrosDe = (rubro_id) => subRubros.filter(s => s.rubro_id === Number(rubro_id))
  const rubroNombre = (id) => { const r = rubros.find(x => x.id === id); return r ? `${r.codigo} - ${r.nombre}` : "" }
  const subRubroNombre = (id) => { const s = subRubros.find(x => x.id === id); return s ? `${s.codigo} - ${s.nombre}` : "" }

  const serviciosDisponibles = useMemo(() => [...new Set(previsiones.map(p => p.servicio).filter(Boolean))].sort(), [previsiones])
  const aniosDisponibles = useMemo(() => {
    const set = new Set(previsiones.map(p => p.anio_ejercicio).filter(Boolean))
    set.add(anioActual + 1)
    return [...set].sort((a, b) => a - b)
  }, [previsiones])

  const filtradas = useMemo(() => previsiones.filter(p =>
    (!filterAnio || p.anio_ejercicio === Number(filterAnio)) &&
    (!filterServicio || p.servicio === filterServicio) &&
    (!filterEstado || p.estado === filterEstado)
  ), [previsiones, filterAnio, filterServicio, filterEstado])

  const totalPrevisto = filtradas.reduce((s, p) => s + (Number(p.importe_total) || 0), 0)
  const sinJustificar = filtradas.filter(p => p.es_nunca_adquirido && !(p.justificacion || "").trim())

  // ── Form: precio actualizado e importe en vivo mientras se edita ──
  const precioActualizadoForm = calcPrecioActualizado(form.precio_unitario_referencia, form.anio_precio_referencia, form.anio_ejercicio)
  const importeTotalForm = (Number(form.cantidad_solicitada) || 0) * precioActualizadoForm

  const openAdd = () => { setForm(emptyForm(filterAnio || anioActual + 1)); setErrMsg(""); setModal({ mode: "add" }) }
  const openEdit = (p) => { setForm({ ...p }); setErrMsg(""); setModal({ mode: "edit", record: p }) }

  const saveForm = async () => {
    setSaving(true); setErrMsg("")
    const precioActualizado = calcPrecioActualizado(form.precio_unitario_referencia, form.anio_precio_referencia, form.anio_ejercicio)
    const importeTotal = (Number(form.cantidad_solicitada) || 0) * precioActualizado
    const payload = {
      ...form,
      anio_ejercicio: Number(form.anio_ejercicio) || anioActual + 1,
      rubro_id: form.rubro_id ? Number(form.rubro_id) : null,
      sub_rubro_id: form.sub_rubro_id ? Number(form.sub_rubro_id) : null,
      cantidad_solicitada: Number(form.cantidad_solicitada) || 0,
      precio_unitario_referencia: Number(form.precio_unitario_referencia) || 0,
      anio_precio_referencia: form.anio_precio_referencia ? Number(form.anio_precio_referencia) : null,
      precio_actualizado: precioActualizado,
      importe_total: importeTotal,
      trimestre_estimado: form.trimestre_estimado ? Number(form.trimestre_estimado) : null,
    }
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.procedimiento_id

    if (modal.mode === "add") {
      const { error } = await supabase.from('previsiones').insert([payload])
      if (error) { setErrMsg(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('previsiones').update(payload).eq('id', modal.record.id)
      if (error) { setErrMsg(error.message); setSaving(false); return }
    }
    setSaving(false); setModal(null); fetchPrevisiones()
  }

  const deleteRec = async (p) => {
    const { error } = await supabase.from('previsiones').delete().eq('id', p.id)
    if (error) setErrMsg(error.message)
    setConfirmDel(null); fetchPrevisiones()
  }

  // ── Export PAC: agregado por trimestre + tipo, igual al formato publicado en Compras Estatales ──
  const exportarPAC = () => {
    const soloPAC = filtradas.filter(p => (p.pac || "PAC") === "PAC")
    const grupos = {}
    soloPAC.forEach(p => {
      const trim = p.trimestre_estimado || 0
      const tipo = p.tipo_compra_estimado || "OTRO"
      const key = `${trim}|${tipo}`
      if (!grupos[key]) grupos[key] = { trimestre: trim, tipo, monto: 0, cantidad: 0 }
      grupos[key].monto += Number(p.importe_total) || 0
      grupos[key].cantidad += 1
    })
    const filas = Object.values(grupos).sort((a, b) => a.trimestre - b.trimestre || a.tipo.localeCompare(b.tipo))

    const wsData = [
      [`PLANIFICACIÓN ANUAL DE COMPRAS (PAC) — EJERCICIO ${filterAnio}`],
      [`División Comercial — DNSFFAA — Exportado ${new Date().toLocaleDateString('es-UY')}`],
      [],
      ["TRIMESTRE", "TIPO DE PROCEDIMIENTO", "CANTIDAD DE ÍTEMS", "MONTO TOTAL ($)"],
      ...filas.map(f => [f.trimestre ? `T${f.trimestre}` : "SIN DEFINIR", f.tipo, f.cantidad, f.monto]),
      [],
      ["TOTAL GENERAL", "", soloPAC.length, filas.reduce((s, f) => s + f.monto, 0)],
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws["!cols"] = [16, 26, 18, 18].map(w => ({ wch: w }))
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }]
    XLSX.utils.book_append_sheet(wb, ws, "PAC Agregado")

    const wsDetalle = XLSX.utils.aoa_to_sheet([
      ["SERVICIO", "RUBRO", "SUB-RUBRO", "DESCRIPCIÓN", "CANTIDAD", "PRECIO ACTUALIZADO", "IMPORTE TOTAL", "TIPO", "TRIMESTRE", "ESTADO"],
      ...soloPAC.map(p => [
        p.servicio, rubroNombre(p.rubro_id), subRubroNombre(p.sub_rubro_id), p.descripcion_arce,
        p.cantidad_solicitada, p.precio_actualizado, p.importe_total, p.tipo_compra_estimado,
        p.trimestre_estimado ? `T${p.trimestre_estimado}` : "", estadoPrevInfo(p.estado).label,
      ]),
    ])
    wsDetalle["!cols"] = [18, 20, 22, 40, 10, 16, 16, 8, 10, 14].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle")

    XLSX.writeFile(wb, `PAC_${filterAnio}_DivCom_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      {errMsg && <div style={{ background: "#fde8e8", color: "#c0392b", padding: 10, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>⚠️ {errMsg}</div>}

      {/* RESUMEN */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>📅 Total previsto {filterAnio}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1a3a5c" }}>{fmt(totalPrevisto)}</div>
        </div>
        <div style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Ítems cargados</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#2e75b6" }}>{filtradas.length}</div>
        </div>
        <div style={{ background: sinJustificar.length ? "#fff8e1" : "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>⚠️ Sin justificación (ítems nuevos)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: sinJustificar.length ? "#e67e22" : "#27ae60" }}>{sinJustificar.length}</div>
        </div>
      </div>

      {/* FILTROS Y ACCIONES */}
      <div style={{ background: "white", borderRadius: 12, padding: "14px 16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,.06)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterAnio} onChange={e => setFilterAnio(Number(e.target.value))} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600 }}>
          {aniosDisponibles.map(a => <option key={a} value={a}>Año {a}</option>)}
        </select>
        <select value={filterServicio} onChange={e => setFilterServicio(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          <option value="">Todos los servicios</option>
          {serviciosDisponibles.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          <option value="">Todos los estados</option>
          {ESTADOS_PREV.map(e => <option key={e.v} value={e.v}>{e.label}</option>)}
        </select>
        <button onClick={openAdd} style={{ background: "#27ae60", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>➕ Nueva Previsión</button>
        <button onClick={exportarPAC} disabled={!filtradas.length} style={{ background: "#2e75b6", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: filtradas.length ? "pointer" : "default", opacity: filtradas.length ? 1 : .5, marginLeft: "auto" }}>⬇ Exportar PAC</button>
      </div>

      {sinJustificar.length > 0 && (
        <div style={{ background: "#fff8e1", border: "1px solid #f0d878", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#856404" }}>
          ⚠️ Hay <b>{sinJustificar.length}</b> ítem(s) marcados como "nunca adquiridos" sin justificación cargada — el protocolo exige informe del servicio solicitante para estos casos (Anexo I, punto II.B.2.b.ii).
        </div>
      )}

      {/* TABLA */}
      <div style={{ background: "white", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1a3a5c" }}>
                {["Servicio", "Rubro / Sub-Rubro", "Descripción", "Cant.", "Precio Actualizado", "Importe Total", "Tipo", "Trim.", "PAC", "Estado", ""].map(h => (
                  <th key={h} style={{ color: "white", padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ padding: 20, textAlign: "center", color: "#888" }}>Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: 20, textAlign: "center", color: "#888" }}>No hay previsiones cargadas para este filtro.</td></tr>
              ) : filtradas.map((p, i) => {
                const e = estadoPrevInfo(p.estado)
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? "#fafbfc" : "white", borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{p.servicio}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div>{rubroNombre(p.rubro_id) || "-"}</div>
                      <div style={{ color: "#888", fontSize: 11 }}>{subRubroNombre(p.sub_rubro_id)}</div>
                    </td>
                    <td style={{ padding: "8px 12px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.descripcion_arce}>
                      {p.descripcion_arce}
                      {p.es_nunca_adquirido && <span title="Nunca adquirido por la Unidad Ejecutora" style={{ marginLeft: 5 }}>🆕</span>}
                      {p.es_recambio && <span title="Recambio" style={{ marginLeft: 5 }}>🔁</span>}
                    </td>
                    <td style={{ padding: "8px 12px" }}>{p.cantidad_solicitada}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{fmt(p.precio_actualizado)}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1a3a5c", whiteSpace: "nowrap" }}>{fmt(p.importe_total)}</td>
                    <td style={{ padding: "8px 12px" }}><span style={{ background: "#e8f0fe", color: "#2e75b6", borderRadius: 4, padding: "2px 7px", fontWeight: 700, fontSize: 11 }}>{p.tipo_compra_estimado}</span></td>
                    <td style={{ padding: "8px 12px" }}>{p.trimestre_estimado ? `T${p.trimestre_estimado}` : "-"}</td>
                    <td style={{ padding: "8px 12px" }}>{p.pac}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ background: e.bg, color: e.color, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>{e.label}</span>
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openEdit(p)} style={{ background: "#e8f0fe", border: "none", borderRadius: 6, padding: "4px 7px", cursor: "pointer", fontSize: 11 }}>✏️</button>
                        {isAdmin && <button onClick={() => setConfirmDel(p)} style={{ background: "#fde8e8", border: "none", borderRadius: 6, padding: "4px 7px", cursor: "pointer", fontSize: 11 }}>🗑</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL ADD/EDIT */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 760, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ background: "linear-gradient(135deg,#1a3a5c,#2e75b6)", padding: "18px 24px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "white", fontWeight: 700, fontSize: 16 }}>{modal.mode === "add" ? "➕ Nueva Previsión" : "✏️ Editar Previsión"}</span>
              <button onClick={() => setModal(null)} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "white", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Año de ejercicio</label>
                <input type="number" value={form.anio_ejercicio} onChange={e => setForm(p => ({ ...p, anio_ejercicio: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Servicio solicitante</label>
                <input value={form.servicio} onChange={e => setForm(p => ({ ...p, servicio: e.target.value }))} style={inputStyle} placeholder="Ej: Cardiología, Farmacia..." />
              </div>
              <div>
                <label style={labelStyle}>Rubro</label>
                <select value={form.rubro_id || ""} onChange={e => setForm(p => ({ ...p, rubro_id: e.target.value, sub_rubro_id: "" }))} style={inputStyle}>
                  <option value="">—</option>
                  {rubros.map(r => <option key={r.id} value={r.id}>{r.codigo} - {r.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sub-Rubro</label>
                <select value={form.sub_rubro_id || ""} onChange={e => setForm(p => ({ ...p, sub_rubro_id: e.target.value }))} disabled={!form.rubro_id} style={inputStyle}>
                  <option value="">—</option>
                  {subRubrosDe(form.rubro_id).map(s => <option key={s.id} value={s.id}>{s.codigo} - {s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Código ARCE (si se conoce)</label>
                <input value={form.codigo_arce} onChange={e => setForm(p => ({ ...p, codigo_arce: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Unidad</label>
                <input value={form.unidad} onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Descripción del bien o servicio</label>
                <input value={form.descripcion_arce} onChange={e => setForm(p => ({ ...p, descripcion_arce: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Detalle / variante</label>
                <input value={form.detalle} onChange={e => setForm(p => ({ ...p, detalle: e.target.value }))} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Cantidad solicitada</label>
                <input type="number" value={form.cantidad_solicitada} onChange={e => setForm(p => ({ ...p, cantidad_solicitada: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Precio unitario de referencia</label>
                <input type="number" value={form.precio_unitario_referencia} onChange={e => setForm(p => ({ ...p, precio_unitario_referencia: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Año de ese precio de referencia</label>
                <input type="number" value={form.anio_precio_referencia} onChange={e => setForm(p => ({ ...p, anio_precio_referencia: e.target.value }))} style={inputStyle} placeholder="Ej: 2024" />
              </div>
              <div style={{ background: "#f8f9fb", borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase" }}>Precio actualizado (10% anual, Anexo I II.B.2.b)</div>
                <div style={{ fontWeight: 700, color: "#117a65" }}>{fmt(precioActualizadoForm)}</div>
              </div>

              <div style={{ gridColumn: "1/-1", background: "#eef2ff", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Importe total estimado</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#1a3a5c" }}>{fmt(importeTotalForm)}</span>
              </div>

              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.es_recambio} onChange={e => setForm(p => ({ ...p, es_recambio: e.target.checked }))} /> Es recambio
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.es_nunca_adquirido} onChange={e => setForm(p => ({ ...p, es_nunca_adquirido: e.target.checked }))} /> Nunca adquirido antes
                </label>
              </div>
              <div>
                <label style={labelStyle}>PAC / NO PAC</label>
                <select value={form.pac} onChange={e => setForm(p => ({ ...p, pac: e.target.value }))} style={inputStyle}>
                  <option value="PAC">PAC</option>
                  <option value="NO PAC">NO PAC</option>
                </select>
              </div>

              {(form.es_nunca_adquirido || form.es_recambio) && (
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={labelStyle}>Justificación {form.es_nunca_adquirido && <span style={{ color: "#c0392b" }}>(obligatoria — ítem nunca adquirido)</span>}</label>
                  <textarea value={form.justificacion} onChange={e => setForm(p => ({ ...p, justificacion: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              )}

              <div>
                <label style={labelStyle}>Tipo de compra estimado</label>
                <select value={form.tipo_compra_estimado} onChange={e => setForm(p => ({ ...p, tipo_compra_estimado: e.target.value }))} style={inputStyle}>
                  {TIPOS_PREV.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Trimestre estimado</label>
                <select value={form.trimestre_estimado} onChange={e => setForm(p => ({ ...p, trimestre_estimado: e.target.value }))} style={inputStyle}>
                  <option value="">—</option>
                  {[1, 2, 3, 4].map(t => <option key={t} value={t}>T{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Estado</label>
                <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} style={inputStyle}>
                  {ESTADOS_PREV.map(e => <option key={e.v} value={e.v}>{e.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Observaciones</label>
                <textarea value={form.observaciones} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>
            {errMsg && <div style={{ padding: "0 24px", color: "#c0392b", fontSize: 12 }}>⚠️ {errMsg}</div>}
            <div style={{ padding: "16px 24px 24px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModal(null)} style={{ background: "#f0f0f0", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, color: "#555", fontSize: 13 }}>Cancelar</button>
              <button onClick={saveForm} disabled={saving} style={{ background: "#2e75b6", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, color: "white", fontSize: 13 }}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "white", borderRadius: 14, padding: 32, maxWidth: 400, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,.3)", textAlign: "center" }}>
            <div style={{ fontSize: 15, marginBottom: 18 }}>¿Eliminar la previsión de <b>{confirmDel.descripcion_arce}</b>?</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDel(null)} style={{ background: "#f0f0f0", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Cancelar</button>
              <button onClick={() => deleteRec(confirmDel)} style={{ background: "#c0392b", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, color: "white", fontSize: 13 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
