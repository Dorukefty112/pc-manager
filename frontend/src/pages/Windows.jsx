import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Monitor, Cpu, HardDrive, Wifi, Info, Terminal, ScrollText, Server, Activity, RefreshCw, Play, Square } from 'lucide-react'

export default function Windows() {
  const { t } = useI18n()
  const TABS = [
    { id: 'services', label: t('Servisler'), icon: Server },
    { id: 'processes', label: t('Processler'), icon: Cpu },
    { id: 'disks', label: t('Diskler'), icon: HardDrive },
    { id: 'network', label: t('Ağ'), icon: Wifi },
    { id: 'system', label: t('Sistem'), icon: Info },
    { id: 'events', label: t('Event Log'), icon: ScrollText },
    { id: 'command', label: t('Komut'), icon: Terminal },
  ]
  const [tab, setTab] = useState('services')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [config, setConfig] = useState(null)
  const [cmdInput, setCmdInput] = useState('')
  const [cmdShell, setCmdShell] = useState('cmd')
  const [cmdOutput, setCmdOutput] = useState('')
  const [eventLog, setEventLog] = useState('System')
  const [eventCount, setEventCount] = useState(50)

  const fetchData = async (endpoint) => {
    setLoading(true)
    setError('')
    setData(null)
    try {
      const result = await api(`/api/windows/${endpoint}`)
      setData(result)
    } catch (e) {
      setError(e.message || t('Veri alınamadı'))
    }
    setLoading(false)
  }

  useEffect(() => {
    api('/api/windows/config').then(setConfig).catch(() => {})
  }, [])

  const handleTabChange = (t) => {
    setTab(t)
    if (t === 'events') {
      fetchData(`events/${eventLog}?count=${eventCount}`)
    } else if (t !== 'command') {
      fetchData(t)
    }
  }

  const runCommand = async () => {
    if (!cmdInput.trim()) return
    setLoading(true)
    setCmdOutput('')
    try {
      const r = await api('/api/windows/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmdInput, shell: cmdShell }),
      })
      setCmdOutput(r.stdout || r.stderr || t('(boş çıktı)'))
    } catch (e) {
      setCmdOutput(t('Hata: ') + e.message)
    }
    setLoading(false)
  }

  if (!config) return <div className="flex items-center justify-center h-64"><Activity size={24} className="animate-pulse" style={{color: 'var(--accent)'}} /></div>

  if (!config.wsl_available) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <HardDrive size={48} style={{color: 'var(--text-muted)'}} />
        <p style={{color: 'var(--text-secondary)'}} className="text-sm">{t('WSL algılanmadı — /mnt/c/Windows bulunamadı')}</p>
        <p style={{color: 'var(--text-muted)'}} className="text-xs">{t('Bu özellik yalnızca WSL üzerinde çalışır')}</p>
      </div>
    )
  }

  if (!config.enabled) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Monitor size={48} style={{color: 'var(--text-muted)'}} />
        <p style={{color: 'var(--text-secondary)'}} className="text-sm">{t('Windows entegrasyonu devre dışı')}</p>
        <p style={{color: 'var(--text-muted)'}} className="text-xs">{t('Ayarlar → Windows sekmesinden aktifleştirebilirsin')}</p>
      </div>
    )
  }

  const renderServices = () => {
    if (!data) return null
    const svcs = data.services || []
    return (
      <div className="space-y-1 max-h-[70vh] overflow-y-auto">
        {svcs.map((s, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm" style={{background: 'var(--bg-surface)'}}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${s.state === 'RUNNING' ? 'bg-green-500' : s.state === 'STOPPED' ? 'bg-red-500' : 'bg-yellow-500'}`} />
            <span className="font-medium truncate flex-1" style={{color: 'var(--text)'}}>{s.display || s.name}</span>
            <span className="text-xs" style={{color: 'var(--text-muted)'}}>{s.state}</span>
          </div>
        ))}
        {svcs.length === 0 && <p className="text-xs" style={{color: 'var(--text-muted)'}}>{t('Servis bulunamadı')}</p>}
      </div>
    )
  }

  const renderProcesses = () => {
    if (!data) return null
    const procs = data.processes || []
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{color: 'var(--text-muted)'}} className="text-xs uppercase tracking-wider">
              <th className="text-left py-2 px-2">{t('İsim')}</th>
              <th className="text-right py-2 px-2">PID</th>
              <th className="text-right py-2 px-2">{t('Bellek (KB)')}</th>
            </tr>
          </thead>
          <tbody>
            {procs.slice(0, 200).map((p, i) => (
              <tr key={i} style={{borderColor: 'var(--border)'}} className="border-t">
                <td className="py-1.5 px-2" style={{color: 'var(--text)'}}>{p.name}</td>
                <td className="py-1.5 px-2 text-right" style={{color: 'var(--text-secondary)'}}>{p.pid}</td>
                <td className="py-1.5 px-2 text-right font-mono text-xs" style={{color: 'var(--text-muted)'}}>{parseInt(p.mem_kb || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {procs.length === 0 && <p className="text-xs py-4" style={{color: 'var(--text-muted)'}}>{t('Process bulunamadı')}</p>}
      </div>
    )
  }

  const renderDisks = () => {
    if (!data) return null
    const disks = data.disks || []
    const fmt = (b) => b ? (b / 1e9).toFixed(1) + ' GB' : '0 GB'
    return (
      <div className="grid gap-3">
        {disks.map((d, i) => {
          const used = d.Used || 0
          const size = d.Size || 1
          const pct = size > 0 ? (used / size) * 100 : 0
          return (
            <div key={i} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium" style={{color: 'var(--text)'}}>{d.Root || d.Name}</span>
                  {d.VolumeName && <span className="text-xs ml-2" style={{color: 'var(--text-muted)'}}>{d.VolumeName}</span>}
                </div>
                <span className="text-xs font-mono" style={{color: 'var(--text-secondary)'}}>{fmt(used)} / {fmt(size)}</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{background: 'var(--border)'}}>
                <div className="h-full rounded-full transition-all" style={{width: `${Math.min(pct, 100)}%`, background: 'var(--accent)'}} />
              </div>
              <div className="text-xs mt-1 text-right" style={{color: 'var(--text-muted)'}}>{pct.toFixed(1)}% {t('dolu')}</div>
            </div>
          )
        })}
        {disks.length === 0 && <p className="text-xs" style={{color: 'var(--text-muted)'}}>{t('Disk bulunamadı')}</p>}
      </div>
    )
  }

  const renderNetwork = () => {
    if (!data) return null
    return (
      <pre className="text-xs leading-relaxed p-4 rounded-lg overflow-x-auto" style={{background: 'var(--bg-surface)', color: 'var(--text-secondary)'}}>
        {data.raw}
      </pre>
    )
  }

  const renderSystem = () => {
    if (!data?.system) return null
    const sys = data.system
    return (
      <div className="space-y-2">
        {Object.entries(sys).map(([k, v], i) => (
          <div key={i} className="flex gap-4 px-3 py-2 rounded-lg text-sm" style={{background: 'var(--bg-surface)'}}>
            <span className="font-medium min-w-[200px]" style={{color: 'var(--text-secondary)'}}>{k}</span>
            <span style={{color: 'var(--text)'}}>{v}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderEvents = () => {
    if (!data) return null
    const events = data.events || []
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-3">
          <select value={eventLog} onChange={e => setEventLog(e.target.value)}
            className="text-sm rounded-lg px-3 py-2"
            style={{background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text)'}}>
            <option value="System">System</option>
            <option value="Application">Application</option>
            <option value="Security">Security</option>
            <option value="Setup">Setup</option>
          </select>
          <input type="number" min={10} max={500} value={eventCount}
            onChange={e => setEventCount(parseInt(e.target.value) || 50)}
            className="w-20 text-sm rounded-lg px-3 py-2"
            style={{background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text)'}} />
          <button onClick={() => fetchData(`events/${eventLog}?count=${eventCount}`)}
            className="btn-ghost p-2 rounded-lg">
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="space-y-1 max-h-[65vh] overflow-y-auto">
          {events.map((e, i) => (
            <div key={i} className="px-3 py-2 rounded-lg text-xs" style={{background: 'var(--bg-surface)'}}>
              <div className="flex items-center gap-3 mb-1">
                <span className="font-mono" style={{color: 'var(--text-muted)'}}>#{e.Id}</span>
                <span style={{color: 'var(--text-secondary)'}}>{e.LevelDisplayName}</span>
                <span className="ml-auto font-mono" style={{color: 'var(--text-muted)'}}>{e.TimeCreated?.slice(0, 19)?.replace('T', ' ')}</span>
              </div>
              <p style={{color: 'var(--text)'}} className="line-clamp-2">{e.Message}</p>
            </div>
          ))}
          {events.length === 0 && <p className="text-xs" style={{color: 'var(--text-muted)'}}>{t('Olay bulunamadı')}</p>}
        </div>
      </div>
    )
  }

  const renderCommand = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={cmdShell} onChange={e => setCmdShell(e.target.value)}
          className="text-sm rounded-lg px-3 py-2"
          style={{background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text)'}}>
          <option value="cmd">CMD</option>
          <option value="powershell">PowerShell</option>
        </select>
        <input type="text" value={cmdInput}
          onChange={e => setCmdInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runCommand()}
          placeholder={t('Windows komutu girin...')}
          className="flex-1 text-sm rounded-lg px-3 py-2"
          style={{background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text)'}} />
        <button onClick={runCommand} disabled={loading || !cmdInput.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{background: 'var(--accent)', opacity: loading || !cmdInput.trim() ? 0.5 : 1, color: '#fff'}}>
          <Play size={14} /> {t('Çalıştır')}
        </button>
      </div>
      {cmdOutput && (
        <pre className="text-xs leading-relaxed p-4 rounded-lg overflow-auto max-h-[60vh]" style={{background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)'}}>
          {cmdOutput}
        </pre>
      )}
    </div>
  )

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center gap-3">
        <Monitor size={20} style={{color: 'var(--accent)'}} />
        <h2 style={{color: 'var(--text)'}} className="text-xl font-semibold tracking-tight">{t('Windows Yönetimi')}</h2>
        <span className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full"
          style={{background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'}}>
          <span className="glow-dot green" />
          {t('WSL Bağlı')}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" style={{borderBottom: '1px solid var(--border)'}}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm whitespace-nowrap transition-colors ${
              tab === t.id ? 'font-medium' : ''
            }`}
            style={{
              color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: tab === t.id ? 'var(--accent-glow)' : 'transparent',
            }}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin" style={{color: 'var(--accent)'}} />
        </div>
      )}

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm"
          style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444'}}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div>
          {tab === 'services' && renderServices()}
          {tab === 'processes' && renderProcesses()}
          {tab === 'disks' && renderDisks()}
          {tab === 'network' && renderNetwork()}
          {tab === 'system' && renderSystem()}
          {tab === 'events' && renderEvents()}
          {tab === 'command' && renderCommand()}
        </div>
      )}

      {data && tab !== 'command' && tab !== 'events' && (
        <div className="flex justify-between text-xs pt-2" style={{color: 'var(--text-muted)'}}>
          <span>{t('{n} kayıt').replace('{n}', data.count ?? data.services?.length ?? data.processes?.length ?? (data.disks?.length ?? 0))}</span>
          <button onClick={() => fetchData(tab)} className="flex items-center gap-1 hover:opacity-70">
            <RefreshCw size={12} /> {t('Yenile')}
          </button>
        </div>
      )}
    </div>
  )
}
