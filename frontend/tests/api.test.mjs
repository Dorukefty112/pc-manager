// İstemci auth çekirdeği testleri (tarayıcı ortamı taklit edilir; ek bağımlılık gerekmez).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

class Store {
  constructor() { this.m = new Map() }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null }
  setItem(k, v) { this.m.set(k, String(v)) }
  removeItem(k) { this.m.delete(k) }
  clear() { this.m.clear() }
}

globalThis.localStorage = new Store()
globalThis.sessionStorage = new Store()
const location = { pathname: '/', host: 'pc.local:8081', protocol: 'http:', assigned: [], assign(url) { this.assigned.push(url) } }
globalThis.window = { location }

let calls = []
let respond = () => new Response('{}', { status: 200 })
globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return respond(url, opts) }

const A = await import('../src/api.js')

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const login = () => A.setSession({ token: 'tok', username: 'doruk', role: 'viewer' })

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  location.pathname = '/'; location.assigned.length = 0
  calls = []
  respond = () => json(200, { ok: true })
  A._resetAuthState()
})

test('setSession(null|undefined|{}) fırlatmaz ve oturumu temizler (asıl bug)', () => {
  login()
  for (const empty of [null, undefined, {}]) {
    login()
    assert.doesNotThrow(() => A.setSession(empty))
    assert.equal(A.getToken(), null)
    assert.equal(localStorage.getItem('pcmanager_user'), null)
  }
})

test('setSession kaydeder; rol ve kullanıcı okunur', () => {
  login()
  assert.equal(A.isAuthenticated(), true)
  assert.deepEqual(A.getUser(), { username: 'doruk', role: 'viewer' })
  assert.equal(A.isAdmin(), false)
})

test('süresi dolan oturum: oturum temizlenir, TEK yönlendirme yapılır, uyarı bir kez okunur', async () => {
  login()
  respond = () => json(401, { detail: 'Geçersiz veya süresi dolmuş token' })
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => A.api('/api/system/stats')))
  assert.ok(results.every(r => r.status === 'rejected' && r.reason.status === 401))
  assert.equal(A.getToken(), null)
  assert.deepEqual(location.assigned, ['/login'])
  assert.equal(A.takeLoginNotice(), 'expired')
  assert.equal(A.takeLoginNotice(), null)
})

test('giriş ekranındaki 401 (yanlış şifre / 2FA) yönlendirme tetiklemez ve gerçek mesajı taşır', async () => {
  login()  // eski bir token kalmış olsa bile
  location.pathname = '/login'
  for (const detail of ['totp_required', 'totp_invalid', 'Geçersiz kullanıcı adı veya şifre']) {
    respond = () => json(401, { detail })
    await assert.rejects(A.api('/api/auth/login', { method: 'POST' }), e => e.message === detail && e.status === 401)
  }
  assert.deepEqual(location.assigned, [])
  assert.equal(calls.at(-1).opts.headers.Authorization, undefined, 'giriş isteği eski token göndermemeli')
})

test('oturumsuz uç noktalardaki 401 (eşleştirme kodu) oturumu/yönlendirmeyi etkilemez', async () => {
  respond = () => json(401, { detail: 'Eşleştirme kodu geçersiz' })
  await assert.rejects(A.api('/api/pairing/pair', { method: 'POST' }), e => e.message === 'Eşleştirme kodu geçersiz')
  assert.deepEqual(location.assigned, [])
})

test('zaten /login sayfasındayken 401: token temizlenir, döngüye girilmez', async () => {
  login()
  location.pathname = '/login'
  respond = () => json(401, { detail: 'x' })
  await assert.rejects(A.api('/api/settings'))
  assert.equal(A.getToken(), null)
  assert.deepEqual(location.assigned, [])
})

test('403 ve 500 yönlendirme yapmaz, durum kodunu taşır', async () => {
  login()
  respond = () => json(403, { detail: 'Bu işlem için yönetici yetkisi gerekli' })
  await assert.rejects(A.api('/api/files/list'), e => e.status === 403 && /yönetici/.test(e.message))
  respond = () => json(500, { detail: 'patladı' })
  await assert.rejects(A.api('/api/x'), e => e.status === 500)
  assert.equal(A.getToken(), 'tok')
  assert.deepEqual(location.assigned, [])
})

test('çıkış: sunucu hata verse de yerel oturum temizlenir ve yönlendirilir', async () => {
  login()
  respond = () => { throw new TypeError('network down') }
  await A.logout()
  assert.equal(A.getToken(), null)
  assert.deepEqual(location.assigned, ['/login'])
})

test('çıkış: sunucuya oturumu kapatma isteği gider', async () => {
  login()
  await A.logout()
  assert.match(calls[0].url, /\/api\/auth\/logout$/)
  assert.equal(calls[0].opts.method, 'POST')
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok')
  assert.equal(A.getToken(), null)
})

test('authFetch: başlığı ekler ve 401\'i api() gibi işler', async () => {
  login()
  respond = () => json(401, {})
  const res = await A.authFetch('/api/files/upload', { method: 'POST' })
  assert.equal(res.status, 401)
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok')
  assert.equal(A.getToken(), null)
  assert.deepEqual(location.assigned, ['/login'])
})

test('syncSession: rolü sunucudan alıp yerele yazar; mobil token kaydı bozmaz', async () => {
  login()
  respond = () => json(200, { username: 'doruk', role: 'admin', kind: 'web' })
  await A.syncSession()
  assert.equal(A.isAdmin(), true)
  localStorage.setItem('pcmanager_user', JSON.stringify({ username: 'a', role: 'viewer' }))
  respond = () => json(200, { username: 'mobile_client', role: 'admin', kind: 'mobile' })
  await A.syncSession()
  assert.deepEqual(A.getUser(), { username: 'a', role: 'viewer' })
})

test('wsUrl: sorgu dizesi olan yollara ?token ikinci ? olarak eklenmez (SSH host bug\'ı)', () => {
  login()
  assert.equal(A.wsUrl('/api/system/ws'), 'ws://pc.local:8081/api/system/ws?token=tok')
  assert.equal(A.wsUrl('/api/terminal?host=abc'), 'ws://pc.local:8081/api/terminal?host=abc&token=tok')
  assert.equal(A.wsUrl('/api/docker/logs/x/ws?tail=300'), 'ws://pc.local:8081/api/docker/logs/x/ws?tail=300&token=tok')
})

test('handleWsClose: 4401 oturumu temizler, 4403 durur, diğerleri yeniden dener', () => {
  login()
  assert.equal(A.handleWsClose({ code: 4403 }, { opened: true }), false)
  assert.equal(A.getToken(), 'tok')
  assert.equal(A.handleWsClose({ code: 1006 }, { opened: true }), true)
  assert.equal(A.handleWsClose({ code: 4401 }), false)
  assert.equal(A.getToken(), null)
  assert.deepEqual(location.assigned, ['/login'])
  // oturum yokken yeniden deneme yok
  assert.equal(A.handleWsClose({ code: 1006 }, { opened: false }), false)
})

test('handleWsClose: hiç açılamayan (1006) bağlantıda oturumu 30 sn\'de en fazla bir kez sınar', async () => {
  login()
  assert.equal(A.handleWsClose({ code: 1006 }, { opened: false }), true)
  assert.equal(A.handleWsClose({ code: 1006 }, { opened: false }), true)
  await new Promise(r => setTimeout(r, 20))
  assert.equal(calls.filter(c => /\/api\/auth\/me$/.test(c.url)).length, 1)
  // açılmış bir bağlantının kopması sınama yapmaz
  calls = []; A._resetAuthState()
  assert.equal(A.handleWsClose({ code: 1006 }, { opened: true }), true)
  await new Promise(r => setTimeout(r, 20))
  assert.equal(calls.length, 0)
})

test('1006 sınaması 401 dönerse oturum temizlenir (eski sunucu: el sıkışmadan 403)', async () => {
  login()
  respond = () => json(401, { detail: 'x' })
  A.handleWsClose({ code: 1006 }, { opened: false })
  await new Promise(r => setTimeout(r, 20))
  assert.equal(A.getToken(), null)
  assert.deepEqual(location.assigned, ['/login'])
})
