import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'
import { Shield, Eye, EyeOff, Server, Lock } from 'lucide-react'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const [siteName, setSiteName] = useState('PC Manager')
  const navigate = useNavigate()

  useEffect(() => {
    api('/api/setup').then(d => setSiteName(d.site_name || 'PC Manager')).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      setToken(res.token)
      navigate('/')
    } catch (err) {
      setError('Hatalı şifre')
    }
    setLoading(false)
  }

  return (
    <div style={{background: 'var(--bg-primary)'}} className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="text-center mb-8">
          <div style={{
            background: 'var(--accent-glow)',
            borderColor: 'var(--accent)',
          }} className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border mb-4">
            <Server size={32} style={{color: 'var(--accent)'}} />
          </div>
          <h1 style={{color: 'var(--text)'}} className="text-2xl font-bold">{siteName}</h1>
          <p style={{color: 'var(--text-muted)'}} className="text-sm mt-1">Sistem yönetim arayüzü</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label style={{color: 'var(--text-secondary)'}} className="text-sm block mb-1.5">Şifre</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{color: 'var(--text-muted)'}} />
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Yönetici şifresi"
                autoFocus
                className="w-full pl-9 pr-10 py-3 text-sm rounded-xl"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 btn-ghost p-0">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444',
            }} className="rounded-lg px-4 py-2.5 text-sm">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !password}
            style={{
              background: 'var(--accent)',
              opacity: loading || !password ? 0.5 : 1,
            }}
            className="w-full text-white font-medium rounded-xl px-4 py-3 text-sm transition-opacity">
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  )
}
