import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { PageHeader, Notice, Field, EmptyState, jsonOpts } from '../components/ui'
import { Network, Plus, Pencil, Trash2, ExternalLink, Terminal, RefreshCw, Save, X, Server, WifiOff } from 'lucide-react'

const emptyHost = () => ({ name: '', url: '', token: '', ssh: '', ssh_port: '' })

function Meter({ label, value }) {
  if (value == null) return null
  const color = value >= 90 ? 'var(--red)' : value >= 75 ? 'var(--yellow)' : 'var(--accent)'
  return (
    <div style={{ flex: 1, minWidth: 70 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        <span>{label}</span><span style={{ color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>%{Math.round(value)}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-hover)', overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
    </div>
  )
}

function HostForm({ host, onSave, onCancel }) {
  const { t } = useI18n()
  const [h, setH] = useState({ ...host, token: '' })
  const set = (k, v) => setH(p => ({ ...p, [k]: v }))
  const submit = () => {
    const body = { ...h }
    if (host.id && !h.token) delete body.token // boş bırakılırsa mevcut token korunur
    onSave(body)
  }
  return (
    <div className="card" style={{ padding: 16, borderColor: 'rgba(6,182,212,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        <Field label={t('Ad')}><input value={h.name} onChange={e => set('name', e.target.value)} placeholder="NAS" /></Field>
        <Field label={t('PC Manager adresi')} hint={t('Boş bırakılırsa yalnızca SSH hedefi olur')}>
          <input value={h.url} onChange={e => set('url', e.target.value)} placeholder="http://100.64.0.2:8081" />
        </Field>
        <Field label={t('API token')} hint={host.has_token ? t('Değiştirmek için yeni token girin') : t('O sunucuda Kullanıcılar > Oturumlar & Token sayfasından oluşturun')}>
          <input type="password" value={h.token} onChange={e => set('token', e.target.value)} placeholder={host.has_token ? '••••••••' : ''} />
        </Field>
        <Field label={t('SSH hedefi')}><input value={h.ssh} onChange={e => set('ssh', e.target.value)} placeholder="kullanici@100.64.0.2" /></Field>
        <Field label={t('SSH portu')}><input type="number" value={h.ssh_port ?? ''} onChange={e => set('ssh_port', e.target.value)} placeholder="22" /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancel}><X size={14} /> {t('Vazgeç')}</button>
        <button className="btn btn-primary" onClick={submit}><Save size={14} /> {t('Kaydet')}</button>
      </div>
    </div>
  )
}

export default function Hosts() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [hosts, setHosts] = useState([])
  const [status, setStatus] = useState({})
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState({})
  const [loading, setLoading] = useState(false)

  const loadHosts = useCallback(() => api('/api/hosts').then(setHosts).catch(e => setMsg({ kind: 'error', text: e.message })), [])
  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api('/api/hosts/status', { timeout: 15000 })
      setStatus(Object.fromEntries(res.map(s => [s.id, s])))
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    loadHosts(); loadStatus()
    const id = setInterval(loadStatus, 15000)
    return () => clearInterval(id)
  }, [loadHosts, loadStatus])

  const save = async (h) => {
    try {
      if (h.id) await api(`/api/hosts/${h.id}`, jsonOpts('PUT', h))
      else await api('/api/hosts', jsonOpts('POST', h))
      setEditing(null); await loadHosts(); loadStatus()
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }
  const remove = async (h) => {
    if (!confirm(`${h.name} ${t('silinsin mi?')}`)) return
    try { await api(`/api/hosts/${h.id}`, { method: 'DELETE' }); loadHosts() } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in">
      <PageHeader icon={Network} title={t('Sunucular')}>
        <button className="btn btn-secondary" onClick={loadStatus} disabled={loading}><RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} /></button>
        <button className="btn btn-primary" onClick={() => setEditing(emptyHost())}><Plus size={14} /> {t('Sunucu ekle')}</button>
      </PageHeader>
      <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>
      {editing && !editing.id && <HostForm host={editing} onSave={save} onCancel={() => setEditing(null)} />}
      {!hosts.length && !editing && (
        <EmptyState>{t('Diğer PC Manager kurulumlarınızı (ör. Tailscale üzerinden) ekleyerek hepsini tek ekrandan izleyin ve SSH ile bağlanın.')}</EmptyState>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
        {hosts.map(h => editing?.id === h.id ? (
          <div key={h.id} style={{ gridColumn: '1 / -1' }}><HostForm host={editing} onSave={save} onCancel={() => setEditing(null)} /></div>
        ) : (
          <div key={h.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {status[h.id]?.online === false ? <WifiOff size={16} color="var(--red)" /> : <Server size={16} color="var(--accent)" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{h.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {status[h.id]?.hostname || h.url || h.ssh}
                </div>
              </div>
              {status[h.id]?.online === true && !status[h.id].error && <span className="badge badge-green">{status[h.id].latency_ms} ms</span>}
              {status[h.id]?.online === false && <span className="badge badge-red">{t('Erişilemiyor')}</span>}
            </div>
            {status[h.id]?.error && <div style={{ fontSize: '0.74rem', color: status[h.id].online === false ? 'var(--red)' : 'var(--text-muted)' }}>{status[h.id].error}</div>}
            {status[h.id]?.cpu != null && (
              <div style={{ display: 'flex', gap: 12 }}>
                <Meter label="CPU" value={status[h.id].cpu} />
                <Meter label="RAM" value={status[h.id].memory} />
                <Meter label="Disk" value={status[h.id].disk} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
              {h.url && <a className="btn btn-secondary" href={h.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> {t('Aç')}</a>}
              {h.ssh && <button className="btn btn-secondary" onClick={() => navigate(`/terminal?host=${h.id}`)}><Terminal size={13} /> SSH</button>}
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-icon" title={t('Düzenle')} onClick={() => setEditing({ ...h })}><Pencil size={14} /></button>
              <button className="btn btn-ghost btn-icon" title={t('Sil')} onClick={() => remove(h)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
