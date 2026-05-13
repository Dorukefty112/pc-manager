import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { HardDrive, ArrowLeft, Folder, File } from 'lucide-react'

export default function DiskUsage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const path = searchParams.get('path') || '/'
  const [data, setData] = useState(null)
  const [disks, setDisks] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api('/api/disks/list').then(setDisks).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    api(`/api/disks/usage?path=${encodeURIComponent(path)}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [path])

  const fmt = (bytes) => {
    if (bytes > 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(2)} MB`
    if (bytes > 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
    return `${bytes} B`
  }

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-semibold mb-4">Disk Analizi</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        {disks.map((d, i) => (
          <button key={i} onClick={() => setSearchParams({ path: d.mount })}
            className={`bg-gray-900 rounded-xl border p-4 text-left hover:bg-gray-800 ${path === d.mount ? 'border-cyan-700' : 'border-gray-800'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <HardDrive size={14} className="text-cyan-400" />
              <span className="text-sm font-mono text-cyan-400">{d.device.replace('/dev/', '')}</span>
            </div>
            <div className="text-xs text-gray-500 mb-1">{d.mount} ({d.fstype})</div>
            <div className="text-sm font-semibold">{fmt(d.used)} / {fmt(d.total)}</div>
            <div className="w-full h-1.5 bg-gray-700 rounded-full mt-1">
              <div className={`h-full rounded-full ${d.percent > 80 ? 'bg-red-500' : d.percent > 60 ? 'bg-yellow-500' : 'bg-cyan-500'}`}
                style={{ width: `${Math.min(d.percent, 100)}%` }} />
            </div>
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 text-sm text-gray-400">
          {data?.parent && (
            <button onClick={() => setSearchParams({ path: data.parent })} className="hover:text-white"><ArrowLeft size={16} /></button>
          )}
          <span className="font-mono text-xs">{path}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-600">Taranıyor...</div>
        ) : (
          <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
            {data?.items?.map(item => (
              <div key={item.path} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50">
                <button
                  onClick={() => item.is_dir ? setSearchParams({ path: item.path }) : null}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  {item.is_dir ? <Folder size={16} className="text-yellow-500 shrink-0" /> : <File size={16} className="text-blue-500 shrink-0" />}
                  <span className="text-sm truncate">{item.name}</span>
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                    {data?.items?.[0]?.size > 0 && (
                      <div className="h-full rounded-full bg-cyan-500" style={{ width: `${(item.size / data.items[0].size) * 100}%` }} />
                    )}
                  </div>
                  <span className="text-xs text-gray-400 w-20 text-right font-mono">{fmt(item.size)}</span>
                </div>
              </div>
            ))}
            {data?.items?.length === 0 && <div className="p-8 text-center text-gray-600">Boş dizin</div>}
          </div>
        )}
      </div>
    </div>
  )
}
