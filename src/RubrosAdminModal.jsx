import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const inputStyle = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 9px", fontSize: 13, boxSizing: "border-box" }
const btnStyle = { border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }

export default function RubrosAdminModal({ onClose }) {
  const [rubros, setRubros] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState("")
  const [nuevoRubro, setNuevoRubro] = useState({ codigo: "", nombre: "" })
  const [nuevoSub, setNuevoSub] = useState({}) // { [rubro_id]: {codigo, nombre} }
  const [expandido, setExpandido] = useState(null)

  const cargar = async () => {
    setLoading(true)
    const { data: rb, error: e1 } = await supabase.from('rubros').select('*').order('codigo')
    const { data: sr, error: e2 } = await supabase.from('sub_rubros').select('*').order('codigo')
    if (e1 || e2) { setErrMsg((e1 || e2).message); setLoading(false); return }
    const withSubs = (rb || []).map(r => ({ ...r, subs: (sr || []).filter(s => s.rubro_id === r.id) }))
    setRubros(withSubs)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const agregarRubro = async () => {
    if (!nuevoRubro.codigo.trim() || !nuevoRubro.nombre.trim()) return
    const { error } = await supabase.from('rubros').insert({ codigo: nuevoRubro.codigo.trim(), nombre: nuevoRubro.nombre.trim() })
    if (error) { setErrMsg(error.message); return }
    setNuevoRubro({ codigo: "", nombre: "" })
    cargar()
  }

  const agregarSub = async (rubro_id) => {
    const v = nuevoSub[rubro_id]
    if (!v?.codigo?.trim() || !v?.nombre?.trim()) return
    const { error } = await supabase.from('sub_rubros').insert({ rubro_id, codigo: v.codigo.trim(), nombre: v.nombre.trim() })
    if (error) { setErrMsg(error.message); return }
    setNuevoSub(p => ({ ...p, [rubro_id]: { codigo: "", nombre: "" } }))
    cargar()
  }

  const borrarRubro = async (id) => {
    if (!confirm("¿Eliminar este rubro y todos sus sub-rubros? Esto no afecta procedimientos ya cargados (quedan sin rubro asignado).")) return
    const { error } = await supabase.from('rubros').delete().eq('id', id)
    if (error) { setErrMsg(error.message); return }
    cargar()
  }

  const borrarSub = async (id) => {
    const { error } = await supabase.from('sub_rubros').delete().eq('id', id)
    if (error) { setErrMsg(error.message); return }
    cargar()
  }

  const toggleActivo = async (tabla, id, activo) => {
    await supabase.from(tabla).update({ activo: !activo }).eq('id', id)
    cargar()
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "min(760px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Gestión de Rubros y Sub-Rubros</h2>
          <button onClick={onClose} style={{ ...btnStyle, background: "#f0f0f0" }}>Cerrar</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {errMsg && <div style={{ background: "#fde8e8", color: "#c0392b", padding: 10, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{errMsg}</div>}

          <div style={{ background: "#f8f9fb", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>➕ Nuevo Rubro</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Código (ej: 2)" value={nuevoRubro.codigo} onChange={e => setNuevoRubro(p => ({ ...p, codigo: e.target.value }))} style={{ ...inputStyle, width: 120 }} />
              <input placeholder="Nombre (ej: Materiales y Suministros)" value={nuevoRubro.nombre} onChange={e => setNuevoRubro(p => ({ ...p, nombre: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={agregarRubro} style={{ ...btnStyle, background: "#2e75b6", color: "#fff" }}>Agregar</button>
            </div>
          </div>

          {loading ? <div>Cargando…</div> : rubros.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13 }}>No hay rubros cargados todavía.</div>
          ) : rubros.map(r => (
            <div key={r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, opacity: r.activo ? 1 : 0.5 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer" }}
                   onClick={() => setExpandido(expandido === r.id ? null : r.id)}>
                <div><b>{r.codigo}</b> — {r.nombre} <span style={{ color: "#888", fontSize: 12 }}>({r.subs.length} sub-rubros)</span></div>
                <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleActivo('rubros', r.id, r.activo)} style={{ ...btnStyle, background: "#f0f0f0", fontSize: 11 }}>{r.activo ? "Desactivar" : "Activar"}</button>
                  <button onClick={() => borrarRubro(r.id)} style={{ ...btnStyle, background: "#fde8e8", color: "#c0392b", fontSize: 11 }}>Eliminar</button>
                </div>
              </div>
              {expandido === r.id && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0f0f0" }}>
                  {r.subs.map(s => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13, opacity: s.activo ? 1 : 0.5 }}>
                      <div>{s.codigo} — {s.nombre}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => toggleActivo('sub_rubros', s.id, s.activo)} style={{ ...btnStyle, background: "#f0f0f0", fontSize: 10, padding: "4px 8px" }}>{s.activo ? "Desactivar" : "Activar"}</button>
                        <button onClick={() => borrarSub(s.id)} style={{ ...btnStyle, background: "#fde8e8", color: "#c0392b", fontSize: 10, padding: "4px 8px" }}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <input placeholder="Código sub-rubro (ej: 2.03)" value={nuevoSub[r.id]?.codigo || ""} onChange={e => setNuevoSub(p => ({ ...p, [r.id]: { ...p[r.id], codigo: e.target.value } }))} style={{ ...inputStyle, width: 140 }} />
                    <input placeholder="Nombre" value={nuevoSub[r.id]?.nombre || ""} onChange={e => setNuevoSub(p => ({ ...p, [r.id]: { ...p[r.id], nombre: e.target.value } }))} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => agregarSub(r.id)} style={{ ...btnStyle, background: "#27ae60", color: "#fff", fontSize: 12 }}>Agregar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
