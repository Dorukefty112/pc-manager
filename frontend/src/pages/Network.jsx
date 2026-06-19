import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Wifi, ArrowDown, ArrowUp, Activity } from 'lucide-react'

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
    const ctx = canvas.getContext('2d')
    const w = canvas.width = canvas.offsetWidth * 2
    const h = canvas.height = 80 * 2
    ctx.clearRect(0, 0, w, h)
    const data = historyRef.current
    const maxSpeed = Math.max(1, ...data.map(d => d.down), ...data.map(d => d.up))
    const step = (w - 8) / Math.max(data.length - 1, 1)

    const draw = (key, color) => {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      data.forEach((p, i) => {
        const x = 4 + i * step
        const y = h - 4 - (p[key] / maxSpeed) * (h - 8)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    draw('down', '#22d3ee')
    draw('up', '#a78bfa')
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
    <div>
      <h2 className="text-xl sm:text-2xl font-semibold mb-6">{t("Ağ Bilgileri")}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-2 text-cyan-400 mb-2"><ArrowDown size={16} /> {t("İndirme")}</div>
          <div className="text-2xl font-bold text-white">{fmt(stats?.speed_down_bps)}</div>
          <div className="text-xs text-gray-500 mt-1">{t("Toplam:")} {fmtBytes(stats?.bytes_recv)}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-2 text-violet-400 mb-2"><ArrowUp size={16} /> {t("Yükleme")}</div>
          <div className="text-2xl font-bold text-white">{fmt(stats?.speed_up_bps)}</div>
          <div className="text-xs text-gray-500 mt-1">{t("Toplam:")} {fmtBytes(stats?.bytes_sent)}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-2 text-emerald-400 mb-2"><Activity size={16} /> {t("Paketler")}</div>
          <div className="text-2xl font-bold text-white">{stats?.packets_recv || 0}</div>
          <div className="text-xs text-gray-500 mt-1">{t("Gönderilen:")} {stats?.packets_sent || 0}</div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <div className="text-sm font-medium text-gray-300 mb-3">{t("Bant Genişliği (60sn)")}</div>
        <canvas ref={canvasRef} className="w-full h-20" />
        <div className="flex gap-4 mt-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" /> {t("İndirme")}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" /> {t("Yükleme")}</span>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="font-medium mb-4 flex items-center gap-2"><Wifi size={16} /> {t("Ağ Arayüzleri")}</h3>
        <div className="space-y-3">
          {interfaces.map(iface => (
            <div key={iface.name} className="bg-gray-800 rounded-lg p-4">
              <div className="font-mono text-sm text-cyan-400 mb-2">{iface.name}</div>
              <div className="space-y-1">
                {iface.addresses.map((addr, i) => (
                  <div key={i} className="text-xs text-gray-400 font-mono">
                    {addr.family === '2' ? 'IPv4' : addr.family === '10' ? 'IPv6' : addr.family}: {addr.address}
                    {addr.netmask ? ` / ${addr.netmask}` : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
