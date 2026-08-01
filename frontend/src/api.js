export function getServerBase() {
  return localStorage.getItem('pcmanager_server_url') || ''
}

export function setServerBase(url) {
  if (url) {
    localStorage.setItem('pcmanager_server_url', url)
  } else {
    localStorage.removeItem('pcmanager_server_url')
  }
  API = url || ''
}

export let API = getServerBase()

function getToken() {
  return localStorage.getItem('pcmanager_token')
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('pcmanager_token', token)
  } else {
    localStorage.removeItem('pcmanager_token')
  }
}

export function isAuthenticated() {
  return !!getToken()
}

export async function api(path, opts = {}) {
  const token = getToken()
  const headers = { ...(opts.headers || {}) }
  if (token && !path.startsWith('/api/auth/')) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${API}${path}`, { ...opts, headers })
  if (res.status === 401) {
    if (window.location.pathname !== '/login') {
      setToken(null)
      window.location.href = '/login'
    }
    throw new Error('Oturum süresi doldu')
  }
  if (!res.ok) throw new Error(await res.text())
  if (opts.raw) return res
  return res.json()
}

export function wsUrl(path) {
  const token = getToken() || ''
  const base = API
  let protocol, host
  if (base) {
    const u = new URL(base)
    protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    host = u.host
  } else {
    protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    host = window.location.host
  }
  return `${protocol}//${host}${path}?token=${encodeURIComponent(token)}`
}
