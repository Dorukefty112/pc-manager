import { useState, useEffect } from 'react'
import { api } from '../api'
import { Container, Play, Square, RotateCw, Trash2, Image, Terminal, RefreshCw } from 'lucide-react'

export default function Docker() {
  const [containers, setContainers] = useState([])
  const [images, setImages] = useState([])
  const [info, setInfo] = useState(null)
  const [tab, setTab] = useState('containers')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState(null)
  const [logContainer, setLogContainer] = useState(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [i, c, im] = await Promise.all([
        api('/api/docker/info'),
        api(`/api/docker/containers?all=${showAll}`),
        api('/api/docker/images'),
      ])
      setInfo(i)
      setContainers(c)
      setImages(im)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [showAll])

  const action = async (actionFn, id) => {
    await actionFn(id)
    fetchAll()
  }

  const viewLogs = async (id) => {
    try {
      const res = await api(`/api/docker/logs/${id}`)
      setLogContainer(id)
      setLogs(res.lines || [])
    } catch {}
  }

  const statusColor = (state) => {
    switch (state) {
      case 'running': return 'bg-green-500'
      case 'exited': return 'bg-red-500'
      case 'paused': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  if (!info && loading) return <div className="text-center text-gray-500 mt-20">Yükleniyor...</div>

  if (info && !info.installed) return (
    <div className="text-center mt-20">
      <Container size={48} className="mx-auto mb-4 text-gray-700" />
      <h2 className="text-xl font-semibold mb-2">Docker Kurulu Değil</h2>
      <p className="text-gray-500 text-sm">Docker'ı kurmak için: <code className="text-cyan-400">sudo pacman -S docker</code></p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Container size={20} className="text-cyan-400" />
          <h2 className="text-xl sm:text-2xl font-semibold">Docker</h2>
        </div>
        <button onClick={fetchAll} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
          <RefreshCw size={16} />
        </button>
      </div>

      {info && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Konteyner', value: info.containers || 0, color: 'text-blue-400' },
            { label: 'Aktif', value: info.running || 0, color: 'text-green-400' },
            { label: 'İmaj', value: info.images || 0, color: 'text-purple-400' },
            { label: 'Sürüm', value: info.version || '?', color: 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('containers')}
          className={`px-4 py-1.5 rounded-lg text-sm ${tab === 'containers' ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          Konteynerlar
        </button>
        <button onClick={() => setTab('images')}
          className={`px-4 py-1.5 rounded-lg text-sm ${tab === 'images' ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          İmajlar
        </button>
      </div>

      {tab === 'containers' && (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-400 mb-3 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="accent-cyan-500" />
            Tümünü göster (duranlar dahil)
          </label>

          {containers.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-600">
              {showAll ? 'Hiç konteyner yok' : 'Çalışan konteyner yok'}
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
                {containers.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor(c.state)}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-xs text-gray-500 truncate">{c.image} <span className="text-gray-700">|</span> {c.id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <span className="text-[10px] text-gray-600 mr-2 hidden sm:inline">{c.status}</span>
                      {c.state === 'running' ? (
                        <>
                          <button onClick={() => action(id => api(`/api/docker/container/stop?container_id=${id}`, { method: 'POST' }), c.id)} className="p-1.5 hover:text-yellow-400 text-gray-600" title="Durdur"><Square size={14} /></button>
                          <button onClick={() => action(id => api(`/api/docker/container/restart?container_id=${id}`, { method: 'POST' }), c.id)} className="p-1.5 hover:text-cyan-400 text-gray-600" title="Yeniden başlat"><RotateCw size={14} /></button>
                        </>
                      ) : (
                        <button onClick={() => action(id => api(`/api/docker/container/start?container_id=${id}`, { method: 'POST' }), c.id)} className="p-1.5 hover:text-green-400 text-gray-600" title="Başlat"><Play size={14} /></button>
                      )}
                      <button onClick={() => viewLogs(c.id)} className="p-1.5 hover:text-blue-400 text-gray-600" title="Log"><Terminal size={14} /></button>
                      <button onClick={() => { if (confirm('Silmek istediğine emin misin?')) action(id => api(`/api/docker/container?container_id=${id}&force=true`, { method: 'DELETE' }), c.id) }} className="p-1.5 hover:text-red-400 text-gray-600" title="Sil"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {logContainer && logs && (
            <div className="mt-4 bg-gray-950 rounded-xl border border-gray-800">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
                <span className="text-xs text-gray-500 font-medium">Loglar - {logContainer}</span>
                <button onClick={() => { setLogs(null); setLogContainer(null) }} className="text-gray-500 hover:text-white text-xs">Kapat</button>
              </div>
              <div className="p-3 font-mono text-xs max-h-64 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-gray-700">Log yok</div>
                ) : (
                  logs.map((line, i) => (
                    <div key={i} className="text-gray-400 whitespace-pre-wrap break-all hover:bg-gray-900 px-1 py-[1px]">{line}</div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'images' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          {images.length === 0 ? (
            <div className="p-8 text-center text-gray-600">Hiç imaj yok</div>
          ) : (
            <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
              {images.map(img => (
                <div key={img.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Image size={16} className="text-purple-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{img.repository}:{img.tag}</div>
                      <div className="text-xs text-gray-500">{img.id}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 shrink-0">{img.size}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
