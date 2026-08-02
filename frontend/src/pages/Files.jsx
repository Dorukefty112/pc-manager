import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, API } from '../api'
import { useI18n } from '../context/I18nContext'
import { Folder, FileText, ArrowLeft, Upload, Trash2, Plus, Search, Edit3, X, HardDrive } from 'lucide-react'

export default function Files() {
  const { t } = useI18n()
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
      setError(''); setSearchResults(null)
      const res = await api(`/api/files/list?path=${encodeURIComponent(path)}`)
      setData(res)
    } catch (e) { setError(e.message) }
  }, [path])

  useEffect(() => { load() }, [load])

  const navigate = (p) => setSearchParams({ path: p })
  const del = async (itemPath) => {
    if (!confirm(t('Silmek istediğine emin misin?'))) return
    await api(`/api/files/delete?path=${encodeURIComponent(itemPath)}`, { method: 'DELETE' })
    load()
  }
  const upload = async (e) => {
    const files = e.target.files
    if (!files?.length) return
    for (const file of files) {
      const form = new FormData(); form.append('file', file)
      const token = localStorage.getItem('pcmanager_token')
      await fetch(`${API}/api/files/upload?dest=${encodeURIComponent(path)}`, { method: 'POST', body: form, headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    }
    load()
  }
  const mkdir = async () => {
    const name = prompt(t('Dizin adı:')); if (!name) return
    await api(`/api/files/mkdir?path=${encodeURIComponent(path + '/' + name)}`, { method: 'POST' })
    load()
  }
  const startRename = (item) => { setRenaming(item.path); setRenameVal(item.name) }
  const doRename = async () => {
    if (!renaming || !renameVal) return
    await api(`/api/files/rename?path=${encodeURIComponent(renaming)}&new_name=${encodeURIComponent(renameVal)}`, { method: 'PUT' })
    setRenaming(null); load()
  }
  const doSearch = async () => {
    if (!searchQ.trim()) return
    try { const res = await api(`/api/files/search?q=${encodeURIComponent(searchQ)}&root=${encodeURIComponent(path)}`); setSearchResults(res) } catch {}
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

  const [selectedItem, setSelectedItem] = useState(null)

  const downloadFile = (item) => {
    api(`/api/files/download?path=${encodeURIComponent(item.path)}`, { raw: true })
      .then(r => r.blob()).then(b => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = item.name; a.click()
      })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Folder size={18} color="var(--accent)" /></span>
          {t('Dosyalar')}
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrap" style={{ width: 160 }}>
            <Search size={13} className="search-icon" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder={t('Ara...')} />
          </div>
          <label className="btn btn-secondary touch-active" style={{ cursor: 'pointer' }}>
            <Upload size={14} /> {t('Yükle')}
            <input type="file" style={{ display: 'none' }} ref={uploadRef} onChange={upload} multiple />
          </label>
          <button onClick={mkdir} className="btn btn-secondary touch-active">
            <Plus size={14} /> {t('Dizin')}
          </button>
        </div>
      </div>

      {/* Quick nav */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['/', t('Kök')], ['/mnt/c', 'Windows (C:)'], ['/mnt', '/mnt']].map(([p, label]) => (
          <button key={p} onClick={() => navigate(p)} className="touch-active" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
            borderRadius: 8, fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
            background: path === p ? 'var(--accent-glow)' : 'var(--bg-elevated)',
            color: path === p ? 'var(--accent)' : 'var(--text-secondary)',
            border: `1px solid ${path === p ? 'rgba(6,182,212,0.3)' : 'var(--border)'}`,
            transition: 'all 0.15s ease',
          }}>
            <HardDrive size={13} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', color: 'var(--red)', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {/* File browser */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Breadcrumb bar */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.02)',
        }}>
          {data?.parent && !searchResults && (
            <button onClick={() => navigate(data.parent)} className="btn-icon touch-active" style={{ flexShrink: 0 }}>
              <ArrowLeft size={14} />
            </button>
          )}
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {searchResults ? `${t('Arama:')} "${searchQ}"` : path}
          </span>
          {searchResults && (
            <button onClick={() => { setSearchResults(null); setSearchQ('') }} className="btn-icon touch-active">
              <X size={13} />
            </button>
          )}
        </div>

        {/* File list */}
        <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          {(searchResults || data?.items)?.map(item => (
            <div key={item.path} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderBottom: '1px solid var(--border)',
              transition: 'background 0.12s',
            }}
              className="touch-active"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                {item.is_dir
                  ? <Folder size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
                  : <FileText size={18} color="#60a5fa" style={{ flexShrink: 0 }} />
                }
                {renaming === item.path ? (
                  <input autoFocus value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenaming(null) }}
                    onBlur={doRename}
                    style={{ flex: 1, borderRadius: 7, padding: '4px 10px', fontSize: '0.85rem' }}
                  />
                ) : (
                  <button
                    onClick={() => {
                      if (item.is_dir && !searchResults) { navigate(item.path) }
                      else if (!item.is_dir) { setSelectedItem(item) }
                    }}
                    style={{
                      flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.85rem', fontWeight: item.is_dir ? 600 : 400,
                      color: item.is_dir ? 'var(--text)' : 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      padding: '2px 0',
                    }}
                  >
                    {item.name}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
                {!item.is_dir && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono',monospace" }}>{fmt(item.size)}</span>}
                <button onClick={() => startRename(item)} className="btn-icon touch-active">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => del(item.path)} className="btn-icon danger touch-active">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {(searchResults?.length === 0 || data?.items?.length === 0) && (
            <div className="table-empty">{t('Sonuç bulunamadı')}</div>
          )}
        </div>
      </div>

      {/* Mobile File Action Sheet */}
      {selectedItem && (
        <div className="sheet-backdrop" style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }} onClick={() => setSelectedItem(null)}>
          <div className="sheet-container pb-safe" style={{ padding: '0 20px 24px' }} onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <FileText size={20} color="#60a5fa" />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }} className="truncate">{selectedItem.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmt(selectedItem.size)}</div>
              </div>
              <button onClick={() => setSelectedItem(null)} className="btn-ghost touch-active" style={{ padding: 6, borderRadius: '50%' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { downloadFile(selectedItem); setSelectedItem(null) }}
                className="btn btn-primary touch-active"
                style={{ width: '100%', justifyContent: 'center', padding: '12px 16px' }}
              >
                <Upload size={16} style={{ transform: 'rotate(180deg)' }} /> İndir
              </button>
              <button
                onClick={() => { startRename(selectedItem); setSelectedItem(null) }}
                className="btn btn-secondary touch-active"
                style={{ width: '100%', justifyContent: 'center', padding: '12px 16px' }}
              >
                <Edit3 size={16} /> Yeniden Adlandır
              </button>
              <button
                onClick={() => { del(selectedItem.path); setSelectedItem(null) }}
                className="btn btn-secondary touch-active"
                style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', color: 'var(--red)' }}
              >
                <Trash2 size={16} /> Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
