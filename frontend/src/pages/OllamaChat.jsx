import { useState, useEffect, useRef } from 'react'
import { api, API } from '../api'
import { useI18n } from '../context/I18nContext'
import {
  MessageSquare, Send, X, Cpu, Activity, HardDrive, Wifi,
  Server, Terminal, Thermometer, FileText, Package, Clock,
  AlertTriangle, RefreshCw, Trash2, Cog, Bot,
} from 'lucide-react'

const TOOL_ICONS = {
  get_cpu: Cpu,
  get_memory: Activity,
  get_disk: HardDrive,
  get_network: Wifi,
  get_services: Server,
  manage_service: Server,
  exec_command: Terminal,
  get_temperature: Thermometer,
  get_logs: FileText,
  get_processes: Activity,
  kill_process: Activity,
  list_files: FileText,
  read_file: FileText,
  write_file: FileText,
  get_deprem: AlertTriangle,
  system_summary: Package,
  check_updates: Package,
}

function ToolCallDisplay({ name, status, args, result }) {
  const { t } = useI18n()
  const Icon = TOOL_ICONS[name] || Cog
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border rounded-lg text-xs mb-2 overflow-hidden transition-colors ${
      status === 'running' ? 'border-cyan-700 bg-cyan-900/10' :
      status === 'done' ? 'border-green-700 bg-green-900/10' :
      'border-gray-700 bg-gray-800/50'
    }`}>
      <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <Icon size={14} className={
          status === 'running' ? 'text-cyan-400 animate-spin' :
          status === 'done' ? 'text-green-400' : 'text-gray-400'
        } />
        <span className={`font-medium ${status === 'running' ? 'text-cyan-300' : status === 'done' ? 'text-green-300' : 'text-gray-300'}`}>
          {name}
        </span>
        {status === 'running' && <span className="text-cyan-500 animate-pulse">{t('çalışıyor...')}</span>}
        {expanded && (
          <pre className="text-[10px] text-gray-500 ml-auto overflow-x-auto max-w-[200px]">
            {JSON.stringify(args).slice(0, 100)}
          </pre>
        )}
      </div>
      {expanded && result && (
        <pre className="px-3 py-1.5 bg-gray-950 text-green-400 text-[10px] overflow-x-auto max-h-32 border-t border-gray-700">
          {typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result, null, 1).slice(0, 500)}
        </pre>
      )}
    </div>
  )
}

function BotIcon() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-cyan-600 flex items-center justify-center shrink-0">
      <Bot size={16} className="text-white" />
    </div>
  )
}

export default function OllamaChat() {
  const { t } = useI18n()
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('gemma4:e4b')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolCalls, setToolCalls] = useState([])
  const [showTools, setShowTools] = useState(true)
  const [ollamaError, setOllamaError] = useState(null)
  const [streamingContent, setStreamingContent] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    api('/api/ollama/models').then(data => {
      if (data.error) {
        setOllamaError(data.error)
        return
      }
      setModels(data)
      if (data.length > 0 && !data.find(m => m.name === selectedModel)) {
        setSelectedModel(data[0].name)
      }
    }).catch(() => setOllamaError(t('Ollama servisine ulasilamadi')))
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, toolCalls])

  const sendMessage = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setStreamingContent('')
    setToolCalls([])
    setOllamaError(null)

    const userMsg = { role: 'user', content: msg }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setLoading(true)

    let accumulated = ''
    let roundToolCalls = []

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const res = await fetch(`${API}/api/ollama/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('pcmanager_token')}` },
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content || '',
          })),
          show_tool_calls: showTools,
          max_tool_rounds: 5,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errText = await res.text()
        setMessages(prev => [...prev, { role: 'assistant', content: t('Hata: ') + errText.slice(0, 200) }])
        setLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)

            if (parsed.error) {
              setMessages(prev => [...prev, { role: 'assistant', content: t('Hata: ') + parsed.error }])
              setLoading(false)
              return
            }

            if (parsed.type === 'content') {
              accumulated += parsed.text
              setStreamingContent(accumulated)
            }

            if (parsed.type === 'tool_start') {
              const tc = { name: parsed.name, args: parsed.arguments, status: 'running' }
              roundToolCalls = [...roundToolCalls, tc]
              setToolCalls([...roundToolCalls])
            }

            if (parsed.type === 'tool_result') {
              roundToolCalls = roundToolCalls.map(tc =>
                tc.name === parsed.name && tc.status === 'running'
                  ? { ...tc, status: 'done', result: parsed.result }
                  : tc
              )
              setToolCalls([...roundToolCalls])
            }

            if (parsed.type === 'info') {
              accumulated += `\n\n_${parsed.text}_`
              setStreamingContent(accumulated)
            }
          } catch {}
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: accumulated || t('(cevap uretilemedi)') }])
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: t('Baglanti hatasi: ') + e.message.slice(0, 100) }])
      }
    }

    setLoading(false)
    setStreamingContent('')
    setToolCalls([])
    abortRef.current = null
  }

  useEffect(() => {
    return () => {
      fetch('/api/ollama/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {})
    }
  }, [])

  const clearChat = () => {
    setMessages([])
    setStreamingContent('')
    setToolCalls([])
    setOllamaError(null)
  }

  const formatText = (text) => {
    if (!text) return null
    const lines = text.split('\n')
    const elements = []
    let inCode = false
    let codeContent = ''
    let codeLang = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('```')) {
        if (inCode) {
          elements.push(<pre key={`code-${i}`} className="bg-gray-950 rounded-lg p-3 my-2 text-xs font-mono text-green-400 overflow-x-auto border border-gray-700">{codeContent}</pre>)
          codeContent = ''
          codeLang = ''
          inCode = false
        } else {
          inCode = true
          codeLang = line.slice(3).trim()
        }
        continue
      }

      if (inCode) {
        codeContent += (codeContent ? '\n' : '') + line
        continue
      }

      if (line.startsWith('*') && line.endsWith('*') && line.length > 2) {
        elements.push(<p key={i} className="text-gray-400 italic text-xs">{line.slice(1, -1)}</p>)
        continue
      }

      if (line.match(/^[-*]\s/)) {
        elements.push(<p key={i} className="text-gray-300 ml-3">• {line.slice(2)}</p>)
        continue
      }

      if (line.match(/^##?\s/)) {
        elements.push(<h3 key={i} className="font-bold text-white mt-3 mb-1">{line.replace(/^#+\s/, '')}</h3>)
        continue
      }

      const parts = line.split(/(`[^`]+`)/g)
      if (parts.length > 1) {
        elements.push(<p key={i} className="text-gray-300">{parts.map((p, j) =>
          p.startsWith('`') && p.endsWith('`')
            ? <code key={j} className="bg-gray-800 text-cyan-300 px-1 rounded text-xs">{p.slice(1, -1)}</code>
            : p
        )}</p>)
      } else if (line.includes('**')) {
        const boldParts = line.split(/(\*\*[^*]+\*\*)/g)
        elements.push(<p key={i} className="text-gray-300">{boldParts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} className="text-white">{p.slice(2, -2)}</strong>
            : p
        )}</p>)
      } else if (line.trim()) {
        elements.push(<p key={i} className="text-gray-300">{line}</p>)
      } else {
        elements.push(<div key={i} className="h-2" />)
      }
    }

    if (inCode && codeContent) {
      elements.push(<pre key="code-unclosed" className="bg-gray-950 rounded-lg p-3 my-2 text-xs font-mono text-green-400 overflow-x-auto border border-gray-700">{codeContent}</pre>)
    }

    return elements
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Bot size={18} className="text-violet-400" />
        <h2 className="text-lg sm:text-xl font-semibold">{t('Yapay Zeka Asistan')}</h2>

        {models.length > 0 && (
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
            className="ml-auto bg-gray-800 border border-gray-700 text-xs rounded-lg px-2 py-1 text-gray-300 max-w-[160px]">
            {models.map(m => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))}
          </select>
        )}

        <button onClick={() => setShowTools(p => !p)}
          className={`p-1.5 rounded-lg transition-colors text-xs ${showTools ? 'bg-violet-900/30 text-violet-400' : 'bg-gray-800 text-gray-500'}`}
          title={t("Tool cagrilarini goster/gizle")}>
          <Cog size={14} />
        </button>

        <button onClick={clearChat}
          className="p-1.5 rounded-lg bg-gray-800 text-gray-500 hover:text-red-400 transition-colors"
          title={t("Sohbeti temizle")}>
          <Trash2 size={14} />
        </button>
      </div>

      {ollamaError && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 mb-3">
          <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-1">
            <AlertTriangle size={16} /> {t('Ollama Baglanti Hatasi')}
          </div>
          <p className="text-red-300 text-xs">{ollamaError}</p>
          <p className="text-gray-400 text-xs mt-2">{t('Terminalde')} <code className="bg-gray-800 px-1 rounded">ollama serve</code> {t('komutunu calistirip tekrar dene.')}</p>
        </div>
      )}

      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && !streamingContent && (
            <div className="text-center py-16 text-gray-500">
              <BotIcon />
              <div className="mt-3 text-sm">{t('PC Manager yapay zeka asistanina hos geldin!')}</div>
              <div className="text-xs text-gray-600 mt-2 max-w-md mx-auto space-y-1">
                <p>{t('Ornek sorular:')}</p>
                <p className="text-gray-500">{t('"Sistem durumu nasil?"')}</p>
                <p className="text-gray-500">{t('"En cok RAM harcayan 5 process hangisi?"')}</p>
                <p className="text-gray-500">{t('"Diskleri kontrol et, temizlik oner"')}</p>
                <p className="text-gray-500">{t('"Servislerde sorun var mi?"')}</p>
                <p className="text-gray-500">{t('"Son depremleri goster"')}</p>
                <p className="text-gray-500">{t('"Biraz once ne kadar ag trafigim oldu?"')}</p>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i}>
              <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-cyan-700 text-white rounded-br-md'
                    : 'bg-gray-800 text-gray-200 rounded-bl-md'
                }`}>
                  <div className="text-xs opacity-60 mb-1 flex items-center gap-1">
                    {m.role === 'user' ? t('Sen') : <Bot size={12} />}
                    {m.role !== 'user' && t(' Asistan')}
                  </div>
                  {formatText(m.content)}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div>
              {toolCalls.length > 0 && showTools && (
                <div className="mb-3 space-y-1">
                  {toolCalls.map((tc, i) => (
                    <ToolCallDisplay key={i} name={tc.name} status={tc.status} args={tc.args} result={tc.result} />
                  ))}
                </div>
              )}

              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%] sm:max-w-[80%]">
                  {streamingContent ? (
                    <div className="text-sm text-gray-200 space-y-1">
                      {formatText(streamingContent)}
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
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
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }}
              placeholder={t('Mesaj yaz... (orn: sistem durumu, depremler, processler...)')}
              disabled={loading || !!ollamaError}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-700 disabled:opacity-50"
            />
            <button onClick={sendMessage} disabled={!input.trim() || loading || !!ollamaError}
              className="p-2.5 bg-violet-700 rounded-xl hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {loading ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
