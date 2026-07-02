import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'
import { useI18n } from '../context/I18nContext'
import { Eye, EyeOff, Check, ArrowRight, User, Globe, Lock, Server } from 'lucide-react'

export default function Setup() {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const [form, setForm] = useState({ admin_name: '', site_name: 'PC Manager', password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    api('/api/setup').then(data => {
      if (data.completed) { setDone(true); navigate('/login') }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [navigate])

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    setError('')
    if (!form.password) { setError(t('Şifre gerekli')); return }
    if (form.password.length < 4) { setError(t('Şifre en az 4 karakter olmalı')); return }
    if (form.password !== form.confirm) { setError(t('Şifreler eşleşmiyor')); return }
    if (!form.site_name.trim()) { setError(t('Site adı gerekli')); return }
    setSubmitting(true)
    try {
      await api('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_name: form.admin_name.trim(), site_name: form.site_name.trim(), password: form.password }) })
      const loginRes = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.password }) })
      setToken(loginRes.token); setDone(true); navigate('/')
    } catch (e) { setError(e.message || t('Kurulum hatası')) }
    setSubmitting(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#020812', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner spinner-lg" />
    </div>
  )
  if (done) return null

  const steps = [
    { icon: User, title: t('Yönetici'), desc: t('Adınız (isteğe bağlı)') },
    { icon: Globe, title: t('Site'), desc: t('Site adınız') },
    { icon: Lock, title: t('Şifre'), desc: t('Giriş şifrenizi belirleyin') },
  ]

  return (
    <div style={{
      minHeight: '100vh', background: '#020812',
      backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(6,182,212,0.07) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(167,139,250,0.05) 0%, transparent 50%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "Inter, -apple-system, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 18, margin: '0 auto 16px',
            background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(6,182,212,0.15)',
          }}>
            <Server size={34} color="#06b6d4" />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f0f6fc', margin: '0 0 6px', letterSpacing: '-0.03em' }}>
            PC Manager
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', margin: 0 }}>{t('İlk kurulum')}</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28,
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', color: '#ef4444', marginBottom: 18 }}>
              {error}
            </div>
          )}

          {/* Steps 0, 1, 2 */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={20} color="#06b6d4" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#f0f6fc', fontSize: '0.95rem' }}>{t('Adınız nedir?')}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>{t('Kontrol panelinde görünecek')}</div>
                </div>
              </div>
              <input value={form.admin_name} onChange={e => update('admin_name', e.target.value)} placeholder={t('Örn: Ahmet')}
                style={{ borderRadius: 12, padding: '12px 16px', fontSize: '0.9rem' }}
                onKeyDown={e => e.key === 'Enter' && setStep(1)}
              />
              <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', margin: 0 }}>{t('Boş bırakabilirsiniz.')}</p>
              <button onClick={() => setStep(1)} style={{ width: '100%', background: '#06b6d4', border: 'none', borderRadius: 12, padding: '13px 20px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 0 20px rgba(6,182,212,0.2)', transition: 'all 0.15s ease' }}>
                {t('Devam')} <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Globe size={20} color="#06b6d4" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#f0f6fc', fontSize: '0.95rem' }}>{t('Site adı ne olsun?')}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>{t('Tarayıcı sekmesinde görünecek')}</div>
                </div>
              </div>
              <input value={form.site_name} onChange={e => update('site_name', e.target.value)}
                style={{ borderRadius: 12, padding: '12px 16px', fontSize: '0.9rem' }}
                onKeyDown={e => e.key === 'Enter' && setStep(2)}
              />
              <button onClick={() => setStep(2)} style={{ width: '100%', background: '#06b6d4', border: 'none', borderRadius: 12, padding: '13px 20px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 0 20px rgba(6,182,212,0.2)' }}>
                {t('Devam')} <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={20} color="#06b6d4" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#f0f6fc', fontSize: '0.95rem' }}>{t('Giriş şifresi')}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>{t("PC Manager'a giriş yapmak için")}</div>
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => update('password', e.target.value)} placeholder={t('En az 4 karakter')}
                  style={{ borderRadius: 12, padding: '12px 44px 12px 16px', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 0 }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <input type={showPassword ? 'text' : 'password'} value={form.confirm} onChange={e => update('confirm', e.target.value)} placeholder={t('Şifre tekrar')}
                style={{ borderRadius: 12, padding: '12px 16px', fontSize: '0.9rem' }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
              <button onClick={handleSubmit} disabled={submitting || !form.password || !form.confirm} style={{ width: '100%', background: '#06b6d4', border: 'none', borderRadius: 12, padding: '13px 20px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 0 20px rgba(6,182,212,0.2)', opacity: (submitting || !form.password || !form.confirm) ? 0.5 : 1 }}>
                {submitting ? <><div className="spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fff' }} />{t('Kaydediliyor...')}</> : <><Check size={16} />{t('Kurulumu Tamamla')}</>}
              </button>
            </div>
          )}

          {/* Step indicators */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
            {steps.map((s, i) => (
              <button key={i} onClick={() => i < step && setStep(i)} style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, cursor: i < step ? 'pointer' : 'default', border: 'none', transition: 'all 0.2s',
                background: i === step ? '#06b6d4' : i < step ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                color: i === step ? '#fff' : i < step ? '#06b6d4' : 'rgba(255,255,255,0.3)',
                boxShadow: i === step ? '0 0 12px rgba(6,182,212,0.4)' : 'none',
              }}>
                {i < step ? <Check size={13} /> : i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
