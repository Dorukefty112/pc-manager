import { useState, useEffect, useCallback } from 'react'
import { api, isAdmin } from '../api'
import { useI18n } from '../context/I18nContext'
import { PageHeader, Section, Notice, Field, EmptyState, fmtDate, jsonOpts } from '../components/ui'
import Toggle from '../components/Toggle'
import { Bell, Plus, Trash2, Save, Send, Pencil, X, FlaskConical, History, CheckCircle2, AlertTriangle, Circle } from 'lucide-react'

const emptyRule = () => ({ id: '', name: '', metric: 'cpu', op: '>', threshold: 90, duration: 120, cooldown: 30, target: '', enabled: true, notify_resolved: true })

function StateBadge({ st }) {
  const { t } = useI18n()
  if (!st) return <span className="badge badge-gray"><Circle size={9} /> {t('Bekleniyor')}</span>
  if (st.firing) return <span className="badge badge-red"><AlertTriangle size={10} /> {t('Alarmda')}</span>
  if (st.since) return <span className="badge badge-yellow"><AlertTriangle size={10} /> {t('Eşik aşıldı')}</span>
  return <span className="badge badge-green"><CheckCircle2 size={10} /> {t('Normal')}</span>
}

function RuleEditor({ rule, metrics, onSave, onCancel }) {
  const { t } = useI18n()
  const [r, setR] = useState(rule)
  const [probe, setProbe] = useState(null)
  const spec = metrics[r.metric] || {}
  const set = (k, v) => setR(prev => ({ ...prev, [k]: v }))

  const tryIt = async () => {
    try { setProbe(await api('/api/notifications/rules/check', jsonOpts('POST', r))) }
    catch (e) { setProbe({ error: e.message }) }
  }

  return (
    <div className="card" style={{ padding: 16, borderColor: 'rgba(6,182,212,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label={t('Ad')}><input value={r.name} placeholder={spec.label} onChange={e => set('name', e.target.value)} /></Field>
        <Field label={t('Metrik')}>
          <select value={r.metric} onChange={e => set('metric', e.target.value)}>
            {Object.entries(metrics).map(([k, m]) => <option key={k} value={k}>{t(m.label)}</option>)}
          </select>
        </Field>
        {spec.target && (
          <Field label={t('Hedef')}><input value={r.target} placeholder={t(spec.target)} onChange={e => set('target', e.target.value)} /></Field>
        )}
        {spec.needs_threshold && (
          <Field label={`${t('Koşul')} ${spec.unit ? `(${spec.unit})` : ''}`}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={r.op} onChange={e => set('op', e.target.value)} style={{ width: 60 }}>
                <option value=">">&gt;</option><option value="<">&lt;</option>
              </select>
              <input type="number" value={r.threshold} onChange={e => set('threshold', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            </div>
          </Field>
        )}
        <Field label={t('Süre (sn)')} hint={t('Koşul bu kadar sürerse tetiklenir')}>
          <input type="number" min={0} value={r.duration} onChange={e => set('duration', e.target.value)} />
        </Field>
        <Field label={t('Tekrar (dk)')} hint={t('Alarm sürerken hatırlatma aralığı')}>
          <input type="number" min={1} value={r.cooldown} onChange={e => set('cooldown', e.target.value)} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Toggle checked={r.enabled} onChange={() => set('enabled', !r.enabled)} /> {t('Etkin')}</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Toggle checked={r.notify_resolved} onChange={() => set('notify_resolved', !r.notify_resolved)} /> {t('Düzelince bildir')}</label>
        {probe && (
          <span style={{ color: probe.error ? 'var(--red)' : probe.hit ? 'var(--orange)' : 'var(--green)' }}>
            {probe.error || `${t('Şu an')}: ${probe.value} — ${probe.hit ? t('koşul sağlanıyor') : t('koşul sağlanmıyor')}`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={tryIt}><FlaskConical size={14} /> {t('Dene')}</button>
        <button className="btn btn-secondary" onClick={onCancel}><X size={14} /> {t('Vazgeç')}</button>
        <button className="btn btn-primary" onClick={() => onSave({ ...r, threshold: Number(r.threshold), duration: Number(r.duration), cooldown: Number(r.cooldown) })}>
          <Save size={14} /> {t('Kaydet')}
        </button>
      </div>
    </div>
  )
}

export default function Alerts() {
  const { t } = useI18n()
  const admin = isAdmin()
  const [rules, setRules] = useState([])
  const [metrics, setMetrics] = useState({})
  const [state, setState] = useState({})
  const [history, setHistory] = useState([])
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState({})

  const load = useCallback(async () => {
    try {
      const r = await api('/api/notifications/rules')
      setRules(r.rules); setMetrics(r.metrics)
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
    api('/api/notifications/history').then(setHistory).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const poll = () => api('/api/notifications/rules/state').then(setState).catch(() => {})
    poll()
    const id = setInterval(poll, 10000)
    return () => clearInterval(id)
  }, [])

  const persist = async (next) => {
    try {
      const r = await api('/api/notifications/rules', jsonOpts('PUT', { rules: next }))
      setRules(r.rules); setEditing(null)
      setMsg({ kind: 'success', text: t('Kurallar kaydedildi') })
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const saveRule = (rule) => {
    const exists = rules.some(r => r.id === rule.id && rule.id)
    persist(exists ? rules.map(r => (r.id === rule.id ? rule : r)) : [...rules, rule])
  }

  const toggleRule = (rule) => persist(rules.map(r => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)))
  const removeRule = (rule) => { if (confirm(`"${rule.name}" ${t('silinsin mi?')}`)) persist(rules.filter(r => r.id !== rule.id)) }

  const testSend = async () => {
    try {
      const r = await api('/api/notifications/test', { method: 'POST', timeout: 30000 })
      setMsg(r.success
        ? { kind: 'success', text: `${t('Test bildirimi gönderildi')}: ${r.sent_to.join(', ')}` }
        : { kind: 'error', text: t('Hiçbir kanala gönderilemedi. Ayarlar > Bildirimler bölümünden Telegram/e-posta/webhook yapılandırın.') })
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const clearHistory = async () => {
    await api('/api/notifications/history', { method: 'DELETE' }).catch(() => {})
    setHistory([])
  }

  const describe = (r) => {
    const m = metrics[r.metric] || {}
    const target = r.target ? ` (${r.target})` : ''
    const cond = m.needs_threshold ? ` ${r.op} ${r.threshold}${m.unit}` : ''
    const dur = r.duration ? `, ${r.duration} ${t('sn boyunca')}` : ''
    return `${t(m.label || r.metric)}${target}${cond}${dur}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in">
      <PageHeader icon={Bell} title={t('Alarm Kuralları')}>
        {admin && <button className="btn btn-secondary" onClick={testSend}><Send size={14} /> {t('Test bildirimi')}</button>}
        {admin && <button className="btn btn-primary" onClick={() => setEditing(emptyRule())}><Plus size={14} /> {t('Yeni kural')}</button>}
      </PageHeader>
      <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>

      {editing && !editing.id && <RuleEditor rule={editing} metrics={metrics} onSave={saveRule} onCancel={() => setEditing(null)} />}

      <Section title={t('Kurallar')} icon={Bell}>
        {!rules.length && <EmptyState>{t('Kural yok')}</EmptyState>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map(r => editing && editing.id === r.id ? (
            <RuleEditor key={r.id} rule={editing} metrics={metrics} onSave={saveRule} onCancel={() => setEditing(null)} />
          ) : (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg-elevated)', opacity: r.enabled ? 1 : 0.55, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.85rem' }}>{r.name}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{describe(r)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {r.enabled && state[r.id]?.value && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>{state[r.id].value}</span>}
                {r.enabled ? <StateBadge st={state[r.id]} /> : <span className="badge badge-gray">{t('Kapalı')}</span>}
                {admin && <>
                  <Toggle checked={r.enabled} onChange={() => toggleRule(r)} />
                  <button className="btn btn-ghost btn-icon" title={t('Düzenle')} onClick={() => setEditing({ ...r })}><Pencil size={14} /></button>
                  <button className="btn btn-ghost btn-icon" title={t('Sil')} onClick={() => removeRule(r)}><Trash2 size={14} /></button>
                </>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('Alarm Geçmişi')} icon={History} actions={admin && history.length > 0 && (
        <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: '0.75rem' }} onClick={clearHistory}><Trash2 size={12} /> {t('Temizle')}</button>
      )}>
        {!history.length ? <EmptyState>{t('Henüz alarm yok.')}</EmptyState> : (
          <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
            <table>
              <thead><tr><th>{t('Zaman')}</th><th>{t('Kural')}</th><th>{t('Durum')}</th><th>{t('Değer')}</th><th>{t('Gönderilen')}</th></tr></thead>
              <tbody>{history.map((h, i) => (
                <tr key={i}>
                  <td className="mono">{fmtDate(h.time)}</td>
                  <td className="primary">{h.name || h.type}</td>
                  <td>{h.state === 'resolved'
                    ? <span className="badge badge-green">{t('Düzeldi')}</span>
                    : <span className="badge badge-red">{t('Alarm')}</span>}</td>
                  <td className="mono">{h.value}</td>
                  <td>{(h.sent_to || []).join(', ') || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
