import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Search, Globe, FolderOpen, Server, ExternalLink, ChevronLeft, ChevronRight, Loader2, Sparkles, ArrowLeft, BookOpenText, Globe as GlobeIcon, X, RefreshCw, House } from 'lucide-react'

export default function SearchEngine() {
  const { t } = useI18n()
  const TABS = [
    { id: 'web', label: t('Web'), icon: Globe },
    { id: 'local', label: t('Yerel'), icon: FolderOpen },
    { id: 'system', label: t('Sistem'), icon: Server },
  ]
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('web')
  const [page, setPage] = useState(1)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searched, setSearched] = useState(false)
  const [reader, setReader] = useState(null)
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerError, setReaderError] = useState('')
  const [browserUrl, setBrowserUrl] = useState(null)
  const iframeRef = useRef(null)
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
    setReader(null)
    setPage(p)
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(q)}&type=${tab}&page=${p}`)
      if (data.error) { setError(data.error); setResults(null) }
      else { setResults(data); setSearched(true) }
    } catch (e) {
      setError(t('Arama basarisiz'))
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

  const openReader = async (url) => {
    setReader(null)
    setReaderError('')
    setReaderLoading(true)
    try {
      const data = await api(`/api/reader?url=${encodeURIComponent(url)}`)
      if (data.error) setReaderError(data.error)
      else setReader(data)
    } catch { setReaderError(t('Sayfa okunamadi')) }
    setReaderLoading(false)
  }

  const closeReader = () => {
    setReader(null)
    setReaderError('')
  }

  const openBrowser = (url) => setBrowserUrl(url)
  const closeBrowser = () => setBrowserUrl(null)

  if (browserUrl) {
    return (
      <div className="flex flex-col h-[calc(100vh-3rem)] animate-fade-in">
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-t-xl" style={{background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)'}}>
          <button onClick={closeBrowser}
            className="btn-ghost p-1.5 rounded-lg flex items-center gap-1 text-xs"
            style={{color: 'var(--text-muted)'}}>
            <ArrowLeft size={16} /> {t('Aramaya Dön')}
          </button>
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs truncate"
            style={{background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)'}}>
            <Globe size={12} style={{color: 'var(--accent)'}} />
            <span className="truncate">{browserUrl}</span>
          </div>
          <a href={browserUrl} target="_blank" rel="noopener noreferrer"
            className="btn-ghost p-1.5 rounded-lg"
            style={{color: 'var(--text-muted)'}}>
            <ExternalLink size={16} />
          </a>
        </div>
        <div className="flex-1 min-h-0">
          <iframe
            ref={iframeRef}
            src={`/api/proxy/page?url=${encodeURIComponent(browserUrl)}`}
            className="w-full h-full border-0"
            title={t('Tarayıcı')}
            style={{background: '#fff'}}
          />
        </div>
      </div>
    )
  }

  if (reader) {
    return (
      <div className="animate-fade-in">
        <div className="sticky top-0 z-10 pb-4 pt-4" style={{background: 'color-mix(in srgb, var(--bg-primary) 95%, transparent)', backdropFilter: 'blur(8px)'}}>
          <div className="flex items-center gap-3 max-w-4xl mx-auto">
            <button onClick={closeReader}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
              style={{background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)'}}>
              <ArrowLeft size={16} /> {t('Geri')}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{color: 'var(--text)'}}>{reader.title}</p>
              <p className="text-xs truncate" style={{color: 'var(--text-muted)'}}>{reader.domain}</p>
            </div>
            <a href={reader.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
              style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
              <ExternalLink size={14} /> {t('Orijinal Sayfa')}
            </a>
          </div>
        </div>
        <div className="max-w-3xl mx-auto">
          <article className="prose prose-invert max-w-none px-1" style={{color: 'var(--text)'}}>
            <h1 className="text-2xl font-bold mb-6" style={{color: 'var(--text)'}}>{reader.title}</h1>
            <div
              className="leading-relaxed space-y-4 text-base [&_p]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-5 [&_h3]:font-medium [&_h3]:mt-4 [&_img]:rounded-xl [&_img]:max-w-full [&_img]:my-4 [&_img]:mx-auto [&_img]:block [&_pre]:bg-gray-900 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_pre]:text-sm [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:opacity-80"
              style={{color: 'var(--text-secondary)'}}
              dangerouslySetInnerHTML={{ __html: reader.content }} />
          </article>
        </div>
      </div>
    )
  }

  if (!searched) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-fade-in">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-5">
            <div style={{
              background: 'var(--accent-glow)',
              borderRadius: '1rem',
              padding: '0.75rem',
              display: 'inline-flex',
            }}>
              <GlobeIcon size={28} style={{color: 'var(--accent)'}} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight" style={{color: 'var(--text)'}}>
              {t('Arama')}<span style={{color: 'var(--accent)'}}>{t(' Motoru')}</span>
            </h1>
          </div>
          <p style={{color: 'var(--text-muted)'}} className="text-sm">{t('Web, yerel dosya ve sistem arama')}</p>
        </div>

        <div className="w-full max-w-2xl">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{color: 'var(--text-muted)'}} />
              <input ref={inputRef} value={query} onChange={e => handleInputChange(e.target.value)} onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder={t('Aramak istediginiz seyi yazin...')}
                className="w-full rounded-2xl pl-12 pr-24 py-4 text-base transition-colors"
                style={{
                  background: 'var(--bg-surface)',
                  border: '2px solid var(--border)',
                  color: 'var(--text)',
                }} />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {TABS.map(t => (
                  <button key={t.id} type="button" onClick={() => setTab(t.id)}
                    className="p-2 rounded-lg transition-colors"
                    style={{
                      color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                      background: tab === t.id ? 'var(--accent-glow)' : 'transparent',
                    }}>
                    <t.icon size={16} />
                  </button>
                ))}
              </div>
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div ref={suggestRef} className="absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden z-10 shadow-xl"
                style={{background: 'var(--bg-card)', border: '1px solid var(--border)'}}>
                {suggestions.map((s, i) => (
                  <button key={i} type="button" onClick={() => handleSuggestionClick(s)}
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors"
                    style={{color: 'var(--text-secondary)'}}>
                    <Search size={14} style={{color: 'var(--text-muted)'}} />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </form>

          <div className="flex justify-center gap-4 mt-6 text-xs">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                  background: tab === t.id ? 'var(--accent-glow)' : 'transparent',
                }}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="sticky top-0 z-10 pb-4 pt-4" style={{background: 'color-mix(in srgb, var(--bg-primary) 95%, transparent)', backdropFilter: 'blur(8px)'}}>
        <form onSubmit={handleSubmit} className="relative max-w-3xl">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{color: 'var(--text-muted)'}} />
            <input value={query} onChange={e => handleInputChange(e.target.value)}
              placeholder={t('Ara...')}
              className="w-full rounded-xl pl-10 pr-32 py-2.5 text-sm"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }} />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {TABS.map(t => (
                <button key={t.id} type="button" onClick={() => { setTab(t.id); setSearched(false) }}
                  className="p-1.5 rounded-md text-xs transition-colors"
                  style={{
                    color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                    background: tab === t.id ? 'var(--accent-glow)' : 'transparent',
                  }}>
                  <t.icon size={14} />
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{color: 'var(--accent)'}} />
          <span className="ml-3 text-sm" style={{color: 'var(--text-muted)'}}>{t('Araniyor...')}</span>
        </div>
      ) : error ? (
        <div className="max-w-3xl mx-auto mt-8 p-6 rounded-xl text-center"
          style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)'}}>
          <p style={{color: '#ef4444'}} className="text-sm">{error}</p>
          <button onClick={() => doSearch(query, 1)} className="mt-3 text-xs hover:underline" style={{color: 'var(--accent)'}}>{t('Tekrar dene')}</button>
        </div>
      ) : results ? (
        <div className="max-w-3xl mx-auto">
          <p className="text-xs mb-4" style={{color: 'var(--text-muted)'}}>
            {t('{query} için {total} sonuç').replace('{query}', results.query).replace('{total}', results.total)}
            {tab !== 'local' && results.total > 0 && (
              <span className="ml-2">— {results.total > 10 ? `${Math.ceil(results.total / 10)}` : '1'} {t('sayfa')}</span>
            )}
          </p>

          {tab === 'web' && results.results?.map((r, i) => (
            <div key={i} className="card p-4 mb-3 animate-scale-in"
              style={{animationDelay: `${i * 50}ms`, animationFillMode: 'both'}}>
              <div className="flex items-center gap-2 mb-1">
                {r.favicon ? (
                  <img src={r.favicon} alt="" className="w-4 h-4 rounded shrink-0" onError={(e) => e.target.style.display = 'none'} />
                ) : (
                  <Globe size={14} className="shrink-0" style={{color: 'var(--text-muted)'}} />
                )}
                <span className="text-xs truncate" style={{color: 'var(--text-muted)'}}>{r.domain}</span>
              </div>
              <button onClick={() => openBrowser(r.url)}
                className="text-base font-semibold hover:underline mb-0.5 block text-left"
                style={{color: 'var(--accent)'}}>
                {r.title || r.domain}
              </button>
              {r.snippet && (
                <p className="text-sm leading-relaxed line-clamp-2 mb-2" style={{color: 'var(--text-secondary)'}}>{r.snippet}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => openBrowser(r.url)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
                  style={{color: 'var(--text-muted)'}}>
                  <Globe size={12} /> {t('Sayfada Aç')}
                </button>
                <button onClick={() => openReader(r.url)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
                  style={{color: 'var(--text-muted)'}}>
                  <BookOpenText size={12} /> {t('Oku')}
                </button>
              </div>
            </div>
          ))}

          {readerLoading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background: 'rgba(0,0,0,0.5)'}}>
              <div className="card p-6 flex items-center gap-3">
                <Loader2 size={20} className="animate-spin" style={{color: 'var(--accent)'}} />
                <span className="text-sm" style={{color: 'var(--text-secondary)'}}>{t('Sayfa okunuyor...')}</span>
              </div>
            </div>
          )}

          {readerError && (
            <div className="max-w-3xl mx-auto mt-4 p-4 rounded-lg text-sm"
              style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444'}}>
              {readerError}
            </div>
          )}

          {tab === 'local' && results.results?.map((r, i) => (
            <div key={i} className="card p-4 mb-2">
              <p className="text-xs font-mono truncate" style={{color: 'var(--text-muted)'}}>{r.path}</p>
              <p className="text-sm font-medium mt-0.5" style={{color: 'var(--text)'}}>{r.name}</p>
              {r.snippet && <p className="text-sm mt-1 line-clamp-2" style={{color: 'var(--text-secondary)'}}>{r.snippet}</p>}
            </div>
          ))}

          {tab === 'system' && results.results?.map((cat, ci) => (
            <div key={ci} className="mb-5">
              <h3 className="text-sm font-medium mb-2" style={{color: 'var(--text-secondary)'}}>{cat.category}</h3>
              <div className="space-y-2">
                {cat.items.map((item, ii) => (
                  <div key={ii} className="card p-3">
                    {item.name && <p className="text-sm font-medium" style={{color: 'var(--text)'}}>{item.name}</p>}
                    {item.pid && <p className="text-xs mt-0.5" style={{color: 'var(--text-muted)'}}>PID: {item.pid} | CPU: %{item.cpu} | MEM: %{item.mem}</p>}
                    {item.status && <p className="text-xs mt-0.5" style={{color: 'var(--text-muted)'}}>{t('Durum: ')}{item.status}</p>}
                    {item.repo && <p className="text-xs mt-0.5" style={{color: 'var(--text-muted)'}}>{item.repo}/{item.name} {item.version}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {results.results?.length === 0 && !error && (
            <div className="text-center py-20">
              <p style={{color: 'var(--text-secondary)'}}>{t('Sonuç bulunamadı.')}</p>
              <p className="text-xs mt-1" style={{color: 'var(--text-muted)'}}>{t('Farklı kelimelerle tekrar deneyin.')}</p>
            </div>
          )}

          {tab === 'web' && results.total > 10 && (
            <div className="flex items-center justify-center gap-4 mt-8 mb-12">
              <button disabled={page <= 1} onClick={() => doSearch(query, page - 1)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm disabled:opacity-30 transition-colors"
                style={{background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)'}}>
                <ChevronLeft size={16} /> {t('Önceki')}
              </button>
              <span className="text-sm" style={{color: 'var(--text-muted)'}}>{t('Sayfa {n}').replace('{n}', page)}</span>
              <button disabled={results.results?.length < 10} onClick={() => doSearch(query, page + 1)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm disabled:opacity-30 transition-colors"
                style={{background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)'}}>
                {t('Sonraki')} <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
