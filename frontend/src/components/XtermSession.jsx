import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { wsUrl, handleWsClose, WS_FORBIDDEN } from '../api'
import '@xterm/xterm/css/xterm.css'

const THEME = {
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
}

/**
 * Bir PTY websocket'ine bağlı xterm.js oturumu.
 * - path verilirse bağlanır (reconnect=true ise koptuğunda yeniden dener)
 * - path yoksa ve initialData verilirse salt-okunur oynatıcı gibi davranır
 * ref.send(data) ile dışarıdan tuş gönderilebilir.
 */
const XtermSession = forwardRef(function XtermSession(
  { path, reconnect = false, initialData, onStatus, reconnectingText = 'Bağlantı koptu, yeniden bağlanılıyor...', closedText = 'Oturum kapandı.', style },
  ref,
) {
  const hostRef = useRef(null)
  const wsRef = useRef(null)
  const statusRef = useRef(onStatus)
  statusRef.current = onStatus

  useImperativeHandle(ref, () => ({
    send(data) {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(data)
    },
  }), [])

  useEffect(() => {
    let disposed = false
    let term, fit, resizeObserver, retry

    const sendSize = () => {
      const ws = wsRef.current
      if (!fit || !ws || ws.readyState !== WebSocket.OPEN) return
      const dims = fit.proposeDimensions()
      if (dims) ws.send(`__RESIZE__:${dims.rows}:${dims.cols}`)
    }

    const connect = () => {
      if (disposed || !path) return
      const ws = new WebSocket(wsUrl(path))
      let opened = false
      wsRef.current = ws
      ws.onopen = () => { opened = true; statusRef.current?.(true); sendSize() }
      ws.onmessage = e => term?.write(e.data)
      ws.onerror = () => statusRef.current?.(false)
      ws.onclose = (ev) => {
        wsRef.current = null
        if (disposed) return
        statusRef.current?.(false)
        const canRetry = handleWsClose(ev, { opened })
        if (ev?.code === WS_FORBIDDEN) {
          term?.writeln(`\r\n\x1b[31m${ev.reason || 'Yetki yok'}\x1b[0m`)
          return
        }
        if (reconnect && canRetry) {
          term?.writeln(`\r\n\x1b[33m${reconnectingText}\x1b[0m`)
          retry = setTimeout(connect, 3000)
        } else {
          term?.writeln(`\r\n\x1b[90m${closedText}\x1b[0m`)
        }
      }
    }

    ;(async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
      if (disposed) return
      term = new Terminal({
        cursorBlink: !!path,
        disableStdin: !path,
        cursorStyle: 'block',
        fontSize: window.innerWidth < 640 ? 12 : 14,
        fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, monospace',
        scrollback: 10000,
        convertEol: !path,
        theme: THEME,
      })
      fit = new FitAddon()
      term.loadAddon(fit)
      term.open(hostRef.current)
      fit.fit()
      if (initialData) term.write(initialData)
      term.onData(data => { const ws = wsRef.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(data) })
      term.onResize(sendSize)
      resizeObserver = new ResizeObserver(() => { try { fit.fit() } catch {} ; sendSize() })
      resizeObserver.observe(hostRef.current)
      connect()
    })()

    return () => {
      disposed = true
      clearTimeout(retry)
      if (wsRef.current) { try { wsRef.current.close() } catch {} }
      resizeObserver?.disconnect()
      term?.dispose()
    }
  }, [path, reconnect, initialData, reconnectingText, closedText])

  return <div ref={hostRef} style={{ width: '100%', height: '100%', ...style }} />
})

export default XtermSession
