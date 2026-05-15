import { useRef, useEffect } from 'react'

export function useWebSocket(url, { onMessage, onOpen, onClose } = {}) {
  const wsRef = useRef(null)
  const mountedRef = useRef(true)
  const retryRef = useRef(null)
  const attemptRef = useRef(0)
  const onMessageRef = useRef(onMessage)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  const urlRef = useRef(url)
  onMessageRef.current = onMessage
  onOpenRef.current = onOpen
  onCloseRef.current = onClose
  urlRef.current = url

  useEffect(() => {
    mountedRef.current = true
    attemptRef.current = 0

    const connect = () => {
      if (!mountedRef.current) return
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
      }
      attemptRef.current += 1
      const ws = new WebSocket(urlRef.current)
      wsRef.current = ws

      ws.onopen = (e) => {
        attemptRef.current = 0
        onOpenRef.current?.(e)
      }

      ws.onmessage = (e) => {
        onMessageRef.current?.(e)
      }

      ws.onerror = () => {
        if (!mountedRef.current) return
        onCloseRef.current?.(new Event('error'))
      }

      ws.onclose = () => {
        wsRef.current = null
        if (!mountedRef.current) return
        onCloseRef.current?.(new Event('close'))
        const delay = Math.min(1000 * Math.pow(2, attemptRef.current - 1), 15000)
        retryRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
      if (wsRef.current) { try { wsRef.current.close() } catch {} }
    }
  }, [])

  return wsRef
}
