import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { Search, Globe, FolderOpen, Server, ExternalLink, Clock, ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'

const TABS = [
  { id: 'web', label: 'Web', icon: Globe },
  { id: 'local', label: 'Yerel', icon: FolderOpen },
  { id: 'system', label: 'Sistem', icon: Server },
]

export default function SearchEngine() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('web')
  const [page, setPage] = useState(1)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef(null)
  const suggestRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target) && inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchSuggestions = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim() || tab !== 'web') { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api(`/api/search/suggest?q=${encodeURIComponent(q)}`)
        setSuggestions(data.suggestions || [])
        setShowSuggestions(true)
      } catch { setSuggestions([]) }
    }, 200)
  }, [tab])

  const doSearch = async (q, p = 1) => {
    if (!q.trim()) return
    setLoading(true)
    setError('')
    setShowSuggestions(false)
    setPage(p)
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(q)}&type=${tab}&page=${p}`)
      if (data.error) { setError(data.error); setResults(null) }
      else { setResults(data); setSearched(true) }
    } catch (e) {
      setError('Arama basarisiz')
      setResults(null)
    }
    setLoading(false)
  }

  const handleSubmit = (e) => {
    e?.preventDefault()
    doSearch(query, 1)
  }

  const handleSuggestionClick = (s) => {
    setQuery(s)
    setShowSuggestions(false)
    doSearch(s, 1)
  }

  const handleInputChange = (val) => {
    setQuery(val)
    setSearched(false)
    fetchSuggestions(val)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && suggestions.length > 0 && showSuggestions) {
      setShowSuggestions(false)
      doSearch(query, 1)
    }
  }

  if (!searched) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <Sparkles size={32} className="text-cyan-400" />
            <h1 className="text-4xl font-bold text-white tracking-tight">
              Pc<span className="text-cyan-400">_Search_Engine</span>
            </h1>
          </div>
          <p className="text-gray-500 text-sm">Web, yerel dosya ve sistem arama motoru</p>
        </div>

        <div className="w-full max-w-2xl">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input ref={inputRef} value={query} onChange={e => handleInputChange(e.target.value)} onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} onKeyDown={handleKeyDown}
                placeholder="Pc_Search_Engine ile arayin..."
                className="w-full bg-gray-900 border-2 border-gray-700 rounded-2xl pl-12 pr-24 py-4 text-base text-white placeholder-gray-600 focus:outline-none focus:border-cyan-700 transition-colors" />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {TABS.map(t => (
                  <button key={t.id} type="button" onClick={() => setTab(t.id)}
                    className={`p-2 rounded-lg transition-colors ${tab === t.id ? 'bg-cyan-900/30 text-cyan-400' : 'text-gray-600 hover:text-gray-400'}`}>
                    <t.icon size={16} />
                  </button>
                ))}
              </div>
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div ref={suggestRef} className="absolute top-full mt-1 left-0 right-0 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden z-10 shadow-xl">
                {suggestions.map((s, i) => (
                  <button key={i} type="button" onClick={() => handleSuggestionClick(s)}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-3 transition-colors">
                    <Search size={14} className="text-gray-600 shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </form>

          <div className="flex justify-center gap-4 mt-6 text-xs text-gray-600">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${tab === t.id ? 'bg-cyan-900/20 text-cyan-400' : 'hover:text-gray-400'}`}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm pb-4 pt-4">
        <form onSubmit={handleSubmit} className="relative max-w-3xl">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={query} onChange={e => handleInputChange(e.target.value)}
              placeholder="Ara..."
              className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-32 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-700" />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {TABS.map(t => (
                <button key={t.id} type="button" onClick={() => { setTab(t.id); setSearched(false) }}
                  className={`p-1.5 rounded-md text-xs transition-colors ${tab === t.id ? 'bg-cyan-900/30 text-cyan-400' : 'text-gray-600 hover:text-gray-400'}`}>
                  <t.icon size={14} />
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-cyan-400 animate-spin" />
          <span className="ml-3 text-gray-500 text-sm">Araniyor...</span>
        </div>
      ) : error ? (
        <div className="max-w-3xl mx-auto mt-8 p-6 bg-red-900/10 border border-red-900/30 rounded-xl text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => doSearch(query, 1)} className="mt-3 text-xs text-cyan-500 hover:underline">Tekrar dene</button>
        </div>
      ) : results ? (
        <div className="max-w-3xl mx-auto">
          <p className="text-xs text-gray-600 mb-4">
            {results.query} icin {results.total} sonuc
          </p>

          {tab === 'web' && results.results?.map((r, i) => (
            <div key={i} className="mb-5">
              <a href={r.url} target="_blank" rel="noopener noreferrer"
                className="group block">
                <p className="text-xs text-gray-600 truncate mb-0.5">{r.url}</p>
                <h3 className="text-base font-medium text-cyan-400 group-hover:underline mb-0.5">
                  {r.title || 'Basliksiz'}
                </h3>
                <p className="text-sm text-gray-400 line-clamp-2">{r.snippet || ''}</p>
              </a>
            </div>
          ))}

          {tab === 'local' && results.results?.map((r, i) => (
            <div key={i} className="mb-4 pb-4 border-b border-gray-800 last:border-0">
              <p className="text-xs text-gray-600 font-mono">{r.path}</p>
              <p className="text-sm font-medium text-gray-200 mt-0.5">{r.name}</p>
              {r.snippet && <p className="text-sm text-gray-400 mt-1 line-clamp-2">{r.snippet}</p>}
            </div>
          ))}

          {tab === 'system' && results.results?.map((cat, ci) => (
            <div key={ci} className="mb-6">
              <h3 className="text-sm font-medium text-gray-300 mb-2">{cat.category}</h3>
              {cat.items.map((item, ii) => (
                <div key={ii} className="mb-2 p-3 bg-gray-900 rounded-xl border border-gray-800">
                  {item.name && <p className="text-sm font-medium text-gray-200">{item.name}</p>}
                  {item.pid && <p className="text-xs text-gray-500 mt-0.5">PID: {item.pid} | CPU: %{item.cpu} | MEM: %{item.mem}</p>}
                  {item.status && <p className="text-xs text-gray-500 mt-0.5">Durum: {item.status}</p>}
                  {item.repo && <p className="text-xs text-gray-500 mt-0.5">{item.repo}/{item.name} {item.version}</p>}
                </div>
              ))}
            </div>
          ))}

          {results.results?.length === 0 && !error && (
            <div className="text-center py-20">
              <p className="text-gray-500">Sonuc bulunamadi.</p>
              <p className="text-xs text-gray-600 mt-1">Farkli kelimelerle tekrar deneyin.</p>
            </div>
          )}

          {tab === 'web' && results.total > 10 && (
            <div className="flex items-center justify-center gap-4 mt-8 mb-12">
              <button disabled={page <= 1} onClick={() => doSearch(query, page - 1)}
                className="flex items-center gap-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-gray-300 disabled:opacity-30 hover:border-gray-600 transition-colors">
                <ChevronLeft size={16} /> Onceki
              </button>
              <span className="text-sm text-gray-500">Sayfa {page}</span>
              <button disabled={results.results?.length < 10} onClick={() => doSearch(query, page + 1)}
                className="flex items-center gap-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-gray-300 disabled:opacity-30 hover:border-gray-600 transition-colors">
                Sonraki <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
