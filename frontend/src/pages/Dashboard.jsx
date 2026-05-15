import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useWebSocket } from '../useWebSocket'
import { Cpu, MemoryStick, Activity, RefreshCw, Wifi, WifiOff } from 'lucide-react'

export default function Dashboard() {
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

  if (!stats) return <div className="text-center text-gray-500 mt-20">Yükleniyor...</div>

  const cards = [
    { icon: Cpu, label: 'CPU', value: `${mergedStats.cpu.percent}%`, detail: `${stats.cpu.count} çekirdek`, color: 'from-cyan-500/20 to-cyan-600/5', border: 'border-cyan-900/50' },
    { icon: MemoryStick, label: 'RAM', value: `${mergedStats.memory.percent}%`, detail: `${(stats.memory.used / 1e9).toFixed(1)}/${(stats.memory.total / 1e9).toFixed(1)} GB`, color: 'from-violet-500/20 to-violet-600/5', border: 'border-violet-900/50' },
    { icon: Activity, label: 'Disk', value: `${stats.disk.percent.toFixed(1)}%`, detail: `${(stats.disk.used / 1e9).toFixed(1)}/${(stats.disk.total / 1e9).toFixed(1)} GB`, color: 'from-emerald-500/20 to-emerald-600/5', border: 'border-emerald-900/50' },
    { icon: RefreshCw, label: 'Açık Kalma', value: uptimeStr, detail: stats.hostname, color: 'from-orange-500/20 to-orange-600/5', border: 'border-orange-900/50' },
  ]

  const Bar = ({ pct, color }) => (
    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mt-2">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold">Sistem Durumu</h2>
          {wsConnected && (
            <span className="flex items-center gap-1 text-[10px] text-green-500 bg-green-900/20 px-1.5 py-0.5 rounded-full">
              <Wifi size={10} /> Canlı
            </span>
          )}
          {!wsConnected && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">
              <WifiOff size={10} /> Bağlanıyor...
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-cyan-500" />
          Otomatik yenile
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className={`bg-gradient-to-br ${c.color} ${c.border} rounded-xl border p-5`}>
            <div className="flex items-center gap-3 mb-2">
              <c.icon size={20} className="text-cyan-400" />
              <span className="text-sm text-gray-400">{c.label}</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{c.value}</div>
            <div className="text-xs text-gray-500">{c.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-300">CPU - RAM Geçmişi (60s)</span>
            <span className="flex gap-4 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" /> CPU</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" /> RAM</span>
            </span>
          </div>
          <canvas ref={canvasRef} className="w-full h-20" />
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-sm font-medium text-gray-300 mb-4">Canlı Kullanım</div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm"><span className="text-cyan-400">CPU</span><span>{mergedStats.cpu.percent}%</span></div>
              <Bar pct={mergedStats.cpu.percent} color="bg-cyan-500" />
            </div>
            <div>
              <div className="flex justify-between text-sm"><span className="text-violet-400">RAM</span><span>{mergedStats.memory.percent}%</span></div>
              <Bar pct={mergedStats.memory.percent} color="bg-violet-500" />
            </div>
            <div>
              <div className="flex justify-between text-sm"><span className="text-emerald-400">Disk</span><span>{stats.disk.percent.toFixed(1)}%</span></div>
              <Bar pct={stats.disk.percent} color="bg-emerald-500" />
            </div>
          </div>
        </div>
      </div>

      {stats.temp?.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="font-medium mb-4">Sıcaklıklar</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.temp.map((t, i) => (
              <div key={i} className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-400">{t.label}</div>
                <div className="text-lg font-semibold">{t.current}°C</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">{stats.os}</span>
          <span className="text-xs text-gray-600">Son güncelleme: {new Date().toLocaleTimeString('tr-TR')}</span>
        </div>
      </div>
    </div>
  )
}
