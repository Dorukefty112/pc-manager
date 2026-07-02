import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useWebSocket } from '../useWebSocket'
import { useI18n } from '../context/I18nContext'
import { Thermometer, Cpu, Monitor, Activity, Gauge, Timer, HardDrive, MemoryStick, RefreshCw, Zap } from 'lucide-react'

function fmtUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}g ${h}s`
  if (h > 0) return `${h}s ${m}d`
  return `${m}d`
}
function fmtBytes(b) {
  if (!b) return '0 GB'
  const gb = b / 1e9
  return gb > 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${gb.toFixed(1)} GB`
}

function MiniBar({ pct = 0, color = 'var(--accent)' }) {
  return (
    <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{
        height: '100%', borderRadius: 99,
        width: `${Math.min(pct, 100)}%`,
        background: color,
        boxShadow: `0 0 8px ${color}60`,
        transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  )
}

function TempBadge({ value, warn }) {
  const hot = value > warn
  return (
    <span style={{
      fontSize: '0.68rem', padding: '2px 8px', borderRadius: 99,
      fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
      background: hot ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)',
      color: hot ? '#ef4444' : '#22c55e',
      border: `1px solid ${hot ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
      flexShrink: 0,
    }}>
      {value}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, sub, color = 'var(--accent)', pct }) {
  return (
    <div className="card card-glow" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `${color}18`, border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={17} color={color} />
        </div>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
      {pct !== undefined && <MiniBar pct={pct} color={color} />}
    </div>
  )
}

export default function Temperature() {
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [tempData, setTempData] = useState(null)
  const [history, setHistory] = useState({ cpu: [], memory: [] })
  const [wsData, setWsData] = useState(null)
  const canvasRef = useRef(null)

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const token = localStorage.getItem('pcmanager_token') || ''
  const wsUrl = `${protocol}//${host}/api/system/ws?token=${encodeURIComponent(token)}`
  useWebSocket(wsUrl, { onMessage: (e) => { try { setWsData(JSON.parse(e.data)) } catch {} } })

  const fetchAll = useCallback(async () => {
    try {
      const [s, td, h] = await Promise.all([
        api('/api/system/stats'), api('/api/temperature'), api('/api/system/stats/history'),
      ])
      setStats(s); setTempData(td); setHistory(h)
    } catch {}
  }, [])

  useEffect(() => { fetchAll(); const id = setInterval(fetchAll, 7000); return () => clearInterval(id) }, [fetchAll])

  useEffect(() => {
    if (!wsData) return
    setHistory(prev => {
      const now = Date.now() / 1000
      return {
        cpu:    [...prev.cpu.slice(-59),    { time: now, value: wsData.cpu }],
        memory: [...prev.memory.slice(-59), { time: now, value: wsData.memory }],
      }
    })
  }, [wsData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !history.cpu.length) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = 80 * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    const w = canvas.offsetWidth, h = 80
    ctx.clearRect(0, 0, w, h)
    const drawLine = (data, color) => {
      if (data.length < 2) return
      const step = w / (data.length - 1)
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, color + '40'); grad.addColorStop(1, color + '00')
      ctx.beginPath(); ctx.moveTo(0, h)
      data.forEach((p, i) => ctx.lineTo(i * step, h - (p.value / 100) * h))
      ctx.lineTo((data.length - 1) * step, h); ctx.closePath()
      ctx.fillStyle = grad; ctx.fill()
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5
      ctx.shadowColor = color; ctx.shadowBlur = 5
      data.forEach((p, i) => { const x = i * step, y = h - (p.value / 100) * h; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
      ctx.stroke(); ctx.shadowBlur = 0
    }
    drawLine(history.cpu, '#22d3ee'); drawLine(history.memory, '#a78bfa')
  }, [history])

  const merged = wsData && stats ? { ...stats, cpu: { ...stats.cpu, percent: wsData.cpu }, memory: { ...stats.memory, percent: wsData.memory } } : stats
  const cpu = merged?.cpu, mem = merged?.memory, disk = stats?.disk
  const gpu = tempData?.gpu, cpuWin = tempData?.cpu, sys = tempData?.system

  const cpuColor = (cpu?.percent || 0) > 80 ? '#ef4444' : (cpu?.percent || 0) > 60 ? '#f97316' : '#06b6d4'
  const ramColor = (mem?.percent || 0) > 80 ? '#ef4444' : (mem?.percent || 0) > 60 ? '#f97316' : '#a78bfa'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Activity size={18} color="var(--accent)" /></span>
          {t('Sistem Durumu')}
        </h2>
        <button onClick={fetchAll} className="btn btn-secondary" style={{ gap: 6 }}>
          <RefreshCw size={14} /> {t('Yenile')}
        </button>
      </div>

      {!stats ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, flexDirection: 'column', gap: 12 }}>
          <div className="spinner spinner-lg" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('Yükleniyor...')}</span>
        </div>
      ) : (
        <>
          {/* GPU + CPU detail */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* GPU */}
            <div className="card card-glow" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Monitor size={17} color="#22d3ee" />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)' }}>GPU</span>
                </div>
                {gpu && <TempBadge value={`${gpu.temp_c}°C`} warn={75} />}
              </div>
              {gpu ? (
                <>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{gpu.name}</span>
                    <span style={{ marginLeft: 8, flexShrink: 0 }}>{gpu.power_w}W</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('Kullanım')}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: gpu.util_pct > 80 ? '#ef4444' : '#22d3ee', letterSpacing: '-0.03em' }}>{gpu.util_pct}%</div>
                      <MiniBar pct={gpu.util_pct} color={gpu.util_pct > 80 ? '#ef4444' : '#22d3ee'} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('Güç')}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>{gpu.power_w}W</div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', paddingTop: 8 }}>{t('Veri alınamadı')}</div>
              )}
            </div>

            {/* CPU detail */}
            <div className="card card-glow" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Cpu size={17} color="#a78bfa" />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)' }}>CPU</span>
                </div>
                {cpu && <TempBadge value={`${Math.round(cpu.percent)}%`} warn={80} />}
              </div>
              {cpu && (
                <>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{cpuWin?.model || 'CPU'}</span>
                    <span style={{ marginLeft: 8, flexShrink: 0 }}>
                      {cpuWin?.freq_mhz > 1000 ? `${(cpuWin.freq_mhz / 1000).toFixed(1)} GHz` : `${cpuWin?.freq_mhz || ''} MHz`}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    {[
                      { label: t('Kullanım'), val: `${Math.round(cpu.percent)}%` },
                      { label: t('Çekirdek'), val: `${cpuWin?.cores || cpu?.count}/${cpuWin?.threads || cpu?.count}` },
                      { label: t('Frekans'), val: cpu.freq?.current > 0 ? `${(cpu.freq.current / 1000).toFixed(1)} GHz` : '-' },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ textAlign: 'center', padding: '8px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <MiniBar pct={cpu.percent} color={cpuColor} />
                </>
              )}
            </div>
          </div>

          {/* Charts + live */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div className="card card-glow" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('CPU - RAM Geçmişi (60s)')}</span>
                <div style={{ display: 'flex', gap: 12, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {[['#22d3ee','CPU'],['#a78bfa','RAM']].map(([c,l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 5px ${c}` }} />{l}
                    </span>
                  ))}
                </div>
              </div>
              <canvas ref={canvasRef} style={{ width: '100%', height: 80, display: 'block' }} />
            </div>

            <div className="card card-glow" style={{ padding: 22 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 18 }}>{t('Canlı Kullanım')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'CPU', pct: cpu?.percent || 0, color: cpuColor },
                  { label: 'RAM', pct: mem?.percent || 0, color: ramColor },
                  { label: 'Disk', pct: disk?.percent || 0, color: '#34d399' },
                ].map(({ label, pct, color }) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 5 }}>
                      <span style={{ color, fontWeight: 600 }}>{label}</span>
                      <span style={{ color: 'var(--text)', fontWeight: 700 }}>{pct.toFixed(1)}%</span>
                    </div>
                    <MiniBar pct={pct} color={color} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            <StatCard icon={Timer} label={t('Açılma Süresi')} color="#fb923c"
              value={stats?.uptime ? fmtUptime(Date.now() / 1000 - stats.uptime) : '-'}
              sub={stats?.hostname} />
            <StatCard icon={MemoryStick} label={t('Bellek')} color="#a78bfa"
              value={sys?.memory ? `${sys.memory.used_mb} MB` : mem ? fmtBytes(mem.used) : '-'}
              sub={mem ? `/ ${fmtBytes(mem.total)}` : ''}
              pct={mem?.percent} />
            <StatCard icon={HardDrive} label="Disk" color="#34d399"
              value={disk ? fmtBytes(disk.used) : '-'}
              sub={disk ? `/ ${fmtBytes(disk.total)}` : ''}
              pct={disk?.percent} />
            <StatCard icon={Gauge} label={t('Sistem Yükü')} color="#22d3ee"
              value={sys ? `${sys.load[0]}` : '-'}
              sub={sys ? `${sys.load[1]} / ${sys.load[2]}` : '1m / 5m / 15m'} />
          </div>

          {/* Footer */}
          <div className="card" style={{ padding: '10px 18px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats?.os} · {stats?.hostname}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('Son:')} {new Date().toLocaleTimeString('tr-TR')}</span>
          </div>
        </>
      )}
    </div>
  )
}
