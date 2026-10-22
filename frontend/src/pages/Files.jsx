import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { api, authFetch } from '../api'
import { useI18n } from '../context/I18nContext'
import { Notice, jsonOpts } from '../components/ui'
import { Folder, FileText, ArrowLeft, Upload, Trash2, Plus, Search, Edit3, X, HardDrive, FilePen, Archive, PackageOpen, Copy, MoveRight, Save, CheckSquare } from 'lucide-react'

const CodeEditor = lazy(() => import('../components/CodeEditor'))
const ARCHIVE_RE = /\.(tar\.gz|tgz|tar|tar\.bz2|tar\.xz|zip)$/i

function EditorModal({ file, onClose, onSaved }) {
  const { t } = useI18n()
  const [content, setContent] = useState(file.content)
  const [mtime, setMtime] = useState(file.mtime)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({})
  const contentRef = useRef(content)
  contentRef.current = content

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const r = await api('/api/files/write', jsonOpts('PUT', { path: file.path, content: contentRef.current, expected_mtime: mtime }))
      setMtime(r.mtime); setDirty(false)
      setMsg({ kind: 'success', text: t('Kaydedildi') })
      onSaved?.()
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
    setSaving(false)
  }, [file.path, mtime, onSaved, t])

  const close = () => {
    if (dirty && !confirm(t('Kaydedilmemiş değişiklikler var. Kapatılsın mı?'))) return
    onClose()
  }

  // Sayfa kökündeki animasyon transform'u fixed konumlandırmayı bozduğu için body'ye taşınır
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', padding: 'max(12px, env(safe-area-inset-top)) 12px 12px' }}>
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 10, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FilePen size={16} color="var(--accent)" />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.path}{dirty && <span style={{ color: 'var(--yellow)' }}> ●</span>}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ctrl+S</span>
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}><Save size={14} /> {t('Kaydet')}</button>
          <button className="btn btn-secondary btn-icon" onClick={close}><X size={14} /></button>
        </div>
        <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Suspense fallback={<div className="spinner" />}>
            <CodeEditor value={file.content} filename={file.name} onChange={v => { setContent(v); setDirty(true) }} onSave={save} />
          </Suspense>
        </div>
      </div>
    </div>,
    document.body,
  )
}

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
  const [selected, setSelected] = useState(new Set())
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState({})

  const toggleSelect = (p) => setSelected(prev => {
    const next = new Set(prev)
    next.has(p) ? next.delete(p) : next.add(p)
    return next
  })
  useEffect(() => { setSelected(new Set()) }, [path])

  const run = async (fn, okText) => {
    try { const r = await fn(); if (okText) setMsg({ kind: 'success', text: typeof okText === 'function' ? okText(r) : okText }); return r }
    catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }
  const openEditor = async (item) => {
    const r = await run(() => api(`/api/files/read?path=${encodeURIComponent(item.path)}`, { timeout: 20000 }))
    if (!r) return
    if (r.binary) return setMsg({ kind: 'error', text: t('İkili (binary) dosya düzenlenemez') })
    setEditing({ ...r, name: item.name })
  }
  const extract = async (item) => {
    const dest = prompt(t('Nereye açılsın?'), item.path.replace(ARCHIVE_RE, ''))
    if (!dest) return
    await run(() => api('/api/files/extract', { ...jsonOpts('POST', { path: item.path, dest }), timeout: 600000 }), r => `${r.files} ${t('dosya açıldı')} → ${r.dest}`)
    load()
  }
  const paths = [...selected]
  const bulkDelete = async () => {
    if (!confirm(`${paths.length} ${t('öğe silinsin mi?')}`)) return
    await run(() => api('/api/files/bulk-delete', jsonOpts('POST', { paths })), r => `${r.deleted} ${t('öğe silindi')}`)
    setSelected(new Set()); load()
  }
  const bulkArchive = async () => {
    const base = paths.length === 1 ? paths[0].split('/').pop() : 'arsiv'
    const dest = prompt(t('Arşiv yolu (.tar.gz veya .zip):'), `${path.replace(/\/$/, '')}/${base}.tar.gz`)
    if (!dest) return
    await run(() => api('/api/files/archive', { ...jsonOpts('POST', { paths, dest }), timeout: 600000 }), r => `${t('Arşiv oluşturuldu')}: ${r.path}`)
    setSelected(new Set()); load()
  }
  const bulkTransfer = async (move) => {
    const dest = prompt(move ? t('Taşınacak dizin:') : t('Kopyalanacak dizin:'), path)
    if (!dest) return
    await run(() => api(`/api/files/${move ? 'move' : 'copy'}`, { ...jsonOpts('POST', { paths, dest }), timeout: 600000 }),
      r => `${r.paths.length} ${move ? t('öğe taşındı') : t('öğe kopyalandı')}`)
    setSelected(new Set()); load()
  }

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
      try {
        const res = await authFetch(`/api/files/upload?dest=${encodeURIComponent(path)}`, { method: 'POST', body: form })
        if (!res.ok && res.status !== 401) {
          let detail = ''
          try { detail = (await res.json()).detail } catch {}
          setMsg({ kind: 'error', text: `${file.name}: ${detail || res.status}` })
        }
      } catch (e) {
        setMsg({ kind: 'error', text: `${file.name}: ${e.message}` })
      }
    }
    e.target.value = ''
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
      <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>

      {selected.size > 0 && (
        <div className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderColor: 'rgba(6,182,212,0.3)' }}>
          <CheckSquare size={15} color="var(--accent)" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600 }}>{selected.size} {t('seçili')}</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={() => bulkTransfer(false)}><Copy size={13} /> {t('Kopyala')}</button>
          <button className="btn btn-secondary" onClick={() => bulkTransfer(true)}><MoveRight size={13} /> {t('Taşı')}</button>
          <button className="btn btn-secondary" onClick={bulkArchive}><Archive size={13} /> {t('Arşivle')}</button>
          <button className="btn btn-danger" onClick={bulkDelete}><Trash2 size={13} /> {t('Sil')}</button>
          <button className="btn btn-ghost btn-icon" onClick={() => setSelected(new Set())}><X size={14} /></button>
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
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <input type="checkbox" checked={selected.has(item.path)} onChange={() => toggleSelect(item.path)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }} aria-label={item.name} />
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
                    className="touch-active"
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
                {!item.is_dir && ARCHIVE_RE.test(item.name) && (
                  <button onClick={() => extract(item)} className="btn-icon touch-active" title={t('Arşivi aç')}><PackageOpen size={14} /></button>
                )}
                {!item.is_dir && !ARCHIVE_RE.test(item.name) && item.size <= 2 * 1024 * 1024 && (
                  <button onClick={() => openEditor(item)} className="btn-icon touch-active" title={t('Düzenle')}><FilePen size={14} /></button>
                )}
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
              {ARCHIVE_RE.test(selectedItem.name) ? (
                <button onClick={() => { extract(selectedItem); setSelectedItem(null) }} className="btn btn-secondary touch-active"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px 16px' }}>
                  <PackageOpen size={16} /> {t('Arşivi aç')}
                </button>
              ) : selectedItem.size <= 2 * 1024 * 1024 && (
                <button onClick={() => { openEditor(selectedItem); setSelectedItem(null) }} className="btn btn-secondary touch-active"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px 16px' }}>
                  <FilePen size={16} /> {t('Düzenle')}
                </button>
              )}
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

      {editing && <EditorModal file={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}
