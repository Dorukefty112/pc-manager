import { useState, useEffect } from 'react'
import { api } from '../api'
import { Container, Play, Square, RotateCw, Trash2, Image, Terminal, RefreshCw, Layers, Activity, X } from 'lucide-react'
import { useI18n } from '../context/I18nContext'

export default function Docker() {
  const { t } = useI18n()
  const [containers, setContainers] = useState([])
  const [images, setImages] = useState([])
  const [info, setInfo] = useState(null)
  const [tab, setTab] = useState('containers')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState(null)
  const [logContainer, setLogContainer] = useState(null)
  const [stats, setStats] = useState(null)
  const [statsContainer, setStatsContainer] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectLogs, setProjectLogs] = useState(null)
  const [composeLoading, setComposeLoading] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [i, c, im] = await Promise.all([
        api('/api/docker/info'),
        api(`/api/docker/containers?all=${showAll}`),
        api('/api/docker/images'),
      ])
      setInfo(i); setContainers(c); setImages(im)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [showAll])

  const action = async (actionFn, id) => { await actionFn(id); fetchAll() }
  const viewLogs = async (id) => {
    try { const res = await api(`/api/docker/logs/${id}`); setLogContainer(id); setLogs(res.lines || []) } catch {}
  }
  const viewStats = async (id) => {
    try { const res = await api(`/api/docker/container/${id}/stats`); setStatsContainer(id); setStats(res) } catch {}
  }
  const fetchProjects = async () => {
    setComposeLoading(true)
    try { const res = await api('/api/docker/compose/projects'); setProjects(res || []) } catch {}
    setComposeLoading(false)
  }
  useEffect(() => { if (tab === 'compose') fetchProjects() }, [tab])
  const composeAction = async (path, actionFn) => { try { await actionFn(path); fetchProjects() } catch {} }
  const viewProjectLogs = async (path) => {
    try { const res = await api(`/api/docker/compose/logs?project_path=${encodeURIComponent(path)}&lines=50`); setProjectLogs({ path, lines: res.lines || [] }) } catch {}
  }

  const stateColor = (state) => {
    if (state === 'running') return '#22c55e'
    if (state === 'exited') return '#ef4444'
    if (state === 'paused') return '#f59e0b'
    return '#6b7280'
  }

  if (!info && loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, flexDirection: 'column', gap: 12 }}>
      <div className="spinner spinner-lg" />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('Yükleniyor...')}</span>
    </div>
  )

  if (info && !info.installed) return (
    <div className="empty-state">
      <Container size={40} color="var(--text-muted)" style={{ opacity: 0.4 }} />
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{t('Docker Kurulu Değil')}</span>
      <span style={{ fontSize: '0.8rem' }}>{t("Docker'ı kurmak için:")} <code style={{ color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>sudo pacman -S docker</code></span>
    </div>
  )

  const TABS = [
    { id: 'containers', label: t('Konteynerlar'), icon: Container },
    { id: 'images', label: t('İmajlar'), icon: Image },
    { id: 'compose', label: 'Compose', icon: Layers },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Container size={18} color="var(--accent)" /></span>
          Docker
          {info?.runtime && <span className="badge badge-cyan" style={{ marginLeft: 6 }}>{info.runtime}</span>}
        </h2>
        <button onClick={fetchAll} disabled={loading} className="btn btn-secondary">
          <RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} /> {t('Yenile')}
        </button>
      </div>

      {/* Stats */}
      {info && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          {[
            { label: t('Konteyner'), value: info.containers || 0, color: '#60a5fa' },
            { label: t('Aktif'), value: info.running || 0, color: '#22c55e' },
            { label: t('İmaj'), value: info.images || 0, color: '#a78bfa' },
            { label: t('Sürüm'), value: info.version || '?', color: 'var(--text-muted)' },
          ].map(s => (
            <div key={s.label} className="card card-glow" style={{ padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 11, padding: 3, width: 'fit-content' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
            cursor: 'pointer', border: 'none', transition: 'all 0.15s ease',
            background: tab === id ? 'var(--accent)' : 'transparent',
            color: tab === id ? '#fff' : 'var(--text-muted)',
            boxShadow: tab === id ? '0 0 12px rgba(6,182,212,0.3)' : 'none',
          }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Containers tab */}
      {tab === 'containers' && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
            {t('Tümünü göster (duranlar dahil)')}
          </label>

          <div className="table-wrap" style={{ overflow: 'hidden' }}>
            {containers.length === 0 ? (
              <div className="table-empty">{showAll ? t('Hiç konteyner yok') : t('Çalışan konteyner yok')}</div>
            ) : (
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                {containers.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 16px', borderBottom: '1px solid var(--border)',
                    transition: 'background 0.12s', gap: 12,
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: stateColor(c.state), flexShrink: 0, boxShadow: `0 0 6px ${stateColor(c.state)}` }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 8, marginTop: 2 }}>
                          <span>{c.image}</span>
                          {c.cpu_percent && <span style={{ color: '#22d3ee' }}>CPU: {c.cpu_percent}</span>}
                          {c.mem_percent && <span style={{ color: '#22c55e' }}>RAM: {c.mem_percent}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginRight: 4 }}>{c.status}</span>
                      {c.state === 'running' ? (
                        <>
                          <button onClick={() => action(id => api(`/api/docker/container/stop?container_id=${id}`, { method: 'POST' }), c.id)} className="btn-icon warning" title={t('Durdur')}><Square size={13} /></button>
                          <button onClick={() => action(id => api(`/api/docker/container/restart?container_id=${id}`, { method: 'POST' }), c.id)} className="btn-icon" title={t('Yeniden Başlat')}><RotateCw size={13} /></button>
                        </>
                      ) : (
                        <button onClick={() => action(id => api(`/api/docker/container/start?container_id=${id}`, { method: 'POST' }), c.id)} className="btn-icon success" title={t('Başlat')}><Play size={13} /></button>
                      )}
                      <button onClick={() => viewStats(c.id)} className="btn-icon" title={t('İstatistik')} style={{ color: '#a78bfa' }}><Activity size={13} /></button>
                      <button onClick={() => viewLogs(c.id)} className="btn-icon" title={t('Log')} style={{ color: '#60a5fa' }}><Terminal size={13} /></button>
                      <button onClick={() => { if (confirm(t('Silmek istediğine emin misin?'))) action(id => api(`/api/docker/container?container_id=${id}&force=true`, { method: 'DELETE' }), c.id) }} className="btn-icon danger" title={t('Sil')}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats panel */}
          {statsContainer && stats && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('İstatistik')} — <code style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--accent)' }}>{statsContainer.slice(0, 12)}</code></span>
                <button onClick={() => { setStats(null); setStatsContainer(null) }} className="btn-icon" style={{ width: 24, height: 24 }}><X size={12} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, padding: '14px 16px' }}>
                {[
                  { label: 'CPU', value: stats.cpu_percent || '0%', color: '#22d3ee' },
                  { label: 'RAM %', value: stats.mem_percent || '0%', color: '#22c55e' },
                  { label: 'RAM', value: stats.mem_usage || '-', color: 'var(--text)' },
                  { label: 'Net I/O', value: stats.net_io || '-', color: 'var(--text)' },
                  { label: 'Disk I/O', value: stats.block_io || '-', color: 'var(--text)' },
                  { label: 'PIDs', value: stats.pids || '-', color: 'var(--text)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: 'center', padding: '8px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontWeight: 700, color, fontSize: '0.9rem' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs panel */}
          {logContainer && logs && (
            <div style={{ background: '#020812', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{t('Loglar')} — {logContainer.slice(0, 12)}</span>
                <button onClick={() => { setLogs(null); setLogContainer(null) }} className="btn-icon" style={{ width: 24, height: 24 }}><X size={12} /></button>
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', padding: '8px 4px' }}>
                {logs.length === 0 ? <div className="empty-state" style={{ padding: 20 }}>{t('Log yok')}</div> : logs.map((line, i) => (
                  <div key={i} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: '#7a90b0', padding: '1px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Images tab */}
      {tab === 'images' && (
        <div className="table-wrap" style={{ overflow: 'hidden' }}>
          {images.length === 0 ? (
            <div className="table-empty">{t('Hiç imaj yok')}</div>
          ) : (
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {images.map(img => (
                <div key={img.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <Image size={15} color="#a78bfa" style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.repository}:{img.tag}</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.68rem', color: 'var(--text-muted)' }}>{img.id}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>{img.size}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compose tab */}
      {tab === 'compose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t('Projeler')}</span>
            <button onClick={fetchProjects} className="btn btn-secondary"><RefreshCw size={13} /></button>
          </div>

          {composeLoading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : projects.length === 0 ? (
            <div className="empty-state">{t('Hiç compose projesi bulunamadı')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projects.map(p => (
                <div key={p.path} className="card card-glow" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.path.split('/').pop() || p.path}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.file}</div>
                    </div>
                    <span className={`badge ${p.status === 'running' ? 'badge-green' : p.status === 'stopped' ? 'badge-red' : 'badge-gray'}`}>
                      <span className={`dot ${p.status === 'running' ? 'dot-green' : p.status === 'stopped' ? 'dot-red' : 'dot-gray'}`} />
                      {p.status === 'running' ? t('Çalışıyor') : p.status === 'stopped' ? t('Durdu') : p.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.services} {t('servis')} ({p.running_services} {t('aktif')})</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {p.status !== 'running' ? (
                        <button onClick={() => composeAction(p.path, path => api(`/api/docker/compose/up?project_path=${encodeURIComponent(path)}`, { method: 'POST' }))} className="btn btn-success">{t('Başlat')}</button>
                      ) : (
                        <button onClick={() => composeAction(p.path, path => api(`/api/docker/compose/down?project_path=${encodeURIComponent(path)}`, { method: 'POST' }))} className="btn btn-danger">{t('Durdur')}</button>
                      )}
                      <button onClick={() => viewProjectLogs(p.path)} className="btn btn-secondary">{t('Loglar')}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {projectLogs && (
            <div style={{ background: '#020812', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{t('Loglar')} — {projectLogs.path.split('/').pop()}</span>
                <button onClick={() => setProjectLogs(null)} className="btn-icon" style={{ width: 24, height: 24 }}><X size={12} /></button>
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', padding: '8px 4px' }}>
                {projectLogs.lines.length === 0 ? <div className="empty-state" style={{ padding: 20 }}>{t('Log yok')}</div> : projectLogs.lines.map((line, i) => (
                  <div key={i} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: '#7a90b0', padding: '1px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
