import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import Login from './Login'
import ApgModal from './ApgModal'
import UsuariosPendientesModal from './UsuariosPendientesModal'

const ESTADOS = ["EN TRÁMITE","EN ADQ","EN DFC","EN MDN","ADJUDICADO","SIN EFECTO","PENDIENTE DE INICIAR","ARCHIVADO"]
const TIPOS = ["CD","CDA","CDE","CDNC","CPA","LA","LAA","LP","OTRO"]
const ORIGENES = ["ANTERIOR 2026","TRÁMITE 2026","NO PAC PLANIFICADO"]
const RUBROS = ["","PREVISIÓN","IMPREVISTOS"]
// Estados que implican COMPROMISO presupuestal (procedimiento activo, aún no adjudicado).
// El "AFECTADO" (devengado/encumbrance) se confirma recién cuando el estado pasa a ADJUDICADO,
// conforme a las etapas de ejecución presupuestal del TOCAF (Asignado → Comprometido → Afectado).
const ESTADOS_COMPROMETIDOS = ["EN TRÁMITE","EN ADQ","EN DFC","EN MDN"]
const ANIO_PRESUPUESTO = 2026
const APG_ESTADO_BADGE = {
  CONFECCION: { color: "#2e75b6", icon: "📝", label: "Confección" },
  VISTO_BUENO_CONTABLE: { color: "#e67e22", icon: "👀", label: "VB Contable" },
  FIRMA_JEFE: { color: "#8e44ad", icon: "✍️", label: "Firma Jefe" },
  COMPLETADO: { color: "#27ae60", icon: "✅", label: "Completado" },
}

const COLS_LABELS = {
  procedimiento:"N° PROCEDIMIENTO", tipo:"TIPO", concepto:"CONCEPTO", proveedor:"PROVEEDOR",
  importe:"IMPORTE TOTAL ($)", periodo:"PERÍODO COBERTURA", anios_apg:"AÑOS APG",
  rubro_apg:"RUBRO APG", importe_apg:"IMPORTE APG ($)", estado:"ESTADO ACTUAL",
  fecha_apertura:"FECHA APERTURA", ultimo_control:"ÚLTIMO CONTROL",
  mdn_tcr:"MDN/TCR", sin_efecto:"SIN EFECTO/DESIERTA", observacion:"OBSERVACIONES",
  origen:"ORIGEN", pac:"PAC/NO PAC"
}

const fmt = (n) => n ? `$ ${Number(n).toLocaleString('es-UY', {maximumFractionDigits:0})}` : "-"
const fmtDate = (d) => d ? d.split("-").reverse().join("/") : ""

const estadoColor = (e) => {
  const v = (e||"").toUpperCase()
  if (v.includes("SIN EFECTO") || v.includes("ARCHIVADO")) return {bg:"#fde8e8",txt:"#c0392b",dot:"#e74c3c"}
  if (v.includes("PENDIENTE")) return {bg:"#fff8e1",txt:"#856404",dot:"#f39c12"}
  if (v.includes("DFC") || v.includes("MDN")) return {bg:"#e3f0fd",txt:"#1a5276",dot:"#2e86c1"}
  if (v.includes("ADQ") || v.includes("ADJUDICADO")) return {bg:"#e8f8f0",txt:"#1e6b3a",dot:"#27ae60"}
  if (v.includes("DIV COM")) return {bg:"#ede7f6",txt:"#4a235a",dot:"#8e44ad"}
  return {bg:"#f0f0f0",txt:"#555",dot:"#999"}
}
const rubroColor = (r) => {
  if ((r||"").toUpperCase() === "PREVISIÓN") return "#e8f8f0"
  if ((r||"").toUpperCase() === "IMPREVISTOS") return "#fff8e1"
  return "#f5f5f5"
}

const EMPTY_FORM = {procedimiento:"",tipo:"CDA",concepto:"",proveedor:"",importe:"",periodo:"",anios_apg:"",rubro_apg:"",importe_apg:"",estado:"EN TRÁMITE",fecha_apertura:"",ultimo_control:"",mdn_tcr:"",sin_efecto:"",observacion:"",origen:"TRÁMITE 2026",pac:"NO PAC"}

// ── EXPORT FUNCTIONS ──────────────────────────────────────────────────────────
function exportToExcel(rows, filename) {
  const headers = Object.values(COLS_LABELS)
  const keys = Object.keys(COLS_LABELS)
  const wsData = [
    ["BASE DE COMPRAS — DIV. COMERCIAL — DNSFFAA 2026"],
    [`Exportado el: ${new Date().toLocaleDateString('es-UY')} — ${rows.length} registros`],
    [],
    headers,
    ...rows.map(r => keys.map(k => r[k] ?? ""))
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [22,8,45,28,15,12,10,12,15,22,12,14,10,18,50,18,10].map(w=>({wch:w}))
  ws["!merges"] = [{s:{r:0,c:0},e:{r:0,c:16}},{s:{r:1,c:0},e:{r:1,c:16}}]
  XLSX.utils.book_append_sheet(wb, ws, "COMPRAS")

  const porEstado = {}, porTipo = {}
  rows.forEach(r => {
    porEstado[r.estado] = (porEstado[r.estado]||0)+1
    porTipo[r.tipo] = (porTipo[r.tipo]||0)+1
  })
  const totalImporte = rows.reduce((s,r)=>s+(Number(r.importe)||0),0)
  const totalAPG = rows.reduce((s,r)=>s+(Number(r.importe_apg)||0),0)
  const wsRes = XLSX.utils.aoa_to_sheet([
    ["RESUMEN EJECUTIVO"], [],
    ["KPI","VALOR"],
    ["Total procedimientos", rows.length],
    ["Activos en trámite", rows.filter(r=>!["SIN EFECTO","ARCHIVADO","PENDIENTE DE INICIAR"].includes(r.estado)).length],
    ["Pendientes de iniciar", rows.filter(r=>r.estado==="PENDIENTE DE INICIAR").length],
    ["Sin efecto / Archivados", rows.filter(r=>["SIN EFECTO","ARCHIVADO"].includes(r.estado)).length],
    ["Importe total ($)", totalImporte],
    ["Total APG asignado ($)", totalAPG],
    [],
    ["POR ESTADO","CANTIDAD"], ...Object.entries(porEstado),
    [],
    ["POR TIPO","CANTIDAD"], ...Object.entries(porTipo),
  ])
  wsRes["!cols"] = [{wch:30},{wch:20}]
  XLSX.utils.book_append_sheet(wb, wsRes, "RESUMEN")
  XLSX.writeFile(wb, filename)
}

function exportToCSV(rows, filename) {
  const keys = Object.keys(COLS_LABELS)
  const headers = Object.values(COLS_LABELS)
  const lines = [
    headers.map(h=>`"${h}"`).join(";"),
    ...rows.map(r => keys.map(k => `"${(r[k]??'').toString().replace(/"/g,'""')}"`).join(";"))
  ]
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {type:"text/csv;charset=utf-8;"})
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click()
  URL.revokeObjectURL(url)
}

// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [loadingPerfil, setLoadingPerfil] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoadingSession(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setPerfil(null); setLoadingPerfil(false); return }
    setLoadingPerfil(true)
    supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { setPerfil(data); setLoadingPerfil(false) })
  }, [session])

  if (loadingSession) {
    return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#888"}}>Cargando...</div>
  }

  if (!session) return <Login />

  if (loadingPerfil) {
    return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#888"}}>Cargando...</div>
  }

  if (!perfil || !perfil.aprobado) {
    return <EsperandoAprobacion session={session} />
  }

  return <Dashboard session={session} perfil={perfil} />
}

// ════════════════════════════════════════════════════════════════════════════
function EsperandoAprobacion({ session }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",background:"#f4f6f9",padding:20}}>
      <div style={{background:"white",borderRadius:16,padding:"40px 32px",maxWidth:420,textAlign:"center",boxShadow:"0 10px 40px rgba(0,0,0,.08)"}}>
        <div style={{fontSize:42,marginBottom:12}}>⏳</div>
        <div style={{fontWeight:700,fontSize:18,color:"#1a3a5c",marginBottom:8}}>Esperando aprobación del administrador</div>
        <div style={{color:"#666",fontSize:14,lineHeight:1.5,marginBottom:20}}>
          Tu cuenta (<strong>{session.user.email}</strong>) fue creada correctamente, pero todavía no tenés acceso a la Base de Compras.
          Un administrador tiene que aprobarte primero.
        </div>
        <button onClick={()=>supabase.auth.signOut()} style={{background:"#f0f0f0",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600,color:"#555",fontSize:13}}>Salir</button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
function Dashboard({ session, perfil }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState("resumen")
  const [search, setSearch] = useState("")
  const [filterTipo, setFilterTipo] = useState("")
  const [filterEstado, setFilterEstado] = useState("")
  const [filterOrigen, setFilterOrigen] = useState("")
  const [filterRubro, setFilterRubro] = useState("")
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [confirmDel, setConfirmDel] = useState(null)
  const [apgModal, setApgModal] = useState(null)
  const [showExport, setShowExport] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState("")
  const exportRef = useRef(null)

  // ── PRESUPUESTO 2026 ───────────────────────────────────────────────────
  const [presupuesto, setPresupuesto] = useState(null)
  const [loadingPresupuesto, setLoadingPresupuesto] = useState(true)
  const [editPresupuesto, setEditPresupuesto] = useState(false)
  const [presupuestoForm, setPresupuestoForm] = useState("")
  const [savingPresupuesto, setSavingPresupuesto] = useState(false)

  const isAdmin = perfil?.rol === 'admin'

  // Cargar datos
  const fetchData = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('compras').select('*').order('created_at', { ascending: false })
    if (error) setErrMsg(error.message)
    else setData(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Cargar presupuesto asignado 2026
  const fetchPresupuesto = async () => {
    setLoadingPresupuesto(true)
    const { data, error } = await supabase.from('presupuesto_anual').select('*').eq('anio', ANIO_PRESUPUESTO).maybeSingle()
    if (!error) setPresupuesto(data)
    setLoadingPresupuesto(false)
  }
  useEffect(() => { fetchPresupuesto() }, [])

  // Realtime: si otro usuario edita el presupuesto, se refleja para todos
  useEffect(() => {
    const channel = supabase
      .channel('presupuesto-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presupuesto_anual' }, () => {
        fetchPresupuesto()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Realtime: actualizar cuando otro usuario modifica datos
  useEffect(() => {
    const channel = supabase
      .channel('compras-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, () => {
        fetchData()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── ESTADOS APG (Confección / Visto Bueno Contable / Firma Jefe / Completado) ──
  const [apgEstados, setApgEstados] = useState({}) // { [procedimiento_id]: estado_apg }
  const [apgTramiteIds, setApgTramiteIds] = useState({}) // { [procedimiento_id]: tramite_id }
  const [apgUltimoCambio, setApgUltimoCambio] = useState({}) // { [tramite_id]: fecha del último cambio de estado }

  const fetchApgEstados = async () => {
    const { data, error } = await supabase.from('apg_tramite').select('id, procedimiento_id, estado_apg')
    if (!error) {
      const map = {}, idMap = {}
      ;(data || []).forEach(r => { map[r.procedimiento_id] = r.estado_apg; idMap[r.procedimiento_id] = r.id })
      setApgEstados(map)
      setApgTramiteIds(idMap)
    }
  }
  const fetchApgUltimoCambio = async () => {
    const { data, error } = await supabase.from('apg_estado_historial').select('tramite_id, fecha').order('fecha', { ascending: false })
    if (!error) {
      const map = {}
      ;(data || []).forEach(r => { if (!map[r.tramite_id]) map[r.tramite_id] = r.fecha })
      setApgUltimoCambio(map)
    }
  }
  useEffect(() => { fetchApgEstados(); fetchApgUltimoCambio() }, [])

  useEffect(() => {
    const channel = supabase
      .channel('apg-tramite-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apg_tramite' }, () => {
        fetchApgEstados()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apg_estado_historial' }, () => {
        fetchApgUltimoCambio()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── NOTIFICACIONES: procedimientos estancados / trámites APG estancados ──
  const [showNotificaciones, setShowNotificaciones] = useState(false)
  const UMBRAL_PENDIENTE_DIAS = 15
  const UMBRAL_APG_ESTANCADO_DIAS = 10
  const diasDesde = (fechaStr) => fechaStr ? Math.floor((Date.now() - new Date(fechaStr).getTime()) / 86400000) : null

  const alertasPendientes = useMemo(() => {
    return rows
      .filter(r => r.estado === 'PENDIENTE DE INICIAR')
      .map(r => ({ ...r, dias: diasDesde(r.updated_at) }))
      .filter(r => r.dias !== null && r.dias >= UMBRAL_PENDIENTE_DIAS)
      .sort((a,b) => b.dias - a.dias)
  }, [rows])

  const alertasApg = useMemo(() => {
    return rows.map(r => {
      const estadoApg = apgEstados[r.id]
      if (!estadoApg || estadoApg === 'COMPLETADO') return null
      const dias = diasDesde(apgUltimoCambio[apgTramiteIds[r.id]])
      if (dias === null || dias < UMBRAL_APG_ESTANCADO_DIAS) return null
      return { ...r, estadoApg, dias }
    }).filter(Boolean).sort((a,b) => b.dias - a.dias)
  }, [rows, apgEstados, apgTramiteIds, apgUltimoCambio])

  const totalAlertas = alertasPendientes.length + alertasApg.length

  // ── USUARIOS PENDIENTES DE APROBACIÓN (solo admin) ──────────────────────
  const [pendientesCount, setPendientesCount] = useState(0)
  const [showPendientes, setShowPendientes] = useState(false)

  const fetchPendientesCount = async () => {
    if (!isAdmin) { setPendientesCount(0); return }
    const { count } = await supabase.from('perfiles').select('id', { count: 'exact', head: true }).eq('aprobado', false)
    setPendientesCount(count || 0)
  }
  useEffect(() => { fetchPendientesCount() }, [isAdmin])

  useEffect(() => {
    const channel = supabase
      .channel('perfiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, () => {
        fetchPendientesCount()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isAdmin])

  useEffect(() => {
    const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(r =>
      (!q || [r.procedimiento,r.concepto,r.proveedor,r.estado,r.observacion].some(f => (f||"").toLowerCase().includes(q))) &&
      (!filterTipo || r.tipo === filterTipo) &&
      (!filterEstado || r.estado === filterEstado) &&
      (!filterOrigen || r.origen === filterOrigen) &&
      (!filterRubro || r.rubro_apg === filterRubro)
    )
  }, [data, search, filterTipo, filterEstado, filterOrigen, filterRubro])

  const total = data.length
  const activos = data.filter(r => !["SIN EFECTO","ARCHIVADO","PENDIENTE DE INICIAR"].includes(r.estado)).length
  const pendientes = data.filter(r => r.estado === "PENDIENTE DE INICIAR").length
  const sinEfecto = data.filter(r => ["SIN EFECTO","ARCHIVADO"].includes(r.estado)).length
  const totalImporte = data.reduce((s,r) => s + (Number(r.importe)||0), 0)
  const totalAPG = data.reduce((s,r) => s + (Number(r.importe_apg)||0), 0)
  const porEstado = ESTADOS.reduce((acc,e) => { acc[e] = data.filter(r=>r.estado===e).length; return acc }, {})
  const porTipo = TIPOS.reduce((acc,t) => { acc[t] = data.filter(r=>r.tipo===t).length; return acc }, {})

  // ── EJECUCIÓN PRESUPUESTAL (TOCAF): Asignado → Comprometido → Afectado ──
  // COMPROMETIDO: procedimientos activos aún no resueltos (reserva preventiva de crédito).
  // AFECTADO: procedimientos ADJUDICADOS (la afectación se confirma con la adjudicación).
  const comprometido = data.filter(r => ESTADOS_COMPROMETIDOS.includes(r.estado)).reduce((s,r) => s + (Number(r.importe_apg)||0), 0)
  const afectado = data.filter(r => r.estado === "ADJUDICADO").reduce((s,r) => s + (Number(r.importe_apg)||0), 0)
  const montoAsignado = Number(presupuesto?.monto_asignado) || 0
  const disponible = montoAsignado - comprometido - afectado
  const pctAfectado = montoAsignado ? Math.min(100, (afectado/montoAsignado)*100) : 0
  const pctComprometido = montoAsignado ? Math.min(100, 100 - pctAfectado, (comprometido/montoAsignado)*100) : 0

  const openAdd = () => { setForm(EMPTY_FORM); setErrMsg(""); setModal({mode:"add"}) }
  const openEdit = (r) => { setForm({...r}); setErrMsg(""); setModal({mode:"edit",record:r}) }
  const openView = (r) => setModal({mode:"view",record:r})

  const saveForm = async () => {
    setSaving(true); setErrMsg("")
    const payload = {
      ...form,
      importe: Number(form.importe)||0,
      importe_apg: Number(form.importe_apg)||0,
      fecha_apertura: form.fecha_apertura || null,
      ultimo_control: form.ultimo_control || null,
    }
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.created_by

    if (modal.mode === "add") {
      const { error } = await supabase.from('compras').insert([{ ...payload, created_by: session.user.id }])
      if (error) { setErrMsg(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('compras').update(payload).eq('id', modal.record.id)
      if (error) { setErrMsg(error.message); setSaving(false); return }
    }
    setSaving(false)
    setModal(null)
    fetchData()
  }

  const deleteRec = async (rec) => {
    const { error } = await supabase.from('compras').delete().eq('id', rec.id)
    if (error) { setErrMsg(error.message); return }
    setConfirmDel(null); setModal(null)
    fetchData()
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  // ── Editar presupuesto asignado (solo admin) ─────────────────────────
  const openEditPresupuesto = () => {
    setPresupuestoForm(presupuesto?.monto_asignado != null ? String(presupuesto.monto_asignado) : "")
    setErrMsg("")
    setEditPresupuesto(true)
  }
  const savePresupuesto = async () => {
    setSavingPresupuesto(true); setErrMsg("")
    const monto = Number(presupuestoForm) || 0
    if (presupuesto?.id) {
      const { error } = await supabase.from('presupuesto_anual')
        .update({ monto_asignado: monto, updated_by: session.user.id })
        .eq('id', presupuesto.id)
      if (error) { setErrMsg(error.message); setSavingPresupuesto(false); return }
    } else {
      const { error } = await supabase.from('presupuesto_anual')
        .insert([{ anio: ANIO_PRESUPUESTO, monto_asignado: monto, updated_by: session.user.id }])
      if (error) { setErrMsg(error.message); setSavingPresupuesto(false); return }
    }
    setSavingPresupuesto(false)
    setEditPresupuesto(false)
    fetchPresupuesto()
  }

  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
  const sel = inp + " cursor-pointer"

  const navItems = [
    {id:"resumen",label:"📊 Resumen"},
    {id:"todos",label:"📋 Todos"},
    {id:"activos",label:"🔄 Activos"},
    {id:"pendientes",label:"📌 Pendientes"},
  ]

  const tableData = view === "activos"
    ? filtered.filter(r => !["SIN EFECTO","ARCHIVADO","PENDIENTE DE INICIAR"].includes(r.estado))
    : view === "pendientes"
    ? filtered.filter(r => r.estado === "PENDIENTE DE INICIAR" || r.origen === "NO PAC PLANIFICADO")
    : filtered

  const today = new Date().toLocaleDateString('es-UY').replace(/\//g,"-")

  return (
    <div style={{fontFamily:"'Segoe UI',Arial,sans-serif",background:"#f0f4f8",minHeight:"100vh"}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#1a3a5c 0%,#2e75b6 100%)",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{color:"white",fontWeight:700,fontSize:17}}>BASE DE COMPRAS — DIV. COMERCIAL</div>
          <div style={{color:"#9dc3e6",fontSize:11,marginTop:2}}>DNSFFAA 2026 · {session.user.email} · {isAdmin ? "👑 Administrador" : "Operador"}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div ref={exportRef} style={{position:"relative"}}>
            <button onClick={()=>setShowExport(s=>!s)}
              style={{background:"rgba(255,255,255,.15)",color:"white",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
              ⬇ Exportar {showExport?"▲":"▼"}
            </button>
            {showExport && (
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"white",borderRadius:10,boxShadow:"0 8px 32px rgba(0,0,0,.18)",minWidth:240,zIndex:500,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",fontSize:11,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:.5,borderBottom:"1px solid #f0f0f0"}}>
                  Vista actual ({tableData.length} registros)
                </div>
                <div onClick={()=>{exportToExcel(tableData,`Compras_DivCom_${today}.xlsx`);setShowExport(false)}}
                  style={{padding:"12px 16px",cursor:"pointer",borderBottom:"1px solid #f8f8f8"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f6ff"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
                  <div style={{fontWeight:600,fontSize:13,color:"#1a3a5c"}}>📊 Excel (.xlsx)</div>
                  <div style={{fontSize:11,color:"#999",marginTop:2}}>Con hoja de resumen</div>
                </div>
                <div onClick={()=>{exportToCSV(tableData,`Compras_DivCom_${today}.csv`);setShowExport(false)}}
                  style={{padding:"12px 16px",cursor:"pointer",borderBottom:"1px solid #f8f8f8"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f6ff"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
                  <div style={{fontWeight:600,fontSize:13,color:"#1a3a5c"}}>📄 CSV</div>
                </div>
                <div onClick={()=>{exportToExcel(data,`Compras_DivCom_COMPLETO_${today}.xlsx`);setShowExport(false)}}
                  style={{padding:"12px 16px",cursor:"pointer",borderTop:"1px solid #f0f0f0"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f6ff"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
                  <div style={{fontWeight:600,fontSize:13,color:"#1a3a5c"}}>📊 Excel completo ({data.length})</div>
                </div>
              </div>
            )}
          </div>
          <button onClick={openAdd} style={{background:"#27ae60",color:"white",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            ＋ Nuevo
          </button>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowNotificaciones(s=>!s)} style={{position:"relative",background:"rgba(255,255,255,.1)",color:"white",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,padding:"8px 12px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
              🔔
              {totalAlertas > 0 && (
                <span style={{position:"absolute",top:-7,right:-7,background:"#e74c3c",color:"white",borderRadius:"50%",minWidth:18,height:18,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,padding:"0 3px"}}>{totalAlertas}</span>
              )}
            </button>
            {showNotificaciones && (
              <div style={{position:"absolute",top:"110%",right:0,background:"white",borderRadius:12,boxShadow:"0 10px 40px rgba(0,0,0,.2)",width:340,maxHeight:420,overflowY:"auto",zIndex:200,color:"#333"}}>
                <div style={{padding:"12px 16px",fontWeight:700,fontSize:13,color:"#1a3a5c",borderBottom:"1px solid #f0f0f0"}}>🔔 Notificaciones</div>
                {totalAlertas === 0 ? (
                  <div style={{padding:20,textAlign:"center",color:"#999",fontSize:13}}>Sin alertas por ahora ✅</div>
                ) : (
                  <>
                    {alertasPendientes.map(r => (
                      <div key={'p'+r.id} onClick={()=>{openView(r);setShowNotificaciones(false)}}
                        style={{padding:"10px 16px",borderBottom:"1px solid #f8f8f8",cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f0f6ff"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
                        <div style={{fontSize:12,fontWeight:600,color:"#e67e22"}}>⏳ Pendiente de iniciar hace {r.dias} días</div>
                        <div style={{fontSize:13,color:"#333",marginTop:2}}>{r.procedimiento} — {r.concepto}</div>
                      </div>
                    ))}
                    {alertasApg.map(r => (
                      <div key={'a'+r.id} onClick={()=>{setApgModal(r);setShowNotificaciones(false)}}
                        style={{padding:"10px 16px",borderBottom:"1px solid #f8f8f8",cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f0f6ff"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
                        <div style={{fontSize:12,fontWeight:600,color:APG_ESTADO_BADGE[r.estadoApg]?.color}}>
                          {APG_ESTADO_BADGE[r.estadoApg]?.icon} {APG_ESTADO_BADGE[r.estadoApg]?.label} hace {r.dias} días
                        </div>
                        <div style={{fontSize:13,color:"#333",marginTop:2}}>{r.procedimiento} — {r.concepto}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <button onClick={()=>setShowPendientes(true)} style={{position:"relative",background:"rgba(255,255,255,.1)",color:"white",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
              👥 Pendientes
              {pendientesCount > 0 && (
                <span style={{position:"absolute",top:-7,right:-7,background:"#e74c3c",color:"white",borderRadius:"50%",minWidth:18,height:18,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,padding:"0 3px"}}>{pendientesCount}</span>
              )}
            </button>
          )}
          <button onClick={handleLogout} style={{background:"rgba(255,255,255,.1)",color:"white",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            Salir
          </button>
        </div>
      </div>

      {/* NAV */}
      <div style={{background:"white",borderBottom:"1px solid #e2e8f0",display:"flex",gap:0,padding:"0 24px",overflowX:"auto"}}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{background:"none",border:"none",padding:"12px 20px",fontWeight:view===n.id?700:400,
              color:view===n.id?"#2e75b6":"#555",borderBottom:view===n.id?"3px solid #2e75b6":"3px solid transparent",
              cursor:"pointer",fontSize:13,whiteSpace:"nowrap"}}>
            {n.label}
          </button>
        ))}
      </div>

      <div style={{padding:"20px 24px"}}>

        {errMsg && (
          <div style={{background:"#fde8e8",color:"#c0392b",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13}}>
            ⚠️ {errMsg}
          </div>
        )}

        {loading && <div style={{textAlign:"center",padding:40,color:"#999"}}>Cargando datos...</div>}

        {!loading && view === "resumen" && (
          <div>
            {/* ── PANEL PRESUPUESTO 2026 (Asignado → Comprometido → Afectado, TOCAF) ── */}
            <div style={{background:"linear-gradient(135deg,#0d3b24,#117a65)",borderRadius:14,padding:"20px 24px",marginBottom:24,boxShadow:"0 4px 16px rgba(17,122,101,.25)",color:"white"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:16}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,letterSpacing:.5}}>💼 EJECUCIÓN PRESUPUESTAL — EJERCICIO {ANIO_PRESUPUESTO}</div>
                  <div style={{fontSize:11,opacity:.7,marginTop:3}}>Conforme a las etapas de ejecución del TOCAF: Asignado → Comprometido → Afectado</div>
                </div>
                {isAdmin && (
                  <button onClick={openEditPresupuesto} style={{background:"rgba(255,255,255,.18)",border:"1px solid rgba(255,255,255,.35)",color:"white",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    ✏️ Editar asignación
                  </button>
                )}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:18,marginBottom:16}}>
                <div>
                  <div style={{fontSize:10,opacity:.75,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>Asignado</div>
                  <div style={{fontSize:20,fontWeight:700}}>{loadingPresupuesto ? "…" : fmt(montoAsignado)}</div>
                </div>
                <div>
                  <div style={{fontSize:10,opacity:.75,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>Comprometido</div>
                  <div style={{fontSize:20,fontWeight:700,color:"#ffd966"}}>{fmt(comprometido)}</div>
                </div>
                <div>
                  <div style={{fontSize:10,opacity:.75,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>Afectado</div>
                  <div style={{fontSize:20,fontWeight:700,color:"#ff9466"}}>{fmt(afectado)}</div>
                </div>
                <div>
                  <div style={{fontSize:10,opacity:.75,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>Disponible</div>
                  <div style={{fontSize:20,fontWeight:700,color:disponible<0?"#ff6b6b":"#7ee787"}}>{fmt(disponible)}</div>
                </div>
              </div>

              <div style={{background:"rgba(255,255,255,.15)",borderRadius:8,height:14,overflow:"hidden",display:"flex"}}>
                <div style={{width:`${pctAfectado}%`,background:"#ff9466"}} title={`Afectado: ${fmt(afectado)}`}/>
                <div style={{width:`${pctComprometido}%`,background:"#ffd966"}} title={`Comprometido: ${fmt(comprometido)}`}/>
              </div>
              <div style={{display:"flex",gap:18,marginTop:9,fontSize:11,opacity:.9,flexWrap:"wrap"}}>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:"#ff9466",marginRight:5}}/>Afectado {montoAsignado?Math.round(pctAfectado):0}%</span>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:"#ffd966",marginRight:5}}/>Comprometido {montoAsignado?Math.round(pctComprometido):0}%</span>
                {!loadingPresupuesto && !montoAsignado && <span style={{opacity:.8}}>⚠️ Todavía no se definió el presupuesto asignado {ANIO_PRESUPUESTO}{isAdmin ? " — hacé clic en \"Editar asignación\"" : ""}</span>}
              </div>
            </div>

            {/* ── PROCEDIMIENTOS ── */}
            <div style={{fontSize:11,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>📁 Procedimientos</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:24}}>
              {[
                {label:"Total procedimientos",val:total,color:"#2e75b6",icon:"📁"},
                {label:"Pendientes de iniciar",val:pendientes,color:"#e67e22",icon:"📌"},
                {label:"Activos en trámite",val:activos,color:"#27ae60",icon:"🔄"},
                {label:"Sin efecto / Archivados",val:sinEfecto,color:"#e74c3c",icon:"⛔"},
              ].map((k,i) => (
                <div key={i} style={{background:"white",borderRadius:12,padding:"16px 20px",boxShadow:"0 1px 4px rgba(0,0,0,.06)",borderLeft:`4px solid ${k.color}`}}>
                  <div style={{fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>{k.icon} {k.label}</div>
                  <div style={{fontSize:22,fontWeight:700,color:k.color}}>{k.val}</div>
                </div>
              ))}
            </div>

            {/* ── MONTOS GLOBALES (demanda total, no confundir con ejecución presupuestal de arriba) ── */}
            <div style={{fontSize:11,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>💰 Montos</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginBottom:20}}>
              {[
                {label:"Importe total compras",val:fmt(totalImporte),color:"#1a3a5c",icon:"💰"},
                {label:"Total APG solicitado",val:fmt(totalAPG),color:"#117a65",icon:"📈"},
              ].map((k,i) => (
                <div key={i} style={{background:"white",borderRadius:12,padding:"16px 20px",boxShadow:"0 1px 4px rgba(0,0,0,.06)",borderLeft:`4px solid ${k.color}`}}>
                  <div style={{fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>{k.icon} {k.label}</div>
                  <div style={{fontSize:22,fontWeight:700,color:k.color}}>{k.val}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16}}>
              <div style={{background:"white",borderRadius:12,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>

                <div style={{fontWeight:700,marginBottom:12,color:"#1a3a5c",fontSize:14}}>📊 Por estado</div>
                {ESTADOS.filter(e=>porEstado[e]>0).map(e => {
                  const c = estadoColor(e)
                  const pct = total ? Math.round(porEstado[e]/total*100) : 0
                  return (
                    <div key={e} style={{marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                        <span style={{color:c.txt,fontWeight:600}}>{e}</span>
                        <span style={{color:"#666"}}>{porEstado[e]} ({pct}%)</span>
                      </div>
                      <div style={{background:"#f0f0f0",borderRadius:4,height:8}}>
                        <div style={{background:c.dot,width:`${pct}%`,height:8,borderRadius:4}}/>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{background:"white",borderRadius:12,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                <div style={{fontWeight:700,marginBottom:12,color:"#1a3a5c",fontSize:14}}>📂 Por tipo de procedimiento</div>
                {TIPOS.filter(t=>porTipo[t]>0).map(t => {
                  const pct = total ? Math.round(porTipo[t]/total*100) : 0
                  return (
                    <div key={t} style={{marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                        <span style={{fontWeight:600,color:"#333"}}>{t}</span>
                        <span style={{color:"#666"}}>{porTipo[t]} ({pct}%)</span>
                      </div>
                      <div style={{background:"#f0f0f0",borderRadius:4,height:8}}>
                        <div style={{background:"#2e75b6",width:`${pct}%`,height:8,borderRadius:4}}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {!loading && view !== "resumen" && (
          <div>
            <div style={{background:"white",borderRadius:12,padding:"14px 16px",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,.06)",display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="🔍  Buscar..." style={{...{border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none"},flexGrow:1,minWidth:200}} />
              <select value={filterTipo} onChange={e=>setFilterTipo(e.target.value)} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13}}>
                <option value="">Tipo</option>
                {TIPOS.map(t=><option key={t}>{t}</option>)}
              </select>
              <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13}}>
                <option value="">Estado</option>
                {ESTADOS.map(e=><option key={e}>{e}</option>)}
              </select>
              <select value={filterOrigen} onChange={e=>setFilterOrigen(e.target.value)} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13}}>
                <option value="">Origen</option>
                {ORIGENES.map(o=><option key={o}>{o}</option>)}
              </select>
              <select value={filterRubro} onChange={e=>setFilterRubro(e.target.value)} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13}}>
                <option value="">Rubro APG</option>
                {["PREVISIÓN","IMPREVISTOS"].map(r=><option key={r}>{r}</option>)}
              </select>
              {(search||filterTipo||filterEstado||filterOrigen||filterRubro) &&
                <button onClick={()=>{setSearch("");setFilterTipo("");setFilterEstado("");setFilterOrigen("");setFilterRubro("")}}
                  style={{background:"#f8d7da",color:"#c0392b",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontWeight:600}}>
                  ✕ Limpiar
                </button>}
              <span style={{fontSize:12,color:"#888",marginLeft:"auto"}}>{tableData.length} registros</span>
            </div>

            <div style={{background:"white",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,.06)",overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"#1a3a5c"}}>
                      {["N° PROC.","TIPO","CONCEPTO","PROVEEDOR","IMPORTE","RUBRO APG","ESTADO","F. APERTURA",""].map(h=>(
                        <th key={h} style={{color:"white",padding:"10px 12px",textAlign:"left",fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.length === 0 && (
                      <tr><td colSpan={9} style={{padding:40,textAlign:"center",color:"#999"}}>Sin resultados</td></tr>
                    )}
                    {tableData.map((r,i) => {
                      const c = estadoColor(r.estado)
                      return (
                        <tr key={r.id} style={{background:i%2===0?"#fafbfc":"white",borderBottom:"1px solid #f0f0f0"}}
                          onMouseEnter={e=>e.currentTarget.style.background="#e8f0fe"}
                          onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fafbfc":"white"}>
                          <td style={{padding:"8px 12px",fontWeight:600,color:"#1a3a5c",minWidth:140}}>{r.procedimiento}</td>
                          <td style={{padding:"8px 12px"}}>
                            <span style={{background:"#e8f0fe",color:"#2e75b6",borderRadius:4,padding:"2px 7px",fontWeight:700,fontSize:11}}>{r.tipo}</span>
                          </td>
                          <td style={{padding:"8px 12px",maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.concepto}>{r.concepto}</td>
                          <td style={{padding:"8px 12px",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#555"}} title={r.proveedor}>{r.proveedor||"-"}</td>
                          <td style={{padding:"8px 12px",whiteSpace:"nowrap",color:"#1a3a5c",fontWeight:600}}>{fmt(r.importe)}</td>
                          <td style={{padding:"8px 12px"}}>
                            {r.rubro_apg && <span style={{background:rubroColor(r.rubro_apg),borderRadius:4,padding:"2px 7px",fontSize:11,fontWeight:600}}>{r.rubro_apg}</span>}
                          </td>
                          <td style={{padding:"8px 12px"}}>
                            <span style={{background:c.bg,color:c.txt,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:600,display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                              <span style={{width:6,height:6,borderRadius:"50%",background:c.dot,display:"inline-block"}}/>
                              {r.estado}
                            </span>
                          </td>
                          <td style={{padding:"8px 12px",whiteSpace:"nowrap",color:"#666"}}>{fmtDate(r.fecha_apertura)||"-"}</td>
                          <td style={{padding:"8px 12px",whiteSpace:"nowrap"}}>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>openView(r)} title="Ver" style={{background:"#e8f0fe",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>👁</button>
                              <button onClick={()=>openEdit(r)} title="Editar" style={{background:"#e8f8f0",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✏️</button>
                              <button onClick={()=>setApgModal(r)} title="Documentación APG" style={{background:"#f3e8fd",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>📑</button>
                              {apgEstados[r.id] && (
                                <span title={`APG: ${APG_ESTADO_BADGE[apgEstados[r.id]]?.label}`} style={{
                                  background: APG_ESTADO_BADGE[apgEstados[r.id]]?.color, color:"white", borderRadius:6,
                                  padding:"4px 6px", fontSize:10, fontWeight:600, whiteSpace:"nowrap",
                                }}>{APG_ESTADO_BADGE[apgEstados[r.id]]?.icon}</span>
                              )}
                              {isAdmin && <button onClick={()=>setConfirmDel(r)} title="Eliminar" style={{background:"#fde8e8",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>🗑</button>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL ADD/EDIT */}
      {modal && modal.mode !== "view" && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
          <div style={{background:"white",borderRadius:16,width:"100%",maxWidth:700,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
            <div style={{background:"linear-gradient(135deg,#1a3a5c,#2e75b6)",padding:"18px 24px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:"white",fontWeight:700,fontSize:16}}>{modal.mode==="add"?"➕ Nuevo Procedimiento":"✏️ Editar Procedimiento"}</span>
              <button onClick={()=>setModal(null)} style={{background:"rgba(255,255,255,.2)",border:"none",color:"white",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{padding:24,display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {[
                {label:"N° Procedimiento",key:"procedimiento",full:true},
                {label:"Tipo",key:"tipo",type:"select",opts:TIPOS},
                {label:"Concepto / Nombre",key:"concepto",full:true},
                {label:"Proveedor",key:"proveedor",full:true},
                {label:"Importe Total ($)",key:"importe",type:"number"},
                {label:"Período cobertura",key:"periodo"},
                {label:"Años APG",key:"anios_apg"},
                {label:"Rubro APG",key:"rubro_apg",type:"select",opts:RUBROS},
                {label:"Importe APG ($)",key:"importe_apg",type:"number"},
                {label:"Estado actual",key:"estado",type:"select",opts:ESTADOS},
                {label:"Fecha apertura",key:"fecha_apertura",type:"date"},
                {label:"Último control",key:"ultimo_control",type:"date"},
                {label:"MDN / TCR",key:"mdn_tcr"},
                {label:"Sin efecto / Desierta",key:"sin_efecto"},
                {label:"Origen",key:"origen",type:"select",opts:ORIGENES},
                {label:"PAC / NO PAC",key:"pac",type:"select",opts:["PAC","NO PAC"]},
                {label:"Observaciones",key:"observacion",full:true,type:"textarea"},
              ].map(f => (
                <div key={f.key} style={{gridColumn:f.full?"1/-1":"auto"}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#555",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:4}}>{f.label}</label>
                  {f.type==="select" ? (
                    <select value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13}}>
                      {f.opts.map(o=><option key={o} value={o}>{o||"—"}</option>)}
                    </select>
                  ) : f.type==="textarea" ? (
                    <textarea value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
                      rows={3} style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,resize:"vertical"}}/>
                  ) : (
                    <input type={f.type||"text"} value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,boxSizing:"border-box"}}/>
                  )}
                </div>
              ))}
            </div>
            {errMsg && <div style={{padding:"0 24px",color:"#c0392b",fontSize:12}}>⚠️ {errMsg}</div>}
            <div style={{padding:"16px 24px 24px",display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setModal(null)} style={{background:"#f0f0f0",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600,color:"#555",fontSize:13}}>Cancelar</button>
              <button onClick={saveForm} disabled={saving} style={{background:"#2e75b6",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600,color:"white",fontSize:13}}>
                {saving ? "Guardando..." : (modal.mode==="add"?"Guardar":"Guardar cambios")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VIEW */}
      {modal && modal.mode === "view" && (() => {
        const r = modal.record
        const c = estadoColor(r.estado)
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
            <div style={{background:"white",borderRadius:16,width:"100%",maxWidth:660,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
              <div style={{background:"linear-gradient(135deg,#1a3a5c,#2e75b6)",padding:"18px 24px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:"white",fontWeight:700,fontSize:15}}>👁 Detalle — {r.procedimiento}</span>
                <button onClick={()=>setModal(null)} style={{background:"rgba(255,255,255,.2)",border:"none",color:"white",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:16}}>✕</button>
              </div>
              <div style={{padding:24}}>
                <div style={{marginBottom:16,display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{background:"#e8f0fe",color:"#2e75b6",borderRadius:6,padding:"4px 10px",fontWeight:700}}>{r.tipo}</span>
                  <span style={{background:c.bg,color:c.txt,borderRadius:6,padding:"4px 10px",fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:c.dot,display:"inline-block"}}/>
                    {r.estado}
                  </span>
                  {r.rubro_apg && <span style={{background:rubroColor(r.rubro_apg),borderRadius:6,padding:"4px 10px",fontWeight:600,fontSize:12}}>{r.rubro_apg}</span>}
                  <span style={{background:"#f0f0f0",borderRadius:6,padding:"4px 10px",fontSize:12,color:"#666"}}>{r.origen}</span>
                </div>
                {[
                  ["Concepto",r.concepto],["Proveedor",r.proveedor||"-"],
                  ["Importe Total",fmt(r.importe)],["Período cobertura",r.periodo||"-"],
                  ["Años APG",r.anios_apg||"-"],["Importe APG",fmt(r.importe_apg)],
                  ["Fecha apertura",fmtDate(r.fecha_apertura)||"-"],["Último control",fmtDate(r.ultimo_control)||"-"],
                  ["MDN / TCR",r.mdn_tcr||"-"],["Sin efecto / Desierta",r.sin_efecto||"-"],
                  ["Observaciones",r.observacion||"-"],
                ].map(([label,val],i) => (
                  <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #f0f0f0"}}>
                    <span style={{minWidth:150,fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:.4,paddingTop:1}}>{label}</span>
                    <span style={{fontSize:13,color:"#333",flex:1}}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{padding:"0 24px 24px",display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setModal(null)} style={{background:"#f0f0f0",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,color:"#555",fontSize:13}}>Cerrar</button>
                <button onClick={()=>{setModal(null);setApgModal(r)}} style={{background:"#8e44ad",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,color:"white",fontSize:13}}>📑 Documentación APG</button>
                <button onClick={()=>openEdit(r)} style={{background:"#2e75b6",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,color:"white",fontSize:13}}>✏️ Editar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* MODAL PRESUPUESTO ASIGNADO */}
      {editPresupuesto && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
          <div style={{background:"white",borderRadius:16,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
            <div style={{background:"linear-gradient(135deg,#0d3b24,#117a65)",padding:"18px 24px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:"white",fontWeight:700,fontSize:15}}>💼 Presupuesto Asignado {ANIO_PRESUPUESTO}</span>
              <button onClick={()=>setEditPresupuesto(false)} style={{background:"rgba(255,255,255,.2)",border:"none",color:"white",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{padding:24}}>
              <label style={{fontSize:11,fontWeight:600,color:"#555",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:6}}>Monto asignado ($)</label>
              <input type="number" value={presupuestoForm} onChange={e=>setPresupuestoForm(e.target.value)}
                style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box"}} autoFocus/>
              <div style={{fontSize:11,color:"#999",marginTop:10,lineHeight:1.5}}>
                Crédito presupuestal total habilitado para la División Comercial en el ejercicio {ANIO_PRESUPUESTO}.
                Comprometido y Afectado se calculan automáticamente según el estado de cada procedimiento.
              </div>
            </div>
            {errMsg && <div style={{padding:"0 24px",color:"#c0392b",fontSize:12}}>⚠️ {errMsg}</div>}
            <div style={{padding:"16px 24px 24px",display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditPresupuesto(false)} style={{background:"#f0f0f0",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600,color:"#555",fontSize:13}}>Cancelar</button>
              <button onClick={savePresupuesto} disabled={savingPresupuesto} style={{background:"#117a65",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600,color:"white",fontSize:13}}>
                {savingPresupuesto ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DOCUMENTACIÓN APG */}
      {apgModal && (
        <ApgModal procedimiento={apgModal} session={session} onClose={()=>setApgModal(null)} />
      )}

      {/* MODAL USUARIOS PENDIENTES */}
      {showPendientes && (
        <UsuariosPendientesModal onClose={()=>setShowPendientes(false)} />
      )}

      {/* CONFIRM DELETE */}
      {confirmDel && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000}}>
          <div style={{background:"white",borderRadius:14,padding:32,maxWidth:400,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,.3)",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8,color:"#1a3a5c"}}>¿Eliminar procedimiento?</div>
            <div style={{color:"#666",fontSize:13,marginBottom:20}}>{confirmDel.procedimiento} — {confirmDel.concepto?.slice(0,60)}</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setConfirmDel(null)} style={{background:"#f0f0f0",border:"none",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:600,color:"#555"}}>Cancelar</button>
              <button onClick={()=>deleteRec(confirmDel)} style={{background:"#e74c3c",border:"none",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:600,color:"white"}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
