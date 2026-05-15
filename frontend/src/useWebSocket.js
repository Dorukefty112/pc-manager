import { useRef, useEffect, useCallback } from 'react'

export function useWebSocket(url, { onMessage, onOpen, onClose } = {}) {
  const wsRef = useRef(null)
  const mountedRef = useRef(true)
  const retryRef = useRef(null)
  const attemptRef = useRef(0)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
    }
    attemptRef.current += 1
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = (e) => {
      attemptRef.current = 0
      onOpen?.(e)
    }

    ws.onmessage = (e) => {
      onMessage?.(e)
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      onClose?.(new Event('error'))
    }

    ws.onclose = () => {
      wsRef.current = null
      if (!mountedRef.current) return
      onClose?.(new Event('close'))
      const delay = Math.min(1000 * Math.pow(2, attemptRef.current - 1), 15000)
      retryRef.current = setTimeout(connect, delay)
    }
  }, [url, onMessage, onOpen, onClose])

  useEffect(() => {
    mountedRef.current = true
    attemptRef.current = 0
    connect()
    return () => {
      mountedRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
      if (wsRef.current) { try { wsRef.current.close() } catch {} }
    }
  }, [connect])

  return wsRef
}
