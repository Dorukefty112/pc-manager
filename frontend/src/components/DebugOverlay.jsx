import { useState, useEffect, useCallback, useRef } from 'react'
import { api, isAuthenticated } from '../api'
import { Bug, X, ChevronUp, Terminal } from 'lucide-react'

const MAX_CALLS = 20

export default function DebugOverlay() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(null)
  const [apiCalls, setApiCalls] = useState([])
  const [errors, setErrors] = useState([])
  const wsRef = useRef(null)

  useEffect(() => {
    if (isAuthenticated()) {
      api('/api/settings').then(setConfig).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const origFetch = window.fetch
    window.fetch = async (...args) => {
      const start = performance.now()
      try {
        const res = await origFetch(...args)
        const elapsed = Math.round(performance.now() - start)
        const info = { url: args[0], method: (args[1]?.method || 'GET'), status: res.status, elapsed }
        setApiCalls(prev => [{ ...info, time: new Date().toLocaleTimeString() }, ...prev].slice(0, MAX_CALLS))
        return res
      } catch (e) {
        const elapsed = Math.round(performance.now() - start)
        setErrors(prev => [{ url: args[0], error: e.message, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 5))
        setApiCalls(prev => [{ url: args[0], method: (args[1]?.method || 'GET'), status: 'ERR', elapsed, time: new Date().toLocaleTimeString() }, ...prev].slice(0, MAX_CALLS))
        throw e
      }
    }
    return () => { window.fetch = origFetch }
  }, [])

  const debugMode = config?.debug?.enabled
  if (!debugMode) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-80 max-h-96 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-950">
            <span className="text-xs font-medium text-cyan-400 flex items-center gap-1.5">
              <Bug size={12} /> Debug
            </span>
            <button onClick={() => setOpen(false)} className="p-0.5 text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto text-xs font-mono p-2 space-y-1">
            {apiCalls.length === 0 && <div className="text-gray-600 text-center py-4">Henuz API cagrisi yok</div>}
            {apiCalls.map((call, i) => (
              <div key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded ${
                call.status === 'ERR' ? 'bg-red-900/20' : 'bg-gray-800/50'
              }`}>
                <span className={`w-1 h-1 rounded-full shrink-0 ${
                  call.status === 'ERR' ? 'bg-red-500' :
                  call.status >= 400 ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <span className="text-gray-500 w-10 shrink-0">{call.method}</span>
                <span className="text-gray-300 truncate flex-1">{typeof call.url === 'string' ? call.url.replace(/^.*\/api\//, '/api/') : '?'}</span>
                <span className={`shrink-0 ${
                  call.elapsed > 500 ? 'text-red-400' : 'text-gray-500'
                }`}>{call.elapsed}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => setOpen(true)}
        className="bg-gray-900 border border-gray-700 hover:border-cyan-700 p-2.5 rounded-full shadow-lg transition-colors">
        <Bug size={18} className="text-cyan-400" />
      </button>
    </div>
  )
}
