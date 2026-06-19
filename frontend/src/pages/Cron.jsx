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
    { label: t('Her dakika'), value: '* * * * *' },
    { label: t('Her 5 dk'), value: '*/5 * * * *' },
    { label: t('Her 15 dk'), value: '*/15 * * * *' },
    { label: t('Her saat'), value: '0 * * * *' },
    { label: t('Her gün (gece)'), value: '0 3 * * *' },
    { label: t('Her Pazartesi'), value: '0 0 * * 1' },
  ]

  const load = async () => {
    try {
      const res = await api('/api/cron/jobs')
      setJobs(res.jobs || [])
    } catch {}
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
      setCommand('')
      load()
    } catch (e) { setError(e.message) }
  }

  const remove = async (cmd) => {
    try {
      await api(`/api/cron/jobs?command=${encodeURIComponent(cmd)}`, { method: 'DELETE' })
      load()
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-cyan-400" />
          <h2 className="text-xl sm:text-2xl font-semibold">{t('Cron Zamanlayıcı')}</h2>
        </div>
        <button onClick={load} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
        <h3 className="text-sm font-medium mb-3">{t('Yeni Zamanlanmış Görev')}</h3>

        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map(p => (
            <button key={p.value} onClick={() => setSchedule(p.value)}
              className={`px-2.5 py-1 text-xs rounded-lg border ${schedule === p.value ? 'border-cyan-700 bg-cyan-900/30 text-cyan-300' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <input value={schedule} onChange={e => setSchedule(e.target.value)}
            placeholder={t('Zaman (örn: * * * * *)')}
            className="w-full sm:w-44 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-cyan-700" />
          <input value={command} onChange={e => setCommand(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder={t('Komut (örn: /usr/bin/backup.sh)')}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-700" />
          <button onClick={add} disabled={!command.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-cyan-700 rounded-lg hover:bg-cyan-600 disabled:opacity-40 text-sm font-medium whitespace-nowrap">
            <Plus size={14} /> {t('Ekle')}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 mt-1">
            <AlertCircle size={12} /> {error}
          </div>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="px-4 py-2.5 border-b border-gray-800 text-xs text-gray-500 font-medium uppercase tracking-wider flex items-center justify-between">
          <span>{t('Zamanlanmış Görevler')} ({jobs.length})</span>
        </div>
        {jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            <Clock size={32} className="mx-auto mb-2 opacity-30" />
            <p>{t('Hiç cron job yok')}</p>
            <p className="text-xs mt-1">{t('Yukarıdan yeni bir görev ekleyin')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800 max-h-[500px] overflow-y-auto">
            {jobs.map((job, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono text-cyan-400 bg-cyan-950/50 px-1.5 py-0.5 rounded">{job.schedule}</code>
                    <span className="text-[10px] text-gray-600">{job.schedule_desc}</span>
                  </div>
                  <div className="text-sm mt-1 font-mono text-gray-300 truncate">{job.command}</div>
                </div>
                <button onClick={() => remove(job.command)} className="p-1.5 text-gray-600 hover:text-red-400 shrink-0 ml-2">
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
