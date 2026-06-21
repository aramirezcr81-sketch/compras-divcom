import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function UsuariosPendientesModal({ onClose }) {
  const [pendientes, setPendientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState(null)
  const [rolElegido, setRolElegido] = useState({}) // { [id]: 'operador' | 'admin' }
  const [errMsg, setErrMsg] = useState("")

  const cargar = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('aprobado', false)
      .order('created_at', { ascending: true })
    if (error) setErrMsg(error.message)
    setPendientes(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const aprobar = async (id) => {
    setProcesando(id); setErrMsg("")
    const rol = rolElegido[id] || "operador"
    const { error } = await supabase.from('perfiles').update({ aprobado: true, rol }).eq('id', id)
    if (error) { setErrMsg(error.message); setProcesando(null); return }
    await cargar()
    setProcesando(null)
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1500,padding:16}}>
      <div style={{background:"white",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.35)"}}>

        <div style={{background:"linear-gradient(135deg,#1a3a5c,#2e75b6)",padding:"18px 24px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{color:"white",fontWeight:700,fontSize:16}}>👥 Usuarios pendientes de aprobación</div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.2)",border:"none",color:"white",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:16}}>✕</button>
        </div>

        <div style={{padding:24}}>
          {errMsg && <div style={{background:"#fde8e8",color:"#c0392b",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13}}>⚠️ {errMsg}</div>}

          {loading ? (
            <div style={{textAlign:"center",color:"#999",padding:30}}>Cargando...</div>
          ) : pendientes.length === 0 ? (
            <div style={{textAlign:"center",color:"#999",padding:30}}>✅ No hay usuarios esperando aprobación.</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {pendientes.map(p => (
                <div key={p.id} style={{border:"1px solid #eee",borderRadius:10,padding:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:180}}>
                    <div style={{fontWeight:600,fontSize:14}}>{p.email}</div>
                    <div style={{fontSize:11,color:"#999"}}>Registrado: {p.created_at ? new Date(p.created_at).toLocaleString('es-UY',{dateStyle:"short",timeStyle:"short"}) : "—"}</div>
                  </div>
                  <select value={rolElegido[p.id] || "operador"} onChange={e=>setRolElegido(r=>({...r,[p.id]:e.target.value}))}
                    style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 8px",fontSize:12,cursor:"pointer"}}>
                    <option value="operador">Operador</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={()=>aprobar(p.id)} disabled={procesando===p.id}
                    style={{background:"#27ae60",color:"white",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:12,cursor:"pointer"}}>
                    {procesando===p.id ? "..." : "✅ Aprobar"}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{fontSize:11,color:"#999",marginTop:16}}>
            Para rechazar definitivamente a alguien (en vez de aprobarlo), borralo desde Supabase → Authentication → Users.
          </div>
        </div>
      </div>
    </div>
  )
}
