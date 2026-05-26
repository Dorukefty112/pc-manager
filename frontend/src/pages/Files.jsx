import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Folder, File, ArrowLeft, Upload, Trash2, Plus, Search, Edit3, X, HardDrive, Home } from 'lucide-react'

export default function Files() {
  const [searchParams, setSearchParams] = useSearchParams()
  const path = searchParams.get('path') || '/'
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const uploadRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setError('')
      setSearchResults(null)
      const res = await api(`/api/files/list?path=${encodeURIComponent(path)}`)
      setData(res)
    } catch (e) {
      setError(e.message)
    }
  }, [path])

  useEffect(() => { load() }, [load])

  const navigate = (p) => setSearchParams({ path: p })

  const del = async (itemPath) => {
    if (!confirm('Silmek istediğine emin misin?')) return
    await api(`/api/files/delete?path=${encodeURIComponent(itemPath)}`, { method: 'DELETE' })
    load()
  }

  const upload = async (e) => {
    const files = e.target.files
    if (!files?.length) return
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      const token = localStorage.getItem('pcmanager_token')
      await fetch(`/api/files/upload?dest=${encodeURIComponent(path)}`, { method: 'POST', body: form, headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    }
    load()
  }

  const mkdir = async () => {
    const name = prompt('Dizin adı:')
    if (!name) return
    await api(`/api/files/mkdir?path=${encodeURIComponent(path + '/' + name)}`, { method: 'POST' })
    load()
  }

  const startRename = (item) => {
    setRenaming(item.path)
    setRenameVal(item.name)
  }

  const doRename = async () => {
    if (!renaming || !renameVal) return
    await api(`/api/files/rename?path=${encodeURIComponent(renaming)}&new_name=${encodeURIComponent(renameVal)}`, { method: 'PUT' })
    setRenaming(null)
    load()
  }

  const doSearch = async () => {
    if (!searchQ.trim()) return
    try {
      const res = await api(`/api/files/search?q=${encodeURIComponent(searchQ)}&root=${encodeURIComponent(path)}`)
      setSearchResults(res)
    } catch {}
  }

  const fmt = (size) => {
    if (size > 1e9) return `${(size / 1e9).toFixed(1)} GB`
    if (size > 1e6) return `${(size / 1e6).toFixed(1)} MB`
    if (size > 1e3) return `${(size / 1e3).toFixed(1)} KB`
    return `${size} B`
  }

  const fmtDate = (ts) => {
    const d = new Date(ts * 1000)
    return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl sm:text-2xl font-semibold">Dosyalar</h2>
        <div className="flex gap-1.5 sm:gap-2">
          <div className="flex gap-1">
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="Ara..." className="w-24 sm:w-40 bg-gray-900 border border-gray-800 rounded-lg px-2 sm:px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-700" />
            <button onClick={doSearch} className="p-1.5 bg-gray-800 rounded-lg hover:bg-gray-700"><Search size={16} /></button>
          </div>
          <label className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 text-sm">
            <Upload size={14} /> <span className="hidden sm:inline">Yükle</span>
            <input type="file" className="hidden" ref={uploadRef} onChange={upload} multiple />
          </label>
          <button onClick={mkdir} className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 text-sm">
            <Plus size={14} /> <span className="hidden sm:inline">Dizin</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 text-sm">
          <HardDrive size={14} /> Kök
        </button>
        <button onClick={() => navigate('/mnt/c')} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 text-sm">
          <HardDrive size={14} /> Windows (C:)
        </button>
        <button onClick={() => navigate('/mnt')} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 text-sm">
          <HardDrive size={14} /> /mnt
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 px-2 sm:px-4 py-3 border-b border-gray-800 text-sm text-gray-400">
          {data?.parent && !searchResults && (
            <button onClick={() => navigate(data.parent)} className="hover:text-white p-1"><ArrowLeft size={16} /></button>
          )}
          <span className="font-mono text-xs truncate">{searchResults ? `Arama: "${searchQ}"` : path}</span>
          {searchResults && <button onClick={() => { setSearchResults(null); setSearchQ('') }} className="ml-auto text-gray-500 hover:text-white p-1"><X size={14} /></button>}
        </div>

        {error && <div className="p-4 text-red-400 text-sm">{error}</div>}

        <div className="divide-y divide-gray-800 max-h-[calc(100vh-250px)] overflow-y-auto">
          {(searchResults || data?.items)?.map(item => (
            <div key={item.path} className="flex items-center justify-between px-2 sm:px-4 py-3 hover:bg-gray-800/50 group">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {item.is_dir ? <Folder size={18} className="text-yellow-500 shrink-0" /> : <File size={18} className="text-blue-500 shrink-0" />}
                {renaming === item.path ? (
                  <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenaming(null) }}
                    onBlur={doRename}
                    className="bg-gray-800 border border-cyan-700 rounded px-2 py-0.5 text-sm flex-1 min-w-0 focus:outline-none" />
                ) : (
                  <button
                    onClick={() => item.is_dir && !searchResults ? navigate(item.path) : (!item.is_dir && api(`/api/files/download?path=${encodeURIComponent(item.path)}`, { raw: true }).then(r => r.blob()).then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = item.name; a.click() }))}
                    className="text-sm text-left truncate hover:text-cyan-400 flex-1 min-w-0 py-0.5"
                  >
                    {item.name}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-xs text-gray-500 shrink-0 ml-2">
                {!item.is_dir && <span className="hidden xs:inline">{fmt(item.size)}</span>}
                <span className="hidden sm:inline">{fmtDate(item.mtime || item.modified)}</span>
                <button onClick={() => startRename(item)} className="p-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-cyan-400"><Edit3 size={14} /></button>
                <button onClick={() => del(item.path)} className="p-1.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {(searchResults?.length === 0 || data?.items?.length === 0) && <div className="p-8 text-center text-gray-600">Sonuç bulunamadı</div>}
        </div>
      </div>
    </div>
  )
}
