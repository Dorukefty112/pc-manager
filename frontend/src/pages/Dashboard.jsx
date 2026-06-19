import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useWebSocket } from '../useWebSocket'
import { useI18n } from '../context/I18nContext'
import { Cpu, MemoryStick, Activity, RefreshCw, Wifi, WifiOff, Gauge, Timer } from 'lucide-react'

export default function Dashboard() {
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState({ cpu: [], memory: [] })
  const [wsData, setWsData] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const canvasRef = useRef(null)

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const token = localStorage.getItem('pcmanager_token') || ''
  const wsUrl = `${protocol}//${host}/api/system/ws?token=${encodeURIComponent(token)}`
  useWebSocket(wsUrl, {
    onMessage: (e) => {
      try {
        const data = JSON.parse(e.data)
        setWsData(data)
      } catch {}
    },
    onOpen: () => setWsConnected(true),
    onClose: () => setWsConnected(false),
  })

  const fetchAll = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        api('/api/system/stats'),
        api('/api/system/stats/history'),
      ]);
      setStats(s);
      setHistory(h);
    } catch {}
  }, [])

  useEffect(() => {
    fetchAll()
    if (autoRefresh) {
      const id = setInterval(fetchAll, 5000)
      return () => clearInterval(id)
    }
  }, [fetchAll, autoRefresh])

  const mergedStats = wsData ? {
    ...stats,
    cpu: { ...stats?.cpu, percent: wsData.cpu },
    memory: { ...stats?.memory, percent: wsData.memory },
    disk: stats?.disk || {},
  } : stats

  useEffect(() => {
    if (!wsData) return
    setHistory(prev => {
      const now = Date.now() / 1000
      const cpu = [...prev.cpu.slice(-59), { time: now, value: wsData.cpu }]
      const memory = [...prev.memory.slice(-59), { time: now, value: wsData.memory }]
      return { cpu, memory }
    })
  }, [wsData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !history.cpu.length) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width = canvas.offsetWidth * 2
    const h = canvas.height = 80 * 2
    ctx.scale(1, 1)

    ctx.clearRect(0, 0, w, h)
    const pad = 4
    const cw = w - pad * 2
    const ch = h - pad * 2

    const drawLine = (data, color) => {
      if (data.length < 2) return
      const fillColor = color + '30'
      ctx.beginPath()
      ctx.moveTo(pad, pad + ch)
      const step = cw / (Math.max(data.length - 1, 1))
      data.forEach((p, i) => {
        const x = pad + i * step
        const y = pad + ch - (p.value / 100) * ch
        ctx.lineTo(x, y)
      })
      ctx.lineTo(pad + (data.length - 1) * step, pad + ch)
      ctx.closePath()
      ctx.fillStyle = fillColor
      ctx.fill()

      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      data.forEach((p, i) => {
        const x = pad + i * step
        const y = pad + ch - (p.value / 100) * ch
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    drawLine(history.cpu, '#22d3ee')
    drawLine(history.memory, '#a78bfa')
  }, [history])

  const uptime = stats?.uptime ? Math.floor((Date.now() / 1000 - stats.uptime) / 60) : 0
  const uptimeStr = uptime > 1440 ? `${Math.floor(uptime / 1440)}g ${Math.floor((uptime % 1440) / 60)}s` : `${Math.floor(uptime / 60)}s ${uptime % 60}d`

  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3" style={{color: 'var(--text-muted)'}}>
        <Activity size={32} className="animate-pulse" style={{color: 'var(--accent)'}} />
        <span className="text-sm">{t("Yükleniyor...")}</span>
      </div>
    </div>
  )

  const cards = [
    { icon: Cpu, label: 'CPU', value: `${mergedStats.cpu.percent}%`, detail: `${stats.cpu.count} ${t("çekirdek")}`, color: '--accent' },
    { icon: MemoryStick, label: 'RAM', value: `${mergedStats.memory.percent}%`, detail: `${(stats.memory.used / 1e9).toFixed(1)}/${(stats.memory.total / 1e9).toFixed(1)} GB`, color: '#a78bfa' },
    { icon: Gauge, label: 'Disk', value: `${stats.disk.percent.toFixed(1)}%`, detail: `${(stats.disk.used / 1e9).toFixed(1)}/${(stats.disk.total / 1e9).toFixed(1)} GB`, color: '#34d399' },
    { icon: Timer, label: t('Açık Kalma'), value: uptimeStr, detail: stats.hostname, color: '#fb923c' },
  ]

  const Bar = ({ pct, color }) => (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{background: 'var(--border)'}}>
      <div className="h-full rounded-full transition-all duration-700" style={{width: `${Math.min(pct, 100)}%`, background: color}} />
    </div>
  )

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 style={{color: 'var(--text)'}} className="text-xl font-semibold tracking-tight">{t("Sistem Durumu")}</h2>
          <span className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full ${wsConnected ? 'text-green-500' : ''}`}
            style={{
              background: wsConnected ? 'rgba(34,197,94,0.1)' : 'var(--bg-surface)',
              color: wsConnected ? '#22c55e' : 'var(--text-muted)',
              border: wsConnected ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)',
            }}>
            <span className={`glow-dot ${wsConnected ? 'green' : ''}`} style={!wsConnected ? {background: 'var(--text-muted)'} : {}} />
            {wsConnected ? t("Canlı") : t("Bağlanıyor...")}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{color: 'var(--text-secondary)'}}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
            className="w-3.5 h-3.5 rounded" style={{accentColor: 'var(--accent)'}} />
          {t("Otomatik yenile")}
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={c.label} className="card p-5 animate-scale-in"
            style={{animationDelay: `${i * 70}ms`, animationFillMode: 'both'}}>
            <div className="flex items-center gap-3 mb-2">
              <c.icon size={18} style={{color: c.color}} />
              <span className="text-xs font-medium" style={{color: 'var(--text-secondary)'}}>{c.label}</span>
            </div>
            <div className="stat-value mb-1">{c.value}</div>
            <div className="text-xs" style={{color: 'var(--text-muted)'}}>{c.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{color: 'var(--text-secondary)'}}>{t("CPU - RAM Geçmişi (60s)")}</span>
            <span className="flex gap-4 text-xs" style={{color: 'var(--text-muted)'}}>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background: '#22d3ee'}} /> CPU</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background: '#a78bfa'}} /> RAM</span>
            </span>
          </div>
          <canvas ref={canvasRef} className="w-full h-20" />
        </div>

        <div className="card p-5">
          <div className="text-sm font-medium mb-4" style={{color: 'var(--text-secondary)'}}>{t("Canlı Kullanım")}</div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span style={{color: 'var(--accent)'}}>CPU</span>
                <span style={{color: 'var(--text)'}}>{mergedStats.cpu.percent}%</span>
              </div>
              <Bar pct={mergedStats.cpu.percent} color="var(--accent)" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span style={{color: '#a78bfa'}}>RAM</span>
                <span style={{color: 'var(--text)'}}>{mergedStats.memory.percent}%</span>
              </div>
              <Bar pct={mergedStats.memory.percent} color="#a78bfa" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span style={{color: '#34d399'}}>Disk</span>
                <span style={{color: 'var(--text)'}}>{stats.disk.percent.toFixed(1)}%</span>
              </div>
              <Bar pct={stats.disk.percent} color="#34d399" />
            </div>
          </div>
        </div>
      </div>

      {stats.temp?.length > 0 && (
        <div className="card p-5 animate-fade-in">
          <h3 className="text-sm font-medium mb-4" style={{color: 'var(--text-secondary)'}}>{t("Sıcaklıklar")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.temp.map((t, i) => (
              <div key={i} className="rounded-lg px-3 py-2" style={{background: 'var(--bg-surface)'}}>
                <div className="text-xs" style={{color: 'var(--text-muted)'}}>{t.label}</div>
                <div className="text-lg font-semibold" style={{color: 'var(--text)'}}>{t.current}°C</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{color: 'var(--text-muted)'}}>{stats.os}</span>
          <span className="text-xs" style={{color: 'var(--text-muted)'}}>{t("Son güncelleme:")} {new Date().toLocaleTimeString('tr-TR')}</span>
        </div>
      </div>
    </div>
  )
}
