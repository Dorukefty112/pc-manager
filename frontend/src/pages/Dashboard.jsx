import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useWebSocket } from '../useWebSocket'
import { useI18n } from '../context/I18nContext'
import {
  Cpu, MemoryStick, Activity, Wifi, WifiOff,
  Gauge, Timer, HardDrive, Thermometer, Server,
  RefreshCw, ArrowUpRight, Zap, Shield
} from 'lucide-react'

// ─── Circular Progress Ring ───────────────────────────────────────────────────
function CircleGauge({ value = 0, color = '#06b6d4', size = 100, strokeWidth = 8, label, sublabel }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(value, 100) / 100) * circ

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)',
            filter: `drop-shadow(0 0 6px ${color}80)`,
          }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 1,
      }}>
        <span style={{
          fontSize: size < 90 ? '0.85rem' : '1.1rem',
          fontWeight: 700, color: 'var(--text)',
          letterSpacing: '-0.03em',
        }}>{label}</span>
        {sublabel && (
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{sublabel}</span>
        )}
      </div>
    </div>
  )
}

// ─── Sparkline canvas ─────────────────────────────────────────────────────────
function Sparkline({ data = [], color = '#06b6d4', height = 40 }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || data.length < 2) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    const w = canvas.offsetWidth
    const h = height
    ctx.clearRect(0, 0, w, h)
    const step = w / (data.length - 1)
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, color + '50')
    grad.addColorStop(1, color + '00')
    ctx.beginPath()
    ctx.moveTo(0, h)
    data.forEach((p, i) => ctx.lineTo(i * step, h - (p.value / 100) * h))
    ctx.lineTo((data.length - 1) * step, h)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.beginPath()
    data.forEach((p, i) => {
      const x = i * step, y = h - (p.value / 100) * h
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.stroke()
  }, [data, color, height])
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} />
}

// ─── Horizontal bar ──────────────────────────────────────────────────────────
function Bar({ pct = 0, color = '#06b6d4' }) {
  return (
    <div style={{ width: '100%', height: 6, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
      <div style={{
        height: '100%', borderRadius: 99,
        width: `${Math.min(pct, 100)}%`,
        background: `linear-gradient(90deg, ${color}aa, ${color})`,
        boxShadow: `0 0 8px ${color}60`,
        transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState({ cpu: [], memory: [] })
  const [wsData, setWsData] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const token = localStorage.getItem('pcmanager_token') || ''
  const wsUrl = `${protocol}//${host}/api/system/ws?token=${encodeURIComponent(token)}`

  useWebSocket(wsUrl, {
    onMessage: (e) => { try { setWsData(JSON.parse(e.data)) } catch {} },
    onOpen: () => setWsConnected(true),
    onClose: () => setWsConnected(false),
  })

  const fetchAll = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        api('/api/system/stats'),
        api('/api/system/stats/history'),
      ])
      setStats(s)
      setHistory(h)
    } catch {}
  }, [])

  useEffect(() => {
    fetchAll()
    if (autoRefresh) {
      const id = setInterval(fetchAll, 5000)
      return () => clearInterval(id)
    }
  }, [fetchAll, autoRefresh])

  useEffect(() => {
    if (!wsData) return
    setHistory(prev => {
      const t = Date.now() / 1000
      return {
        cpu: [...prev.cpu.slice(-59), { time: t, value: wsData.cpu }],
        memory: [...prev.memory.slice(-59), { time: t, value: wsData.memory }],
      }
    })
  }, [wsData])

  const merged = wsData && stats ? {
    ...stats,
    cpu: { ...stats.cpu, percent: wsData.cpu },
    memory: { ...stats.memory, percent: wsData.memory },
  } : stats

  const uptime = stats?.uptime
    ? Math.floor((Date.now() / 1000 - stats.uptime) / 60) : 0
  const uptimeStr = uptime > 1440
    ? `${Math.floor(uptime / 1440)}g ${Math.floor((uptime % 1440) / 60)}s`
    : `${Math.floor(uptime / 60)}s ${uptime % 60}d`

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!stats) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        border: '3px solid rgba(6,182,212,0.15)',
        borderTopColor: '#06b6d4',
        animation: 'spin 1s linear infinite',
      }} />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', letterSpacing: '0.05em' }}>
        {t('Yükleniyor...')}
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const cpuPct = merged?.cpu?.percent ?? 0
  const ramPct = merged?.memory?.percent ?? 0
  const diskPct = stats?.disk?.percent ?? 0
  const ramUsed = ((stats?.memory?.used ?? 0) / 1e9).toFixed(1)
  const ramTotal = ((stats?.memory?.total ?? 0) / 1e9).toFixed(1)
  const diskUsed = ((stats?.disk?.used ?? 0) / 1e9).toFixed(1)
  const diskTotal = ((stats?.disk?.total ?? 0) / 1e9).toFixed(1)

  const cpuColor = cpuPct > 80 ? '#ef4444' : cpuPct > 60 ? '#f97316' : '#06b6d4'
  const ramColor = ramPct > 80 ? '#ef4444' : ramPct > 60 ? '#f97316' : '#a78bfa'
  const diskColor = diskPct > 80 ? '#ef4444' : diskPct > 60 ? '#f97316' : '#34d399'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes fade-up { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .dash-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
        }
        .dash-card:hover {
          border-color: var(--accent);
          box-shadow: 0 0 28px rgba(6,182,212,0.12), 0 8px 32px rgba(0,0,0,0.3);
          transform: translateY(-2px);
        }
        .stat-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 600;
        }
        .animate-fade-up { animation: fade-up 0.35s ease-out both; }
      `}</style>

      {/* ── Hero Header ──────────────────────────────────────────────────────── */}
      <div className="dash-card animate-fade-up" style={{
        padding: '28px 32px',
        background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(167,139,250,0.06) 50%, rgba(52,211,153,0.05) 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* decorative blobs */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 200, height: 200,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -30, left: '30%', width: 160, height: 160,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Live icon */}
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(167,139,250,0.2))',
              border: '1px solid rgba(6,182,212,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'float 3s ease-in-out infinite',
            }}>
              <Server size={24} color="#06b6d4" />
            </div>
            <div>
              <h2 style={{
                margin: 0, fontSize: '1.35rem', fontWeight: 800,
                color: 'var(--text)', letterSpacing: '-0.03em',
              }}>
                {stats.hostname}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{stats.os}</span>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border)' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('Uptime')}: {uptimeStr}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Live indicator */}
            <div className="stat-pill" style={{
              background: wsConnected ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
              border: `1px solid ${wsConnected ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
              color: wsConnected ? '#22c55e' : 'var(--text-muted)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: wsConnected ? '#22c55e' : 'var(--text-muted)',
                boxShadow: wsConnected ? '0 0 6px #22c55e' : 'none',
                animation: wsConnected ? 'pulse 2s ease-in-out infinite' : 'none',
              }} />
              {wsConnected ? t('Canlı') : t('Bağlanıyor...')}
            </div>

            {/* Clock */}
            <div className="stat-pill" style={{
              background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
              color: 'var(--accent)',
            }}>
              <Zap size={10} />
              {now.toLocaleTimeString('tr-TR')}
            </div>

            {/* Auto-refresh toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--accent)' }} />
              {t('Otomatik yenile')}
            </label>
          </div>
        </div>
      </div>

      {/* ── 3 Gauge Cards ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>

        {/* CPU */}
        <div className="dash-card animate-fade-up" style={{ padding: 24, animationDelay: '60ms' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `rgba(6,182,212,0.12)`, border: '1px solid rgba(6,182,212,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Cpu size={18} color={cpuColor} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>CPU</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{stats.cpu.count} {t('çekirdek')}</div>
              </div>
            </div>
            <CircleGauge value={cpuPct} color={cpuColor} size={76} strokeWidth={7}
              label={`${cpuPct}%`} />
          </div>
          <Bar pct={cpuPct} color={cpuColor} />
          <div style={{ marginTop: 12 }}>
            <Sparkline data={history.cpu} color={cpuColor} height={36} />
          </div>
        </div>

        {/* RAM */}
        <div className="dash-card animate-fade-up" style={{ padding: 24, animationDelay: '120ms' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MemoryStick size={18} color={ramColor} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>RAM</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ramUsed}/{ramTotal} GB</div>
              </div>
            </div>
            <CircleGauge value={ramPct} color={ramColor} size={76} strokeWidth={7}
              label={`${ramPct}%`} />
          </div>
          <Bar pct={ramPct} color={ramColor} />
          <div style={{ marginTop: 12 }}>
            <Sparkline data={history.memory} color={ramColor} height={36} />
          </div>
        </div>

        {/* Disk */}
        <div className="dash-card animate-fade-up" style={{ padding: 24, animationDelay: '180ms' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <HardDrive size={18} color={diskColor} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>Disk</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{diskUsed}/{diskTotal} GB</div>
              </div>
            </div>
            <CircleGauge value={diskPct} color={diskColor} size={76} strokeWidth={7}
              label={`${diskPct.toFixed(1)}%`} />
          </div>
          <Bar pct={diskPct} color={diskColor} />
          <div style={{ marginTop: 12, height: 36 }} />
        </div>
      </div>

      {/* ── Chart + Live Usage ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* History chart */}
        <div className="dash-card animate-fade-up" style={{ padding: 24, animationDelay: '240ms' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.875rem' }}>
              {t('CPU - RAM Geçmişi')}
            </span>
            <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4', boxShadow: '0 0 6px #06b6d4' }} />
                CPU
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 6px #a78bfa' }} />
                RAM
              </span>
            </div>
          </div>
          <div style={{ position: 'relative', height: 100 }}>
            <Sparkline data={history.cpu} color="#06b6d4" height={100} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <Sparkline data={history.memory} color="#a78bfa" height={100} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span>-60s</span><span>-30s</span><span>{t('şimdi')}</span>
          </div>
        </div>

        {/* Live usage bars */}
        <div className="dash-card animate-fade-up" style={{ padding: 24, animationDelay: '300ms' }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.875rem', marginBottom: 22 }}>
            {t('Canlı Kullanım')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {[
              { label: 'CPU', value: cpuPct, unit: '%', color: cpuColor },
              { label: 'RAM', value: ramPct, unit: '%', color: ramColor },
              { label: 'Disk', value: diskPct, unit: '%', color: diskColor },
            ].map(({ label, value, unit, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
                  <span style={{ color, fontWeight: 600 }}>{label}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 700 }}>
                    {typeof value === 'number' ? value.toFixed(1) : value}{unit}
                  </span>
                </div>
                <Bar pct={value} color={color} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Temperature Cards ─────────────────────────────────────────────────── */}
      {stats.temp?.length > 0 && (
        <div className="dash-card animate-fade-up" style={{ padding: 24, animationDelay: '360ms' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <Thermometer size={16} color="#f97316" />
            <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.875rem' }}>{t('Sıcaklıklar')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
            {stats.temp.map((t, i) => {
              const tColor = t.current > 80 ? '#ef4444' : t.current > 60 ? '#f97316' : '#34d399'
              return (
                <div key={i} style={{
                  background: `rgba(${t.current > 80 ? '239,68,68' : t.current > 60 ? '249,115,22' : '52,211,153'},0.07)`,
                  border: `1px solid rgba(${t.current > 80 ? '239,68,68' : t.current > 60 ? '249,115,22' : '52,211,153'},0.2)`,
                  borderRadius: 12, padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t.label}</span>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: tColor, letterSpacing: '-0.03em' }}>
                    {t.current}°
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Footer info bar ──────────────────────────────────────────────────── */}
      <div className="dash-card animate-fade-up" style={{
        padding: '12px 20px', animationDelay: '420ms',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={13} color="var(--text-muted)" />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats.os}</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {t('Son güncelleme:')} {now.toLocaleTimeString('tr-TR')}
        </span>
      </div>
    </div>
  )
}
