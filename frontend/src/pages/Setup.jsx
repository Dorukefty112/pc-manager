import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'
import { Shield, Eye, EyeOff, Check, ArrowRight, User, Globe, Lock, Server } from 'lucide-react'

export default function Setup() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const [form, setForm] = useState({
    admin_name: '',
    site_name: 'PC Manager',
    password: '',
    confirm: '',
  })
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    api('/api/setup').then(data => {
      if (data.completed) {
        setDone(true)
        navigate('/login')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [navigate])

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    setError('')
    if (!form.password) { setError('Şifre gerekli'); return }
    if (form.password.length < 4) { setError('Şifre en az 4 karakter olmalı'); return }
    if (form.password !== form.confirm) { setError('Şifreler eşleşmiyor'); return }
    if (!form.site_name.trim()) { setError('Site adı gerekli'); return }

    setSubmitting(true)
    try {
      const res = await api('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_name: form.admin_name.trim(),
          site_name: form.site_name.trim(),
          password: form.password,
        }),
      })
      const loginRes = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.password }),
      })
      setToken(loginRes.token)
      setDone(true)
      navigate('/')
    } catch (e) {
      setError(e.message || 'Kurulum hatası')
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-gray-500">Yükleniyor...</div>
      </div>
    )
  }

  if (done) return null

  const steps = [
    { icon: User, title: 'Yönetici', desc: 'Adınız (isteğe bağlı)' },
    { icon: Globe, title: 'Site', desc: 'Site adınız' },
    { icon: Lock, title: 'Şifre', desc: 'Giriş şifrenizi belirleyin' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-900/50 mb-4">
            <Server size={32} className="text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">PC Manager</h1>
          <p className="text-gray-500 text-sm mt-1">İlk kurulum</p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
          {error && (
            <div className="mb-4 bg-red-900/20 border border-red-900/50 rounded-lg px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-cyan-900/30 border border-cyan-800 flex items-center justify-center">
                  <User size={20} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Adınız nedir?</h3>
                  <p className="text-xs text-gray-500">Kontrol panelinde görünecek</p>
                </div>
              </div>
              <input value={form.admin_name} onChange={e => update('admin_name', e.target.value)}
                placeholder="Örn: Doruk"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-700" />
              <p className="text-xs text-gray-600">Boş bırakabilirsiniz.</p>
              <button onClick={() => setStep(1)}
                className="w-full bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2">
                Devam <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-cyan-900/30 border border-cyan-800 flex items-center justify-center">
                  <Globe size={20} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Site adı ne olsun?</h3>
                  <p className="text-xs text-gray-500">Tarayıcı sekmesinde görünecek</p>
                </div>
              </div>
              <input value={form.site_name} onChange={e => update('site_name', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-700" />
              <button onClick={() => setStep(2)}
                className="w-full bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2">
                Devam <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-cyan-900/30 border border-cyan-800 flex items-center justify-center">
                  <Lock size={20} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Giriş şifresi</h3>
                  <p className="text-xs text-gray-500">PC Manager'a giriş yapmak için</p>
                </div>
              </div>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={form.password}
                  onChange={e => update('password', e.target.value)}
                  placeholder="En az 4 karakter"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-700 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={form.confirm}
                  onChange={e => update('confirm', e.target.value)}
                  placeholder="Şifre tekrar"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-700" />
              </div>
              <button onClick={handleSubmit} disabled={submitting || !form.password || !form.confirm}
                className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2">
                {submitting ? 'Kaydediliyor...' : <><Check size={16} /> Kurulumu Tamamla</>}
              </button>
            </div>
          )}

          <div className="flex justify-center gap-2 mt-6">
            {steps.map((s, i) => (
              <button key={i} onClick={() => i < step ? setStep(i) : {}}
                className={`w-8 h-8 rounded-full text-xs font-medium transition-all flex items-center justify-center
                  ${i === step ? 'bg-cyan-700 text-white' :
                    i < step ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-800' :
                    'bg-gray-800 text-gray-600'}`}>
                {i < step ? <Check size={14} /> : i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
