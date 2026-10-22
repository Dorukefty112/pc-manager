# PC Manager

**Sistem yönetimi platformu** — Modern web arayüzü ile sunucu yönetim işlemlerinizi yönetin.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-2.2.1-blue)

> ⚠️ **Uyarı:** Bu proje kişisel kullanım için geliştirilmektedir. Bazı özellikler beklendiği gibi çalışmayabilir veya eksik olabilir.Bu proje hobi için yapılmıştır ve kullanıcıların yararlanması için genel kullanıma açılmıştır. **HİÇ BİR SORUMLULUK BANA AİT DEĞİLDİR!** Bu proje tamamen bir AI agent (opencode un servis ettiği big pickle,google gemini antigravity deki çeşitli modeller ve claude sonnet 5 ve opus 5) ile geliştirilmiştir, bu nedenle hatalar ve tutarsızlıklar içerebilir.

## Sistem Gereksinimleri

| Bileşen | Gereksinim |
|---------|------------|
| **İşletim Sistemi** | Linux (tüm dağıtımlar) |
| **CPU** | 2+ çekirdek |
| **RAM** | En az 1GB (Ollama ile 4GB+ önerilir) |
| **Depolama** | 500MB boş alan (Ollama modelleri için +5GB) |
| **Python** | 3.11+ |
| **Node.js** | 18+ |
| **Ollama** (opsiyonel) | AI asistan için gerekli |

## Özellikler

| Modül | Açıklama |
|-------|----------|
| 🖥️ **Sistem** | CPU, RAM, disk, uptime, sistem bilgisi |
| 📁 **Dosya Yönetimi** | Gezinti, yükleme, indirme, kod editörü, toplu işlemler, arşivleme/açma |
| ⚡ **Güç Yönetimi** | Shutdown, reboot, sleep |
| 🧪 **Terminal** | Web tabanlı tam terminal emülatörü (xterm.js), SSH, oturum kayıtları |
| ⚙️ **Süreçler** | Süreç listeleme, sonlandırma (SIGTERM/SIGKILL) |
| 🌐 **Ağ** | Bağlantılar, port kullanımı, bant genişliği |
| 💾 **Disk** | Partition kullanımı, mount noktaları, disk sağlığı |
| 📦 **Güncellemeler** | pacman güncelleme yönetimi |
| 📋 **Loglar** | journalctl log görüntüleme ve filtreleme |
| 🔧 **Servisler** | systemd servis yönetimi (start/stop/restart/enable/disable) |
| 🐳 **Docker** | Container/image yönetimi, canlı log, konteyner terminali, compose, temizlik |
| ⏰ **Cron** | Cron job görüntüleme ve düzenleme, systemd zamanlayıcıları |
| 💬 **Sohbet** | Ollama ile yerel AI sohbet asistanı |
| 🛡️ **Pentest** | Nmap, SQLMap, Hydra, John, Gobuster ve 12+ diğer güvenlik aracı |
| 🌍 **Deprem İzleme** | Sismik Harita (Kandilli, AFAD, USGS, EMSC, GFZ, NOA, IRIS) API entegrasyonlu gelişmiş canlı deprem takibi, istatistikler, filtreler ve sesli uyarı |
| 🔎 **Pc_Search_Engine** | Web (DuckDuckGo), yerel dosya ve sistem arama motoru |
| ⚙️ **Kurulum Sihirbazı** | İlk açılışta site adı, yönetici adı ve şifre belirleme |
| 📈 **Metrik Geçmişi** | 7 günlük CPU/RAM/disk/ağ/G-Ç/sıcaklık geçmişi, senkron grafikler, Prometheus çıktısı |
| 🔔 **Alarm Kuralları** | Süre, tekrar ve "düzeldi" bildirimli kurallar: CPU, RAM, disk, sıcaklık, servis, süreç, HTTP |
| 👥 **Kullanıcılar & Güvenlik** | Çoklu kullanıcı, yönetici/izleyici rolleri, oturum yönetimi, 2FA (TOTP), API token'ları |
| 🗄️ **Yedekler** | Zamanlanmış `.tar.gz` yedekleri, saklama sayısı, hariç tutma, indirme ve geri yükleme |
| 🖧 **Sunucular** | Diğer PC Manager kurulumlarını tek panelden izleme, kayıtlı hedeflere SSH |
| 📡 **Wake-on-LAN** | Yerel ağdaki bilgisayarları uzaktan açma |

## Hızlı Başlangıç

### Tek Komutla Kurulum

```bash
bash <(curl -s https://raw.githubusercontent.com/Dorukefty112/pc-manager/master/install.sh)
```

Kurulum tamamlandıktan sonra `http://localhost:8081` adresine gidin. İlk açılışta kurulum sihirbazı sizi karşılayacaktır.

Tailscale kullanıyorsanız, script otomatik olarak Tailscale IP'nizi tespit eder ve servise ekler.

### Manuel Kurulum

```bash
# Bağımlılıkları yükle
sudo pacman -S --noconfirm python python-pip nodejs npm git

# Projeyi clone'la
sudo git clone https://github.com/Dorukefty112/pc-manager.git /opt/pc-manager

# Python venv ve bağımlılıklar
sudo python -m venv /opt/pc-manager/venv
sudo /opt/pc-manager/venv/bin/pip install -r /opt/pc-manager/backend/requirements.txt

# Frontend build
sudo npm install --prefix /opt/pc-manager/frontend
sudo npm run build --prefix /opt/pc-manager/frontend

# Servis olarak başlat
sudo bash /opt/pc-manager/install.sh
```

## Kullanım

### Web Arayüzü

`http://localhost:8081` — Tüm özelliklere tarayıcı üzerinden erişim.

### Servis Yönetimi

```bash
sudo systemctl status pc-manager    # Durum kontrolü
sudo systemctl start pc-manager     # Başlatma
sudo systemctl stop pc-manager      # Durdurma
sudo systemctl restart pc-manager   # Yeniden başlatma
sudo systemctl enable pc-manager    # Otomatik başlatma
```

## Teknolojiler

| Bileşen | Teknoloji |
|---------|-----------|
| **Backend** | Python 3, FastAPI, Uvicorn |
| **Frontend** | React 19, Vite, Tailwind CSS, Lucide React |
| **Terminal** | xterm.js |
| **Auth** | JWT (python-jose) |
| **AI** | Ollama (gemma4) |
| **Pentest** | Nmap, Masscan, SQLMap, Hydra, John, Gobuster, Nikto, Wfuzz, Dirb, SearchSploit |

## API Dokümantasyonu

Backend çalışırken: [http://localhost:8081/docs](http://localhost:8081/docs) (Swagger UI)

## Telegram Bildirimleri (Deprem Uyarisi)

KRITIK ve YUKSEK seviye depremlerde telefonunuza aninda bildirim almak icin:

1. Telegram'da [@BotFather](https://t.me/BotFather)'a gidin, `/newbot` yazip bir bot olusturun
2. Size verilen **token**'i kopyalayin (ornek: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
3. Yeni botunuza herhangi bir mesaj atin
4. `https://api.telegram.org/bot<TOKEN>/getUpdates` adresine gidin, `"chat":{"id":123456789}` kismindaki **chat ID**'yi bulun
5. PC Manager'da **Ayarlar → Telegram** sekmesine token ve chat ID'yi girip kaydedin
6. "Test Mesaji Gonder" butonuyla dogrulayin

## Termux (Android) — Telefonda Çalıştırma

PC Manager'ı doğrudan Android telefonda [Termux](https://termux.dev) (F-Droid sürümü) ile çalıştırabilirsiniz. **Root gerekmez**; root varsa güç yönetimi (kapat/yeniden başlat) de etkinleşir. 64-bit (arm64) ve 32-bit (armv7) telefonlar desteklenir.

```bash
pkg install -y curl
bash <(curl -fsSL https://raw.githubusercontent.com/Dorukefty112/pc-manager/master/install-termux.sh)
```

Kurulum bitince `~/pc-manager/start.sh` ile başlatın ve telefonda `http://localhost:8081`, aynı Wi-Fi'daki başka cihazdan `http://<telefon-ip>:8081` adresine gidin. Portu değiştirmek için `PCMANAGER_PORT=9000 ./start.sh`. Güncellemek için aynı kurulum komutunu tekrar çalıştırmanız yeterli.

Kurulum telefonda hiçbir şeyi kaynaktan derlemez: native Python paketleri (psutil, cryptography, bcrypt, lxml) Termux'un hazır paketlerinden, arayüz ise CI'ın derleyip `frontend-dist` dalına koyduğu hazır hâliyle gelir.

Android'in kısıtlamaları nedeniyle:
- **Root'suz cihazda** sistem geneli CPU yüzdesi gösterilemez (Android 8+ `/proc/stat`'ı uygulamalara kapatıyor; 0 görünür), ağ sayaçları cihaza göre eksik olabilir; kapatma/yeniden başlatma, systemd servisleri ve paket güncellemeleri kullanılamaz. RAM, disk, sıcaklık (termal bölgeler), dosyalar, terminal, yedekler, alarmlar çalışır.
- **Root'lu cihazda** güç komutları `su` ile çalıştırılır.
- Web araması (`ddgs` Rust/BoringSSL gerektiriyor) ve mDNS otomatik keşfi devre dışıdır; mobil eşleştirme QR kodu/IP ile çalışır.
- Termux'u arka planda canlı tutmak için `termux-wake-lock` çalıştırın. [Termux:Boot](https://wiki.termux.com/wiki/Termux:Boot) uygulamasını kurarsanız telefon açılışında kendiliğinden başlar (kurucu betik gerekli dosyayı oluşturur).

## Mobil Uygulama (Android)

PC Manager'ın Android uygulaması, `frontend/` içindeki React arayüzünü [Capacitor](https://capacitorjs.com) ile native bir kabuğa sararak aynı kod tabanından üretilir. Uygulama, telefonun Tailscale üzerinden eve bağlanmasını kullanarak uzaktan çalışır.

**Eşleştirme:** PC Manager'da **Ayarlar → Mobil Cihazlar**'dan bir QR kod/6 haneli kod üretin, uygulamada "Kodu Tara" ile okutun (veya IP/port/kodu elle girin). Cihaz eşleştikten sonra uzun ömürlü bir token alır; **Ayarlar → Mobil Cihazlar**'dan istediğiniz an yetkisini geri alabilirsiniz.

**Build (kendi makinenizde, Android Studio ile):**
```bash
cd frontend
npm install
npm run build
npx cap sync android
npx cap open android
```
Android Studio açıldığında normal şekilde Run/Build APK yapabilirsiniz. Bu adım Android SDK gerektirir.

## Kullanıcılar, Roller ve 2FA

**Kullanıcılar → Kullanıcılar** sekmesinden yeni hesap ekleyebilirsiniz:

- **Yönetici**: her şeye tam erişim.
- **İzleyici**: salt-okunur. Durum ve metrikleri görebilir; dosyalar, ayarlar, terminal, pentest, yedekler gibi hassas alanlara erişemez ve hiçbir değişiklik yapamaz.

Mevcut tek şifreli kurulumlar `admin` kullanıcısı olarak çalışmaya devam eder; giriş ekranında kullanıcı adı boş bırakılabilir.
**Hesabım** sekmesinden şifre değiştirebilir ve Google Authenticator/Aegis gibi bir uygulamayla iki adımlı doğrulamayı açabilirsiniz.
**Oturumlar & Token** sekmesinde açık oturumlarınızı görüp kapatabilirsiniz.

## Metrikler ve Prometheus

Arka planda her 10 saniyede bir ölçüm alınır ve `backend/metrics.db` içinde 7 gün saklanır (**Metrik Geçmişi** sayfası).
Prometheus ile izlemek için **Kullanıcılar → Oturumlar & Token**'dan *İzleyici* rollü bir API token'ı oluşturun:

```yaml
scrape_configs:
  - job_name: pc-manager
    metrics_path: /api/metrics/prometheus
    authorization:
      credentials: <API_TOKEN>
    static_configs:
      - targets: ["100.64.0.2:8081"]
```

Aynı token, **Sunucular** sayfasında başka bir PC Manager kurulumunu izlemek için de kullanılır.

## Yedekleme

**Yedekler** sayfasında görev oluşturun: kaynak dizinler, hedef dizin, zamanlama (manuel/saatlik/günlük/haftalık), saklanacak arşiv sayısı ve hariç tutma desenleri (`*.log`, `node_modules`...).
Arşivler tam yollarıyla saklanır; geri yükleme seçtiğiniz dizinin altına aynı ağacı kurar (`/` seçilirse yerine yazar).
"PC Manager ayarlarını yedekle" düğmesi uygulamanın kendi ayar dosyaları için hazır bir görev oluşturur.

## Güvenlik

- JWT tabanlı kimlik doğrulama; her giriş sunucu tarafında bir oturum kaydı açar, çıkış ve oturum kapatma anında etkilidir
- Tüm hassas işlemler auth gerektirir (CI'da tüm uç noktaları tarayan bir test bunu doğrular)
- Şifre hash ile saklanır (bcrypt), isteğe bağlı TOTP 2FA
- Girişte kaba kuvvet koruması: 5 dakikada aynı IP ve kullanıcı için 10, aynı IP için toplam 40 hatalı deneme → geçici kilit
- Kurulum sihirbazı tamamlanmadan giriş kapalıdır (varsayılan şifreyle yeni kurulmuş cihaz ele geçirilemez)
- Oturumlar kayan süreli: 24 saat boşta kalınca biter, en fazla 30 gün yaşar (`PCMANAGER_SESSION_HOURS`, `PCMANAGER_SESSION_MAX_DAYS`)
- Sunucu loglarında `?token=` değerleri maskelenir
- Şifre ortam değişkeni ile özelleştirilebilir (`PCMANAGER_PASSWORD`)

> **v2.2.0'a yükseltenler için:** Önceki sürümlerde kimlik doğrulamasız erişilebilen bir dosya okuma açığı ve korumasız playbook uç noktaları kapatıldı.
> Sunucunuz ağa açıksa `backend/.jwt_secret` dosyasını silip servisi yeniden başlatmanız (yeni imza anahtarı üretilir) ve yönetici şifrenizi değiştirmeniz önerilir.
> Yükseltmeden sonra tüm kullanıcıların bir kez yeniden giriş yapması gerekir.

## Lisans

MIT
