import { useEffect, useRef, useState, useCallback } from 'react'
import { useI18n } from '../context/I18nContext'
import { Terminal as TerminalIcon, Wifi, WifiOff, Maximize2 } from 'lucide-react'

function getToken() {
  return localStorage.getItem('pcmanager_token')
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
      if (fit) { const dims = fit.proposeDimensions(); if (dims) ws.send(`__RESIZE__:${dims.rows}:${dims.cols}`) }
    }
    ws.onclose = () => {
      wsRef.current = null
      if (!mountedRef.current) return
      setConnected(false)
      if (term) term.writeln('\x1b[33m' + t('Bağlantı koptu, yeniden bağlanılıyor...') + '\x1b[0m')
      retryRef.current = setTimeout(connect, 3000)
    }
    ws.onerror = () => { if (!mountedRef.current) return; setConnected(false) }
    ws.onmessage = (e) => { if (term) term.write(e.data) }
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
        fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, monospace',
        theme: {
          background: '#020812',
          foreground: '#c9d1d9',
          cursor: '#06b6d4',
          cursorAccent: '#020812',
          selectionBackground: '#1a3a5c',
          black: '#0d1117', red: '#ff7b72', green: '#3fb950',
          yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
          cyan: '#39c5cf', white: '#b1bac4',
          brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
          brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
          brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
        },
      })
      fit = new FitAddon()
      term.loadAddon(fit)
      xtermRef.current = term
      fitRef.current = fit
      term.open(termRef.current)
      fit.fit()
      connect()
      term.onData(data => { const ws = wsRef.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(data) })
      term.onResize(({ cols, rows }) => { const ws = wsRef.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(`__RESIZE__:${rows}:${cols}`) })
      resizeObserver = new ResizeObserver(() => {
        fit.fit()
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) { const dims = fit.proposeDimensions(); if (dims) ws.send(`__RESIZE__:${dims.rows}:${dims.cols}`) }
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <h2 className="page-title">
          <span className="page-title-icon" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <TerminalIcon size={18} color="#22c55e" />
          </span>
          {t('Terminal')}
        </h2>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600,
          background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: connected ? '#22c55e' : '#ef4444',
          border: `1px solid ${connected ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? '#22c55e' : '#ef4444',
            boxShadow: connected ? '0 0 6px #22c55e' : 'none',
          }} />
          {connected ? t('Bağlı') : t('Bağlantı Kesik')}
        </span>
      </div>

      {/* Terminal wrapper */}
      <div style={{
        flex: 1, minHeight: 320, position: 'relative',
        background: '#020812',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Traffic light */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'rgba(255,255,255,0.02)', flexShrink: 0,
        }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', opacity: 0.7 }} />
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', opacity: 0.7 }} />
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e', opacity: 0.7 }} />
          <span style={{ marginLeft: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>
            bash — {location.host}
          </span>
        </div>
        <div ref={termRef} style={{ flex: 1, height: 'calc(100% - 37px)' }} />
      </div>
    </div>
  )
}
