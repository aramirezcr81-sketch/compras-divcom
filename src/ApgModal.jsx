import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { generarAnexoCompraDirecta, generarNotaJefe, generarDistribucionAnios } from './docGenerators'
import { itemTotalUR, itemCantidadTotal, itemTotalURTotal, grandTotalUR, grandTotalPesos, basePesosSinVariacion, fmtUR, fmtPesos } from './apgCalc'

const MESES = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]

const TIPO_SOLICITUD_MAP = {
  CD: "Compra Directa", CDA: "Compra Directa Ampliada", CDE: "Compra Directa Excepcional",
  CDNC: "Compra Directa Convenio Marco", CPA: "Convenio de Participación Ampliado",
  LA: "Licitación Abreviada", LAA: "Licitación Abreviada Ampliada", LP: "Licitación Pública", OTRO: "",
}

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
  iniciales_firma: "",
  cotizacion_ur: "",
  mes_cotizacion: `${MESES[new Date().getMonth()]} ${new Date().getFullYear()}`,
  pct_variacion_cambio: 10,
  condiciones_particulares: "",
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
              precio_unitario_ur: it.precio_unitario_ur, iva_pct: it.iva_pct, anios: aniosMap }
          })
          setItems(loadedItems)
          setAnios(yearSet.size ? [...yearSet].sort() : [new Date().getFullYear()])
        }
      }
      setLoading(false)
    })()
  }, [procedimiento.id])

  const updateTramite = (key, val) => setTramite(p => ({ ...p, [key]: val }))

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

  const saveApg = async () => {
    setSaving(true); setErrMsg("")
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
      iniciales_firma: tramite.iniciales_firma,
      cotizacion_ur: Number(tramite.cotizacion_ur) || null,
      mes_cotizacion: tramite.mes_cotizacion,
      pct_variacion_cambio: Number(tramite.pct_variacion_cambio) || 0,
      condiciones_particulares: tramite.condiciones_particulares,
      updated_by: session.user.id,
    }

    let tramiteId = tramite.id
    if (tramiteId) {
      const { error } = await supabase.from('apg_tramite').update(payload).eq('id', tramiteId)
      if (error) { setErrMsg(error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('apg_tramite').insert([{ ...payload, created_by: session.user.id }]).select().single()
      if (error) { setErrMsg(error.message); setSaving(false); return }
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
    if (delErr) { setErrMsg(delErr.message); setSaving(false); return }

    for (const it of itemsCalc) {
      const { data: itemRow, error: itErr } = await supabase.from('apg_items').insert([{
        tramite_id: tramiteId, codigo_arce: it.codigo_arce, descripcion_arce: it.descripcion_arce,
        detalle_variante: it.detalle_variante, unidad_arce: it.unidad_arce, observaciones: it.observaciones,
        precio_unitario_ur: Number(it.precio_unitario_ur) || 0, iva_pct: Number(it.iva_pct) || 0,
      }]).select().single()
      if (itErr) { setErrMsg(itErr.message); setSaving(false); return }

      const filasAnios = anios.filter(a => Number(it.anios[a]) > 0).map(a => ({
        item_id: itemRow.id, anio: a, cantidad: Number(it.anios[a]) || 0,
      }))
      if (filasAnios.length) {
        const { error: ayErr } = await supabase.from('apg_items_anios').insert(filasAnios)
        if (ayErr) { setErrMsg(ayErr.message); setSaving(false); return }
      }
    }

    setSaving(false)
  }

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
      const t = { ...tramite, procedimiento: procedimiento.procedimiento, concepto: procedimiento.concepto }
      if (tipo === "anexo") await generarAnexoCompraDirecta(t, itemsCalc, anios)
      if (tipo === "nota") await generarNotaJefe(t, itemsCalc, anios)
      if (tipo === "distribucion") await generarDistribucionAnios(t, itemsCalc, anios)
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
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.2)",border:"none",color:"white",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:16}}>✕</button>
        </div>

        {loading ? (
          <div style={{padding:60,textAlign:"center",color:"#999"}}>Cargando...</div>
        ) : (
          <div style={{padding:24}}>

            {errMsg && <div style={{background:"#fde8e8",color:"#c0392b",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13}}>⚠️ {errMsg}</div>}

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
                      ...anios.map(a=>`Cant. ${a}`), `Total ${MONEDA_CODIGO[tramite.moneda]}`,""].map((h,i)=>(
                      <th key={i} style={{color:"white",padding:"8px 6px",textAlign:"left",fontWeight:600,whiteSpace:"nowrap"}}>
                        {h.startsWith("Cant.") ? <span>{h} <span onClick={()=>removeAnio(Number(h.split(" ")[1]))} style={{cursor:"pointer",opacity:.7}}>✕</span></span> : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it._key} style={{borderBottom:"1px solid #f0f0f0"}}>
                      <td style={{padding:4}}><input value={it.codigo_arce} onChange={e=>updateItem(it._key,"codigo_arce",e.target.value)} style={{...inputStyle,minWidth:70}} /></td>
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
                      <td style={{padding:4}}><button onClick={()=>removeItem(it._key)} style={{background:"#fde8e8",border:"none",borderRadius:6,padding:"4px 7px",cursor:"pointer",fontSize:11}}>🗑</button></td>
                    </tr>
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
              <button onClick={()=>handleGenerar("anexo")} disabled={!!generando} style={{background:"#2e75b6",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                {generando==="anexo" ? "Generando..." : "📄 Anexo Compra Directa"}
              </button>
              <button onClick={()=>handleGenerar("nota")} disabled={!!generando} style={{background:"#117a65",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                {generando==="nota" ? "Generando..." : "📄 Nota al Jefe (cálculo APG)"}
              </button>
              <button onClick={()=>handleGenerar("distribucion")} disabled={!!generando} style={{background:"#8e44ad",color:"white",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                {generando==="distribucion" ? "Generando..." : "📄 Distribución por años"}
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
