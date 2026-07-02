import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Gauge, ArrowDown, ArrowUp, Activity, Timer, Server, Wifi, RefreshCw, MapPin, Play } from 'lucide-react'

export default function Speedtest() {
  const { t } = useI18n()
  const [status, setStatus] = useState({ status: 'idle', results: null, error: null, progress: '' })
  const [running, setRunning] = useState(false)
  const [liveSpeed, setLiveSpeed] = useState(null)
  const [livePhase, setLivePhase] = useState('')
  const pollRef = useRef(null)

  const start = async () => {
    try {
      await api('/api/speedtest/start', { method: 'POST' })
      setRunning(true); setLiveSpeed(null); setLivePhase('')
      setStatus({ status: 'running', results: null, error: null, progress: '' })
    } catch {}
  }

  useEffect(() => {
    if (!running) return
    pollRef.current = setInterval(async () => {
      try {
        const s = await api('/api/speedtest/status')
        setStatus(s)
        const lv = s.live
        if (lv?.phase) {
          if (lv.phase === 'hazirlik') setLivePhase(t('Hazırlanıyor...'))
          else if (lv.phase === 'indirme') { setLivePhase(t('İndiriliyor...')); setLiveSpeed(lv.download > 0 ? { type: 'download', value: lv.download } : null) }
          else if (lv.phase === 'yukleme') { setLivePhase(t('Yükleniyor...')); setLiveSpeed(lv.upload > 0 ? { type: 'upload', value: lv.upload } : null) }
        }
        if (s.status === 'done' || s.status === 'error') {
          clearInterval(pollRef.current); setRunning(false)
        }
      } catch {}
    }, 300)
    return () => clearInterval(pollRef.current)
  }, [running])

  const r = status.results
  const isRunning = status.status === 'running'
  const fmt = (mbps) => !mbps ? '0 Mbps' : mbps > 1000 ? `${(mbps / 1000).toFixed(1)} Gbps` : `${mbps.toFixed(0)} Mbps`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Gauge size={18} color="var(--accent)" /></span>
          {t('Hız Testi')}
        </h2>
      </div>

      {/* Hero test card */}
      <div className="card card-glow" style={{ padding: '36px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center top, rgba(6,182,212,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />

        {!isRunning && !r && (
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px',
              background: 'var(--accent-glow)', border: '2px solid rgba(6,182,212,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 32px rgba(6,182,212,0.2)',
              animation: 'float 3s ease-in-out infinite',
            }}>
              <Gauge size={36} color="var(--accent)" />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t('Hız Testi')}</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 24 }}>{t('İnternet bağlantı hızını ölç')}</p>
            <button onClick={start} className="btn btn-primary" style={{ padding: '12px 36px', fontSize: '0.9rem', margin: '0 auto' }}>
              <Play size={16} /> {t('Testi Başlat')}
            </button>
          </div>
        )}

        {isRunning && (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                border: '3px solid rgba(6,182,212,0.15)', borderTopColor: 'var(--accent)',
                animation: 'spin 1s linear infinite',
              }} />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {livePhase || t('Test devam ediyor...')}
              </div>
              {liveSpeed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {liveSpeed.type === 'download'
                    ? <ArrowDown size={28} color="#22d3ee" />
                    : <ArrowUp size={28} color="#a78bfa" />
                  }
                  <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>
                    {fmt(liveSpeed.value)}
                  </span>
                </div>
              )}
              <div style={{ width: '100%', maxWidth: 280, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${Math.min((liveSpeed?.value || 0) / 10, 100)}%`,
                  background: liveSpeed?.type === 'download'
                    ? 'linear-gradient(90deg, #22d3ee, #06b6d4)'
                    : 'linear-gradient(90deg, #a78bfa, #7c3aed)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          </div>
        )}

        {status.error && (
          <div style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', color: 'var(--red)', fontSize: '0.85rem', marginTop: 16 }}>
            {status.error}
          </div>
        )}
      </div>

      {r && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {[
              { label: t('İndirme'), icon: ArrowDown, color: '#22d3ee', value: fmt(r.download), sub: `${(r.download_bytes / 1e6).toFixed(0)} MB ${t('alındı')}`, pct: Math.min((r.download || 0) / 10, 100) },
              { label: t('Yükleme'), icon: ArrowUp, color: '#a78bfa', value: fmt(r.upload), sub: `${(r.upload_bytes / 1e6).toFixed(0)} MB ${t('gönderildi')}`, pct: Math.min((r.upload || 0) / 10, 100) },
            ].map(({ label, icon: Icon, color, value, sub, pct }) => (
              <div key={label} className="card card-glow" style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 14px', background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={22} color={color} />
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 14 }}>{sub}</div>
                <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: color, transition: 'width 1s ease', boxShadow: `0 0 8px ${color}60` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="card card-glow" style={{ padding: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16 }}>
              {[
                { icon: Timer, label: t('Ping'), value: `${r.ping} ms` },
                { icon: Server, label: t('Sunucu'), value: r.server_name },
                { icon: MapPin, label: t('Konum'), value: r.server_location },
                { icon: Wifi, label: 'ISP', value: r.isp || '-' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
                    <Icon size={13} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{label}</span>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button onClick={start} disabled={running} className="btn btn-secondary">
              <RefreshCw size={14} /> {t('Tekrar Test Et')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
