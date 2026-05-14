export const API = ''

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
