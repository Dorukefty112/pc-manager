import { useState, useEffect } from 'react'
import { api } from '../api'
import { Play, Square, RotateCw, Search, RefreshCw } from 'lucide-react'

export default function Services() {
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
      setTimeout(fetchServices, 1000)
    } catch (e) { alert(e.message) }
  }

  const statusColor = (active, sub) => {
    if (active === 'active' && sub === 'running') return 'bg-green-900/50 text-green-400'
    if (active === 'active') return 'bg-green-900/30 text-green-500'
    if (active === 'failed') return 'bg-red-900/50 text-red-400'
    return 'bg-gray-800 text-gray-500'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-semibold">Servisler</h2>
        <button onClick={fetchServices} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      <div className="relative max-w-xs mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchServices()} placeholder="Servis ara..." 
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-cyan-700" />
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-2 sm:px-4 py-3 font-medium">Servis</th>
                <th className="text-left px-2 sm:px-4 py-3 font-medium">Durum</th>
                <th className="text-left px-2 sm:px-4 py-3 font-medium hidden md:table-cell">Açıklama</th>
                <th className="text-right px-2 sm:px-4 py-3 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {services.map(s => (
                <tr key={s.name} className="hover:bg-gray-800/50">
                  <td className="px-2 sm:px-4 py-2.5 font-mono text-xs text-gray-200 max-w-[150px] sm:max-w-[250px] truncate">{s.name}</td>
                  <td className="px-2 sm:px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor(s.active, s.sub)}`}>{s.sub || s.active}</span>
                  </td>
                  <td className="px-2 sm:px-4 py-2.5 text-xs text-gray-500 max-w-[300px] truncate hidden md:table-cell">{s.description}</td>
                  <td className="px-2 sm:px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => action(s.name, 'start')} disabled={s.active === 'active'} title="Başlat"
                        className="p-1.5 rounded hover:bg-green-900/50 text-green-500 disabled:opacity-30 disabled:cursor-not-allowed"><Play size={14} /></button>
                      <button onClick={() => action(s.name, 'stop')} disabled={s.active !== 'active'} title="Durdur"
                        className="p-1.5 rounded hover:bg-red-900/50 text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"><Square size={14} /></button>
                      <button onClick={() => action(s.name, 'restart')} title="Yeniden Başlat"
                        className="p-1.5 rounded hover:bg-yellow-900/50 text-yellow-500"><RotateCw size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {services.length === 0 && <div className="p-8 text-center text-gray-600">Servis bulunamadı</div>}
      </div>
    </div>
  )
}
