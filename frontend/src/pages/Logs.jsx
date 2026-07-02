import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { ScrollText, Search, RotateCw } from 'lucide-react'

export default function Logs() {
  const { t } = useI18n()
  const [logs, setLogs] = useState([])
  const [unit, setUnit] = useState('')
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await api(`/api/logs?unit=${encodeURIComponent(unit)}&lines=200`)
      setLogs(res.lines || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { api('/api/logs/units').then(setUnits).catch(() => {}) }, [])
  useEffect(() => { fetchLogs() }, [])

  const getLineColor = (line) => {
    const l = line.toLowerCase()
    if (l.includes('error') || l.includes('failed') || l.includes('critical')) return '#ef4444'
    if (l.includes('warn') || l.includes('warning')) return '#f59e0b'
    if (l.includes('info') || l.includes('started') || l.includes('success')) return '#22c55e'
    return '#7a90b0'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><ScrollText size={18} color="var(--accent)" /></span>
          {t('Günlükler')}
        </h2>
        <button onClick={fetchLogs} disabled={loading} className="btn btn-secondary">
          <RotateCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          {t('Yenile')}
        </button>
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: 180, maxWidth: 300 }}>
          <Search size={14} className="search-icon" />
          <input
            value={unit}
            onChange={e => setUnit(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchLogs()}
            placeholder={t('Servis (örn: sshd)')}
          />
        </div>
        <button onClick={() => { setUnit(''); fetchLogs() }} className="btn btn-secondary">{t('Tümü')}</button>
        <button onClick={fetchLogs} className="btn btn-primary">{t('Filtrele')}</button>
      </div>

      {/* Unit pills */}
      {units.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {units.slice(0, 15).map(u => {
            const name = u.name.replace('.service', '')
            const isActive = unit === name
            return (
              <button key={u.name} onClick={() => setUnit(name)} style={{
                padding: '4px 12px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s ease', border: '1px solid',
                background: isActive ? 'var(--accent-glow)' : 'var(--bg-elevated)',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                borderColor: isActive ? 'rgba(6,182,212,0.3)' : 'var(--border)',
              }}>
                {name}
              </button>
            )
          })}
        </div>
      )}

      {/* Log viewer */}
      <div style={{
        background: '#020812',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.4)',
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {['#ef4444','#f59e0b','#22c55e'].map(c => (
              <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.7 }} />
            ))}
          </div>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
            journalctl {unit ? `--unit=${unit}` : ''} --lines=200
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)' }}>
            {logs.length} {t('satır')}
          </span>
        </div>

        <div style={{ height: '60vh', minHeight: 300, overflowY: 'auto', padding: '10px 4px' }}>
          {loading && (
            <div className="empty-state" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <div className="spinner" />
            </div>
          )}
          {!loading && logs.length === 0 && (
            <div className="empty-state" style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>
              {t('Log bulunamadı')}
            </div>
          )}
          {logs.map((line, i) => (
            <div key={i} style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: '0.75rem', lineHeight: 1.65,
              color: getLineColor(line),
              padding: '1px 14px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
