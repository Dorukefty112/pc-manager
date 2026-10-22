const TOKEN_KEY = 'pcmanager_token'
const USER_KEY = 'pcmanager_user'
const NOTICE_KEY = 'pcmanager_login_notice'

// Sunucunun WebSocket kapanış kodları (backend/dependencies.py ile aynı olmalı)
export const WS_UNAUTHORIZED = 4401
export const WS_FORBIDDEN = 4403

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

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

/**
 * Oturumu kaydeder; null/undefined verilirse temizler.
 * (Not: parametre varsayılanı `= {}` yalnızca undefined için çalışır, null için
 * destructuring TypeError fırlatırdı — süresi dolan oturumda yönlendirmeyi ve
 * çıkış butonunu bozan hata buydu.)
 */
export function setSession(session) {
  const { token, username, role } = session || {}
  setToken(token || null)
  try {
    if (token) {
      localStorage.setItem(USER_KEY, JSON.stringify({ username, role }))
    } else {
      localStorage.removeItem(USER_KEY)
    }
  } catch {}
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || { username: 'admin', role: 'admin' }
  } catch {
    return { username: 'admin', role: 'admin' }
  }
}

export function isAdmin() {
  return getUser().role === 'admin'
}

export function isAuthenticated() {
  return !!getToken()
}

/** Giriş ekranında gösterilecek tek seferlik uyarıyı okur ve siler. */
export function takeLoginNotice() {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY)
    sessionStorage.removeItem(NOTICE_KEY)
    return notice
  } catch {
    return null
  }
}

let redirecting = false
let lastProbe = 0

/** Yalnızca testler için: modül durumunu sıfırlar. */
export function _resetAuthState() {
  redirecting = false
  lastProbe = 0
}

/**
 * Oturum geçersiz (süresi dolmuş, iptal edilmiş, sunucu anahtarı değişmiş...).
 * Yerel oturumu temizler ve giriş ekranına yönlendirir. Aynı anda gelen onlarca
 * 401 için yalnızca bir kez çalışır.
 */
export function handleUnauthorized(reason = 'expired') {
  const hadSession = isAuthenticated()
  setSession(null)
  if (window.location.pathname === '/login') return
  if (redirecting) return
  redirecting = true
  if (hadSession) {
    try { sessionStorage.setItem(NOTICE_KEY, reason) } catch {}
  }
  window.location.assign('/login')
}

/**
 * WebSocket kapanışını değerlendirir. Yeniden bağlanılmalıysa true döner.
 *   4401 -> oturum geçersiz: giriş ekranına dön, yeniden deneme
 *   4403 -> yetki yok: yeniden denemenin anlamı yok
 *   diğer -> yeniden dene (ağ kopması vb.)
 * Eski sunucular reddedilen bağlantıyı el sıkışmadan kapatıp yalnızca 1006 verir;
 * hiç açılamayan bağlantılarda oturumu bir kez sınayarak bunu da yakalarız.
 */
export function handleWsClose(event, { opened = false } = {}) {
  const code = event?.code
  if (code === WS_UNAUTHORIZED) {
    handleUnauthorized()
    return false
  }
  if (code === WS_FORBIDDEN) return false
  if (!isAuthenticated()) return false
  if (!opened && Date.now() - lastProbe > 30000) {
    lastProbe = Date.now()
    api('/api/auth/me').catch(() => {})  // 401 ise api() oturumu temizleyip yönlendirir
  }
  return true
}

export async function api(path, opts = {}) {
  const token = getToken()
  const headers = { ...(opts.headers || {}) }
  if (token && path !== '/api/auth/login') {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), opts.timeout || 8000)

  try {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    // 401'i "oturum bitti" saymak için istekte gerçekten bir oturum token'ı olmalı.
    // Giriş (yanlış şifre / 2FA kodu) ve eşleştirme gibi oturumsuz uç noktalar
    // kendi hata mesajlarını döndürür; bunlar yönlendirmeyi tetiklememeli.
    if (res.status === 401 && token && path !== '/api/auth/login') {
      handleUnauthorized()
      const err = new Error('Oturum süresi doldu')
      err.status = 401
      throw err
    }
    if (!res.ok) {
      const text = await res.text()
      let detail = text
      try { detail = JSON.parse(text).detail ?? text } catch {}
      const err = new Error(typeof detail === 'string' ? detail : text)
      err.status = res.status
      throw err
    }
    if (opts.raw) return res
    return res.json()
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('Sunucu yanıt vermedi (Zaman aşımı)')
    }
    throw err
  }
}

/**
 * Ham fetch (dosya yükleme, akış gibi api()'nin JSON sarmalına uymayan istekler) —
 * Authorization başlığını ekler ve 401'i api() ile aynı şekilde işler.
 */
export async function authFetch(path, opts = {}) {
  const token = getToken()
  const headers = { ...(opts.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, { ...opts, headers })
  if (res.status === 401 && token) handleUnauthorized()
  return res
}

/** Çıkış: sunucudaki oturumu kapatmayı dener ama ne olursa olsun yerel oturumu temizler. */
export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST', timeout: 4000 })
  } catch {}
  setSession(null)
  window.location.assign('/login')
}

/**
 * Sunucudaki gerçek oturum/rol bilgisini alıp yerel kayda yazar. Rol sonradan
 * değiştirilmiş olabilir; ayrıca süresi dolmuş bir token'ı sayfa açılır açılmaz yakalar.
 */
export async function syncSession() {
  const me = await api('/api/auth/me')
  if (me.kind !== 'mobile') {
    try { localStorage.setItem(USER_KEY, JSON.stringify({ username: me.username, role: me.role })) } catch {}
  }
  return me
}

export function wsUrl(path) {
  const token = getToken() || ''
  const base = API
  let protocol, host
  if (base) {
    try {
      const u = new URL(base)
      protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
      host = u.host
    } catch {
      protocol = 'ws:'
      host = base
    }
  } else {
    protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    host = window.location.host
  }
  const sep = path.includes('?') ? '&' : '?'
  return `${protocol}//${host}${path}${sep}token=${encodeURIComponent(token)}`
}
