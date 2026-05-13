import { useEffect, useRef, useState } from 'react'
import { Terminal as TerminalIcon, Maximize, Minimize } from 'lucide-react'

export default function Terminal() {
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const xtermRef = useRef(null)
  const fitRef = useRef(null)
  const [connected, setConnected] = useState(false)

  function getToken() {
    return localStorage.getItem('pcmanager_token')
  }

  useEffect(() => {
    let mounted = true
    const init = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const token = getToken()
      const wsUrl = `${protocol}//${location.host}/api/terminal?token=${encodeURIComponent(token || '')}`

      const fontSize = window.innerWidth < 640 ? 12 : 14
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize,
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', selectionBackground: '#264f78' },
      })

      const fit = new FitAddon()
      term.loadAddon(fit)
      xtermRef.current = term
      fitRef.current = fit

      term.open(termRef.current)
      fit.fit()

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mounted) return
        setConnected(true)
        const dims = fit.proposeDimensions()
        if (dims) {
          ws.send(`__RESIZE__:${dims.rows}:${dims.cols}`)
        }
      }

      ws.onclose = () => { if (mounted) setConnected(false) }
      ws.onerror = () => {
        if (!mounted) return
        setConnected(false)
        term.writeln('\x1b[31mWebSocket bağlantı hatası!\x1b[0m')
      }

      ws.onmessage = e => term.write(e.data)

      term.onData(data => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      })

      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(`__RESIZE__:${rows}:${cols}`)
      })

      const resizeObserver = new ResizeObserver(() => {
        fit.fit()
        if (ws.readyState === WebSocket.OPEN) {
          const dims = fit.proposeDimensions()
          if (dims) ws.send(`__RESIZE__:${dims.rows}:${dims.cols}`)
        }
      })
      resizeObserver.observe(termRef.current)
    }

    init()

    return () => {
      mounted = false
      if (wsRef.current) wsRef.current.close()
      if (xtermRef.current) xtermRef.current.dispose()
    }
  }, [])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TerminalIcon size={18} className="text-green-400" />
          <h2 className="text-lg sm:text-xl font-semibold">Terminal</h2>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          {connected ? 'Bağlı' : 'Bağlantı Kesik'}
        </span>
      </div>
      <div ref={termRef} className="flex-1 min-h-[300px] rounded-xl overflow-hidden border border-gray-800" />
    </div>
  )
}
