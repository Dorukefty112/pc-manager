import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Package, RefreshCw, Download, AlertTriangle } from 'lucide-react'

export default function Updates() {
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const check = async () => {
    setLoading(true)
    try {
      const res = await api('/api/updates/check')
      setData(res)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { check() }, [])

  const upgrade = async () => {
    if (!confirm(t('Tüm güncellemeler yüklensin mi? Bu işlem biraz sürebilir.'))) return
    try {
      const res = await api('/api/updates/upgrade', { method: 'POST' })
      setMessage(res.message || t('Güncelleme başlatıldı'))
    } catch (e) {
      setMessage(t('Hata: ') + e.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold">{t('Güncellemeler')}</h2>
        <button onClick={check} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 text-sm disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('Yenile')}
        </button>
      </div>

      {data && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Package size={20} className="text-cyan-400" />
              <span className="text-lg font-medium">{t('{count} güncelleme mevcut').replace('{count}', data.count)}</span>
            </div>
            {data.count > 0 && (
              <button onClick={upgrade} className="flex items-center gap-2 px-4 py-2 bg-cyan-700 rounded-lg hover:bg-cyan-600 text-sm font-medium">
                <Download size={14} /> {t('Tümünü Güncelle')}
              </button>
            )}
          </div>
          {data.error && (
            <div className="flex items-center gap-2 text-yellow-400 text-sm mb-3"><AlertTriangle size={14} /> {data.error}</div>
          )}
        </div>
      )}

      {data?.updates?.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
            {data.updates.map((u, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <Package size={14} className="text-cyan-400 shrink-0" />
                  <span className="text-sm font-mono">{u.package}</span>
                </div>
                {u.new_version && <span className="text-xs text-gray-500 font-mono">{u.new_version}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div className="mt-4 bg-gray-900 rounded-xl border border-gray-800 p-4 text-sm text-gray-300">
          {message}
        </div>
      )}
    </div>
  )
}
