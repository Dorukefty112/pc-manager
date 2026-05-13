import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'
import { Shield, Eye, EyeOff, Server } from 'lucide-react'

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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-900/50 mb-4">
            <Server size={32} className="text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">{siteName}</h1>
          <p className="text-gray-500 text-sm mt-1">Sistem yönetim arayüzü</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Şifre</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Yönetici şifresi"
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-700 pr-10"
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-900/50 rounded-lg px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !password}
            className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors">
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  )
}
