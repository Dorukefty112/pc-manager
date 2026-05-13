import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Bug, RefreshCw, Terminal, FileCode, RotateCcw, CheckCircle, XCircle, AlertTriangle, Loader, ChevronDown, ChevronRight, Search } from 'lucide-react'

export default function DebugPage() {
  const [info, setInfo] = useState(null)
  const [logs, setLogs] = useState([])
  const [packages, setPackages] = useState(null)
  const [loading, setLoading] = useState({ info: false, logs: false, pkgs: false })
  const [activeSection, setActiveSection] = useState('overview')

  const [agentStatus, setAgentStatus] = useState(null)
  const [checkpoints, setCheckpoints] = useState([])
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentResult, setAgentResult] = useState(null)
  const [agentTarget, setAgentTarget] = useState('')

  const loadInfo = async () => {
    setLoading(prev => ({ ...prev, info: true }))
    try { setInfo(await api('/api/debug/info')) } catch (e) { setInfo({ error: e.message }) }
    setLoading(prev => ({ ...prev, info: false }))
  }
  const loadLogs = async () => {
    setLoading(prev => ({ ...prev, logs: true }))
    try { setLogs(await api('/api/debug/logs?lines=100')) } catch (e) { setLogs({ error: e.message }) }
    setLoading(prev => ({ ...prev, logs: false }))
  }
  const loadPackages = async () => {
    setLoading(prev => ({ ...prev, pkgs: true }))
    try { setPackages(await api('/api/debug/packages')) } catch (e) { setPackages({ error: e.message }) }
    setLoading(prev => ({ ...prev, pkgs: false }))
  }

  useEffect(() => { loadInfo(); loadLogs() }, [])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Bug size={20} className="text-cyan-400" />
        <h2 className="text-xl font-semibold">Debug Paneli</h2>
        {info && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
            info.debug_mode ? 'bg-green-900/50 text-green-300' : 'bg-gray-800 text-gray-500'
          }`}>
            {info.debug_mode ? 'Aktif' : 'Kapali'}
          </span>
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-800 pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Genel', icon: Bug },
          { id: 'logs', label: 'Loglar', icon: Terminal },
          { id: 'agent', label: 'Debug Agent', icon: Search },
          { id: 'packages', label: 'Paketler', icon: FileCode },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm whitespace-nowrap transition-colors ${
              activeSection === tab.id
                ? 'bg-gray-800 text-cyan-300 border-b-2 border-cyan-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {activeSection === 'overview' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Sistem Bilgisi</h3>
              <button onClick={loadInfo} disabled={loading.info}
                className="p-1.5 text-gray-500 hover:text-cyan-300 disabled:opacity-50">
                <RefreshCw size={14} className={loading.info ? 'animate-spin' : ''} />
              </button>
            </div>
            {info && !info.error ? (
              <div className="space-y-2 text-sm font-mono">
                <Row label="Python" value={info.python?.split('(')[0]?.trim()} />
                <Row label="Config Dizini" value={info.base_dir} />
                <Row label="Calisma Dizini" value={info.cwd} />
                <Row label="Debug Mod" value={info.debug_mode ? 'Aktif' : 'Kapali'} />
                <Row label="Route Sayisi" value={info.routes_count} />
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-200 text-xs">Ortam Degiskenleri</summary>
                  <pre className="mt-1 bg-gray-950 rounded-lg p-2 text-xs text-green-400 overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(info.env, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Yuklenemedi: {info?.error}</p>
            )}
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Hizli Aksiyonlar</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={async () => {
                try { await api('/api/debug/test-error', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' }) }
                catch(e) { alert('Hata yakalandi (beklenen): ' + e.message) }
              }} className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded-lg text-xs transition-colors">
                Test Hatasi Firlat
              </button>
            </div>
          </div>

          {info?.config && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Config (canli)</h3>
              <pre className="bg-gray-950 rounded-lg p-2 text-xs text-green-400 overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(info.config, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {activeSection === 'logs' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Backend Loglari (journalctl)</h3>
            <button onClick={loadLogs} disabled={loading.logs}
              className="p-1.5 text-gray-500 hover:text-cyan-300 disabled:opacity-50">
              <RefreshCw size={14} className={loading.logs ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-green-400 max-h-96 overflow-y-auto space-y-0.5">
            {logs.logs?.map((l, i) => <div key={i} className="opacity-80 hover:opacity-100">{l}</div>)}
            {(!logs.logs || logs.logs.length === 0) && <div className="text-gray-600">Log bulunamadi</div>}
          </div>
        </div>
      )}

      {activeSection === 'packages' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400 uppercase">Python Paketleri</h3>
              <button onClick={loadPackages} disabled={loading.pkgs}
                className="p-1.5 text-gray-500 hover:text-cyan-300 disabled:opacity-50">
                <RefreshCw size={14} className={loading.pkgs ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="text-xs font-mono space-y-0.5 max-h-64 overflow-y-auto">
              {packages?.python_packages?.map((p, i) => (
                <div key={i} className="text-gray-400">{p.name} == {p.version}</div>
              ))}
              {(!packages?.python_packages || packages.python_packages.length === 0) &&
                <div className="text-gray-600">Yuklemek icin butona tikla</div>}
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase mb-3">Node Paketleri</h3>
            <div className="text-xs font-mono space-y-0.5 max-h-64 overflow-y-auto">
              {packages?.node_packages?.map((p, i) => (
                <div key={i} className="text-gray-400">{p}</div>
              ))}
              {(!packages?.node_packages || packages.node_packages.length === 0) &&
                <div className="text-gray-600">Yuklemek icin butona tikla</div>}
            </div>
          </div>
        </div>
      )}

      {activeSection === 'agent' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Debug Agent</h3>
              <button onClick={async () => {
                try { setAgentStatus(await api('/api/debug/agent/status')) } catch(e) {}
                try { setCheckpoints(await api('/api/debug/agent/checkpoints')) } catch(e) {}
              }} className="p-1.5 text-gray-500 hover:text-cyan-300">
                <RefreshCw size={14} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              AI agent kod tabanini analiz eder, hatalari bulur ve duzeltmeye calisir.
              Her duzeltme oncesi otomatik checkpoint alinir, dilersen geri alabilirsin.
            </p>

            <div className="flex gap-2 mb-4">
              <input value={agentTarget} onChange={e => setAgentTarget(e.target.value)}
                placeholder="Hedef dosya/dizin (bos=butun proje)"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
              <button onClick={async () => {
                setAgentRunning(true); setAgentResult(null)
                try {
                  const res = await api('/api/debug/agent/check', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ target: agentTarget }),
                  })
                  setAgentResult({ type: 'check', data: res })
                } catch(e) { setAgentResult({ type: 'error', data: e.message }) }
                setAgentRunning(false)
              }} disabled={agentRunning}
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded-lg text-sm flex items-center gap-1.5">
                {agentRunning ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
                Kod Butunlugunu Kontrol Et
              </button>
            </div>

            {agentResult && (
              <div className="bg-gray-950 rounded-lg p-3 text-sm max-h-80 overflow-y-auto">
                {agentResult.type === 'check' && (
                  <div className="whitespace-pre-wrap text-gray-300">{agentResult.data?.response || JSON.stringify(agentResult.data, null, 2)}</div>
                )}
                {agentResult.type === 'error' && (
                  <div className="text-red-400">Hata: {agentResult.data}</div>
                )}
              </div>
            )}

            {checkpoints?.checkpoints?.length > 0 && (
              <div className="mt-4 border-t border-gray-800 pt-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Checkpoint Gecmisi</h4>
                <div className="space-y-1">
                  {checkpoints.checkpoints.map(cp => (
                    <div key={cp.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-xs">
                      <div>
                        <span className="text-gray-300">{cp.label}</span>
                        <span className="text-gray-600 ml-2">{cp.timestamp}</span>
                      </div>
                      <button onClick={async () => {
                        if (!confirm('Geri alinsin mi? Bu islem geri alinamaz.')) return
                        try {
                          const res = await api(`/api/debug/agent/rollback/${cp.id}`, { method: 'POST' })
                          alert('Geri alindi: ' + cp.label)
                        } catch(e) { alert('Hata: ' + e.message) }
                      }} className="flex items-center gap-1 px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded transition-colors">
                        <RotateCcw size={10} /> Geri Al
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {agentStatus?.has_uncommitted_changes && (
              <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                <div className="flex items-center gap-1.5 text-yellow-400 text-xs mb-1">
                  <AlertTriangle size={12} /> Kaydedilmemis degisiklik var
                </div>
                <pre className="text-xs text-yellow-300/70 whitespace-pre-wrap">{agentStatus.changes}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className="text-gray-200 break-all">{String(value ?? '-')}</span>
    </div>
  )
}
