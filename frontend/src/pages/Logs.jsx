import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { ScrollText, Search, RotateCw } from 'lucide-react'

export default function Logs() {
  const { t } = useI18n()
  const [logs, setLogs] = useState([])
  const [unit, setUnit] = useState('')
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await api(`/api/logs?unit=${encodeURIComponent(unit)}&lines=200`)
      setLogs(res.lines || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    api('/api/logs/units').then(setUnits).catch(() => {})
  }, [])

  useEffect(() => { fetchLogs() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-xl sm:text-2xl font-semibold">{t('Günlükler')}</h2>
        <button onClick={fetchLogs} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 text-sm shrink-0">
          <RotateCw size={14} className={loading ? 'animate-spin' : ''} /> <span className="hidden sm:inline">{t('Yenile')}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder={t('Servis (örn: sshd)')} 
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-cyan-700" />
        </div>
        <button onClick={() => { setUnit(''); fetchLogs() }} className="px-3 py-2 text-sm bg-gray-800 rounded-lg hover:bg-gray-700">{t('Tümü')}</button>
        <button onClick={fetchLogs} className="px-3 py-2 text-sm bg-cyan-700 rounded-lg hover:bg-cyan-600">{t('Filtrele')}</button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {units.slice(0, 15).map(u => (
          <button key={u.name} onClick={() => setUnit(u.name.replace('.service', ''))}
            className={`shrink-0 text-xs px-2.5 py-1.5 rounded-full ${unit === u.name.replace('.service', '') ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >{u.name.replace('.service', '')}</button>
        ))}
      </div>

      <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
        <div className="h-[60vh] sm:h-[600px] overflow-y-auto p-2 sm:p-3 font-mono text-[10px] sm:text-xs leading-relaxed">
          {logs.length === 0 && !loading && <div className="text-gray-600 text-center mt-20">{t('Log bulunamadı')}</div>}
          {logs.map((line, i) => (
            <div key={i} className="hover:bg-gray-900 px-1 sm:px-2 py-0.5 rounded whitespace-pre-wrap break-all text-gray-400">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
