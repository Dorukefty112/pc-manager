import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'
import { api, getServerBase } from '../api'
import XtermSession from '../components/XtermSession'
import { fmtDate, fmtBytes, EmptyState } from '../components/ui'
import { Terminal as TerminalIcon, History, X, Trash2, Play, RefreshCw } from 'lucide-react'

const QUICK_KEYS = [
  ['Ctrl+C', '\x03'], ['Tab', '\t'], ['▲ Üst', '\x1b[A'], ['▼ Alt', '\x1b[B'],
  ['ls -la', 'ls -la\r'], ['clear', 'clear\r'], ['htop', 'htop\r'],
]

function Recordings({ onClose }) {
  const { t } = useI18n()
  const [items, setItems] = useState(null)
  const [playing, setPlaying] = useState(null)

  const load = useCallback(() => { api('/api/terminal/recordings').then(setItems).catch(() => setItems([])) }, [])
  useEffect(load, [load])

  const play = async (rec) => {
    try {
      const res = await api(`/api/terminal/recordings/${rec.id}`, { raw: true, timeout: 30000 })
      setPlaying({ rec, data: await res.text() })
    } catch {}
  }
  const remove = async (rec) => {
    if (!confirm(t('Kayıt silinsin mi?'))) return
    await api(`/api/terminal/recordings/${rec.id}`, { method: 'DELETE' }).catch(() => {})
    if (playing?.rec.id === rec.id) setPlaying(null)
    load()
  }

  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <History size={15} color="var(--accent)" /> {t('Oturum kayıtları')}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost btn-icon" onClick={load}><RefreshCw size={13} /></button>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        {t('Terminal ve konteyner oturumlarının çıktısı kaydedilir (oturum başına 5 MB, son 50 oturum). Ayarlar > config.json içinde terminal.record=false ile kapatılabilir.')}
      </div>
      {items === null ? <div className="spinner" /> : !items.length ? <EmptyState>{t('Kayıt yok')}</EmptyState> : (
        <div className="table-wrap" style={{ maxHeight: 220, overflow: 'auto' }}>
          <table>
            <thead><tr><th>{t('Başlangıç')}</th><th>{t('Kullanıcı')}</th><th>{t('Oturum')}</th><th>{t('Boyut')}</th><th /></tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} style={playing?.rec.id === r.id ? { background: 'var(--bg-hover)' } : undefined}>
                <td className="mono">{fmtDate(r.started)}</td>
                <td>{r.username}</td>
                <td className="mono">{r.label}{!r.ended && <span className="badge badge-green" style={{ marginLeft: 6 }}>{t('açık')}</span>}</td>
                <td>{fmtBytes(r.size)}{r.truncated ? ' +' : ''}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-icon" title={t('Oynat')} onClick={() => play(r)}><Play size={13} /></button>
                  <button className="btn btn-ghost btn-icon" title={t('Sil')} onClick={() => remove(r)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {playing && (
        <div style={{ height: 300, background: '#020812', borderRadius: 10, padding: 6, border: '1px solid var(--border)' }}>
          <XtermSession key={playing.rec.id} initialData={playing.data} />
        </div>
      )}
    </div>
  )
}

export default function Terminal() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const [hosts, setHosts] = useState([])
  const [connected, setConnected] = useState(false)
  const [showRec, setShowRec] = useState(false)
  const sessionRef = useRef(null)
  const host = params.get('host') || ''

  useEffect(() => {
    api('/api/hosts').then(list => setHosts(list.filter(h => h.ssh))).catch(() => {})
  }, [])

  const target = hosts.find(h => h.id === host)
  const hostLabel = target ? `ssh ${target.ssh}` : `bash — ${getServerBase().replace(/^https?:\/\//, '') || location.host}`
  const path = host ? `/api/terminal?host=${encodeURIComponent(host)}` : '/api/terminal'
  const send = data => sessionRef.current?.send(data)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 10, flexWrap: 'wrap' }}>
        <h2 className="page-title">
          <span className="page-title-icon" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <TerminalIcon size={18} color="#22c55e" />
          </span>
          {t('Terminal')}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {hosts.length > 0 && (
            <select value={host} onChange={e => setParams(e.target.value ? { host: e.target.value } : {})} style={{ fontSize: '0.78rem', padding: '5px 10px' }}>
              <option value="">{t('Bu sunucu')}</option>
              {hosts.map(h => <option key={h.id} value={h.id}>SSH · {h.name}</option>)}
            </select>
          )}
          <button className={`btn ${showRec ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowRec(v => !v)} style={{ padding: '5px 12px' }}>
            <History size={13} /> {t('Kayıtlar')}
          </button>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600,
            background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: connected ? '#22c55e' : '#ef4444',
            border: `1px solid ${connected ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: connected ? '#22c55e' : '#ef4444',
              boxShadow: connected ? '0 0 6px #22c55e' : 'none',
            }} />
            {connected ? t('Bağlı') : t('Bağlantı Kesik')}
          </span>
        </div>
      </div>

      {showRec && <Recordings onClose={() => setShowRec(false)} />}

      {/* Terminal wrapper */}
      <div style={{
        flex: 1, minHeight: 320, position: 'relative',
        background: '#020812',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Traffic light */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'rgba(255,255,255,0.02)', flexShrink: 0,
        }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', opacity: 0.7 }} />
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', opacity: 0.7 }} />
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e', opacity: 0.7 }} />
          <span style={{ marginLeft: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>
            {hostLabel}
          </span>
        </div>
        <div style={{ height: 'calc(100% - 37px)' }}>
          <XtermSession
            key={path}
            ref={sessionRef}
            path={path}
            reconnect={!host}
            onStatus={setConnected}
            reconnectingText={t('Bağlantı koptu, yeniden bağlanılıyor...')}
            closedText={t('Oturum kapandı.')}
          />
        </div>
      </div>

      {/* Mobile Quick Keys Toolbar */}
      <div className="mobile-quick-toolbar" style={{
        display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto',
        padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, scrollbarWidth: 'none', flexShrink: 0,
      }}>
        <style>{`
          .mobile-quick-btn {
            display: flex; align-items: center; justify-content: center;
            padding: 6px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;
            font-family: 'JetBrains Mono', monospace; background: var(--bg-hover);
            color: var(--text-secondary); border: 1px solid var(--border-light);
            white-space: nowrap; cursor: pointer;
          }
          .mobile-quick-btn:active { background: var(--accent-glow); color: var(--accent); }
        `}</style>
        {QUICK_KEYS.map(([label, data]) => (
          <button key={label} className="mobile-quick-btn touch-active" onClick={() => send(data)}>{label}</button>
        ))}
      </div>
    </div>
  )
}
