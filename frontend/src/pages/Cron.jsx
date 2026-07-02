import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Clock, Plus, Trash2, RefreshCw, AlertCircle } from 'lucide-react'

export default function Cron() {
  const { t } = useI18n()
  const [jobs, setJobs] = useState([])
  const [schedule, setSchedule] = useState('* * * * *')
  const [command, setCommand] = useState('')
  const [error, setError] = useState('')

  const PRESETS = [
    { label: t('Her dakika'),    value: '* * * * *' },
    { label: t('Her 5 dk'),     value: '*/5 * * * *' },
    { label: t('Her 15 dk'),    value: '*/15 * * * *' },
    { label: t('Her saat'),     value: '0 * * * *' },
    { label: t('Her gün (gece)'), value: '0 3 * * *' },
    { label: t('Her Pazartesi'), value: '0 0 * * 1' },
  ]

  const load = async () => {
    try { const res = await api('/api/cron/jobs'); setJobs(res.jobs || []) } catch {}
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!command.trim()) return
    setError('')
    try {
      await api('/api/cron/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: schedule.trim(), command: command.trim() }),
      })
      setCommand(''); load()
    } catch (e) { setError(e.message) }
  }

  const remove = async (cmd) => {
    try { await api(`/api/cron/jobs?command=${encodeURIComponent(cmd)}`, { method: 'DELETE' }); load() }
    catch (e) { setError(e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Clock size={18} color="var(--accent)" /></span>
          {t('Cron Zamanlayıcı')}
        </h2>
        <button onClick={load} className="btn btn-secondary"><RefreshCw size={14} /> {t('Yenile')}</button>
      </div>

      {/* Add form */}
      <div className="card card-glow" style={{ padding: 22 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)', marginBottom: 16 }}>
          {t('Yeni Zamanlanmış Görev')}
        </div>

        {/* Preset pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {PRESETS.map(p => (
            <button key={p.value} onClick={() => setSchedule(p.value)} style={{
              padding: '4px 12px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s ease', border: '1px solid',
              background: schedule === p.value ? 'var(--accent-glow)' : 'var(--bg-elevated)',
              color: schedule === p.value ? 'var(--accent)' : 'var(--text-muted)',
              borderColor: schedule === p.value ? 'rgba(6,182,212,0.3)' : 'var(--border)',
            }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input value={schedule} onChange={e => setSchedule(e.target.value)}
            placeholder="* * * * *"
            style={{ width: 160, fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem' }}
          />
          <input value={command} onChange={e => setCommand(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder={t('Komut (örn: /usr/bin/backup.sh)')}
            style={{ flex: 1, minWidth: 200, fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem' }}
          />
          <button onClick={add} disabled={!command.trim()} className="btn btn-primary">
            <Plus size={14} /> {t('Ekle')}
          </button>
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, marginTop: 8,
            background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 9, padding: '8px 12px',
            color: 'var(--red)', fontSize: '0.78rem',
          }}>
            <AlertCircle size={13} /> {error}
          </div>
        )}
      </div>

      {/* Jobs list */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '11px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={14} color="var(--text-muted)" />
            <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {t('Zamanlanmış Görevler')}
            </span>
          </div>
          <span className="badge badge-cyan">{jobs.length}</span>
        </div>

        {jobs.length === 0 ? (
          <div className="empty-state">
            <Clock size={32} color="var(--text-muted)" style={{ opacity: 0.4 }} />
            <span>{t('Hiç cron job yok')}</span>
            <span style={{ fontSize: '0.75rem' }}>{t('Yukarıdan yeni bir görev ekleyin')}</span>
          </div>
        ) : (
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {jobs.map((job, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 18px', borderBottom: '1px solid var(--border)',
                transition: 'background 0.12s', gap: 12,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                    <code style={{
                      fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem',
                      background: 'var(--accent-glow2)', color: 'var(--accent)',
                      padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(6,182,212,0.2)',
                    }}>
                      {job.schedule}
                    </code>
                    {job.schedule_desc && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{job.schedule_desc}</span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem',
                    color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {job.command}
                  </div>
                </div>
                <button onClick={() => remove(job.command)} className="btn-icon danger" style={{ flexShrink: 0 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
