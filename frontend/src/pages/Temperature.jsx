import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useWebSocket } from '../useWebSocket'
import { useI18n } from '../context/I18nContext'
import { Thermometer, Cpu, Monitor, Activity, Gauge, Timer, HardDrive, MemoryStick, RefreshCw } from 'lucide-react'

function fmtUptime(s) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}g ${h}s`
  if (h > 0) return `${h}s ${m}d`
  return `${m}d`
}

function fmtBytes(b) {
  if (!b) return '0 GB'
  const gb = b / 1e9
  return gb > 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${gb.toFixed(1)} GB`
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
  useWebSocket(wsUrl, {
    onMessage: (e) => {
      try {
        setWsData(JSON.parse(e.data))
      } catch {}
    },
  })

  const fetchAll = useCallback(async () => {
    try {
      const [s, t, h] = await Promise.all([
        api('/api/system/stats'),
        api('/api/temperature'),
        api('/api/system/stats/history'),
      ])
      setStats(s)
      setTempData(t)
      setHistory(h)
    } catch {}
  }, [])

  useEffect(() => { fetchAll(); const id = setInterval(fetchAll, 7000); return () => clearInterval(id) }, [fetchAll])

  const mergedStats = wsData ? {
    ...stats,
    cpu: { ...stats?.cpu, percent: wsData.cpu },
    memory: { ...stats?.memory, percent: wsData.memory },
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
    ctx.clearRect(0, 0, w, h)
    const pad = 4
    const cw = w - pad * 2
    const ch = h - pad * 2

    const drawLine = (data, color) => {
      if (data.length < 2) return
      ctx.beginPath()
      ctx.moveTo(pad, pad + ch)
      const step = cw / (Math.max(data.length - 1, 1))
      data.forEach((p, i) => { ctx.lineTo(pad + i * step, pad + ch - (p.value / 100) * ch) })
      ctx.lineTo(pad + (data.length - 1) * step, pad + ch)
      ctx.closePath()
      ctx.fillStyle = color + '30'
      ctx.fill()
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      data.forEach((p, i) => { i === 0 ? ctx.moveTo(pad + i * step, pad + ch - (p.value / 100) * ch) : ctx.lineTo(pad + i * step, pad + ch - (p.value / 100) * ch) })
      ctx.stroke()
    }
    drawLine(history.cpu, '#22d3ee')
    drawLine(history.memory, '#a78bfa')
  }, [history])

  const cpu = mergedStats?.cpu
  const mem = mergedStats?.memory
  const disk = stats?.disk
  const gpu = tempData?.gpu
  const cpuWin = tempData?.cpu
  const sys = tempData?.system

  const Bar = ({ pct, color }) => (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )

  const TempBadge = ({ value, warn }) => (
    <span className="text-xs px-2 py-0.5 rounded-full font-mono shrink-0" style={{
      background: value > warn ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)',
      color: value > warn ? '#ef4444' : '#22c55e',
      border: `1px solid ${value > warn ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
    }}>
      {value}
    </span>
  )

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={24} style={{ color: 'var(--accent)' }} />
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{t("Sistem Durumu")}</h2>
        </div>
        <button onClick={fetchAll} className="btn-ghost p-2 rounded-lg" style={{ color: 'var(--text-muted)' }} title={t("Yenile")}>
          <RefreshCw size={16} />
        </button>
      </div>

      {!stats ? (
        <div className="flex items-center justify-center h-64">
          <Activity size={32} className="animate-pulse" style={{ color: 'var(--accent)' }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <Monitor size={20} style={{ color: '#22d3ee' }} />
                <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>GPU</span>
                {gpu && <TempBadge value={`${gpu.temp_c}°C`} warn={75} />}
              </div>
              {gpu ? (
                <>
                  <div className="text-xs mb-3 truncate flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate">{gpu.name}</span>
                    <span className="text-[11px] shrink-0">{gpu.power_w}W</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t("Kullanim")}</div>
                      <div className="flex items-center gap-2">
                        <Activity size={14} style={{ color: gpu.util_pct > 80 ? '#ef4444' : '#a78bfa' }} />
                        <span className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{gpu.util_pct}%</span>
                      </div>
                      <Bar pct={gpu.util_pct} color={gpu.util_pct > 80 ? '#ef4444' : '#22d3ee'} />
                    </div>
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t("Guc")}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{gpu.power_w}W</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t("Veri alinamadi")}</div>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <Cpu size={20} style={{ color: '#a78bfa' }} />
                <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>CPU</span>
                {cpu && <TempBadge value={`${Math.round(cpu.percent)}%`} warn={80} />}
              </div>
              {cpu && (
                <>
                  <div className="text-xs mb-3 truncate flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate">{cpuWin?.model || 'AMD Ryzen'}</span>
                    <span className="text-[11px] shrink-0">
                      {cpuWin?.freq_mhz > 1000 ? `${(cpuWin.freq_mhz / 1000).toFixed(1)} GHz` : `${cpuWin?.freq_mhz || ''} MHz`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t("Kullanim")}</div>
                      <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{Math.round(cpu.percent)}%</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t("Cekirdek")}</div>
                      <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{cpuWin?.cores || cpu?.count}/{cpuWin?.threads || cpu?.count}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t("Frekans")}</div>
                      <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                        {cpu.freq?.current > 0 ? `${(cpu.freq.current / 1000).toFixed(1)} GHz` : '-'}
                      </div>
                    </div>
                  </div>
                  <Bar pct={cpu.percent} color={cpu.percent > 80 ? '#ef4444' : '#a78bfa'} />
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{t("CPU - RAM Geçmişi (60s)")}</span>
                <span className="flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#22d3ee' }} /> CPU</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#a78bfa' }} /> RAM</span>
                </span>
              </div>
              <canvas ref={canvasRef} className="w-full h-20" />
            </div>

            <div className="card p-5">
              <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>{t("Canli Kullanim")}</div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: 'var(--accent)' }}>CPU</span>
                    <span style={{ color: 'var(--text)' }}>{cpu ? `${Math.round(cpu.percent)}%` : '-'}</span>
                  </div>
                  <Bar pct={cpu?.percent || 0} color="var(--accent)" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: '#a78bfa' }}>RAM</span>
                    <span style={{ color: 'var(--text)' }}>{mem ? `${mem.percent}%` : '-'}</span>
                  </div>
                  <Bar pct={mem?.percent || 0} color="#a78bfa" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: '#34d399' }}>Disk</span>
                    <span style={{ color: 'var(--text)' }}>{disk ? `${disk.percent.toFixed(1)}%` : '-'}</span>
                  </div>
                  <Bar pct={disk?.percent || 0} color="#34d399" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="card p-4 flex items-center gap-3">
              <Timer size={18} style={{ color: '#fb923c' }} />
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t("Acilma Suresi")}</div>
                <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                  {stats?.uptime ? fmtUptime(Date.now() / 1000 - stats.uptime) : '-'}
                </div>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <MemoryStick size={18} style={{ color: '#a78bfa' }} />
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t("Bellek")}</div>
                <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                  {sys?.memory ? `${sys.memory.used_mb}/${sys.memory.total_mb} MB` : mem ? `${fmtBytes(mem.used)}/${fmtBytes(mem.total)}` : '-'}
                </div>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <HardDrive size={18} style={{ color: '#34d399' }} />
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Disk</div>
                <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                  {disk ? `${fmtBytes(disk.used)} / ${fmtBytes(disk.total)}` : '-'}
                </div>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <Gauge size={18} style={{ color: '#22d3ee' }} />
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t("Sistem Yuklemesi")}</div>
                <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                  {sys ? `${sys.load[0]}/${sys.load[1]}/${sys.load[2]}` : '-'}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{stats?.os} · {stats?.hostname}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t("Son:")} {new Date().toLocaleTimeString('tr-TR')}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
