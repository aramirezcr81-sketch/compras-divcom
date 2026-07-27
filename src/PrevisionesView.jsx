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

const PRIORIDAD_INFO = {
  1: { label: "Prioridad 1", color: "#c0392b", bg: "#fde8e8" },
  2: { label: "Prioridad 2", color: "#e67e22", bg: "#fff3e0" },
  3: { label: "Prioridad 3", color: "#2e75b6", bg: "#e3f0fd" },
}

// ── Columnas EXACTAS del export real del Sistema de Previsiones (Sanidad Militar) ──
// SERVICIO SOLICITANTE | CÓD ACCE | DESCRIPCIÓN ACCE | CÓDIGO VARIANTE ACCE | DESCRIPCIÓN VARIANTE ACCE |
// UNIDAD DE ENTREGA ACCE | CANTIDAD 2023 | CANTIDAD 2024 | CANTIDAD 2025 | IMPUESTOS | PROMEDIO SISTEMA |
// COSTO UNITARIO SIN IMPUESTOS SISTEMA | IMPUESTOS SISTEMA | COSTO TOTAL IMPUESTOS INCLUIDOS SISTEMA |
// CANTIDAD SOLICITADA SERVICIO | COSTO UNITARIO SIN IMPUESTOS SERVICIO | IMPUESTOS SERVICIO |
// COSTO TOTAL IMPUESTOS INCLUIDOS SERVICIO | PRIORIDAD SERVICIO | OBSERVACIONES DEL SERVICIO
const COL = {
  servicio_solicitante: 0, cod_acce: 1, descripcion_acce: 2, codigo_variante_acce: 3,
  descripcion_variante_acce: 4, unidad_entrega_acce: 5, cantidad_2023: 6, cantidad_2024: 7,
  cantidad_2025: 8, impuestos_texto: 9, promedio_sistema: 10, costo_unitario_sistema: 11,
  impuestos_sistema: 12, costo_total_sistema: 13, cantidad_solicitada_servicio: 14,
  costo_unitario_servicio: 15, impuestos_servicio: 16, costo_total_servicio: 17,
  prioridad_servicio: 18, observaciones_servicio: 19,
}

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
const fmt = (n) => n || n === 0 ? `$ ${Number(n).toLocaleString('es-UY', { maximumFractionDigits: 0 })}` : "-"
const inputStyle = { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }
const labelStyle = { fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: .5, display: "block", marginBottom: 4 }

const emptyForm = (anioDefault) => ({
  anio_ejercicio: anioDefault, servicio_solicitante: "", cod_acce: "", descripcion_acce: "",
  codigo_variante_acce: "", descripcion_variante_acce: "", unidad_entrega_acce: "UNIDAD",
  cantidad_2023: "", cantidad_2024: "", cantidad_2025: "",
  promedio_sistema: "", costo_unitario_sistema: "", costo_total_sistema: "",
  cantidad_solicitada_servicio: "", costo_unitario_servicio: "", costo_total_servicio: "",
  prioridad_servicio: "", observaciones_servicio: "",
  rubro_id: "", sub_rubro_id: "", tipo_compra_estimado: "CD", trimestre_estimado: "",
  pac: "PAC", estado: "BORRADOR", observaciones: "",
})

export default function PrevisionesView({ rubros, subRubros, isAdmin }) {
  const anioActual = new Date().getFullYear()
  const [previsiones, setPrevisiones] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState("")
  const [filterAnio, setFilterAnio] = useState(anioActual + 1)
  const [filterServicio, setFilterServicio] = useState("")
  const [filterEstado, setFilterEstado] = useState("")
  const [filterPrioridad, setFilterPrioridad] = useState("")
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm(anioActual + 1))
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const fetchPrevisiones = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('previsiones').select('*')
      .order('servicio_solicitante').order('prioridad_servicio')
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

  const serviciosDisponibles = useMemo(() => [...new Set(previsiones.map(p => p.servicio_solicitante).filter(Boolean))].sort(), [previsiones])
  const aniosDisponibles = useMemo(() => {
    const set = new Set(previsiones.map(p => p.anio_ejercicio).filter(Boolean))
    set.add(anioActual + 1)
    return [...set].sort((a, b) => a - b)
  }, [previsiones])

  const filtradas = useMemo(() => previsiones.filter(p =>
    (!filterAnio || p.anio_ejercicio === Number(filterAnio)) &&
    (!filterServicio || p.servicio_solicitante === filterServicio) &&
    (!filterEstado || p.estado === filterEstado) &&
    (!filterPrioridad || p.prioridad_servicio === Number(filterPrioridad))
  ), [previsiones, filterAnio, filterServicio, filterEstado, filterPrioridad])

  const totalPrevisto = filtradas.reduce((s, p) => s + (Number(p.costo_total_servicio) || 0), 0)
  const totalesPrioridad = { 1: 0, 2: 0, 3: 0 }
  filtradas.forEach(p => { if (totalesPrioridad[p.prioridad_servicio] !== undefined) totalesPrioridad[p.prioridad_servicio] += Number(p.costo_total_servicio) || 0 })

  const openAdd = () => { setForm(emptyForm(filterAnio || anioActual + 1)); setErrMsg(""); setModal({ mode: "add" }) }
  const openEdit = (p) => { setForm({ ...p }); setErrMsg(""); setModal({ mode: "edit", record: p }) }

  const saveForm = async () => {
    setSaving(true); setErrMsg("")
    const payload = {
      ...form,
      anio_ejercicio: Number(form.anio_ejercicio) || anioActual + 1,
      rubro_id: form.rubro_id ? Number(form.rubro_id) : null,
      sub_rubro_id: form.sub_rubro_id ? Number(form.sub_rubro_id) : null,
      cantidad_2023: num(form.cantidad_2023), cantidad_2024: num(form.cantidad_2024), cantidad_2025: num(form.cantidad_2025),
      promedio_sistema: num(form.promedio_sistema), costo_unitario_sistema: num(form.costo_unitario_sistema),
      costo_total_sistema: num(form.costo_total_sistema),
      cantidad_solicitada_servicio: num(form.cantidad_solicitada_servicio),
      costo_unitario_servicio: num(form.costo_unitario_servicio),
      costo_total_servicio: num(form.costo_total_servicio) || (num(form.cantidad_solicitada_servicio) * num(form.costo_unitario_servicio)),
      prioridad_servicio: form.prioridad_servicio ? Number(form.prioridad_servicio) : null,
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

  // ── Export PAC ──
  const exportarPAC = () => {
    const soloPAC = filtradas.filter(p => (p.pac || "PAC") === "PAC")
    const grupos = {}
    soloPAC.forEach(p => {
      const trim = p.trimestre_estimado || 0
      const tipo = p.tipo_compra_estimado || "OTRO"
      const key = `${trim}|${tipo}`
      if (!grupos[key]) grupos[key] = { trimestre: trim, tipo, monto: 0, cantidad: 0 }
      grupos[key].monto += Number(p.costo_total_servicio) || 0
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
      ["SERVICIO", "CÓD ACCE", "DESCRIPCIÓN ACCE", "VARIANTE", "RUBRO", "SUB-RUBRO", "CANT. 2023", "CANT. 2024", "CANT. 2025",
       "CANT. SOLICITADA", "COSTO UNIT. SERVICIO", "COSTO TOTAL SERVICIO", "PRIORIDAD", "TIPO", "TRIMESTRE", "ESTADO"],
      ...soloPAC.map(p => [
        p.servicio_solicitante, p.cod_acce, p.descripcion_acce, p.descripcion_variante_acce,
        rubroNombre(p.rubro_id), subRubroNombre(p.sub_rubro_id),
        p.cantidad_2023, p.cantidad_2024, p.cantidad_2025,
        p.cantidad_solicitada_servicio, p.costo_unitario_servicio, p.costo_total_servicio,
        p.prioridad_servicio, p.tipo_compra_estimado, p.trimestre_estimado ? `T${p.trimestre_estimado}` : "",
        estadoPrevInfo(p.estado).label,
      ]),
    ])
    wsDetalle["!cols"] = [26, 10, 34, 22, 20, 22, 10, 10, 10, 12, 14, 14, 9, 8, 10, 14].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle")

    XLSX.writeFile(wb, `PAC_${filterAnio}_DivCom_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Importador: parsea el export REAL del Sistema de Previsiones ──
  const [showImport, setShowImport] = useState(false)
  const [importStep, setImportStep] = useState(1)
  const [importDefaults, setImportDefaults] = useState({
    anio_ejercicio: anioActual + 1, rubro_id: "", sub_rubro_id: "",
    tipo_compra_estimado: "CD", trimestre_estimado: "", pac: "PAC",
  })
  const [importParsed, setImportParsed] = useState([])
  const [importInfo, setImportInfo] = useState(null) // {titulo, anioDetectado, servicios, filas}
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState("")
  const [importResult, setImportResult] = useState(null)

  const resetImport = () => {
    setShowImport(false); setImportStep(1); setImportParsed([]); setImportInfo(null)
    setImportErr(""); setImportResult(null)
  }

  const handleArchivoSeleccionado = async (file) => {
    setImportErr("")
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })

      const tituloFila = aoa.find(r => (r[0] || "").toString().trim() !== "") || []
      const titulo = (tituloFila[0] || "").toString()
      const anioMatch = titulo.match(/20\d{2}/)
      const anioDetectado = anioMatch ? Number(anioMatch[0]) : (anioActual + 1)

      const headerRowIdx = aoa.findIndex(r => (r[0] || "").toString().trim().toUpperCase().includes("SERVICIO SOLICITANTE"))
      if (headerRowIdx === -1) {
        setImportErr("No reconozco el formato: no encontré la fila de encabezados 'SERVICIO SOLICITANTE'. ¿Es un export del Sistema de Previsiones?")
        return
      }
      const dataRows = aoa.slice(headerRowIdx + 1).filter(r => (r[COL.descripcion_acce] || "").toString().trim() !== "")

      const parsed = dataRows.map(r => ({
        servicio_solicitante: (r[COL.servicio_solicitante] || "").toString().trim(),
        cod_acce: (r[COL.cod_acce] ?? "").toString().trim(),
        descripcion_acce: (r[COL.descripcion_acce] || "").toString().trim(),
        codigo_variante_acce: (r[COL.codigo_variante_acce] ?? "").toString().trim(),
        descripcion_variante_acce: (r[COL.descripcion_variante_acce] || "").toString().trim(),
        unidad_entrega_acce: (r[COL.unidad_entrega_acce] || "").toString().trim(),
        cantidad_2023: num(r[COL.cantidad_2023]), cantidad_2024: num(r[COL.cantidad_2024]), cantidad_2025: num(r[COL.cantidad_2025]),
        impuestos_texto: (r[COL.impuestos_texto] || "").toString().trim(),
        promedio_sistema: num(r[COL.promedio_sistema]), costo_unitario_sistema: num(r[COL.costo_unitario_sistema]),
        impuestos_sistema: num(r[COL.impuestos_sistema]), costo_total_sistema: num(r[COL.costo_total_sistema]),
        cantidad_solicitada_servicio: num(r[COL.cantidad_solicitada_servicio]),
        costo_unitario_servicio: num(r[COL.costo_unitario_servicio]),
        impuestos_servicio: num(r[COL.impuestos_servicio]), costo_total_servicio: num(r[COL.costo_total_servicio]),
        prioridad_servicio: r[COL.prioridad_servicio] ? Number(r[COL.prioridad_servicio]) : null,
        observaciones_servicio: (r[COL.observaciones_servicio] || "").toString().trim(),
      })).filter(f => f.descripcion_acce)

      if (!parsed.length) { setImportErr("No se encontraron filas de datos debajo del encabezado."); return }

      setImportParsed(parsed)
      setImportInfo({
        titulo, anioDetectado,
        servicios: [...new Set(parsed.map(p => p.servicio_solicitante))],
        filas: parsed.length,
      })
      setImportDefaults(p => ({ ...p, anio_ejercicio: anioDetectado }))
      setImportStep(2)
    } catch (e) {
      setImportErr("No se pudo leer el archivo: " + e.message)
    }
  }

  const filasParaImportar = useMemo(() => importParsed.map(p => ({
    ...p,
    anio_ejercicio: Number(importDefaults.anio_ejercicio) || anioActual + 1,
    rubro_id: importDefaults.rubro_id ? Number(importDefaults.rubro_id) : null,
    sub_rubro_id: importDefaults.sub_rubro_id ? Number(importDefaults.sub_rubro_id) : null,
    tipo_compra_estimado: importDefaults.tipo_compra_estimado,
    trimestre_estimado: importDefaults.trimestre_estimado ? Number(importDefaults.trimestre_estimado) : null,
    pac: importDefaults.pac,
    estado: "BORRADOR",
  })), [importParsed, importDefaults, anioActual])

  const confirmarImportacion = async () => {
    setImporting(true); setImportErr("")
    const filas = filasParaImportar
    const tamanoLote = 200
    let insertadas = 0
    for (let i = 0; i < filas.length; i += tamanoLote) {
      const lote = filas.slice(i, i + tamanoLote)
      const { error } = await supabase.from('previsiones').insert(lote)
      if (error) { setImportErr(error.message); setImporting(false); return }
      insertadas += lote.length
    }
    setImportResult(insertadas)
    setImporting(false)
    fetchPrevisiones()
  }

  return (
    <div>
      {errMsg && <div style={{ background: "#fde8e8", color: "#c0392b", padding: 10, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>⚠️ {errMsg}</div>}

      {/* RESUMEN */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>📅 Total previsto {filterAnio}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a3a5c" }}>{fmt(totalPrevisto)}</div>
        </div>
        <div style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Ítems cargados</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#2e75b6" }}>{filtradas.length}</div>
        </div>
        {[1, 2, 3].map(pr => (
          <div key={pr} style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 11, color: PRIORIDAD_INFO[pr].color, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6, fontWeight: 700 }}>{PRIORIDAD_INFO[pr].label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a3a5c" }}>{fmt(totalesPrioridad[pr])}</div>
          </div>
        ))}
      </div>

      {/* FILTROS Y ACCIONES */}
      <div style={{ background: "white", borderRadius: 12, padding: "14px 16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,.06)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterAnio} onChange={e => setFilterAnio(Number(e.target.value))} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600 }}>
          {aniosDisponibles.map(a => <option key={a} value={a}>Año {a}</option>)}
        </select>
        <select value={filterServicio} onChange={e => setFilterServicio(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, maxWidth: 220 }}>
          <option value="">Todos los servicios</option>
          {serviciosDisponibles.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterPrioridad} onChange={e => setFilterPrioridad(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          <option value="">Toda prioridad</option>
          {[1, 2, 3].map(p => <option key={p} value={p}>Prioridad {p}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          <option value="">Todos los estados</option>
          {ESTADOS_PREV.map(e => <option key={e.v} value={e.v}>{e.label}</option>)}
        </select>
        <button onClick={openAdd} style={{ background: "#27ae60", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>➕ Nueva</button>
        <button onClick={() => { resetImport(); setShowImport(true) }} style={{ background: "#8e44ad", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>📥 Importar del Sistema</button>
        <button onClick={exportarPAC} disabled={!filtradas.length} style={{ background: "#2e75b6", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: filtradas.length ? "pointer" : "default", opacity: filtradas.length ? 1 : .5, marginLeft: "auto" }}>⬇ Exportar PAC</button>
      </div>

      {/* TABLA */}
      <div style={{ background: "white", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1a3a5c" }}>
                {["Servicio", "ACCE / Variante", "Consumo 23/24/25", "Sistema (cant. / costo)", "Servicio (cant. / costo)", "Prior.", "Rubro DivCom", "Estado", ""].map(h => (
                  <th key={h} style={{ color: "white", padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#888" }}>Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#888" }}>No hay previsiones cargadas para este filtro.</td></tr>
              ) : filtradas.map((p, i) => {
                const e = estadoPrevInfo(p.estado)
                const pr = PRIORIDAD_INFO[p.prioridad_servicio]
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? "#fafbfc" : "white", borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.servicio_solicitante}>{p.servicio_solicitante}</td>
                    <td style={{ padding: "8px 12px", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.descripcion_acce}>{p.cod_acce} — {p.descripcion_acce}</div>
                      <div style={{ color: "#888", fontSize: 11 }}>{p.descripcion_variante_acce}</div>
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontSize: 11, color: "#666" }}>{p.cantidad_2023}/{p.cantidad_2024}/{p.cantidad_2025}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontSize: 11 }}>
                      <div>{p.promedio_sistema} u.</div>
                      <div style={{ color: "#888" }}>{fmt(p.costo_total_sistema)}</div>
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 700 }}>{p.cantidad_solicitada_servicio} u.</div>
                      <div style={{ color: "#117a65", fontWeight: 700 }}>{fmt(p.costo_total_servicio)}</div>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {pr && <span style={{ background: pr.bg, color: pr.color, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>{p.prioridad_servicio}</span>}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap" }}>
                      {p.rubro_id ? rubroNombre(p.rubro_id) : <span style={{ color: "#bbb" }}>sin asignar</span>}
                    </td>
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
          <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 800, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
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
                <input value={form.servicio_solicitante} onChange={e => setForm(p => ({ ...p, servicio_solicitante: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cód. ACCE</label>
                <input value={form.cod_acce} onChange={e => setForm(p => ({ ...p, cod_acce: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Unidad de entrega ACCE</label>
                <input value={form.unidad_entrega_acce} onChange={e => setForm(p => ({ ...p, unidad_entrega_acce: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Descripción ACCE</label>
                <input value={form.descripcion_acce} onChange={e => setForm(p => ({ ...p, descripcion_acce: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Descripción variante ACCE</label>
                <input value={form.descripcion_variante_acce} onChange={e => setForm(p => ({ ...p, descripcion_variante_acce: e.target.value }))} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Cantidad 2023</label>
                <input type="number" value={form.cantidad_2023} onChange={e => setForm(p => ({ ...p, cantidad_2023: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad 2024</label>
                <input type="number" value={form.cantidad_2024} onChange={e => setForm(p => ({ ...p, cantidad_2024: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad 2025</label>
                <input type="number" value={form.cantidad_2025} onChange={e => setForm(p => ({ ...p, cantidad_2025: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Prioridad del Servicio</label>
                <select value={form.prioridad_servicio} onChange={e => setForm(p => ({ ...p, prioridad_servicio: e.target.value }))} style={inputStyle}>
                  <option value="">—</option>
                  <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Cantidad solicitada (Servicio)</label>
                <input type="number" value={form.cantidad_solicitada_servicio} onChange={e => setForm(p => ({ ...p, cantidad_solicitada_servicio: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Costo unitario (Servicio)</label>
                <input type="number" value={form.costo_unitario_servicio} onChange={e => setForm(p => ({ ...p, costo_unitario_servicio: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1/-1", background: "#eef2ff", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Costo total (Servicio)</span>
                <input type="number" value={form.costo_total_servicio} onChange={e => setForm(p => ({ ...p, costo_total_servicio: e.target.value }))} style={{ ...inputStyle, width: 160, fontWeight: 700 }} placeholder={fmt(num(form.cantidad_solicitada_servicio) * num(form.costo_unitario_servicio))} />
              </div>

              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Observaciones del Servicio</label>
                <textarea value={form.observaciones_servicio} onChange={e => setForm(p => ({ ...p, observaciones_servicio: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </div>

              <div style={{ gridColumn: "1/-1", borderTop: "1px solid #eee", paddingTop: 14, fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Clasificación propia de DivCom</div>
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
                <label style={labelStyle}>PAC / NO PAC</label>
                <select value={form.pac} onChange={e => setForm(p => ({ ...p, pac: e.target.value }))} style={inputStyle}>
                  <option value="PAC">PAC</option>
                  <option value="NO PAC">NO PAC</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Estado</label>
                <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} style={inputStyle}>
                  {ESTADOS_PREV.map(e => <option key={e.v} value={e.v}>{e.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Observaciones de DivCom</label>
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
            <div style={{ fontSize: 15, marginBottom: 18 }}>¿Eliminar la previsión de <b>{confirmDel.descripcion_acce}</b>?</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDel(null)} style={{ background: "#f0f0f0", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Cancelar</button>
              <button onClick={() => deleteRec(confirmDel)} style={{ background: "#c0392b", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, color: "white", fontSize: 13 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR */}
      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 820, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ background: "linear-gradient(135deg,#5b2c6f,#8e44ad)", padding: "18px 24px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "white", fontWeight: 700, fontSize: 16 }}>📥 Importar del Sistema de Previsiones — Paso {importStep} de 2</span>
              <button onClick={resetImport} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "white", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              {importErr && <div style={{ background: "#fde8e8", color: "#c0392b", padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>⚠️ {importErr}</div>}

              {importStep === 1 && (
                <>
                  <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
                    Subí el archivo tal cual lo exporta el Sistema de Previsiones (ej. <code>SIST_PREV_AL_...xls</code>). Reconozco el formato automáticamente — no hace falta mapear columnas.
                  </p>
                  <label style={{ display: "block", border: "2px dashed #d0d0d0", borderRadius: 12, padding: "30px 20px", textAlign: "center", cursor: "pointer", color: "#555" }}>
                    📄 Hacé clic para elegir el archivo (.xls o .xlsx)
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleArchivoSeleccionado(e.target.files[0])} />
                  </label>
                </>
              )}

              {importStep === 2 && importResult === null && (
                <>
                  <div style={{ background: "#f0f6ff", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
                    <div><b>Título detectado:</b> {importInfo?.titulo}</div>
                    <div><b>Año detectado:</b> {importInfo?.anioDetectado}</div>
                    <div><b>Servicios encontrados ({importInfo?.servicios.length}):</b> {importInfo?.servicios.join(", ")}</div>
                    <div><b>Filas de ítems:</b> {importInfo?.filas}</div>
                  </div>
                  <p style={{ fontSize: 13, color: "#555" }}>Estos campos son propios de DivCom (el Sistema de Previsiones no los trae) y se aplican a <b>todas</b> las filas de este archivo — los podés dejar en blanco y asignarlos después, fila por fila:</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                    <div>
                      <label style={labelStyle}>Año de ejercicio</label>
                      <input type="number" value={importDefaults.anio_ejercicio} onChange={e => setImportDefaults(p => ({ ...p, anio_ejercicio: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>PAC / NO PAC</label>
                      <select value={importDefaults.pac} onChange={e => setImportDefaults(p => ({ ...p, pac: e.target.value }))} style={inputStyle}>
                        <option value="PAC">PAC</option>
                        <option value="NO PAC">NO PAC</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Rubro (opcional)</label>
                      <select value={importDefaults.rubro_id} onChange={e => setImportDefaults(p => ({ ...p, rubro_id: e.target.value, sub_rubro_id: "" }))} style={inputStyle}>
                        <option value="">—</option>
                        {rubros.map(r => <option key={r.id} value={r.id}>{r.codigo} - {r.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Sub-Rubro (opcional)</label>
                      <select value={importDefaults.sub_rubro_id} onChange={e => setImportDefaults(p => ({ ...p, sub_rubro_id: e.target.value }))} disabled={!importDefaults.rubro_id} style={inputStyle}>
                        <option value="">—</option>
                        {subRubrosDe(importDefaults.rubro_id).map(s => <option key={s.id} value={s.id}>{s.codigo} - {s.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Tipo de compra estimado</label>
                      <select value={importDefaults.tipo_compra_estimado} onChange={e => setImportDefaults(p => ({ ...p, tipo_compra_estimado: e.target.value }))} style={inputStyle}>
                        {TIPOS_PREV.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Trimestre estimado</label>
                      <select value={importDefaults.trimestre_estimado} onChange={e => setImportDefaults(p => ({ ...p, trimestre_estimado: e.target.value }))} style={inputStyle}>
                        <option value="">—</option>
                        {[1, 2, 3, 4].map(t => <option key={t} value={t}>T{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10, marginBottom: 16, maxHeight: 260 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: "#f0f0f0" }}>
                          {["Servicio", "Descripción ACCE", "Cant. Servicio", "Costo Total Servicio", "Prioridad"].map(h => (
                            <th key={h} style={{ padding: "6px 8px", textAlign: "left", position: "sticky", top: 0, background: "#f0f0f0" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filasParaImportar.slice(0, 15).map((f, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }}>
                            <td style={{ padding: "6px 8px" }}>{f.servicio_solicitante}</td>
                            <td style={{ padding: "6px 8px" }}>{f.descripcion_acce}</td>
                            <td style={{ padding: "6px 8px" }}>{f.cantidad_solicitada_servicio}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 700 }}>{fmt(f.costo_total_servicio)}</td>
                            <td style={{ padding: "6px 8px" }}>{f.prioridad_servicio || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filasParaImportar.length > 15 && <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>… y {filasParaImportar.length - 15} filas más.</div>}

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => setImportStep(1)} style={{ background: "#f0f0f0", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>← Atrás</button>
                    <button onClick={confirmarImportacion} disabled={importing || !filasParaImportar.length}
                      style={{ background: "#27ae60", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, color: "white", fontSize: 13 }}>
                      {importing ? "Importando..." : `✅ Confirmar importación (${filasParaImportar.length})`}
                    </button>
                  </div>
                </>
              )}

              {importStep === 2 && importResult !== null && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                  <div style={{ fontSize: 15, marginBottom: 20 }}>Se importaron <b>{importResult}</b> previsiones correctamente, en estado Borrador.</div>
                  <button onClick={resetImport} style={{ background: "#2e75b6", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, color: "white", fontSize: 13 }}>Cerrar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
