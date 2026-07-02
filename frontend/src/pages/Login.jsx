import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'
import { useI18n } from '../context/I18nContext'
import { Eye, EyeOff, Lock, Monitor, ArrowRight, AlertCircle } from 'lucide-react'

export default function Login() {
  const { t } = useI18n()
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
    } catch {
      setError(t('Hatalı şifre. Lütfen tekrar deneyin.'))
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes spin-slow { to { transform: rotate(360deg); } }
        @keyframes login-fade { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .login-card { animation: login-fade 0.4s ease-out; }
        .login-btn {
          width: 100%; padding: 12px; border-radius: 12px;
          background: var(--accent); color: #fff;
          font-size: 0.9rem; font-weight: 700;
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.2s ease;
          letter-spacing: 0.01em;
          box-shadow: 0 0 20px rgba(6,182,212,0.3);
        }
        .login-btn:hover:not(:disabled) {
          background: var(--accent-dim);
          box-shadow: 0 0 32px rgba(6,182,212,0.5);
          transform: translateY(-1px);
        }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .pw-input-wrap { position: relative; }
        .pw-input-wrap input { padding-right: 40px; width: 100%; }
        .pw-toggle {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: var(--text-muted); padding: 4px;
          display: flex; align-items: center;
          transition: color 0.15s;
        }
        .pw-toggle:hover { color: var(--text-secondary); }
      `}</style>

      {/* Background decorative blobs */}
      <div style={{
        position: 'absolute', top: '10%', left: '15%', width: 400, height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '15%', right: '10%', width: 350, height: 350,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Grid pattern */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
        opacity: 0.3,
        maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
      }} />

      {/* Login Card */}
      <div className="login-card" style={{
        width: '100%', maxWidth: 400,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px var(--border), 0 24px 64px rgba(0,0,0,0.6)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Top accent line */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, transparent, var(--accent), var(--purple), transparent)',
        }} />

        <div style={{ padding: '36px 32px 32px' }}>
          {/* Logo + title */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: 'linear-gradient(135deg, var(--accent-glow), rgba(167,139,250,0.12))',
              border: '1px solid rgba(6,182,212,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 0 24px rgba(6,182,212,0.2)',
              animation: 'float 3s ease-in-out infinite',
            }}>
              <Monitor size={28} color="var(--accent)" />
            </div>
            <h1 style={{
              margin: 0,
              fontSize: '1.4rem', fontWeight: 800,
              color: 'var(--text)', letterSpacing: '-0.03em',
            }}>
              {siteName}
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {t('Sistem yönetim arayüzü')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                display: 'block', marginBottom: 7,
                fontSize: '0.78rem', fontWeight: 600,
                color: 'var(--text-secondary)', letterSpacing: '0.03em',
              }}>
                <Lock size={11} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                {t('Şifre')}
              </label>
              <div className="pw-input-wrap">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('Yönetici şifresi')}
                  autoFocus
                  style={{ borderRadius: 12, padding: '11px 14px' }}
                />
                <button type="button" className="pw-toggle" onClick={() => setShow(!show)}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--red-glow)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 10, padding: '10px 14px',
                color: 'var(--red)', fontSize: '0.82rem',
                animation: 'scale-in 0.2s ease-out',
              }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="login-btn"
              style={{ marginTop: 4 }}
            >
              {loading ? (
                <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> {t('Giriş yapılıyor...')}</>
              ) : (
                <>{t('Giriş Yap')} <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <div style={{
            marginTop: 24, paddingTop: 20,
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
            fontSize: '0.72rem', color: 'var(--text-muted)',
          }}>
            PC Manager v1.3.0 — MIT License
          </div>
        </div>
      </div>
    </div>
  )
}
