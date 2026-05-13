import { useState, useEffect } from 'react'
import { api } from '../api'
import { Search, XCircle, Skull } from 'lucide-react'

export default function Processes() {
  const [procs, setProcs] = useState([])
  const [sort, setSort] = useState('cpu')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try { setProcs(await api(`/api/processes?sort=${sort}&limit=80&search=${encodeURIComponent(search)}`)) } catch {}
    }
    fetch()
    const id = setInterval(fetch, 5000)
    return () => clearInterval(id)
  }, [sort, search])

  const kill = async (pid, force = false) => {
    if (!confirm(`${force ? 'SIGKILL' : 'SIGTERM'} ile process ${pid} sonlandırılsın mı?`)) return
    try {
      await api(`/api/processes/kill?pid=${pid}&force=${force}`, { method: 'POST' })
      setProcs(prev => prev.filter(p => p.pid !== pid))
    } catch (e) { alert(e.message) }
  }

  const formatMem = (bytes) => {
    if (!bytes) return '0B'
    const mb = bytes / 1024 / 1024
    return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
  }

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-semibold mb-4">Process'ler</h2>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Process ara..." className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-cyan-700" />
        </div>
        <div className="flex gap-1 text-sm">
          <button onClick={() => setSort('cpu')} className={`px-3 py-2 rounded-lg ${sort === 'cpu' ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>CPU</button>
          <button onClick={() => setSort('memory')} className={`px-3 py-2 rounded-lg ${sort === 'memory' ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>RAM</button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-2 sm:px-4 py-3 font-medium">PID</th>
                <th className="text-left px-2 sm:px-4 py-3 font-medium">İsim</th>
                <th className="text-right px-2 sm:px-4 py-3 font-medium">CPU%</th>
                <th className="text-right px-2 sm:px-4 py-3 font-medium">RAM%</th>
                <th className="text-right px-2 sm:px-4 py-3 font-medium hidden md:table-cell">RAM</th>
                <th className="text-left px-2 sm:px-4 py-3 font-medium hidden sm:table-cell">Durum</th>
                <th className="text-left px-2 sm:px-4 py-3 font-medium hidden lg:table-cell">Kullanıcı</th>
                <th className="text-right px-2 sm:px-4 py-3 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {procs.map(p => (
                <tr key={p.pid} className="hover:bg-gray-800/50">
                  <td className="px-2 sm:px-4 py-2.5 font-mono text-xs text-gray-400">{p.pid}</td>
                  <td className="px-2 sm:px-4 py-2.5 text-gray-200 max-w-[120px] sm:max-w-[200px] truncate">{p.name || '?'}</td>
                  <td className="px-2 sm:px-4 py-2.5 text-right">
                    <span className={`${(p.cpu_percent || 0) > 50 ? 'text-red-400' : (p.cpu_percent || 0) > 20 ? 'text-yellow-400' : 'text-gray-300'}`}>
                      {p.cpu_percent?.toFixed(1) || '0'}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2.5 text-right text-gray-300">{p.memory_percent?.toFixed(1) || '0'}</td>
                  <td className="px-2 sm:px-4 py-2.5 text-right text-gray-400 font-mono text-xs hidden md:table-cell">{formatMem(p.memory_info?.rss)}</td>
                  <td className="px-2 sm:px-4 py-2.5 hidden sm:table-cell">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${p.status === 'running' ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}>{p.status}</span>
                  </td>
                  <td className="px-2 sm:px-4 py-2.5 text-xs text-gray-500 hidden lg:table-cell">{p.username || '?'}</td>
                  <td className="px-2 sm:px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => kill(p.pid, false)} title="SIGTERM" className="p-1.5 rounded hover:bg-yellow-900/50 text-yellow-500"><XCircle size={14} /></button>
                      <button onClick={() => kill(p.pid, true)} title="SIGKILL" className="p-1.5 rounded hover:bg-red-900/50 text-red-500"><Skull size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {procs.length === 0 && <div className="p-8 text-center text-gray-600">Process bulunamadı</div>}
      </div>
    </div>
  )
}
