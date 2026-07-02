import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Package, RefreshCw, Download, AlertTriangle, CheckCircle } from 'lucide-react'

export default function Updates() {
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const check = async () => {
    setLoading(true)
    try { const res = await api('/api/updates/check'); setData(res) } catch {}
    setLoading(false)
  }
  useEffect(() => { check() }, [])

  const upgrade = async () => {
    if (!confirm(t('Tüm güncellemeler yüklensin mi? Bu işlem biraz sürebilir.'))) return
    try {
      const res = await api('/api/updates/upgrade', { method: 'POST' })
      setMessage(res.message || t('Güncelleme başlatıldı'))
    } catch (e) { setMessage(t('Hata: ') + e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Package size={18} color="var(--accent)" /></span>
          {t('Güncellemeler')}
        </h2>
        <button onClick={check} disabled={loading} className="btn btn-secondary">
          <RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          {t('Yenile')}
        </button>
      </div>

      {data && (
        <div className="card card-glow" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12,
                background: data.count > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
                border: `1px solid ${data.count > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {data.count > 0
                  ? <Package size={22} color="#f59e0b" />
                  : <CheckCircle size={22} color="#22c55e" />
                }
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>
                  {data.count > 0
                    ? t('{count} güncelleme mevcut').replace('{count}', data.count)
                    : t('Sistem güncel')
                  }
                </div>
                {data.count > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>
                    {t('Sisteminizi güncel tutmanız önerilir')}
                  </div>
                )}
              </div>
            </div>
            {data.count > 0 && (
              <button onClick={upgrade} className="btn btn-primary">
                <Download size={14} /> {t('Tümünü Güncelle')}
              </button>
            )}
          </div>
          {data.error && (
            <div style={{
              marginTop: 14, display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 10, padding: '10px 14px',
              color: '#f59e0b', fontSize: '0.82rem',
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} /> {data.error}
            </div>
          )}
        </div>
      )}

      {message && (
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 12, padding: '12px 16px',
          fontSize: '0.85rem', color: '#22c55e',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={15} /> {message}
        </div>
      )}

      {data?.updates?.length > 0 && (
        <div className="table-wrap" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={14} color="var(--text-muted)" />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('Güncellenecek Paketler')}
            </span>
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {data.updates.map((u, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 16px', borderBottom: '1px solid var(--border)',
                transition: 'background 0.12s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Package size={13} color="var(--accent)" style={{ flexShrink: 0 }} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: 'var(--text)' }}>{u.package}</span>
                </div>
                {u.new_version && (
                  <span className="badge badge-cyan" style={{ fontFamily: "'JetBrains Mono',monospace" }}>{u.new_version}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.count === 0 && (
        <div className="empty-state">
          <CheckCircle size={36} color="#22c55e" />
          <span>{t('Sistem güncel, güncellenecek paket yok')}</span>
        </div>
      )}
    </div>
  )
}
