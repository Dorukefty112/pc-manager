import { useState, useEffect, useCallback, Fragment } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { PageHeader, Section, Notice, Field, EmptyState, fmtDate, fmtBytes, jsonOpts } from '../components/ui'
import Toggle from '../components/Toggle'
import {
  Archive, Plus, Play, Pencil, Trash2, Download, RotateCcw, RefreshCw, X, Save,
  FolderTree, ChevronDown, ChevronRight, Sparkles,
} from 'lucide-react'

const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const emptyJob = () => ({ name: '', sources: [], dest: '/var/backups/pc-manager', excludes: ['*.log', 'node_modules', '__pycache__'], schedule: 'daily', time: '03:00', weekday: 0, keep: 7, enabled: true })

function scheduleText(job, t) {
  if (job.schedule === 'manual') return t('Manuel')
  if (job.schedule === 'hourly') return t('Saatlik')
  if (job.schedule === 'weekly') return `${t('Haftalık')} · ${t(WEEKDAYS[job.weekday])} ${job.time}`
  return `${t('Günlük')} · ${job.time}`
}

function RunBadge({ run, running }) {
  const { t } = useI18n()
  if (running) return <span className="badge badge-cyan"><div className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }} /> {t('Çalışıyor')}</span>
  if (!run) return <span className="badge badge-gray">{t('Hiç çalışmadı')}</span>
  if (run.status === 'success') return <span className="badge badge-green">{t('Başarılı')}</span>
  if (run.status === 'failed') return <span className="badge badge-red" title={run.error}>{t('Hata')}</span>
  return <span className="badge badge-yellow">{run.status}</span>
}

function JobEditor({ job, onSave, onCancel }) {
  const { t } = useI18n()
  const [j, setJ] = useState({ ...job, sourcesText: job.sources.join('\n'), excludesText: job.excludes.join('\n') })
  const set = (k, v) => setJ(prev => ({ ...prev, [k]: v }))
  const submit = () => {
    const { sourcesText, excludesText, running, last_run, ...rest } = j
    onSave({
      ...rest,
      sources: sourcesText.split('\n').map(s => s.trim()).filter(Boolean),
      excludes: excludesText.split('\n').map(s => s.trim()).filter(Boolean),
      keep: Number(j.keep), weekday: Number(j.weekday),
    })
  }
  return (
    <div className="card" style={{ padding: 16, borderColor: 'rgba(6,182,212,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <Field label={t('Görev adı')}><input value={j.name} onChange={e => set('name', e.target.value)} placeholder={t('Örn: Web sunucusu')} /></Field>
        <Field label={t('Hedef dizin')}><input value={j.dest} onChange={e => set('dest', e.target.value)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }} /></Field>
        <Field label={t('Zamanlama')}>
          <select value={j.schedule} onChange={e => set('schedule', e.target.value)}>
            <option value="manual">{t('Manuel')}</option>
            <option value="hourly">{t('Saatlik')}</option>
            <option value="daily">{t('Günlük')}</option>
            <option value="weekly">{t('Haftalık')}</option>
          </select>
        </Field>
        {(j.schedule === 'daily' || j.schedule === 'weekly') && (
          <Field label={t('Saat')}><input type="time" value={j.time} onChange={e => set('time', e.target.value)} /></Field>
        )}
        {j.schedule === 'weekly' && (
          <Field label={t('Gün')}>
            <select value={j.weekday} onChange={e => set('weekday', e.target.value)}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('Saklanacak arşiv sayısı')}><input type="number" min={1} max={365} value={j.keep} onChange={e => set('keep', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        <Field label={t('Kaynak yollar (her satıra bir mutlak yol)')}>
          <textarea rows={4} value={j.sourcesText} onChange={e => set('sourcesText', e.target.value)} placeholder={'/etc/nginx\n/home/kullanici/projeler'} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem' }} />
        </Field>
        <Field label={t('Hariç tutulacaklar (glob deseni)')}>
          <textarea rows={4} value={j.excludesText} onChange={e => set('excludesText', e.target.value)} placeholder={'*.log\nnode_modules'} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem' }} />
        </Field>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <Toggle checked={j.enabled} onChange={() => set('enabled', !j.enabled)} /> {t('Zamanlama etkin')}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onCancel}><X size={14} /> {t('Vazgeç')}</button>
          <button className="btn btn-primary" onClick={submit}><Save size={14} /> {t('Kaydet')}</button>
        </div>
      </div>
    </div>
  )
}

function Archives({ job, onMsg }) {
  const { t } = useI18n()
  const [items, setItems] = useState(null)
  const [contents, setContents] = useState(null)

  const load = useCallback(() => {
    api(`/api/backups/jobs/${job.id}/archives`).then(setItems).catch(e => onMsg({ kind: 'error', text: e.message }))
  }, [job.id, onMsg])
  useEffect(load, [load, job.last_run?.id])

  const base = name => `/api/backups/jobs/${job.id}/archives/${encodeURIComponent(name)}`

  const download = async (a) => {
    try {
      const res = await api(base(a.name), { raw: true, timeout: 600000 })
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url; link.download = a.name; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { onMsg({ kind: 'error', text: e.message }) }
  }
  const remove = async (a) => {
    if (!confirm(`${a.name} ${t('silinsin mi?')}`)) return
    try { await api(base(a.name), { method: 'DELETE' }); load() } catch (e) { onMsg({ kind: 'error', text: e.message }) }
  }
  const restore = async (a) => {
    const target = prompt(t('Arşiv hangi dizine açılsın? Dosyalar bu dizin altında tam yollarıyla oluşturulur. "/" yazarsanız mevcut dosyaların üzerine yazılır.'), `/tmp/geri-yukleme-${a.name.replace('.tar.gz', '')}`)
    if (!target) return
    if (target.trim() === '/' && !confirm(t('Mevcut dosyaların ÜZERİNE yazılacak. Emin misin?'))) return
    try {
      const r = await api(`${base(a.name)}/restore`, { ...jsonOpts('POST', { target }), timeout: 600000 })
      onMsg({ kind: 'success', text: `${r.files} ${t('dosya geri yüklendi')} → ${r.target}` })
    } catch (e) { onMsg({ kind: 'error', text: e.message }) }
  }
  const showContents = async (a) => {
    if (contents?.name === a.name) return setContents(null)
    try { setContents({ name: a.name, ...(await api(`${base(a.name)}/contents`)) }) } catch (e) { onMsg({ kind: 'error', text: e.message }) }
  }

  if (!items) return <div style={{ padding: 12 }}><div className="spinner" /></div>
  if (!items.length) return <EmptyState>{t('Bu görev için arşiv yok')}</EmptyState>
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table>
        <thead><tr><th>{t('Arşiv')}</th><th>{t('Boyut')}</th><th>{t('Tarih')}</th><th /></tr></thead>
        <tbody>{items.map(a => (
          <Fragment key={a.name}>
            <tr>
              <td className="mono">{a.name}</td>
              <td>{fmtBytes(a.size)}</td>
              <td>{fmtDate(a.mtime)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-icon" title={t('İçerik')} onClick={() => showContents(a)}><FolderTree size={14} /></button>
                <button className="btn btn-ghost btn-icon" title={t('İndir')} onClick={() => download(a)}><Download size={14} /></button>
                <button className="btn btn-ghost btn-icon" title={t('Geri yükle')} onClick={() => restore(a)}><RotateCcw size={14} /></button>
                <button className="btn btn-ghost btn-icon" title={t('Sil')} onClick={() => remove(a)}><Trash2 size={14} /></button>
              </td>
            </tr>
            {contents?.name === a.name && (
              <tr><td colSpan={4}>
                <div style={{ maxHeight: 220, overflow: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem' }}>
                  {contents.items.map(i => (
                    <div key={i.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: i.dir ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      <span style={{ wordBreak: 'break-all' }}>{i.name}{i.dir ? '/' : ''}</span>
                      {!i.dir && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{fmtBytes(i.size)}</span>}
                    </div>
                  ))}
                  {contents.truncated && <div style={{ color: 'var(--text-muted)' }}>… {t('ilk 500 kayıt gösteriliyor')}</div>}
                </div>
              </td></tr>
            )}
          </Fragment>
        ))}</tbody>
      </table>
    </div>
  )
}

export default function Backups() {
  const { t } = useI18n()
  const [jobs, setJobs] = useState([])
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState({})
  const [msg, setMsg] = useState({})

  const load = useCallback(() => {
    api('/api/backups/jobs').then(setJobs).catch(e => setMsg({ kind: 'error', text: e.message }))
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  const save = async (job) => {
    try {
      if (job.id) await api(`/api/backups/jobs/${job.id}`, jsonOpts('PUT', job))
      else await api('/api/backups/jobs', jsonOpts('POST', job))
      setEditing(null); load()
      setMsg({ kind: 'success', text: t('Görev kaydedildi') })
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }
  const runNow = async (job) => {
    try { await api(`/api/backups/jobs/${job.id}/run`, { method: 'POST' }); load(); setOpen(o => ({ ...o, [job.id]: true })) }
    catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }
  const remove = async (job) => {
    if (!confirm(`"${job.name}" ${t('görevi silinsin mi? (Arşiv dosyaları silinmez)')}`)) return
    try { await api(`/api/backups/jobs/${job.id}`, { method: 'DELETE' }); load() } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }
  const fromPreset = async () => {
    try {
      const [p] = await api('/api/backups/presets')
      setEditing({ ...emptyJob(), ...p })
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in">
      <PageHeader icon={Archive} title={t('Yedekler')}>
        <button className="btn btn-secondary" onClick={load}><RefreshCw size={14} /></button>
        <button className="btn btn-secondary" onClick={fromPreset}><Sparkles size={14} /> {t('PC Manager ayarlarını yedekle')}</button>
        <button className="btn btn-primary" onClick={() => setEditing(emptyJob())}><Plus size={14} /> {t('Yeni görev')}</button>
      </PageHeader>
      <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>

      {editing && !editing.id && <JobEditor job={editing} onSave={save} onCancel={() => setEditing(null)} />}

      {!jobs.length && !editing && (
        <EmptyState>{t('Henüz yedekleme görevi yok. Klasörlerinizi düzenli olarak .tar.gz arşivlerine almak için yeni bir görev oluşturun.')}</EmptyState>
      )}

      {jobs.map(job => editing?.id === job.id ? (
        <JobEditor key={job.id} job={editing} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <Section key={job.id} style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => setOpen(o => ({ ...o, [job.id]: !o[job.id] }))}>
              {open[job.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {job.name}
                {!job.enabled && job.schedule !== 'manual' && <span className="badge badge-gray">{t('Zamanlama kapalı')}</span>}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {scheduleText(job, t)} · {job.sources.length} {t('kaynak')} → <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{job.dest}</span> · {job.keep} {t('arşiv saklanır')}
              </div>
              {job.last_run && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {t('Son çalışma')}: {fmtDate(job.last_run.started)}
                  {job.last_run.status === 'success' && ` · ${job.last_run.files} ${t('dosya')} · ${fmtBytes(job.last_run.size)}`}
                  {job.last_run.skipped?.length > 0 && <span style={{ color: 'var(--yellow)' }}> · {t('bulunamayan')}: {job.last_run.skipped.join(', ')}</span>}
                  {job.last_run.error && <span style={{ color: 'var(--red)' }}> · {job.last_run.error}</span>}
                </div>
              )}
            </div>
            <RunBadge run={job.last_run} running={job.running} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-primary" disabled={job.running} onClick={() => runNow(job)}><Play size={13} /> {t('Şimdi çalıştır')}</button>
              <button className="btn btn-ghost btn-icon" title={t('Düzenle')} onClick={() => setEditing({ ...job })}><Pencil size={14} /></button>
              <button className="btn btn-ghost btn-icon" title={t('Sil')} onClick={() => remove(job)}><Trash2 size={14} /></button>
            </div>
          </div>
          {open[job.id] && <Archives job={job} onMsg={setMsg} />}
        </Section>
      ))}
    </div>
  )
}
