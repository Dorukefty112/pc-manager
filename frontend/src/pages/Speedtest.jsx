import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Gauge, ArrowDown, ArrowUp, Activity, Timer, Server, Wifi, RefreshCw, MapPin } from 'lucide-react'

export default function Speedtest() {
  const [status, setStatus] = useState({ status: 'idle', results: null, error: null, progress: '' })
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState([])
  const [liveSpeed, setLiveSpeed] = useState(null)
  const [livePhase, setLivePhase] = useState('')
  const pollRef = useRef(null)

  const start = async () => {
    try {
      await api('/api/speedtest/start', { method: 'POST' })
      setRunning(true)
      setLiveSpeed(null)
      setLivePhase('')
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
        if (lv && lv.phase) {
          if (lv.phase === 'hazirlik') {
            setLivePhase('Hazirlaniyor...')
          } else if (lv.phase === 'indirme') {
            setLivePhase('Indiriliyor...')
            setLiveSpeed(lv.download > 0 ? { type: 'download', value: lv.download } : null)
          } else if (lv.phase === 'yukleme') {
            setLivePhase('Yukleniyor...')
            setLiveSpeed(lv.upload > 0 ? { type: 'upload', value: lv.upload } : null)
          }
        }
        if (s.status === 'done' || s.status === 'error') {
          clearInterval(pollRef.current)
          setRunning(false)
          const h = await api('/api/speedtest/history')
          setHistory(h.history || [])
        }
      } catch {}
    }, 300)
    return () => clearInterval(pollRef.current)
  }, [running])

  const r = status.results
  const isRunning = status.status === 'running'

  const formatSpeed = (mbps) => {
    if (!mbps || mbps === 0) return '0 Mbps'
    if (mbps > 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
    return `${mbps.toFixed(0)} Mbps`
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="card p-8 text-center">
        <div className="mb-6">
          <Gauge size={48} className="mx-auto mb-2" style={{color: 'var(--accent)'}} />
          <h2 className="text-xl font-semibold" style={{color: 'var(--text)'}}>Hiz Testi</h2>
          <p className="text-sm" style={{color: 'var(--text-muted)'}}>Internet baglanti hizini olc</p>
        </div>

        {isRunning && (
          <div className="flex flex-col items-center gap-4 mb-6">
            <Activity size={32} className="animate-spin" style={{color: 'var(--accent)'}} />
            {liveSpeed ? (
              <div className="grid grid-cols-1 gap-4 w-full max-w-md">
                <div className="text-center">
                  <div className="text-xs mb-1" style={{color: 'var(--text-muted)'}}>
                    {livePhase}
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    {liveSpeed.type === 'download' ? (
                      <ArrowDown size={24} style={{color: '#22d3ee'}} />
                    ) : (
                      <ArrowUp size={24} style={{color: '#a78bfa'}} />
                    )}
                    <span className="text-4xl font-bold tabular-nums" style={{color: 'var(--text)'}}>
                      {formatSpeed(liveSpeed.value)}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full mt-3 overflow-hidden" style={{background: 'var(--border)'}}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min((liveSpeed.value || 0) / 10, 100)}%`,
                        background: liveSpeed.type === 'download'
                          ? 'linear-gradient(90deg, #22d3ee, #06b6d4)'
                          : 'linear-gradient(90deg, #a78bfa, #7c3aed)'
                      }} />
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-sm" style={{color: 'var(--text-secondary)'}}>
                {status.progress || livePhase || 'Test devam ediyor...'}
              </span>
            )}
          </div>
        )}

        {!isRunning && !r && (
          <button onClick={start} disabled={running}
            className="btn-primary text-base px-8 py-3 rounded-xl transition-all hover:scale-105"
            style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
            <Activity size={20} /> Testi Baslat
          </button>
        )}

        {status.error && (
          <div className="mt-4 p-4 rounded-xl text-sm" style={{background: 'rgba(239,68,68,0.1)', color: '#ef4444'}}>
            {status.error}
          </div>
        )}
      </div>

      {r && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-6 text-center">
              <ArrowDown size={28} className="mx-auto mb-2" style={{color: '#22d3ee'}} />
              <div className="text-xs font-medium mb-1" style={{color: 'var(--text-muted)'}}>Indirme</div>
              <div className="text-3xl font-bold mb-1" style={{color: 'var(--text)'}}>{formatSpeed(r.download)}</div>
              <div className="text-xs" style={{color: 'var(--text-secondary)'}}>
                {(r.download_bytes / 1_000_000).toFixed(0)} MB alindi
              </div>
              <div className="w-full h-2 rounded-full mt-3 overflow-hidden" style={{background: 'var(--border)'}}>
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{width: `${Math.min((r.download || 0) / 10, 100)}%`, background: 'linear-gradient(90deg, #22d3ee, #06b6d4)'}} />
              </div>
            </div>

            <div className="card p-6 text-center">
              <ArrowUp size={28} className="mx-auto mb-2" style={{color: '#a78bfa'}} />
              <div className="text-xs font-medium mb-1" style={{color: 'var(--text-muted)'}}>Yukleme</div>
              <div className="text-3xl font-bold mb-1" style={{color: 'var(--text)'}}>{formatSpeed(r.upload)}</div>
              <div className="text-xs" style={{color: 'var(--text-secondary)'}}>
                {(r.upload_bytes / 1_000_000).toFixed(0)} MB gonderildi
              </div>
              <div className="w-full h-2 rounded-full mt-3 overflow-hidden" style={{background: 'var(--border)'}}>
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{width: `${Math.min((r.upload || 0) / 10, 100)}%`, background: 'linear-gradient(90deg, #a78bfa, #7c3aed)'}} />
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Timer size={14} style={{color: 'var(--text-muted)'}} />
                  <span className="text-xs" style={{color: 'var(--text-muted)'}}>Ping</span>
                </div>
                <div className="text-lg font-semibold" style={{color: 'var(--text)'}}>{r.ping} ms</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Server size={14} style={{color: 'var(--text-muted)'}} />
                  <span className="text-xs" style={{color: 'var(--text-muted)'}}>Sunucu</span>
                </div>
                <div className="text-lg font-semibold truncate" style={{color: 'var(--text)'}} title={r.server_host}>{r.server_name}</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <MapPin size={14} style={{color: 'var(--text-muted)'}} />
                  <span className="text-xs" style={{color: 'var(--text-muted)'}}>Konum</span>
                </div>
                <div className="text-lg font-semibold truncate" style={{color: 'var(--text)'}}>{r.server_location}</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Wifi size={14} style={{color: 'var(--text-muted)'}} />
                  <span className="text-xs" style={{color: 'var(--text-muted)'}}>ISP</span>
                </div>
                <div className="text-lg font-semibold truncate" style={{color: 'var(--text)'}}>{r.isp || '-'}</div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button onClick={start} disabled={running}
              className="btn-primary px-6 py-2 rounded-xl text-sm transition-all hover:scale-105"
              style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
              <RefreshCw size={16} /> Tekrar Test Et
            </button>
          </div>
        </>
      )}
    </div>
  )
}
