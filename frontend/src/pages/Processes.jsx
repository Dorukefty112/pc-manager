import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Cpu, Search, XCircle, Skull, RefreshCw } from 'lucide-react'

export default function Processes() {
  const { t } = useI18n()
  const [procs, setProcs] = useState([])
  const [sort, setSort] = useState('cpu')
  const [search, setSearch] = useState('')

  const fetchProcs = async () => {
    try { setProcs(await api(`/api/processes?sort=${sort}&limit=80&search=${encodeURIComponent(search)}`)) } catch {}
  }

  useEffect(() => {
    fetchProcs()
    const id = setInterval(fetchProcs, 5000)
    return () => clearInterval(id)
  }, [sort, search])

  const kill = async (pid, force = false) => {
    if (!confirm(t(`${force ? 'SIGKILL' : 'SIGTERM'} ile process ${pid} sonlandırılsın mı?`))) return
    try {
      await api(`/api/processes/kill?pid=${pid}&force=${force}`, { method: 'POST' })
      setProcs(prev => prev.filter(p => p.pid !== pid))
    } catch (e) { alert(e.message) }
  }

  const formatMem = (bytes) => {
    if (!bytes) return '0 MB'
    const mb = bytes / 1024 / 1024
    return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
  }

  const cpuColor = (pct) => pct > 50 ? '#ef4444' : pct > 20 ? '#f59e0b' : 'var(--text)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Cpu size={18} color="var(--accent)" /></span>
          {t("Process'ler")}
        </h2>
        <button onClick={fetchProcs} className="btn btn-secondary">
          <RefreshCw size={14} /> {t('Yenile')}
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 180, maxWidth: 340 }}>
          <Search size={14} className="search-icon" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Process ara...')} />
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {['cpu','memory'].map(s => (
            <button key={s} onClick={() => setSort(s)} style={{
              padding: '5px 14px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.15s ease',
              background: sort === s ? 'var(--accent)' : 'transparent',
              color: sort === s ? '#fff' : 'var(--text-muted)',
              boxShadow: sort === s ? '0 0 12px rgba(6,182,212,0.3)' : 'none',
            }}>
              {s === 'cpu' ? 'CPU' : 'RAM'}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>PID</th>
                <th>{t('İsim')}</th>
                <th style={{ textAlign: 'right' }}>CPU%</th>
                <th style={{ textAlign: 'right' }}>RAM%</th>
                <th style={{ textAlign: 'right' }}>RAM</th>
                <th>{t('Durum')}</th>
                <th style={{ textAlign: 'right' }}>{t('İşlem')}</th>
              </tr>
            </thead>
            <tbody>
              {procs.map(p => (
                <tr key={p.pid}>
                  <td className="mono">{p.pid}</td>
                  <td className="primary" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name || '?'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: cpuColor(p.cpu_percent || 0), fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem' }}>
                      {(p.cpu_percent || 0).toFixed(1)}
                    </span>
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {(p.memory_percent || 0).toFixed(1)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                    {formatMem(p.memory_info?.rss)}
                  </td>
                  <td>
                    <span className={`badge ${p.status === 'running' ? 'badge-green' : 'badge-gray'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => kill(p.pid, false)} className="btn-icon warning" title="SIGTERM">
                        <XCircle size={14} />
                      </button>
                      <button onClick={() => kill(p.pid, true)} className="btn-icon danger" title="SIGKILL">
                        <Skull size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {procs.length === 0 && <div className="table-empty">{t('Process bulunamadı')}</div>}
      </div>
    </div>
  )
}
