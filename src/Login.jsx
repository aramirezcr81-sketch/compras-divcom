import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(traducirError(error.message))
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(traducirError(error.message))
      } else {
        setInfo('Cuenta creada. Si tu proyecto requiere confirmación por email, revisá tu correo. Si no, ya podés iniciar sesión.')
        setMode('login')
      }
    }
    setLoading(false)
  }

  const traducirError = (msg) => {
    if (msg.includes('Invalid login credentials')) return 'Usuario o contraseña incorrectos.'
    if (msg.includes('User already registered')) return 'Ya existe una cuenta con ese email.'
    if (msg.includes('Password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.'
    if (msg.includes('Unable to validate email')) return 'El formato del email no es válido.'
    return msg
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🏥</div>
        <h1 style={styles.title}>Base de Compras</h1>
        <p style={styles.subtitle}>División Comercial — DNSFFAA</p>

        <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu.email@ejemplo.com"
            required
            style={styles.input}
          />

          <label style={styles.label}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            style={styles.input}
          />

          {error && <div style={styles.error}>⚠️ {error}</div>}
          {info && <div style={styles.info}>ℹ️ {info}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Espere...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <div style={styles.switchMode}>
          {mode === 'login' ? (
            <>¿No tenés cuenta?{' '}
              <span style={styles.link} onClick={() => { setMode('signup'); setError(''); setInfo('') }}>
                Crear una cuenta nueva
              </span>
            </>
          ) : (
            <>¿Ya tenés cuenta?{' '}
              <span style={styles.link} onClick={() => { setMode('login'); setError(''); setInfo('') }}>
                Iniciar sesión
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a3a5c 0%, #2e75b6 100%)',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    padding: 16,
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,.25)',
    textAlign: 'center',
  },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 700, color: '#1a3a5c', margin: 0 },
  subtitle: { fontSize: 13, color: '#888', marginTop: 4 },
  label: {
    display: 'block',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '.4px',
    marginBottom: 5,
    marginTop: 14,
  },
  input: {
    width: '100%',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    background: '#2e75b6',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '12px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 20,
  },
  error: {
    background: '#fde8e8',
    color: '#c0392b',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 12,
    marginTop: 14,
    textAlign: 'left',
  },
  info: {
    background: '#e3f0fd',
    color: '#1a5276',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 12,
    marginTop: 14,
    textAlign: 'left',
  },
  switchMode: { marginTop: 20, fontSize: 12, color: '#666' },
  link: { color: '#2e75b6', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' },
}
