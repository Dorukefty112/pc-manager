import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Wifi, ArrowDown, ArrowUp, Activity, Globe } from 'lucide-react'

export default function Network() {
  const { t } = useI18n()
  const [interfaces, setInterfaces] = useState([])
  const [stats, setStats] = useState(null)
  const canvasRef = useRef(null)
  const historyRef = useRef([])

  useEffect(() => {
    api('/api/network/interfaces').then(setInterfaces).catch(() => {})
  }, [])

  useEffect(() => {
    const fetch = async () => {
      try {
        const s = await api('/api/network/stats')
        setStats(s)
        historyRef.current.push({ time: Date.now(), down: s.speed_down_bps, up: s.speed_up_bps })
        if (historyRef.current.length > 60) historyRef.current.shift()
      } catch {}
    }
    fetch()
    const id = setInterval(fetch, 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !historyRef.current.length) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = 80 * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    const w = canvas.offsetWidth, h = 80
    ctx.clearRect(0, 0, w, h)
    const data = historyRef.current
    const maxSpeed = Math.max(1, ...data.map(d => d.down), ...data.map(d => d.up))
    const step = w / Math.max(data.length - 1, 1)
    const draw = (key, color) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, color + '40'); grad.addColorStop(1, color + '00')
      ctx.beginPath(); ctx.moveTo(0, h)
      data.forEach((p, i) => ctx.lineTo(i * step, h - (p[key] / maxSpeed) * (h - 4)))
      ctx.lineTo((data.length - 1) * step, h); ctx.closePath()
      ctx.fillStyle = grad; ctx.fill()
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5
      ctx.shadowColor = color; ctx.shadowBlur = 5
      data.forEach((p, i) => { const x = i * step, y = h - (p[key] / maxSpeed) * (h - 4); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
      ctx.stroke(); ctx.shadowBlur = 0
    }
    draw('down', '#22d3ee'); draw('up', '#a78bfa')
  }, [stats])

  const fmt = (bps) => {
    if (!bps) return '0 b/s'
    if (bps > 1e9) return `${(bps / 1e9).toFixed(1)} Gb/s`
    if (bps > 1e6) return `${(bps / 1e6).toFixed(1)} Mb/s`
    if (bps > 1e3) return `${(bps / 1e3).toFixed(1)} Kb/s`
    return `${bps.toFixed(0)} b/s`
  }
  const fmtBytes = (b) => {
    if (!b) return '0 B'
    if (b > 1e12) return `${(b / 1e12).toFixed(1)} TB`
    if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`
    if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
    return `${(b / 1e3).toFixed(0)} KB`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Globe size={18} color="var(--accent)" /></span>
          {t('Ağ Bilgileri')}
        </h2>
      </div>

      {/* Speed cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {[
          { label: t('İndirme'), icon: ArrowDown, color: '#22d3ee', value: fmt(stats?.speed_down_bps), sub: `${t('Toplam:')} ${fmtBytes(stats?.bytes_recv)}` },
          { label: t('Yükleme'), icon: ArrowUp, color: '#a78bfa', value: fmt(stats?.speed_up_bps), sub: `${t('Toplam:')} ${fmtBytes(stats?.bytes_sent)}` },
          { label: t('Paket (Alınan)'), icon: Activity, color: '#34d399', value: `${(stats?.packets_recv || 0).toLocaleString()}`, sub: `${t('Gönderilen:')} ${(stats?.packets_sent || 0).toLocaleString()}` },
        ].map(({ label, icon: Icon, color, value, sub }) => (
          <div key={label} className="card card-glow" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={17} color={color} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Bandwidth chart */}
      <div className="card card-glow" style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('Bant Genişliği (60sn)')}</span>
          <div style={{ display: 'flex', gap: 14, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {[['#22d3ee', t('İndirme')], ['#a78bfa', t('Yükleme')]].map(([c, l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 5px ${c}` }} />{l}
              </span>
            ))}
          </div>
        </div>
        <canvas ref={canvasRef} style={{ width: '100%', height: 80, display: 'block' }} />
      </div>

      {/* Interfaces */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wifi size={15} color="var(--accent)" />
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>{t('Ağ Arayüzleri')}</span>
        </div>
        <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {interfaces.map(iface => (
            <div key={iface.name} style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>
                {iface.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {iface.addresses.map((addr, i) => (
                  <div key={i} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>
                      {addr.family === '2' ? 'IPv4' : addr.family === '10' ? 'IPv6' : addr.family}
                    </span>
                    {addr.address}{addr.netmask ? ` / ${addr.netmask}` : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {interfaces.length === 0 && <div className="empty-state">{t('Arayüz bulunamadı')}</div>}
        </div>
      </div>
    </div>
  )
}
