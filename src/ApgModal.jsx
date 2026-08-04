import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import { generarAnexoCompraDirecta, generarNotaJefe, generarDistribucionAnios, generarFormularioA, generarFormularioB, generarMemoAutorizacionGastar } from './docGenerators'
import { itemTotalUR, itemCantidadTotal, itemTotalURTotal, grandTotalUR, grandTotalPesos, basePesosSinVariacion, fmtUR, fmtPesos } from './apgCalc'

const MESES = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]

const TIPO_SOLICITUD_MAP = {
  CD: "Compra Directa", CDA: "Compra Directa Ampliada", CDE: "Compra Directa Excepcional",
  CDNC: "Compra Directa Convenio Marco", CPA: "Convenio de Participación Ampliado",
  LA: "Licitación Abreviada", LAA: "Licitación Abreviada Ampliada", LP: "Licitación Pública", OTRO: "",
}

// Formulario A: Compras Directas y Licitaciones (manual 3.1). Formulario B: excepción — exclusividad,
// importaciones, contratación entre organismos del Estado (manual 3.2). Editable por si el caso concreto no encaja.
const FORMULARIO_TIPO_DEFAULT = { CD:"A", CDA:"A", LA:"A", LAA:"A", LP:"A", CDE:"B", CDNC:"B", CPA:"B", OTRO:"A" }

const MONEDA_OPCIONES = [
  { value: "UR", label: "UR — Unidad Reajustable" },
  { value: "PESOS", label: "$ — Pesos uruguayos" },
  { value: "USD", label: "USD — Dólares" },
]
const MONEDA_CODIGO = { UR: "UR", PESOS: "$", USD: "USD" }

const ESTADOS_APG = [
  { value: "CONFECCION", label: "Confección (Compras)", color: "#2e75b6", icon: "📝" },
  { value: "VISTO_BUENO_CONTABLE", label: "Visto Bueno Contable", color: "#e67e22", icon: "👀" },
  { value: "FIRMA_JEFE", label: "Firma del Jefe", color: "#8e44ad", icon: "✍️" },
  { value: "COMPLETADO", label: "Completado", color: "#27ae60", icon: "✅" },
]
const estadoInfo = (v) => ESTADOS_APG.find(e => e.value === v) || ESTADOS_APG[0]

const emptyTramite = (procedimiento) => ({
  id: null,
  procedimiento_id: procedimiento.id,
  procedimiento: procedimiento.procedimiento,
  concepto: procedimiento.concepto,
  moneda: "UR",
  estado_apg: "CONFECCION",
  servicio_solicitante: "DIVISIÓN COMERCIAL",
  profesional_solicitante: "",
  dias_horarios: "",
  contacto_celular: "",
  contacto_interno: "",
  contacto_correo: "",
  plazo_ejecucion_meses: 12,
  tipo_solicitud: TIPO_SOLICITUD_MAP[procedimiento.tipo] || "",
  destinatario_anexo: "JEFE DE LA DIVISIÓN ADQUISICIONES DE LA D.N.S.FF.AA.",
  destinatario_nota: "JEFE DE LA DIVISIÓN COMERCIAL DE LA D.N.S.FF.AA.",
  articulo_ley: "artículo 27 de la Ley N° 20.446",
  expediente_numero: "",
  numero_apg: "",
  iniciales_firma: "",
  cotizacion_ur: "",
  mes_cotizacion: `${MESES[new Date().getMonth()]} ${new Date().getFullYear()}`,
  pct_variacion_cambio: 10,
  condiciones_particulares: "",
  // MEMO — Solicitud de Autorización para Gastar ─────────────────────
  memo_tipo_tramite: "INICIO",
  memo_referencia_expediente: "",
  memo_motivo: "",
  memo_rubro: "",
  memo_financiacion: "Fondos de terceros",
  memo_iva_exento: false,
  destinatario_memo: "Jefe de la División Planeamiento y Presupuesto",
  // Formulario A / B ────────────────────────────────────────────────
  formulario_tipo: FORMULARIO_TIPO_DEFAULT[procedimiento.tipo] || "A",
  fecha_solicitud: new Date().toISOString().slice(0, 10),
  incluye_especificaciones: true,
  incluye_requerimientos_adm: true,
  incluye_ponderaciones: true,
  especificaciones_tecnicas: true,
  recepcion_lugar: "",
  recepcion_dias: "",
  recepcion_horario: "",
  recepcion_telefono: "",
  recepcion_fecha_limite: "",
  proveedores_convocar: [],
  motivo_menor_proveedores: "",
  proveedor_excepcion_nombre: "",
  proveedor_excepcion_telefono: "",
  proveedor_excepcion_correo: "",
  fundamentacion_excepcion: "",
  documentacion_proveedor: "",
  jefe_divcom_nombre: "Cnel. José E. Perera",
  jefe_divcom_cargo: "Jefe de la División Comercial",
})

const emptyItem = () => ({
  _key: crypto.randomUUID(),
  id: null,
  codigo_arce: "",
  descripcion_arce: "",
  detalle_variante: "",
  unidad_arce: "UNIDAD",
  observaciones: "",
  precio_unitario_ur: "",
  iva_pct: 10,
  convenio_marco: "NO",
  requiere_muestra: false,
  anios: {},
})

const inputStyle = {width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 9px",fontSize:12,boxSizing:"border-box"}
const labelStyle = {fontSize:10,fontWeight:600,color:"#555",textTransform:"uppercase",letterSpacing:.4,display:"block",marginBottom:3}

function Field({ label, value, onChange, type = "text", full }) {
  return (
    <div style={{gridColumn: full ? "1/-1" : "auto"}}>
      <label style={labelStyle}>{label}</label>
      {type === "textarea" ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={3} style={{...inputStyle, resize:"vertical"}} />
      ) : (
        <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  )
}

export default function ApgModal({ procedimiento, session, onClose }) {
  const [tramite, setTramite] = useState(emptyTramite(procedimiento))
  const [items, setItems] = useState([emptyItem()])
  const [anios, setAnios] = useState([new Date().getFullYear()])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generando, setGenerando] = useState("")
  const [errMsg, setErrMsg] = useState("")
  const [historial, setHistorial] = useState([])
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [comentarioEstado, setComentarioEstado] = useState("")
  const [estadoSeleccionado, setEstadoSeleccionado] = useState("CONFECCION")
  const [refOpen, setRefOpen] = useState(null) // _key del ítem con el popover de referencia abierto
  const [refCache, setRefCache] = useState({}) // codigo_arce -> [{estudio, frecuencia}]
  const [refLoading, setRefLoading] = useState(false)
  const [borradorRestaurado, setBorradorRestaurado] = useState(false)
  const [autosaveStatus, setAutosaveStatus] = useState("") // "" | "guardando" | "guardado" | "error"
  const draftKey = `apg_draft_${procedimiento.id}`

  const buscarReferenciaArce = async (it) => {
    const codigo = Number(it.codigo_arce)
    if (!codigo) return
    if (refOpen === it._key) { setRefOpen(null); return }
    setRefOpen(it._key)
    if (refCache[codigo]) return
    setRefLoading(true)
    const { data } = await supabase.from('arce_estudios_referencia')
      .select('estudio, frecuencia').eq('codigo_arce', codigo)
      .order('frecuencia', { ascending: false }).limit(20)
    setRefCache(p => ({ ...p, [codigo]: data || [] }))
    setRefLoading(false)
  }

  const cargarHistorial = async (tramiteId) => {
    const { data, error } = await supabase
      .from('apg_estado_historial')
      .select('*')
      .eq('tramite_id', tramiteId)
      .order('fecha', { ascending: false })
    if (!error) setHistorial(data || [])
  }

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('apg_tramite')
        .select('*, apg_items(*, apg_items_anios(*))')
        .eq('procedimiento_id', procedimiento.id)
        .maybeSingle()

      if (error) { setErrMsg(error.message); setLoading(false); return }

      if (data) {
        const { apg_items, ...t } = data
        setTramite({ ...emptyTramite(procedimiento), ...t })
        setEstadoSeleccionado(t.estado_apg || "CONFECCION")
        await cargarHistorial(t.id)
        if (apg_items?.length) {
          const yearSet = new Set()
          const loadedItems = apg_items.map(it => {
            const aniosMap = {}
            ;(it.apg_items_anios || []).forEach(ay => { aniosMap[ay.anio] = ay.cantidad; yearSet.add(ay.anio) })
            return { _key: crypto.randomUUID(), id: it.id, codigo_arce: it.codigo_arce, descripcion_arce: it.descripcion_arce,
              detalle_variante: it.detalle_variante, unidad_arce: it.unidad_arce, observaciones: it.observaciones,
              precio_unitario_ur: it.precio_unitario_ur, iva_pct: it.iva_pct,
              convenio_marco: it.convenio_marco ?? "NO", requiere_muestra: it.requiere_muestra ?? false, anios: aniosMap }
          })
          setItems(loadedItems)
          setAnios(yearSet.size ? [...yearSet].sort() : [new Date().getFullYear()])
        }
      }
      setLoading(false)

      // Si había un borrador sin guardar (ej. la página se recargó a mitad de carga),
      // lo restauramos por encima de lo que vino de la base, porque es más reciente.
      try {
        const raw = localStorage.getItem(draftKey)
        if (raw) {
          const draft = JSON.parse(raw)
          const catorceDiasMs = 14 * 24 * 60 * 60 * 1000
          if (draft?.guardado && (Date.now() - draft.guardado) > catorceDiasMs) {
            localStorage.removeItem(draftKey) // borrador demasiado viejo, se descarta solo
          } else {
            if (draft?.tramite) setTramite(p => ({ ...p, ...draft.tramite }))
            if (draft?.items?.length) setItems(draft.items)
            if (draft?.anios?.length) setAnios(draft.anios)
            setBorradorRestaurado(true)
          }
        }
      } catch { /* borrador corrupto: se ignora */ }
    })()
  }, [procedimiento.id])

  const updateTramite = (key, val) => setTramite(p => ({ ...p, [key]: val }))

  // Autoguardado: mientras el usuario escribe, vamos dejando un borrador en el
  // navegador. Si la pestaña se recarga a mitad de carga (batería, memoria, etc.),
  // al volver a abrir este mismo trámite se restaura solo, sin perder lo tipeado.
  useEffect(() => {
    if (loading) return
    try {
      localStorage.setItem(draftKey, JSON.stringify({ tramite, items, anios, guardado: Date.now() }))
    } catch { /* si localStorage está lleno o bloqueado, seguimos sin autoguardado */ }
  }, [tramite, items, anios, loading, draftKey])

  const addItem = () => setItems(p => [...p, emptyItem()])
  const removeItem = (key) => setItems(p => p.length > 1 ? p.filter(it => it._key !== key) : p)
  const updateItem = (key, field, val) => setItems(p => p.map(it => it._key === key ? { ...it, [field]: val } : it))
  const updateItemAnio = (key, anio, val) => setItems(p => p.map(it => it._key === key ? { ...it, anios: { ...it.anios, [anio]: val } } : it))

  const addAnio = () => setAnios(p => [...p, Math.max(...p) + 1])
  const removeAnio = (a) => {
    if (anios.length <= 1) return
    setAnios(p => p.filter(x => x !== a))
    setItems(p => p.map(it => { const c = { ...it.anios }; delete c[a]; return { ...it, anios: c } }))
  }

  const itemsCalc = items.filter(it => it.codigo_arce || it.descripcion_arce)

  // Guarda tramite + items en la base. `silencioso=true` lo usa el autoguardado
  // (no toca el spinner ni el cartel de error grande, para no interrumpir mientras
  // se está escribiendo). Devuelve true/false según haya salido bien.
  const persistir = async ({ silencioso = false } = {}) => {
    if (!silencioso) { setSaving(true); setErrMsg("") } else { setAutosaveStatus("guardando") }

    const payload = {
      procedimiento_id: procedimiento.id,
      moneda: tramite.moneda,
      servicio_solicitante: tramite.servicio_solicitante,
      profesional_solicitante: tramite.profesional_solicitante,
      dias_horarios: tramite.dias_horarios,
      contacto_celular: tramite.contacto_celular,
      contacto_interno: tramite.contacto_interno,
      contacto_correo: tramite.contacto_correo,
      plazo_ejecucion_meses: Number(tramite.plazo_ejecucion_meses) || null,
      tipo_solicitud: tramite.tipo_solicitud,
      destinatario_anexo: tramite.destinatario_anexo,
      destinatario_nota: tramite.destinatario_nota,
      articulo_ley: tramite.articulo_ley,
      expediente_numero: tramite.expediente_numero,
      numero_apg: tramite.numero_apg || null,
      iniciales_firma: tramite.iniciales_firma,
      cotizacion_ur: Number(tramite.cotizacion_ur) || null,
      mes_cotizacion: tramite.mes_cotizacion,
      pct_variacion_cambio: Number(tramite.pct_variacion_cambio) || 0,
      condiciones_particulares: tramite.condiciones_particulares,
      // MEMO — Solicitud de Autorización para Gastar ─────────────────
      memo_tipo_tramite: tramite.memo_tipo_tramite,
      memo_referencia_expediente: tramite.memo_referencia_expediente,
      memo_motivo: tramite.memo_motivo,
      memo_rubro: tramite.memo_rubro,
      memo_financiacion: tramite.memo_financiacion,
      memo_iva_exento: !!tramite.memo_iva_exento,
      destinatario_memo: tramite.destinatario_memo,
      // Formulario A / B ────────────────────────────────────────────
      formulario_tipo: tramite.formulario_tipo,
      fecha_solicitud: tramite.fecha_solicitud || null,
      incluye_especificaciones: !!tramite.incluye_especificaciones,
      incluye_requerimientos_adm: !!tramite.incluye_requerimientos_adm,
      incluye_ponderaciones: !!tramite.incluye_ponderaciones,
      especificaciones_tecnicas: !!tramite.especificaciones_tecnicas,
      recepcion_lugar: tramite.recepcion_lugar,
      recepcion_dias: tramite.recepcion_dias,
      recepcion_horario: tramite.recepcion_horario,
      recepcion_telefono: tramite.recepcion_telefono,
      recepcion_fecha_limite: tramite.recepcion_fecha_limite || null,
      proveedores_convocar: tramite.proveedores_convocar || [],
      motivo_menor_proveedores: tramite.motivo_menor_proveedores,
      proveedor_excepcion_nombre: tramite.proveedor_excepcion_nombre,
      proveedor_excepcion_telefono: tramite.proveedor_excepcion_telefono,
      proveedor_excepcion_correo: tramite.proveedor_excepcion_correo,
      fundamentacion_excepcion: tramite.fundamentacion_excepcion,
      documentacion_proveedor: tramite.documentacion_proveedor,
      jefe_divcom_nombre: tramite.jefe_divcom_nombre,
      jefe_divcom_cargo: tramite.jefe_divcom_cargo,
      updated_by: session.user.id,
    }

    const fail = (msg) => {
      if (!silencioso) { setErrMsg(msg); setSaving(false) } else { setAutosaveStatus("error") }
      return false
    }

    let tramiteId = tramite.id
    if (tramiteId) {
      const { error } = await supabase.from('apg_tramite').update(payload).eq('id', tramiteId)
      if (error) return fail(error.message)
    } else {
      const { data, error } = await supabase.from('apg_tramite').insert([{ ...payload, created_by: session.user.id }]).select().single()
      if (error) return fail(error.message)
      tramiteId = data.id
      setTramite(p => ({ ...p, id: tramiteId }))
      await supabase.from('apg_estado_historial').insert([{
        tramite_id: tramiteId, estado: "CONFECCION", comentario: "Trámite iniciado",
        usuario_id: session.user.id, usuario_email: session.user.email,
      }])
      await cargarHistorial(tramiteId)
    }

    // Reemplazar ítems: borrar los anteriores e insertar los actuales (simple y seguro para este volumen de datos)
    const { error: delErr } = await supabase.from('apg_items').delete().eq('tramite_id', tramiteId)
    if (delErr) return fail(delErr.message)

    for (const it of itemsCalc) {
      const { data: itemRow, error: itErr } = await supabase.from('apg_items').insert([{
        tramite_id: tramiteId, codigo_arce: it.codigo_arce, descripcion_arce: it.descripcion_arce,
        detalle_variante: it.detalle_variante, unidad_arce: it.unidad_arce, observaciones: it.observaciones,
        precio_unitario_ur: Number(it.precio_unitario_ur) || 0, iva_pct: Number(it.iva_pct) || 0,
        convenio_marco: it.convenio_marco || "NO", requiere_muestra: !!it.requiere_muestra,
      }]).select().single()
      if (itErr) return fail(itErr.message)

      const filasAnios = anios.filter(a => Number(it.anios[a]) > 0).map(a => ({
        item_id: itemRow.id, anio: a, cantidad: Number(it.anios[a]) || 0,
      }))
      if (filasAnios.length) {
        const { error: ayErr } = await supabase.from('apg_items_anios').insert(filasAnios)
        if (ayErr) return fail(ayErr.message)
      }
    }

    if (!silencioso) { setSaving(false) } else { setAutosaveStatus("guardado") }
    try { localStorage.removeItem(draftKey) } catch { /* no-op */ }
    setBorradorRestaurado(false)

    // Espejar el N° de APG (y el expediente) en `compras` para poder verlos/buscarlos
    // desde el listado principal sin abrir este modal.
    await supabase.from('compras').update({
      numero_apg: tramite.numero_apg || null,
    }).eq('id', procedimiento.id)

    return true
  }

  const saveApg = () => persistir({ silencioso: false })

  // ── Autoguardado real: a los 2,5s de que dejás de escribir, se guarda solo
  // en la base de datos (no depende del navegador ni de que aprietes Guardar).
  const lastSnapshotRef = useRef(null)
  const debounceRef = useRef(null)
  useEffect(() => {
    if (loading) return
    const snapshot = JSON.stringify({ tramite, items, anios })
    if (lastSnapshotRef.current === null) { lastSnapshotRef.current = snapshot; return } // recién cargado, no hay nada nuevo que guardar
    if (snapshot === lastSnapshotRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const ok = await persistir({ silencioso: true })
      if (ok) lastSnapshotRef.current = JSON.stringify({ tramite, items, anios })
    }, 2500)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tramite, items, anios, loading])

  const cambiarEstado = async () => {
    if (!tramite.id) { setErrMsg("Primero guardá los datos del trámite (botón de abajo) para poder registrar el estado."); return }
    if (estadoSeleccionado === tramite.estado_apg) return
    setCambiandoEstado(true); setErrMsg("")

    const { error: updErr } = await supabase.from('apg_tramite')
      .update({ estado_apg: estadoSeleccionado, updated_by: session.user.id })
      .eq('id', tramite.id)
    if (updErr) { setErrMsg(updErr.message); setCambiandoEstado(false); return }

    const { error: histErr } = await supabase.from('apg_estado_historial').insert([{
      tramite_id: tramite.id, estado: estadoSeleccionado, comentario: comentarioEstado || null,
      usuario_id: session.user.id, usuario_email: session.user.email,
    }])
    if (histErr) { setErrMsg(histErr.message); setCambiandoEstado(false); return }

    setTramite(p => ({ ...p, estado_apg: estadoSeleccionado }))
    setComentarioEstado("")
    await cargarHistorial(tramite.id)
    setCambiandoEstado(false)
  }

  const handleGenerar = async (tipo) => {
    setGenerando(tipo)
    try {
      const t = { ...tramite, procedimiento: procedimiento.procedimiento, concepto: procedimiento.concepto, tipo_codigo: procedimiento.tipo }
      if (tipo === "anexo") await generarAnexoCompraDirecta(t, itemsCalc, anios)
      if (tipo === "nota") await generarNotaJefe(t, itemsCalc, anios)
      if (tipo === "distribucion") await generarDistribucionAnios(t, itemsCalc, anios)
      if (tipo === "formularioA") await generarFormularioA(t, itemsCalc, anios)
      if (tipo === "formularioB") await generarFormularioB(t, itemsCalc, anios)
      if (tipo === "memo") await generarMemoAutorizacionGastar(t, itemsCalc, anios)
    } catch (e) {
      setErrMsg("Error al generar el documento: " + e.message)
    }
    setGenerando("")
  }

  const totalUR = grandTotalUR(itemsCalc, anios)
  const cotizacionEfectiva = tramite.moneda === "PESOS" ? 1 : tramite.cotizacion_ur
  const totalPesosBase = basePesosSinVariacion(itemsCalc, anios, cotizacionEfectiva)
  const totalPesosFinal = grandTotalPesos(itemsCalc, anios, cotizacionEfectiva, tramite.pct_variacion_cambio)

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1500,padding:16}}>
      <div style={{background:"white",borderRadius:16,width:"100%",maxWidth:980,maxHeight:"92vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.35)"}}>

        <div style={{background:"linear-gradient(135deg,#1a3a5c,#2e75b6)",padding:"18px 24px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{color:"white",fontWeight:700,fontSize:16}}>📑 Documentación APG</div>
            <div style={{color:"#bcd4ec",fontSize:12,marginTop:2}}>{procedimiento.procedimiento} — {procedimiento.concepto}</div>
            {tramite.numero_apg && <div style={{color:"white",fontSize:12,marginTop:4,fontWeight:700}}>N° de APG: {tramite.numero_apg}</div>}
            {autosaveStatus === "guardando" && <div style={{color:"#ffe9a8",fontSize:11,marginTop:4}}>💾 Guardando automáticamente…</div>}
            {autosaveStatus === "guardado" && <div style={{color:"#a8f0c6",fontSize:11,marginTop:4}}>✓ Guardado automáticamente en la base de datos</div>}
            {autosaveStatus === "error" && <div style={{color:"#ffb3b3",fontSize:11,marginTop:4}}>⚠ No se pudo autoguardar — revisá tu conexión y usá el botón Guardar</div>}
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.2)",border:"none",color:"white",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:16}}>✕</button>
        </div>

        {loading ? (
          <div style={{padding:60,textAlign:"center",color:"#999"}}>Cargando...</div>
        ) : (
          <div style={{padding:24}}>

            {errMsg && <div style={{background:"#fde8e8",color:"#c0392b",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13}}>⚠️ {errMsg}</div>}

            {borradorRestaurado && (
              <div style={{background:"#fff8e1",color:"#8a6d00",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span>💾 Se restauraron cambios sin guardar de una sesión anterior en este mismo trámite.</span>
                <button onClick={() => { try { localStorage.removeItem(draftKey) } catch {} ; window.location.reload() }}
                  style={{background:"#8a6d00",color:"white",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,whiteSpace:"nowrap"}}>
                  Descartar y recargar desde la base
                </button>
              </div>
            )}

            {/* ── ESTADO DEL TRÁMITE ── */}
            <div style={{fontWeight:700,color:"#1a3a5c",fontSize:13,marginBottom:10}}>📌 Estado del trámite</div>
            <div style={{background:"#fafbfc",border:"1px solid #eee",borderRadius:10,padding:16,marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,flexWrap:"wrap"}}>
                {ESTADOS_APG.map((e, i) => {
                  const idxActual = ESTADOS_APG.findIndex(x => x.value === tramite.estado_apg)
                  const alcanzado = i <= idxActual
                  return (
                    <div key={e.value} style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{
                        display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:20,
                        background: alcanzado ? e.color : "#eee", color: alcanzado ? "white" : "#999",
                        fontSize:12, fontWeight:600, whiteSpace:"nowrap",
                      }}>
                        <span>{e.icon}</span><span>{e.label}</span>
                      </div>
                      {i < ESTADOS_APG.length - 1 && <div style={{width:18,height:2,background: i < idxActual ? e.color : "#ddd"}} />}
                    </div>
                  )
                })}
              </div>

              <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                <div style={{minWidth:200}}>
                  <label style={labelStyle}>Cambiar a</label>
                  <select value={estadoSeleccionado} onChange={e=>setEstadoSeleccionado(e.target.value)} style={{...inputStyle,cursor:"pointer"}}>
                    {ESTADOS_APG.map(e => <option key={e.value} value={e.value}>{e.icon} {e.label}</option>)}
                  </select>
                </div>
                <div style={{flex:1,minWidth:220}}>
                  <label style={labelStyle}>Comentario (opcional)</label>
                  <input value={comentarioEstado} onChange={e=>setComentarioEstado(e.target.value)} placeholder="ej: pasado a Contable según mail del 18/06" style={inputStyle} />
                </div>
                <button onClick={cambiarEstado} disabled={cambiandoEstado || estadoSeleccionado===tramite.estado_apg}
                  style={{background: estadoSeleccionado===tramite.estado_apg ? "#ddd" : "#1a3a5c", color:"white", border:"none", borderRadius:8, padding:"9px 16px", fontWeight:600, fontSize:12, cursor: estadoSeleccionado===tramite.estado_apg ? "default":"pointer"}}>
                  {cambiandoEstado ? "Guardando..." : "Registrar"}
                </button>
              </div>
              {!tramite.id && <div style={{fontSize:11,color:"#999",marginTop:8}}>El seguimiento de estado se habilita después de guardar los datos del trámite por primera vez.</div>}

              {historial.length > 0 && (
                <div style={{marginTop:16,borderTop:"1px solid #eee",paddingTop:12}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase",marginBottom:8}}>Historial</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:140,overflowY:"auto"}}>
                    {historial.map(h => {
                      const info = estadoInfo(h.estado)
                      return (
                        <div key={h.id} style={{fontSize:12,display:"flex",gap:8,alignItems:"baseline"}}>
                          <span style={{color:info.color,fontWeight:600,whiteSpace:"nowrap"}}>{info.icon} {info.label}</span>
                          <span style={{color:"#999",fontSize:11,whiteSpace:"nowrap"}}>{new Date(h.fecha).toLocaleString('es-UY',{dateStyle:"short",timeStyle:"short"})}</span>
                          <span style={{color:"#bbb",fontSize:11,whiteSpace:"nowrap"}}>{h.usuario_email}</span>
                          {h.comentario && <span style={{color:"#666",fontStyle:"italic"}}>— {h.comentario}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── DATOS DEL TRÁMITE ── */}
            <div style={{fontWeight:700,color:"#1a3a5c",fontSize:13,marginBottom:10}}>📋 Datos del trámite</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <label style={labelStyle}>Formulario de inicio (manual 3.1 / 3.2)</label>
                <select value={tramite.formulario_tipo} onChange={e=>updateTramite("formulario_tipo", e.target.value)} style={{...inputStyle, cursor:"pointer"}}>
                  <option value="A">Formulario A — Compras Directas y Licitaciones</option>
                  <option value="B">Formulario B — Excepción (exclusividad / organismos del Estado)</option>
                </select>
              </div>
              <Field label="Fecha de solicitud" type="date" value={tramite.fecha_solicitud} onChange={v=>updateTramite("fecha_solicitud",v)} />
              <Field label="Jefe de División Comercial (firma)" value={tramite.jefe_divcom_nombre} onChange={v=>updateTramite("jefe_divcom_nombre",v)} />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
              <Field label="Servicio solicitante" value={tramite.servicio_solicitante} onChange={v=>updateTramite("servicio_solicitante",v)} />
              <Field label="Profesional solicitante" value={tramite.profesional_solicitante} onChange={v=>updateTramite("profesional_solicitante",v)} />
              <Field label="Días y horarios del profesional" value={tramite.dias_horarios} onChange={v=>updateTramite("dias_horarios",v)} />
              <Field label="Celular" value={tramite.contacto_celular} onChange={v=>updateTramite("contacto_celular",v)} />
              <Field label="Interno" value={tramite.contacto_interno} onChange={v=>updateTramite("contacto_interno",v)} />
              <Field label="Correo" value={tramite.contacto_correo} onChange={v=>updateTramite("contacto_correo",v)} />
              <Field label="Plazo de ejecución (meses)" type="number" value={tramite.plazo_ejecucion_meses} onChange={v=>updateTramite("plazo_ejecucion_meses",v)} />
              <Field label="Tipo de solicitud" value={tramite.tipo_solicitud} onChange={v=>updateTramite("tipo_solicitud",v)} />
              <Field label="Expediente N°" value={tramite.expediente_numero} onChange={v=>updateTramite("expediente_numero",v)} />
              <Field label="N° de APG (asignado por Financiero Contable)" value={tramite.numero_apg} onChange={v=>updateTramite("numero_apg",v)} />
              <Field label="Destinatario — Anexo (Adquisiciones)" value={tramite.destinatario_anexo} onChange={v=>updateTramite("destinatario_anexo",v)} full />
              <Field label="Destinatario — Nota (Jefe Comercial)" value={tramite.destinatario_nota} onChange={v=>updateTramite("destinatario_nota",v)} full />
              <Field label="Artículo de ley a citar (dejar vacío si no aplica)" value={tramite.articulo_ley} onChange={v=>updateTramite("articulo_ley",v)} full />
              <Field label="Iniciales de firma (ej: LA/sb)" value={tramite.iniciales_firma} onChange={v=>updateTramite("iniciales_firma",v)} />
              <div>
                <label style={labelStyle}>Moneda del precio unitario</label>
                <select value={tramite.moneda} onChange={e=>updateTramite("moneda", e.target.value)} style={{...inputStyle, cursor:"pointer"}}>
                  {MONEDA_OPCIONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {tramite.moneda !== "PESOS" && (
                <>
                  <Field label={`Cotización ${MONEDA_CODIGO[tramite.moneda]} ($)`} type="number" value={tramite.cotizacion_ur} onChange={v=>updateTramite("cotizacion_ur",v)} />
                  <Field label="Mes de cotización" value={tramite.mes_cotizacion} onChange={v=>updateTramite("mes_cotizacion",v)} />
                </>
              )}
              <Field label="% variación de cambio (previsión)" type="number" value={tramite.pct_variacion_cambio} onChange={v=>updateTramite("pct_variacion_cambio",v)} />
              <Field label="Condiciones particulares (una por línea — viñetas en el Anexo)" type="textarea" value={tramite.condiciones_particulares} onChange={v=>updateTramite("condiciones_particulares",v)} full />
            </div>

            {/* ── MEMO: SOLICITUD DE AUTORIZACIÓN PARA GASTAR ── */}
            <div style={{background:"#fef9f0",border:"1px solid #f0e0c0",borderRadius:10,padding:14,marginBottom:20}}>
              <div style={{fontWeight:700,color:"#1a3a5c",fontSize:12,marginBottom:10}}>📨 MEMO — Solicitud de Autorización para Gastar (a Planeamiento y Presupuesto)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label style={labelStyle}>Tipo de trámite</label>
                  <select value={tramite.memo_tipo_tramite} onChange={e=>updateTramite("memo_tipo_tramite", e.target.value)} style={{...inputStyle, cursor:"pointer"}}>
                    <option value="INICIO">Inicio</option>
                    <option value="AMPLIACION">Ampliación</option>
                    <option value="AMPLIACION_PARCIAL">Ampliación parcial</option>
                  </select>
                </div>
                {tramite.memo_tipo_tramite !== "INICIO" && (
                  <Field label="N° del procedimiento que se amplía (ej: 024/26)" value={tramite.memo_referencia_expediente} onChange={v=>updateTramite("memo_referencia_expediente",v)} />
                )}
                <Field label="Destinatario (Planeamiento y Presupuesto)" value={tramite.destinatario_memo} onChange={v=>updateTramite("destinatario_memo",v)} />
              </div>
              <Field label="Motivo / contexto (párrafo completo: imprevistos/previsiones del año, justificación)" type="textarea" value={tramite.memo_motivo} onChange={v=>updateTramite("memo_motivo",v)} full />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:10}}>
                <Field label="Rubro / Sub-rubro (se descuenta de)" value={tramite.memo_rubro} onChange={v=>updateTramite("memo_rubro",v)} />
                <Field label="Financiación" value={tramite.memo_financiacion} onChange={v=>updateTramite("memo_financiacion",v)} />
                <div style={{display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12}}>
                    <input type="checkbox" checked={!!tramite.memo_iva_exento} onChange={e=>updateTramite("memo_iva_exento", e.target.checked)} /> IVA exento (si no, va "IVA incluido")
                  </label>
                </div>
              </div>
            </div>

            {/* ── DOCUMENTACIÓN ADJUNTA (manual 3.4) ── */}
            <div style={{background:"#fafbfc",border:"1px solid #eee",borderRadius:10,padding:14,marginBottom:20}}>
              <div style={{fontWeight:700,color:"#1a3a5c",fontSize:12,marginBottom:8}}>📎 Documentación adjunta al inicio del expediente</div>
              <div style={{display:"flex",gap:18,flexWrap:"wrap",fontSize:12,color:"#444"}}>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                  <input type="checkbox" checked={tramite.especificaciones_tecnicas !== false} onChange={e=>updateTramite("especificaciones_tecnicas", e.target.checked)} /> Especificaciones técnicas
                </label>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                  <input type="checkbox" checked={tramite.incluye_requerimientos_adm !== false} onChange={e=>updateTramite("incluye_requerimientos_adm", e.target.checked)} /> Anexo de Requerimientos ADM
                </label>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                  <input type="checkbox" checked={tramite.incluye_ponderaciones !== false} onChange={e=>updateTramite("incluye_ponderaciones", e.target.checked)} /> Ponderaciones
                </label>
              </div>
            </div>

            {/* ── FORMULARIO A: recepción de muestras y proveedores a convocar ── */}
            {tramite.formulario_tipo === "A" && (
              <div style={{background:"#f0f6ff",border:"1px solid #cfe2f7",borderRadius:10,padding:14,marginBottom:20}}>
                <div style={{fontWeight:700,color:"#1a3a5c",fontSize:12,marginBottom:10}}>📦 Formulario A — Recepción de muestras (marcá "Requiere muestra" en el ítem correspondiente, abajo)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
                  <Field label="Lugar" value={tramite.recepcion_lugar} onChange={v=>updateTramite("recepcion_lugar",v)} />
                  <Field label="Días" value={tramite.recepcion_dias} onChange={v=>updateTramite("recepcion_dias",v)} />
                  <Field label="Horario" value={tramite.recepcion_horario} onChange={v=>updateTramite("recepcion_horario",v)} />
                  <Field label="Teléfono" value={tramite.recepcion_telefono} onChange={v=>updateTramite("recepcion_telefono",v)} />
                  <Field label="Fecha límite" type="date" value={tramite.recepcion_fecha_limite} onChange={v=>updateTramite("recepcion_fecha_limite",v)} />
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontWeight:700,color:"#1a3a5c",fontSize:12}}>Proveedores a convocar (mín. 3 Compra Directa / 6 Licitación)</div>
                  <button onClick={()=>updateTramite("proveedores_convocar",[...(tramite.proveedores_convocar||[]),{nombre:"",telefono:"",correo:""}])}
                    style={{background:"#eef6ff",color:"#2e75b6",border:"1px solid #cfe2f7",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>＋ Proveedor</button>
                </div>
                {(tramite.proveedores_convocar||[]).map((p, i) => (
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1.5fr auto",gap:8,marginBottom:6}}>
                    <input placeholder="Nombre" value={p.nombre||""} onChange={e=>{
                      const arr=[...tramite.proveedores_convocar]; arr[i]={...arr[i],nombre:e.target.value}; updateTramite("proveedores_convocar",arr)
                    }} style={inputStyle} />
                    <input placeholder="Teléfono" value={p.telefono||""} onChange={e=>{
                      const arr=[...tramite.proveedores_convocar]; arr[i]={...arr[i],telefono:e.target.value}; updateTramite("proveedores_convocar",arr)
                    }} style={inputStyle} />
                    <input placeholder="Correo" value={p.correo||""} onChange={e=>{
                      const arr=[...tramite.proveedores_convocar]; arr[i]={...arr[i],correo:e.target.value}; updateTramite("proveedores_convocar",arr)
                    }} style={inputStyle} />
                    <button onClick={()=>updateTramite("proveedores_convocar",tramite.proveedores_convocar.filter((_,x)=>x!==i))}
                      style={{background:"#fde8e8",border:"none",borderRadius:6,padding:"4px 9px",cursor:"pointer"}}>🗑</button>
                  </div>
                ))}
                <Field label="Motivo si se convoca a menos del mínimo (dejar vacío si se cumple el mínimo)" type="textarea" value={tramite.motivo_menor_proveedores} onChange={v=>updateTramite("motivo_menor_proveedores",v)} full />
              </div>
            )}

            {/* ── FORMULARIO B: datos del proveedor y fundamentación de la excepción ── */}
            {tramite.formulario_tipo === "B" && (
              <div style={{background:"#fff8e1",border:"1px solid #f3e2b3",borderRadius:10,padding:14,marginBottom:20}}>
                <div style={{fontWeight:700,color:"#1a3a5c",fontSize:12,marginBottom:10}}>⚖️ Formulario B — Excepción</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <Field label="Proveedor — Nombre" value={tramite.proveedor_excepcion_nombre} onChange={v=>updateTramite("proveedor_excepcion_nombre",v)} />
                  <Field label="Proveedor — Teléfono" value={tramite.proveedor_excepcion_telefono} onChange={v=>updateTramite("proveedor_excepcion_telefono",v)} />
                  <Field label="Proveedor — Correo" value={tramite.proveedor_excepcion_correo} onChange={v=>updateTramite("proveedor_excepcion_correo",v)} />
                </div>
                <Field label="Fundamentación de la excepción (exclusividad, etc. — dejar vacío si es contratación entre organismos del Estado)" type="textarea" value={tramite.fundamentacion_excepcion} onChange={v=>updateTramite("fundamentacion_excepcion",v)} full />
                <Field label="Documentación a presentar por el proveedor (certificados, formularios, habilitaciones)" type="textarea" value={tramite.documentacion_proveedor} onChange={v=>updateTramite("documentacion_proveedor",v)} full />
              </div>
            )}

            {/* ── ÍTEMS ARCE ── */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontWeight:700,color:"#1a3a5c",fontSize:13}}>🧾 Ítems ARCE</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addAnio} style={{background:"#eef6ff",color:"#2e75b6",border:"1px solid #cfe2f7",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>＋ Año</button>
                <button onClick={addItem} style={{background:"#e8f8f0",color:"#1e6b3a",border:"1px solid #cdebd9",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>＋ Ítem</button>
              </div>
            </div>

            <div style={{overflowX:"auto",marginBottom:20,border:"1px solid #eee",borderRadius:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:900}}>
                <thead>
                  <tr style={{background:"#1a3a5c"}}>
                    {["Código","Descripción","Detalle/variante","Unidad","Observaciones",`Precio Unit. ${MONEDA_CODIGO[tramite.moneda]}`,"% IVA",
                      ...anios.map(a=>`Cant. ${a}`), `Total ${MONEDA_CODIGO[tramite.moneda]}`,"Convenio Marco","Muestra",""].map((h,i)=>(
                      <th key={i} style={{color:"white",padding:"8px 6px",textAlign:"left",fontWeight:600,whiteSpace:"nowrap"}}>
                        {h.startsWith("Cant.") ? <span>{h} <span onClick={()=>removeAnio(Number(h.split(" ")[1]))} style={{cursor:"pointer",opacity:.7}}>✕</span></span> : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <>
                    <tr key={it._key} style={{borderBottom: refOpen===it._key ? "none" : "1px solid #f0f0f0"}}>
                      <td style={{padding:4}}>
                        <div style={{display:"flex",gap:2,alignItems:"center"}}>
                          <input value={it.codigo_arce} onChange={e=>updateItem(it._key,"codigo_arce",e.target.value)} style={{...inputStyle,minWidth:60}} />
                          <button type="button" title="Ver estudios históricos con este código" onClick={()=>buscarReferenciaArce(it)}
                            disabled={!it.codigo_arce}
                            style={{border:"none",background: refOpen===it._key ? "#2e75b6" : "#eef2ff",color: refOpen===it._key ? "white" : "#2e75b6",borderRadius:5,padding:"5px 6px",cursor:it.codigo_arce?"pointer":"default",fontSize:11,opacity:it.codigo_arce?1:.4}}>🔍</button>
                        </div>
                      </td>
                      <td style={{padding:4}}><input value={it.descripcion_arce} onChange={e=>updateItem(it._key,"descripcion_arce",e.target.value)} style={{...inputStyle,minWidth:140}} /></td>
                      <td style={{padding:4}}><input value={it.detalle_variante} onChange={e=>updateItem(it._key,"detalle_variante",e.target.value)} style={{...inputStyle,minWidth:120}} /></td>
                      <td style={{padding:4}}><input value={it.unidad_arce} onChange={e=>updateItem(it._key,"unidad_arce",e.target.value)} style={{...inputStyle,minWidth:70}} /></td>
                      <td style={{padding:4}}><input value={it.observaciones} onChange={e=>updateItem(it._key,"observaciones",e.target.value)} style={{...inputStyle,minWidth:160}} /></td>
                      <td style={{padding:4}}><input type="number" value={it.precio_unitario_ur} onChange={e=>updateItem(it._key,"precio_unitario_ur",e.target.value)} style={{...inputStyle,minWidth:80}} /></td>
                      <td style={{padding:4}}><input type="number" value={it.iva_pct} onChange={e=>updateItem(it._key,"iva_pct",e.target.value)} style={{...inputStyle,minWidth:55}} /></td>
                      {anios.map(a => (
                        <td key={a} style={{padding:4}}><input type="number" value={it.anios[a] ?? ""} onChange={e=>updateItemAnio(it._key,a,e.target.value)} style={{...inputStyle,minWidth:65}} /></td>
                      ))}
                      <td style={{padding:"4px 8px",fontWeight:700,color:"#117a65",whiteSpace:"nowrap"}}>{fmtUR(itemTotalURTotal(it,anios))}</td>
                      <td style={{padding:4}}><input placeholder="NO" value={it.convenio_marco ?? "NO"} onChange={e=>updateItem(it._key,"convenio_marco",e.target.value)} style={{...inputStyle,minWidth:90}} /></td>
                      <td style={{padding:4,textAlign:"center"}}><input type="checkbox" checked={!!it.requiere_muestra} onChange={e=>updateItem(it._key,"requiere_muestra",e.target.checked)} /></td>
                      <td style={{padding:4}}><button onClick={()=>removeItem(it._key)} style={{background:"#fde8e8",border:"none",borderRadius:6,padding:"4px 7px",cursor:"pointer",fontSize:11}}>🗑</button></td>
                    </tr>
                    {refOpen === it._key && (
                      <tr style={{borderBottom:"1px solid #f0f0f0"}}>
                        <td colSpan={11 + anios.length} style={{padding:"6px 10px 10px 10px",background:"#f8f9fb"}}>
                          <div style={{fontSize:10,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:.4,marginBottom:5}}>
                            Estudios históricamente facturados con el código {it.codigo_arce}
                          </div>
                          {refLoading ? <div style={{fontSize:12,color:"#888"}}>Buscando…</div> : (
                            (refCache[Number(it.codigo_arce)] || []).length === 0 ? (
                              <div style={{fontSize:12,color:"#888"}}>Sin referencias históricas para este código.</div>
                            ) : (
                              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                                {refCache[Number(it.codigo_arce)].map((r,i) => (
                                  <button key={i} type="button" onClick={()=>{updateItem(it._key,"descripcion_arce",r.estudio); setRefOpen(null)}}
                                    title="Click para usar como descripción"
                                    style={{border:"1px solid #e2e8f0",background:"white",borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer",display:"flex",gap:5,alignItems:"center"}}>
                                    {r.estudio}
                                    <span style={{background:"#eef2ff",color:"#2e75b6",borderRadius:10,padding:"1px 6px",fontWeight:700,fontSize:10}}>×{r.frecuencia}</span>
                                  </button>
                                ))}
                              </div>
                            )
                          )}
                        </td>
                      </tr>
                    )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── RESUMEN CALCULADO ── */}
            <div style={{background:"#f0f6ff",borderRadius:10,padding:16,marginBottom:20,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
              {tramite.moneda !== "PESOS" && <div><div style={{fontSize:10,color:"#888",textTransform:"uppercase"}}>Total {MONEDA_CODIGO[tramite.moneda]}</div><div style={{fontSize:17,fontWeight:700,color:"#1a3a5c"}}>{fmtUR(totalUR)}</div></div>}
              <div><div style={{fontSize:10,color:"#888",textTransform:"uppercase"}}>$ sin variación</div><div style={{fontSize:17,fontWeight:700,color:"#1a3a5c"}}>{fmtPesos(totalPesosBase)}</div></div>
              <div><div style={{fontSize:10,color:"#888",textTransform:"uppercase"}}>$ con {tramite.pct_variacion_cambio||0}% variación</div><div style={{fontSize:17,fontWeight:700,color:"#117a65"}}>{fmtPesos(totalPesosFinal)}</div></div>
              {tramite.moneda !== "PESOS" && !tramite.cotizacion_ur && <div style={{fontSize:11,color:"#c0392b",alignSelf:"center"}}>⚠️ Cargá la cotización {MONEDA_CODIGO[tramite.moneda]} para calcular los montos en pesos</div>}
            </div>

            {/* ── GENERAR DOCUMENTOS ── */}
            <div style={{fontWeight:700,color:"#1a3a5c",fontSize:13,marginBottom:10}}>📄 Generar documentos (.docx)</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {tramite.formulario_tipo === "A" ? (
                <button onClick={()=>handleGenerar("formularioA")} disabled={!!generando} style={{background:"#1a3a5c",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                  {generando==="formularioA" ? "Generando..." : "📄 Formulario A"}
                </button>
              ) : (
                <button onClick={()=>handleGenerar("formularioB")} disabled={!!generando} style={{background:"#1a3a5c",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                  {generando==="formularioB" ? "Generando..." : "📄 Formulario B"}
                </button>
              )}
              <button onClick={()=>handleGenerar("anexo")} disabled={!!generando} style={{background:"#2e75b6",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                {generando==="anexo" ? "Generando..." : "📄 Anexo Compra Directa"}
              </button>
              <button onClick={()=>handleGenerar("nota")} disabled={!!generando} style={{background:"#117a65",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                {generando==="nota" ? "Generando..." : "📄 Nota al Jefe (cálculo APG)"}
              </button>
              <button onClick={()=>handleGenerar("distribucion")} disabled={!!generando} style={{background:"#8e44ad",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                {generando==="distribucion" ? "Generando..." : "📄 Distribución por años"}
              </button>
              <button onClick={()=>handleGenerar("memo")} disabled={!!generando} style={{background:"#B8860B",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                {generando==="memo" ? "Generando..." : "📨 MEMO Autorización para Gastar"}
              </button>
            </div>
            <div style={{fontSize:11,color:"#999",marginTop:8}}>Los documentos se generan en Word para que puedas revisarlos, ajustar el texto libre y agregar el membrete institucional antes de imprimir o subir al expediente.</div>
          </div>
        )}

        <div style={{padding:"16px 24px 24px",display:"flex",gap:10,justifyContent:"flex-end",borderTop:"1px solid #f0f0f0"}}>
          <button onClick={onClose} style={{background:"#f0f0f0",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600,color:"#555",fontSize:13}}>Cerrar</button>
          <button onClick={saveApg} disabled={saving} style={{background:"#27ae60",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600,color:"white",fontSize:13}}>
            {saving ? "Guardando..." : "💾 Guardar datos del trámite"}
          </button>
        </div>
      </div>
    </div>
  )
}
