import { useEffect, useRef, useState, useCallback } from 'react'
import { useI18n } from '../context/I18nContext'
import { Terminal as TerminalIcon, Maximize, Minimize, Wifi, WifiOff } from 'lucide-react'

function getToken() {
  return localStorage.getItem('pcmanager_token')
}

function createWs(url, handlers) {
  const ws = new WebSocket(url)
  ws.onopen = handlers.onOpen
  ws.onmessage = handlers.onMessage
  ws.onerror = handlers.onError
  ws.onclose = handlers.onClose
  return ws
}

export default function Terminal() {
  const { t } = useI18n()
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const xtermRef = useRef(null)
  const fitRef = useRef(null)
  const mountedRef = useRef(true)
  const retryRef = useRef(null)
  const [connected, setConnected] = useState(false)

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = getToken()
  const wsUrl = `${protocol}//${location.host}/api/terminal?token=${encodeURIComponent(token || '')}`

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current) { try { wsRef.current.close() } catch {} }
    const term = xtermRef.current
    if (!term) return

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      const fit = fitRef.current
      if (fit) {
        const dims = fit.proposeDimensions()
        if (dims) ws.send(`__RESIZE__:${dims.rows}:${dims.cols}`)
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (!mountedRef.current) return
      setConnected(false)
      if (term) term.writeln('\x1b[33m' + t('Baglanti koptu, yeniden baglaniliyor...') + '\x1b[0m')
      retryRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      setConnected(false)
    }

    ws.onmessage = (e) => {
      if (term) term.write(e.data)
    }
  }, [wsUrl])

  useEffect(() => {
    mountedRef.current = true
    let term, fit, resizeObserver

    const init = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      const fontSize = window.innerWidth < 640 ? 12 : 14
      term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize,
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', selectionBackground: '#264f78' },
      })

      fit = new FitAddon()
      term.loadAddon(fit)
      xtermRef.current = term
      fitRef.current = fit

      term.open(termRef.current)
      fit.fit()

      connect()

      term.onData(data => {
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(data)
      })

      term.onResize(({ cols, rows }) => {
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(`__RESIZE__:${rows}:${cols}`)
      })

      resizeObserver = new ResizeObserver(() => {
        fit.fit()
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          const dims = fit.proposeDimensions()
          if (dims) ws.send(`__RESIZE__:${dims.rows}:${dims.cols}`)
        }
      })
      resizeObserver.observe(termRef.current)
    }

    init()

    return () => {
      mountedRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
      if (wsRef.current) { try { wsRef.current.close() } catch {} }
      if (term) term.dispose()
      if (resizeObserver) resizeObserver.disconnect()
    }
  }, [connect])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TerminalIcon size={18} className="text-green-400" />
          <h2 className="text-lg sm:text-xl font-semibold">{t("Terminal")}</h2>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          {connected ? t("Bağlı") : t("Bağlantı Kesik")}
        </span>
      </div>
      <div ref={termRef} className="flex-1 min-h-[300px] rounded-xl overflow-hidden border border-gray-800" />
    </div>
  )
}
