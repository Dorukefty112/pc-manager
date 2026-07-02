import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { MessageSquare, Send, Cpu, Bot } from 'lucide-react'

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
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    return () => {
      if (sessionId) api(`/api/chat/${sessionId}`, { method: 'DELETE' }).catch(() => {})
      api('/api/ollama/unload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {})
    }
  }, [sessionId])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
      if (line.startsWith('**') && line.endsWith('**'))
        return <p key={i} style={{ fontWeight: 700, color: 'var(--text)', margin: '8px 0 4px' }}>{line.slice(2, -2)}</p>
      if (line.startsWith('• ') || line.startsWith('- '))
        return <p key={i} style={{ paddingLeft: 10, color: 'var(--text-secondary)', margin: '2px 0' }}>• {line.slice(2)}</p>
      if (line.includes('`')) {
        const parts = line.split('`')
        return <p key={i} style={{ margin: '2px 0', color: 'var(--text-secondary)' }}>
          {parts.map((p, j) => j % 2 === 1
            ? <code key={j} style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 5, fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82em' }}>{p}</code>
            : p
          )}
        </p>
      }
      return <p key={i} style={{ margin: '2px 0', color: 'var(--text-secondary)' }}>{line}</p>
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2 className="page-title">
          <span className="page-title-icon" style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)' }}>
            <MessageSquare size={18} color="#a78bfa" />
          </span>
          {t('Asistan')}
        </h2>
        {sessionId && (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            ID: {sessionId}
          </span>
        )}
      </div>

      {/* Chat window */}
      <div style={{
        flex: 1, minHeight: 400,
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{
                  width: 28, height: 28, borderRadius: 9, flexShrink: 0, marginRight: 8, marginTop: 2,
                  background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bot size={14} color="#a78bfa" />
                </div>
              )}
              <div style={{
                maxWidth: '78%', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                padding: '10px 14px', fontSize: '0.85rem', lineHeight: 1.55,
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                color: m.role === 'user' ? '#fff' : 'var(--text-secondary)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                boxShadow: m.role === 'user' ? '0 2px 12px rgba(6,182,212,0.2)' : 'none',
              }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, opacity: 0.65, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {m.role === 'user' ? t('Sen') : <><Cpu size={9} /> {t('Asistan')}</>}
                </div>
                {formatText(m.text)}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={14} color="#a78bfa" />
              </div>
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '14px 14px 14px 4px', padding: '12px 16px',
                display: 'flex', gap: 5, alignItems: 'center',
              }}>
                {[0, 150, 300].map(delay => (
                  <span key={delay} style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#a78bfa',
                    animation: `bounce 1s ease-in-out ${delay}ms infinite`,
                  }} />
                ))}
                <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }`}</style>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={t('Mesaj yaz veya komut ver...')}
            disabled={!sessionId || loading}
            style={{ flex: 1, borderRadius: 12 }}
          />
          <button onClick={send} disabled={!input.trim() || !sessionId || loading} style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: 'var(--accent)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: (!input.trim() || !sessionId || loading) ? 0.4 : 1,
            transition: 'all 0.15s ease',
            boxShadow: '0 0 14px rgba(6,182,212,0.25)',
          }}>
            <Send size={17} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  )
}
