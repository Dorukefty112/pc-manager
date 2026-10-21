import { useState, useEffect, useCallback } from 'react'
import { api, isAdmin } from '../api'
import { useI18n } from '../context/I18nContext'
import { Section, Notice, EmptyState, fmtDate } from './ui'
import Toggle from './Toggle'
import { Timer, Play, RefreshCw } from 'lucide-react'

function relative(ts, t) {
  if (!ts) return '—'
  const diff = ts - Date.now() / 1000
  const abs = Math.abs(diff)
  const txt = abs < 3600 ? `${Math.round(abs / 60)} ${t('dk')}` : abs < 86400 ? `${Math.round(abs / 3600)} ${t('sa')}` : `${Math.round(abs / 86400)} ${t('gün')}`
  return diff >= 0 ? `${txt} ${t('sonra')}` : `${txt} ${t('önce')}`
}

export default function SystemdTimers() {
  const { t } = useI18n()
  const admin = isAdmin()
  const [timers, setTimers] = useState(null)
  const [msg, setMsg] = useState({})
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    api('/api/services/timers', { timeout: 20000 }).then(setTimers).catch(e => { setTimers([]); setMsg({ kind: 'error', text: e.message }) })
  }, [])
  useEffect(load, [load])

  const act = async (timer, action) => {
    setBusy(timer.name + action)
    try {
      await api(`/api/services/timers/${encodeURIComponent(timer.name)}/${action}`, { method: 'POST', timeout: 30000 })
      if (action === 'run') setMsg({ kind: 'success', text: `${timer.activates} ${t('başlatıldı')}` })
      load()
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
    setBusy('')
  }

  return (
    <Section title={t('systemd Zamanlayıcıları')} icon={Timer} actions={<button className="btn btn-secondary" onClick={load}><RefreshCw size={13} /></button>}>
      <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>
      {timers === null ? <div className="spinner" /> : !timers.length ? <EmptyState>{t('Zamanlayıcı bulunamadı (systemd çalışmıyor olabilir)')}</EmptyState> : (
        <div className="table-wrap" style={{ marginTop: msg.text ? 10 : 0 }}>
          <table>
            <thead><tr><th>{t('Zamanlayıcı')}</th><th>{t('Takvim')}</th><th>{t('Sonraki')}</th><th>{t('Son')}</th><th>{t('Etkin')}</th><th /></tr></thead>
            <tbody>{timers.map(tm => (
              <tr key={tm.name}>
                <td>
                  <div className="primary" style={{ color: 'var(--text)', fontWeight: 500 }}>{tm.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tm.description} → {tm.activates}</div>
                </td>
                <td className="mono">{tm.schedule || '—'}</td>
                <td title={fmtDate(tm.next)}>{relative(tm.next, t)}</td>
                <td title={fmtDate(tm.last)}>{relative(tm.last, t)}</td>
                <td>
                  {admin && ['enabled', 'disabled'].includes(tm.enabled)
                    ? <Toggle checked={tm.enabled === 'enabled'} onChange={() => act(tm, tm.enabled === 'enabled' ? 'disable' : 'enable')} />
                    : <span className="badge badge-gray">{tm.enabled}</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {admin && <button className="btn btn-ghost btn-icon" title={t('Şimdi çalıştır')} disabled={busy === tm.name + 'run'} onClick={() => act(tm, 'run')}><Play size={13} /></button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
