import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { useWebSocket } from '../useWebSocket'
import {
  Plus, Save, Play, Trash2, ChevronUp, ChevronDown,
  Search, RefreshCw, Terminal, Server, Package,
  FileText, Clock, Globe, List, X, AlertCircle,
  CheckCircle, Clock as ClockIcon, Loader,
} from 'lucide-react'

const STEP_TYPES = [
  { value: 'command', label: 'Command', icon: Terminal },
  { value: 'service', label: 'Service', icon: Server },
  { value: 'package', label: 'Package', icon: Package },
  { value: 'file', label: 'File', icon: FileText },
  { value: 'wait', label: 'Wait', icon: Clock },
  { value: 'webhook', label: 'Webhook', icon: Globe },
]

function emptyStep() {
  return { type: 'command', cmd: '' }
}

function defaultFields(type) {
  switch (type) {
    case 'command': return { cmd: '' }
    case 'service': return { action: 'restart', name: '' }
    case 'package': return { action: 'install', name: '' }
    case 'file': return { action: 'write', path: '', content: '' }
    case 'wait': return { seconds: 5 }
    case 'webhook': return { url: '', method: 'GET', body: '' }
    default: return { cmd: '' }
  }
}

function StepEditor({ step, index, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const { t } = useI18n()

  const update = (key, val) => {
    onChange(index, { ...step, [key]: val })
  }

  const changeType = (newType) => {
    const merged = { ...defaultFields(newType), ...step }
    merged.type = newType
    onChange(index, merged)
  }

  const typeIcon = STEP_TYPES.find(st => st.value === step.type)?.icon || Terminal
  const Icon = typeIcon

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-cyan-400 shrink-0" />
        <select value={step.type} onChange={e => changeType(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs font-medium text-gray-200">
          {STEP_TYPES.map(st => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button onClick={onMoveUp} disabled={isFirst}
          className="p-1 rounded hover:bg-gray-700 text-gray-500 disabled:opacity-30"><ChevronUp size={14} /></button>
        <button onClick={onMoveDown} disabled={isLast}
          className="p-1 rounded hover:bg-gray-700 text-gray-500 disabled:opacity-30"><ChevronDown size={14} /></button>
        <button onClick={onRemove}
          className="p-1 rounded hover:bg-red-900/50 text-red-500"><Trash2 size={14} /></button>
      </div>

      {step.type === 'command' && (
        <input value={step.cmd || ''} onChange={e => update('cmd', e.target.value)}
          placeholder="apt update && apt upgrade -y"
          className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-500" />
      )}

      {step.type === 'service' && (
        <div className="flex gap-2">
          <select value={step.action || 'restart'} onChange={e => update('action', e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200">
            <option value="start">{t('Başlat')}</option>
            <option value="stop">{t('Durdur')}</option>
            <option value="restart">{t('Yeniden Başlat')}</option>
          </select>
          <input value={step.name || ''} onChange={e => update('name', e.target.value)}
            placeholder="sshd"
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-500" />
        </div>
      )}

      {step.type === 'package' && (
        <div className="flex gap-2">
          <select value={step.action || 'install'} onChange={e => update('action', e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200">
            <option value="install">Install</option>
            <option value="remove">Remove</option>
          </select>
          <input value={step.name || ''} onChange={e => update('name', e.target.value)}
            placeholder="htop"
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-500" />
        </div>
      )}

      {step.type === 'file' && (
        <div className="space-y-1.5">
          <select value={step.action || 'write'} onChange={e => update('action', e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200">
            <option value="write">Write</option>
            <option value="delete">Delete</option>
          </select>
          <input value={step.path || ''} onChange={e => update('path', e.target.value)}
            placeholder="/tmp/test.txt"
            className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-500" />
          {step.action !== 'delete' && (
            <textarea value={step.content || ''} onChange={e => update('content', e.target.value)}
              placeholder="file content..."
              rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-500" />
          )}
        </div>
      )}

      {step.type === 'wait' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{t('Bekle')}:</span>
          <input type="number" min={1} value={step.seconds || 5} onChange={e => update('seconds', parseInt(e.target.value) || 1)}
            className="w-20 bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-gray-200" />
          <span className="text-xs text-gray-400">{t('saniye')}</span>
        </div>
      )}

      {step.type === 'webhook' && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <select value={step.method || 'GET'} onChange={e => update('method', e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
            <input value={step.url || ''} onChange={e => update('url', e.target.value)}
              placeholder="https://..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-500" />
          </div>
          {step.method === 'POST' && (
            <textarea value={step.body || ''} onChange={e => update('body', e.target.value)}
              placeholder='{"key": "value"}'
              rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-500" />
          )}
        </div>
      )}
    </div>
  )
}

export default function Playbooks() {
  const { t } = useI18n()
  const [playbooks, setPlaybooks] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [playbook, setPlaybook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [runs, setRuns] = useState([])
  const [tab, setTab] = useState('editor')
  const [runningId, setRunningId] = useState(null)
  const [wsUrl, setWsUrl] = useState('')
  const [liveRun, setLiveRun] = useState(null)
  const [runLog, setRunLog] = useState('')

  const fetchPlaybooks = useCallback(async () => {
    try {
      const res = await api(`/api/playbooks?search=${encodeURIComponent(search)}`)
      setPlaybooks(res)
    } catch {}
  }, [search])

  useEffect(() => { fetchPlaybooks() }, [fetchPlaybooks])

  useEffect(() => {
    if (selectedId) {
      api(`/api/playbooks/${selectedId}`).then(setPlaybook).catch(() => {})
    } else {
      setPlaybook(null)
    }
  }, [selectedId])

  const fetchRuns = useCallback(async () => {
    try {
      const res = await api('/api/playbooks/runs')
      setRuns(res)
    } catch {}
  }, [])

  useEffect(() => {
    if (tab === 'runs') fetchRuns()
  }, [tab, fetchRuns])

  const createNew = () => {
    const pb = { name: '', description: '', steps: [] }
    setSelectedId(null)
    setPlaybook(pb)
    setTab('editor')
  }

  const savePlaybook = async () => {
    if (!playbook?.name?.trim()) return
    setSaving(true)
    try {
      if (selectedId) {
        const res = await api(`/api/playbooks/${selectedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(playbook),
        })
        setPlaybook(res)
      } else {
        const res = await api('/api/playbooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(playbook),
        })
        setPlaybook(res)
        setSelectedId(res.id)
      }
      await fetchPlaybooks()
    } catch (e) { alert(t('Hata: ') + e.message) }
    setSaving(false)
  }

  const deletePlaybook = async () => {
    if (!selectedId || !confirm(t('Silmek istediğine emin misin?'))) return
    try {
      await api(`/api/playbooks/${selectedId}`, { method: 'DELETE' })
      setSelectedId(null)
      setPlaybook(null)
      await fetchPlaybooks()
    } catch (e) { alert(e.message) }
  }

  const runPlaybook = async () => {
    if (!selectedId) return
    try {
      const res = await api(`/api/playbooks/${selectedId}/run`, { method: 'POST' })
      setRunningId(res.execution_id)
      setTab('runs')
    } catch (e) { alert(e.message) }
  }

  const viewRun = (executionId) => {
    setRunningId(executionId)
    setWsUrl(`ws://${window.location.host}/api/playbooks/runs/${executionId}/ws`)
  }

  const closeRun = () => {
    setRunningId(null)
    setWsUrl('')
    setLiveRun(null)
  }

  const addStep = () => {
    setPlaybook(prev => ({
      ...prev,
      steps: [...(prev?.steps || []), emptyStep()],
    }))
  }

  const updateStep = (index, step) => {
    setPlaybook(prev => {
      const steps = [...(prev?.steps || [])]
      steps[index] = step
      return { ...prev, steps }
    })
  }

  const removeStep = (index) => {
    setPlaybook(prev => {
      const steps = [...(prev?.steps || [])]
      steps.splice(index, 1)
      return { ...prev, steps }
    })
  }

  const moveStep = (index, dir) => {
    setPlaybook(prev => {
      const steps = [...(prev?.steps || [])]
      const target = index + dir
      if (target < 0 || target >= steps.length) return prev
      ;[steps[index], steps[target]] = [steps[target], steps[index]]
      return { ...prev, steps }
    })
  }

  const selectedPb = playbooks.find(p => p.id === selectedId)

  return (
    <div className="flex gap-4 h-full">
      <div className="w-64 sm:w-72 shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('Ara...')}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-cyan-700" />
          </div>
          <button onClick={fetchPlaybooks} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400">
            <RefreshCw size={14} />
          </button>
        </div>

        <button onClick={createNew}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-sm font-medium">
          <Plus size={14} /> {t('Yeni Playbook')}
        </button>

        <div className="flex-1 overflow-y-auto space-y-1">
          {playbooks.map(pb => (
            <button key={pb.id} onClick={() => { setSelectedId(pb.id); setTab('editor') }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedId === pb.id
                  ? 'bg-cyan-900/30 text-cyan-300 border border-cyan-800/50'
                  : 'hover:bg-gray-800/50 text-gray-300 border border-transparent'
              }`}>
              <div className="font-medium truncate">{pb.name}</div>
              {pb.description && <div className="text-xs text-gray-500 truncate mt-0.5">{pb.description}</div>}
              <div className="text-xs text-gray-600 mt-0.5">{pb.steps?.length || 0} steps</div>
            </button>
          ))}
          {playbooks.length === 0 && (
            <div className="text-center text-gray-600 text-sm py-8">{t('Henüz playbook yok')}</div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!playbook ? (
          <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
            {t('Bir playbook seçin veya yeni oluşturun')}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 border-b border-gray-800 pb-2">
              <button onClick={() => setTab('editor')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'editor' ? 'bg-gray-800 text-cyan-300' : 'text-gray-500 hover:text-gray-300'
                }`}>
                <div className="flex items-center gap-1.5"><List size={14} /> {t('Düzenle')}</div>
              </button>
              <button onClick={() => setTab('runs')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'runs' ? 'bg-gray-800 text-cyan-300' : 'text-gray-500 hover:text-gray-300'
                }`}>
                <div className="flex items-center gap-1.5"><ClockIcon size={14} /> {t('Geçmiş')}</div>
              </button>
              <div className="flex-1" />
              {selectedId && (
                <button onClick={deletePlaybook}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-900/30">
                  <Trash2 size={14} /> {t('Sil')}
                </button>
              )}
              <button onClick={savePlaybook} disabled={saving || !playbook?.name?.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-sm font-medium disabled:opacity-50">
                <Save size={14} /> {saving ? t('Kaydediliyor...') : t('Kaydet')}
              </button>
              {selectedId && (
                <button onClick={runPlaybook}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-medium">
                  <Play size={14} /> {t('Çalıştır')}
                </button>
              )}
            </div>

            {tab === 'editor' && (
              <div className="flex-1 overflow-y-auto space-y-3">
                <input value={playbook.name || ''} onChange={e => setPlaybook(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('Playbook adı')}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-lg font-semibold text-gray-200 placeholder-gray-600" />
                <input value={playbook.description || ''} onChange={e => setPlaybook(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('Açıklama')}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-400 placeholder-gray-600" />

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-400">{t('Adımlar')} ({playbook.steps?.length || 0})</h3>
                  <button onClick={addStep}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs">
                    <Plus size={12} /> {t('Adım Ekle')}
                  </button>
                </div>

                <div className="space-y-2">
                  {(playbook.steps || []).map((step, i) => (
                    <StepEditor
                      key={i}
                      step={step}
                      index={i}
                      onChange={updateStep}
                      onRemove={() => removeStep(i)}
                      onMoveUp={() => moveStep(i, -1)}
                      onMoveDown={() => moveStep(i, 1)}
                      isFirst={i === 0}
                      isLast={i === (playbook.steps?.length || 0) - 1}
                    />
                  ))}
                  {(playbook.steps || []).length === 0 && (
                    <div className="text-center text-gray-600 text-sm py-8">
                      {t('Henüz adım eklenmemiş. "Adım Ekle" butonuna tıklayın.')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'runs' && (
              <div className="flex-1 overflow-y-auto">
                {runningId ? (
                  <RunViewer
                    executionId={runningId}
                    wsUrl={wsUrl}
                    onClose={closeRun}
                    runs={runs}
                  />
                ) : (
                  <div className="space-y-2">
                    {runs.filter(r => !selectedId || r.playbook_id === selectedId).map(r => (
                      <button key={r.execution_id} onClick={() => viewRun(r.execution_id)}
                        className="w-full text-left bg-gray-900 rounded-lg border border-gray-800 p-3 hover:bg-gray-800/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StatusIcon status={r.status} />
                            <span className="text-sm font-medium text-gray-200">{r.playbook_name}</span>
                          </div>
                          <span className="text-xs text-gray-500">{r.started_at?.slice(0, 19).replace('T', ' ')}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span>{r.status === 'running' ? `${r.current_step || 0}/${r.total_steps || 0}` : `${r.total_steps || 0} steps`}</span>
                          <span className={r.status === 'failed' ? 'text-red-400' : r.status === 'success' ? 'text-green-400' : 'text-yellow-400'}>{r.status}</span>
                        </div>
                      </button>
                    ))}
                    {runs.length === 0 && (
                      <div className="text-center text-gray-600 text-sm py-8">{t('Henüz çalıştırma geçmişi yok')}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatusIcon({ status }) {
  if (status === 'running') return <Loader size={14} className="animate-spin text-yellow-400" />
  if (status === 'success') return <CheckCircle size={14} className="text-green-400" />
  if (status === 'failed') return <AlertCircle size={14} className="text-red-400" />
  return <ClockIcon size={14} className="text-gray-500" />
}

function RunViewer({ executionId, wsUrl, onClose, runs }) {
  const { t } = useI18n()
  const [runData, setRunData] = useState(
    runs.find(r => r.execution_id === executionId) || null
  )
  const [log, setLog] = useState('')

  const onMessage = useCallback((e) => {
    try {
      const data = JSON.parse(e.data)
      setRunData(data)
      const stepLogs = (data.steps || [])
        .filter(s => s.status !== 'pending')
        .map(s => `[Step ${s.step}] ${s.type} (${s.status}) - ${s.duration}s\n${s.output}`)
        .join('\n\n')
      setLog(stepLogs)
    } catch {}
  }, [])

  useWebSocket(wsUrl, { onMessage })

  if (!runData) {
    return <div className="text-center text-gray-500 py-8">{t('Yükleniyor...')}</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon status={runData.status} />
          <span className="text-sm font-medium text-gray-200">{runData.playbook_name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{runData.status}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{runData.current_step || 0}/{runData.total_steps || 0}</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-500"><X size={14} /></button>
        </div>
      </div>

      <div className="space-y-1.5">
        {(runData.steps || []).map((s, i) => (
          <div key={i}
            className={`rounded-lg border p-2.5 text-xs ${
              s.status === 'success' ? 'bg-green-900/10 border-green-800/30' :
              s.status === 'failed' ? 'bg-red-900/10 border-red-800/30' :
              s.status === 'running' ? 'bg-yellow-900/10 border-yellow-800/30 animate-pulse' :
              'bg-gray-800/30 border-gray-700/30'
            }`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <StatusIcon status={s.status} />
                <span className="font-medium text-gray-300">#{s.step} {s.type}</span>
                {s.command && <span className="text-gray-500 font-mono truncate max-w-[200px]">{s.command}</span>}
              </div>
              <div className="flex items-center gap-2 text-gray-500">
                {s.duration > 0 && <span>{s.duration}s</span>}
                {s.exit_code !== null && <span>exit: {s.exit_code}</span>}
              </div>
            </div>
            {s.output && (
              <pre className="text-gray-400 font-mono text-xs whitespace-pre-wrap max-h-20 overflow-y-auto">{s.output}</pre>
            )}
          </div>
        ))}
      </div>

      {log && (
        <details className="bg-gray-900 rounded-lg border border-gray-800">
          <summary className="px-3 py-2 text-xs text-gray-400 cursor-pointer hover:text-gray-300 font-medium">
            {t('Detaylı Çıktı')}
          </summary>
          <pre className="p-3 text-xs font-mono text-gray-500 whitespace-pre-wrap overflow-x-auto max-h-80">
            {log}
          </pre>
        </details>
      )}
    </div>
  )
}
