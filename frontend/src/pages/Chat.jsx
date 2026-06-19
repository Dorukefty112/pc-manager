import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { MessageSquare, Send, X, Terminal, Cpu } from 'lucide-react'

export default function Chat() {
  const { t } = useI18n()
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api('/api/chat/start').then(data => {
      if (cancelled) return
      setSessionId(data.session_id)
      setMessages([{ role: 'assistant', text: data.message }])
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (sessionId) {
        api(`/api/chat/${sessionId}`, { method: 'DELETE' }).catch(() => {})
      }
      api('/api/ollama/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {})
    }
  }, [sessionId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async () => {
    const msg = input.trim()
    if (!msg || !sessionId || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)
    try {
      const res = await api(`/api/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      setMessages(prev => [...prev, { role: 'assistant', text: res.response }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: t('Hata: ') + e.message }])
    }
    setLoading(false)
  }, [input, sessionId, loading])

  const formatText = (text) => {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} className="font-bold text-white mt-2 mb-1">{line.slice(2, -2)}</p>
      }
      if (line.startsWith('\u2022 ')) {
        return <p key={i} className="text-gray-300 ml-2">{'\u2022'} {line.slice(2)}</p>
      }
      if (line.startsWith('- ') && !line.startsWith('- PID')) {
        return <p key={i} className="text-gray-300 ml-2">- {line.slice(2)}</p>
      }
      if (line.startsWith('```') && line.endsWith('```')) {
        return <pre key={i} className="bg-gray-950 rounded-lg p-2 my-1 text-xs font-mono text-green-400 overflow-x-auto">{line.slice(3, -3)}</pre>
      }
      if (line.startsWith('```')) {
        return null
      }
      if (line.match(/^```/) === null && line.includes('`')) {
        const parts = line.split('`')
        return <p key={i} className="text-gray-300">{parts.map((p, j) => j % 2 === 1 ? <code key={j} className="bg-gray-800 text-cyan-300 px-1 rounded text-xs">{p}</code> : p)}</p>
      }
      return <p key={i} className="text-gray-300">{line}</p>
    })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={18} className="text-cyan-400" />
        <h2 className="text-lg sm:text-xl font-semibold">{t('Asistan')}</h2>
        {sessionId && <span className="text-[10px] text-gray-600 font-mono ml-auto">ID: {sessionId}</span>}
      </div>

      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'bg-cyan-700 text-white rounded-br-md'
                  : 'bg-gray-800 text-gray-200 rounded-bl-md'
              }`}>
                <div className="text-xs opacity-60 mb-1 flex items-center gap-1">
                  {m.role === 'user' ? t('Sen') : <><Cpu size={10} /> {t('Asistan')}</>}
                </div>
                {formatText(m.text)}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-800 p-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={t('Mesaj yaz veya komut ver...')}
              disabled={!sessionId || loading}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-700 disabled:opacity-50"
            />
            <button onClick={send} disabled={!input.trim() || !sessionId || loading}
              className="p-2.5 bg-cyan-700 rounded-xl hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
