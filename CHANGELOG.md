# Changelog

## [1.3.0] — 2026-06-19

- **Çoklu Dağıtım Desteği**: install.sh artık Arch/Debian/Fedora/openSUSE ve türevlerini otomatik algılar, pacman/apt/dnf/zypper ile kurulum yapar.
- **i18n / Çoklu Dil Desteği**: Türkçe + İngilizce tam çeviri. Tüm frontend sayfaları `t()` fonksiyonu ile dönüştürüldü. Ayarlar > Genel'den dil seçimi.
- **Podman + Docker Compose Desteği**: Podman otomatik algılama, docker-compose projelerini listeleme/başlatma/durdurma/log görüntüleme. Konteyner CPU/RAM istatistikleri.
- **nftables/iptables Firewall**: UFW'ye ek olarak native Linux firewall yönetimi. Tablo/chain listeleme, kural ekleme/silme, flush.
- **Playbook Motoru**: Ansible benzeri otomasyon sistemi. JSON tabanlı playbook'lar (komut/service/paket/dosya/bekleme/webhook adımları). CRUD + canlı WebSocket çalıştırma. AI asistan üzerinden de yönetilebilir.
- **AI Agent Araçları**: firewal native, playbook, docker compose için yeni tool'lar eklendi.
- **install.sh İyileştirmeleri**: `hostname -I` yerine `ip -4 addr` ile taşınabilir IP tespiti. Python/nodejs eksiklerinde otomatik kurulum.

## [1.2.0] — 2026-05-27

- **9 Yeni AI Agent Aracı**: Docker yönetimi, Güvenlik Duvarı (UFW), Hız Testi, Windows/WSL, Güç yönetimi, Güncellemeler, Cron, Ayarlar, Bildirimler — AI asistan artık 25+ aracı kullanabilir.
- **Windows/WSL**: tools.py'ye windows tool'u eklendi (servisler, processler, diskler, komut çalıştırma).
- **Firewall Tool**: UFW durumu sorgulama, aç/kapa, kural ekleme/silme.
- **Hız Testi Tool**: Speedtest başlatma ve sonuç sorgulama.
- **Güç Tool**: Shutdown/reboot.
- **Güncelleme Tool**: apt/pacman güncelleme kontrolü ve yükseltme.
- **Cron Tool**: Cron job listeleme, ekleme, silme.
- **Ayarlar Tool**: PC Manager config okuma ve güncelleme.

## [1.1.0] — 2026-05-27

- **Sıcaklık İzleme**: GPU (nvidia-smi), CPU sensör sıcaklıkları, sistem yükü. Yeni dashboard olarak `Temperature.jsx`.
- **Yenilenen Dashboard**: Canlı CPU/RAM geçmişi grafiği, sıcaklık kartları, sistem yükü göstergeleri.
- **Speedtest**: Internet hız testi (speedtest-cli), canlı ilerleme, geçmiş kaydı. 3 faz: hazırlık/indirme/yükleme.
- **Güvenlik Duvarı Yönetimi**: UFW durum/kural görüntüleme, aç/kapa/yeniden yükle/sıfırla, kural ekleme/silme.
- **Router Düzeltmesi**: 26 endpoint'ten 10'una eksik auth eklendi (speedtest, firewall, temperature dahil).
- **Speedtest Tool**: AI agent için speedtest tool'u eklendi.

## [1.0.7] — 2026-05-26

- **Windows/WSL Entegrasyonu**: Servisler, processler, diskler, ağ, sistem bilgisi, event log ve komut çalıştırma. Settings'ten aç/kapa.
- **PWA Desteği**: manifest.json, service worker (cache-first), SVG ikonlar (192/512). Mobilde "Ana Ekrana Ekle" çalışır.
- **Tema Sistemi**: Dark/light mode, ThemeContext ile localStorage'da kalıcı, tüm sayfalarda CSS variables.
- **UI Tamamen Yenilendi**: Glassmorphism kartlar, gradient vurgular, fade-in/scale animasyonlar, modern scrollbar, özel input/button stilleri.
- **Arama Motoru Yeniden Yazıldı**: Zengin sonuç kartları (favicon, domain, snippet), DuckDuckGo favicon CDN, pagination, autocomplete.
- **İç Sayfa Tarayıcı (Proxy)**: `/api/proxy/page` endpoint'i — auth gerektirmez, `<base>` tag rewrite ile same-origin iframe, XML/JSON/JS dahil tüm içerik türleri desteklenir.
- **Reader Mode**: Backend BeautifulSoup ile metin çıkarma, frontend'de sade okuma görünümü.
- **Statik Dosya Düzeltmesi**: main.py catch-all route'da dosya varlık kontrolü — 404 yerine SPA fallback.
- **Güvenlik**: `/api/proxy/page` artık public (iframe auth header göndermediği için).

## [1.0.6] — 2026-05-16

- **AFAD fallback düzeltmesi**: AFAD API'nin hem `{ "data": [...] }` hem de direkt `[...]` cevap formatları desteklenir.
- **Deprem regression testleri**: AFAD liste formatı ve Kandilli boşken AFAD fallback davranışı test kapsamına alındı.

## [1.0.5] — 2026-05-15

- **Bildirim Motoru**: CPU/RAM/Disk eşik değerleri arka planda her 30sn kontrol edilir, aşılınca Telegram/E-posta/Webhook ile bildirim gönderilir.
- **E-posta Bildirimi**: SMTP desteği (TLS, Gmail/Outlook uyumlu). Ayarlar > E-posta.
- **Webhook Bildirimi**: Discord/Slack/Teams için generic HTTP POST. Ayarlar > Webhook.
- **Telegram Bildirimi**: Bildirim kanalı olarak kullanılabilir (varsayılan: açık). Ayarlar > Bildirimler.
- **Alarm Geçmişi**: Tüm bildirimler kaydedilir, Settings > Bildirimler > Alarm Geçmişi'nden görüntülenir ve temizlenir.
- **Deprem Telegram**: Artık tüm depremler (M2+, 300km içi) batch halinde gönderilir, duplicate korumalı.
- **WebSocket Reconnection**: Dashboard/Terminal/PenTest WS bağlantıları kopunca otomatik yeniden bağlanır.
- **JWT Secret Kalıcılığı**: Secret `.jwt_secret` dosyasına yazılır, restart'ta token'lar geçersiz olmaz.
- **Login Refresh Döngüsü Düzeltildi**: 3 farklı 401 kaynağı temizlendi, api.js 401 handler'ı login sayfasında refresh yapmaz.
- **WebSocket Auth Blokajı Düzeltildi**: Router-level auth WebSocket'leri blokluyordu, HTTP endpoint'lere tek tek auth eklendi.

## [1.0.4] — 2026-05-15

- **Auth güçlendirme**: SHA-256 → bcrypt şifre hashing. Eski hash'ler login'de otomatik bcrypt'e yükseltilir.
- **Auth açıkları kapatıldı**: settings, telegram, system, terminal, pentest, ollama, debug, search_engine, debug_agent endpoint'lerine auth eklendi.
- **Genel auth**: 10 endpoint artık token gerektiriyor.

## [1.0.3] — 2026-05-14

- **Kritik bug duzeltmeleri**: chat.py _clean_output UnboundLocalError, shutdown/reboot calismama, deprem DIKKAT seviyesi hep true donme, ollama off-by-one loop, settings shallow copy corruption, cron substring matching
- **Async performans**: execute_tool artik event loop'u bloklamiyor (run_in_executor)
- **Frontend**: Debug link full page reload yerine SPA nav, map marker key fix, parseInt NaN fix, DepremAlert interval leak fix, bold markdown her yerde calisiyor
- **Zaman asimlari**: web_search 8sn, web_fetch 8sn

## [1.0.2] — 2026-05-14

- **Duzenlenen Acil Durum Banner**: PC modunda sidebar padding sorunu cozuldu.
- **Ollama Agent kararlilik**: Tool hatalari icin ikinci try/except kalkani, internet yokken kirilma yerine hata mesaji gosterir.
- **web_search/web_fetch zaman asimi**: Timeout 15sn → 8sn dusuruldu.
- **Sistem Prompt guncellendi**: Tool hatalarinda kullaniciyi bilgilendirme talimati eklendi.

## [1.0.1] — 2026-05-14

- **Telegram Bildirimleri**: KRITIK/YUKSEK depremlerde telefona aninda uyari. Ayarlar → Telegram'dan bot token ve chat ID girilir.
- **Deprem Haritasi**: Leaflet ile interaktif harita, buyukluk/risk bazli markerlar, popup detay.
- **Acil Durum Modu**: Depremde asistan hayatta kalma moduna gecer, kirmizi overlay + banner.
- **web_fetch tool**: Agent'in sayfa icerigini okumasi icin yeni tool.
- **Duzenlenen Mobil Sidebar**: Leaflet harita uzerinde menu acilinca overlay dogru calisiyor.
- **Settings API**: Eksik config anahtarlari otomatik tamamlaniyor.

## [1.0.0] — 2026-05-14

İlk sürüm. PC Manager — Sistem yönetimi ve OSINT platformu.

### Eklenenler

- **Pc_Search_Engine**: Web (DuckDuckGo), yerel dosya ve sistem arama — tamamen özgün arama motoru
- **Sistem Yönetimi**: CPU, RAM, disk, uptime takibi
- **Dosya Yönetimi**: Web üzerinden dosya gezintisi, yükleme, indirme
- **Güç Yönetimi**: Shutdown, reboot, sleep
- **Terminal**: Web tabanlı tam terminal (xterm.js)
- **Süreç Yönetimi**: Listeleme, sonlandırma (SIGTERM/SIGKILL)
- **Ağ İzleme**: Bağlantılar, port kullanımı, bant genişliği
- **Disk Takibi**: Partition kullanımı, mount noktaları
- **Güncellemeler**: pacman güncelleme yönetimi
- **Log Görüntüleyici**: journalctl ile sistem logları
- **Servis Yönetimi**: systemd start/stop/restart/enable/disable
- **Docker**: Container ve image yönetimi
- **Cron**: Cron job görüntüleme ve düzenleme
- **Ollama Sohbet**: Yerel AI asistanı (tool calling destekli)
- **Deprem İzleme**: Kandilli + AFAD verisi ile canlı deprem takibi, sesli uyarı, risk analizi
- **OSINT**: 11 araç ile email/kullanıcı adı/domain/telefon sorgulama (unified scanner)
- **Pentest**: 20+ güvenlik aracı (Nmap, SQLMap, Hydra, John, Gobuster, vb.)
- **Kimlik Doğrulama**: JWT tabanlı giriş sistemi
- **Kurulum Sihirbazı**: İlk açılışta site adı, yönetici adı ve şifre belirleme ekranı
- **Özelleştirilebilir Şifre**: `PCMANAGER_PASSWORD` ortam değişkeni ile kurulum öncesi şifre belirleme
- **Tailscale Desteği**: install.sh otomatik Tailscale IP tespiti ve servise ekleme
- **API**: `GET /api/setup` ve `POST /api/setup` ile kurulum yönetimi
- **Sürüm**: `GET /api/version` endpoint'i, VERSION dosyası

### Düzeltmeler

- AFAD API URL'si güncellendi (eski domain 302 redirect veriyordu)
- Deprem tool'u HTTP self-reference yerine direkt fonksiyon çağrısı yapıyor
- Zaman dilimi (timezone) sorunu giderildi (Kandilli UTC+3, AFAD UTC)
- Ollama system prompt'a deprem tool'u eklendi
- Frontend hataları sessizce yutmak yerine gösteriyor
- Kişisel kullanıcı adı (`doruk`) koddan kaldırıldı, yerine generic `kullanici` kullanıldı
- README'ye hata uyarısı banner'ı eklendi
- Deprem uyarı yoklama aralığı 15sn → 30sn düşürüldü

### Teknik

- Backend: Python 3 + FastAPI + Uvicorn
- Frontend: React 19 + Vite + Tailwind CSS
- Auth: JWT (python-jose), SHA-256 password hash
- Deployment: systemd servisi, curl ile tek komut kurulum
- Auth: Şifre `config.json`, ortam değişkeni veya varsayılan olarak okunur

---

Sürüm notları: [GitHub Releases](https://github.com/Dorukefty112/pc-manager/releases)
