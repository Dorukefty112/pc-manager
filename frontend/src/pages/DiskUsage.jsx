import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { HardDrive, ArrowLeft, Folder, FileText } from 'lucide-react'

export default function DiskUsage() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const path = searchParams.get('path') || '/'
  const [data, setData] = useState(null)
  const [disks, setDisks] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { api('/api/disks/list').then(setDisks).catch(() => {}) }, [])

  useEffect(() => {
    setLoading(true)
    api(`/api/disks/usage?path=${encodeURIComponent(path)}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [path])

  const fmt = (bytes) => {
    if (bytes > 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
    if (bytes > 1e9)  return `${(bytes / 1e9).toFixed(2)} GB`
    if (bytes > 1e6)  return `${(bytes / 1e6).toFixed(2)} MB`
    if (bytes > 1e3)  return `${(bytes / 1e3).toFixed(1)} KB`
    return `${bytes} B`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><HardDrive size={18} color="var(--accent)" /></span>
          {t('Disk Analizi')}
        </h2>
      </div>

      {/* Disk buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {disks.map((d, i) => {
          const diskColor = d.percent > 80 ? '#ef4444' : d.percent > 60 ? '#f97316' : '#34d399'
          const isActive = path === d.mount
          return (
            <button key={i} onClick={() => setSearchParams({ path: d.mount })} style={{
              background: isActive ? 'var(--accent-glow2)' : 'var(--bg-card)',
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12, padding: 16, textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: isActive ? 'var(--shadow-glow)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <HardDrive size={14} color={isActive ? 'var(--accent)' : 'var(--text-muted)'} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: isActive ? 'var(--accent)' : 'var(--text)', fontWeight: 600 }}>
                  {d.device.replace('/dev/', '')}
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>{d.mount} ({d.fstype})</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                {fmt(d.used)} / {fmt(d.total)}
              </div>
              <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${Math.min(d.percent, 100)}%`,
                  background: diskColor, boxShadow: `0 0 6px ${diskColor}60`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </button>
          )
        })}
      </div>

      {/* File browser */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.02)',
        }}>
          {data?.parent && (
            <button onClick={() => setSearchParams({ path: data.parent })} className="btn-icon" style={{ flexShrink: 0 }}>
              <ArrowLeft size={15} />
            </button>
          )}
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {path}
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="spinner" />
            {t('Taranıyor...')}
          </div>
        ) : (
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {data?.items?.map(item => {
              const maxSize = data.items[0]?.size || 1
              const barPct = item.size > 0 ? (item.size / maxSize) * 100 : 0
              return (
                <div key={item.path} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 16px', borderBottom: '1px solid var(--border)',
                  transition: 'background 0.12s',
                  cursor: item.is_dir ? 'pointer' : 'default',
                }}
                  onClick={() => item.is_dir && setSearchParams({ path: item.path })}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    {item.is_dir
                      ? <Folder size={15} color="#f59e0b" style={{ flexShrink: 0 }} />
                      : <FileText size={15} color="#60a5fa" style={{ flexShrink: 0 }} />
                    }
                    <span style={{ fontSize: '0.82rem', color: item.is_dir ? 'var(--text)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 99, width: `${barPct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: 'var(--text-muted)', width: 70, textAlign: 'right' }}>
                      {fmt(item.size)}
                    </span>
                  </div>
                </div>
              )
            })}
            {(!data?.items || data.items.length === 0) && <div className="empty-state">{t('Boş dizin')}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
