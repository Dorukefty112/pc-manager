# Changelog

## [1.0.4] — 2026-05-15

- **Auth guclendirme**: SHA-256 → bcrypt sifre hashing. Eski hash'ler login'de otomatik bcrypt'e yukseltilir.
- **Auth aciklari kapatildi**: settings, telegram, system, terminal, pentest, ollama, debug, search_engine, debug_agent endpoint'lerine auth eklendi. Sadece /api/version, /api/auth/login, /api/deprem, /api/setup public kaldi.
- **Genel auth**: 10 endpoint art�k token gerektiriyor.

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
