import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Play, Square, RotateCw, Search, RefreshCw, Server } from 'lucide-react'

export default function Services() {
  const { t } = useI18n()
  const [services, setServices] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchServices = async () => {
    setLoading(true)
    try {
      const res = await api(`/api/services?search=${encodeURIComponent(search)}`)
      setServices(res)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchServices() }, [])

  const action = async (name, cmd) => {
    try {
      await api(`/api/services/${cmd}?name=${encodeURIComponent(name)}`, { method: 'POST' })
      setTimeout(fetchServices, 1200)
    } catch (e) { alert(e.message) }
  }

  const getStatusBadge = (active, sub) => {
    if (active === 'active' && sub === 'running') return { cls: 'badge-green', label: sub }
    if (active === 'active') return { cls: 'badge-cyan', label: active }
    if (active === 'failed') return { cls: 'badge-red', label: 'failed' }
    return { cls: 'badge-gray', label: sub || active }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Server size={18} color="var(--accent)" /></span>
          {t('Servisler')}
        </h2>
        <button onClick={fetchServices} disabled={loading} className="btn btn-secondary">
          <RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          {t('Yenile')}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 400 }}>
        <div className="search-wrap" style={{ flex: 1 }}>
          <Search size={14} className="search-icon" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchServices()}
            placeholder={t('Servis ara...')}
          />
        </div>
        <button onClick={fetchServices} className="btn btn-primary">{t('Ara')}</button>
      </div>

      <div className="table-wrap" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>{t('Servis')}</th>
                <th>{t('Durum')}</th>
                <th style={{ display: 'none' }}>{t('Açıklama')}</th>
                <th style={{ textAlign: 'right' }}>{t('İşlem')}</th>
              </tr>
            </thead>
            <tbody>
              {services.map(s => {
                const { cls, label } = getStatusBadge(s.active, s.sub)
                return (
                  <tr key={s.name}>
                    <td className="primary mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {s.name}
                    </td>
                    <td>
                      <span className={`badge ${cls}`}>
                        <span className={`dot ${cls === 'badge-green' ? 'dot-green' : cls === 'badge-red' ? 'dot-red' : cls === 'badge-cyan' ? 'dot-cyan' : 'dot-gray'}`} />
                        {label}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.description}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => action(s.name, 'start')}
                          disabled={s.active === 'active'}
                          className="btn-icon success"
                          title={t('Başlat')}
                        >
                          <Play size={13} />
                        </button>
                        <button
                          onClick={() => action(s.name, 'stop')}
                          disabled={s.active !== 'active'}
                          className="btn-icon danger"
                          title={t('Durdur')}
                        >
                          <Square size={13} />
                        </button>
                        <button
                          onClick={() => action(s.name, 'restart')}
                          className="btn-icon warning"
                          title={t('Yeniden Başlat')}
                        >
                          <RotateCw size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {services.length === 0 && <div className="table-empty">{t('Servis bulunamadı')}</div>}
      </div>
    </div>
  )
}
