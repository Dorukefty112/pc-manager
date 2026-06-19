# PC Manager

> _Not: Yapay zekâ araçlarında yaşadığım sorunlar nedeniyle güncellemeler bir süre daha yavaş ilerleyecek._

**Sistem yönetimi ve OSINT platformu** — Modern web arayüzü ile sunucu yönetim işlemlerinizi yönetin.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.3.0-blue)

> ⚠️ **Uyarı:** Bu proje kişisel kullanım için geliştirilmektedir. Bazı özellikler beklendiği gibi çalışmayabilir veya eksik olabilir.Bu proje hobi için yapılmıştır ve kullanıcıların yararlanması için genel kullanıma açılmıştır. **HİÇ BİR SORUMLULUK BANA AİT DEĞİLDİR!** Bu proje tamamen bir AI agent (opencode) ile geliştirilmiştir, bu nedenle hatalar ve tutarsızlıklar içerebilir.

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
| 📁 **Dosya Yönetimi** | Gezinti, yükleme, indirme, düzenleme |
| ⚡ **Güç Yönetimi** | Shutdown, reboot, sleep |
| 🧪 **Terminal** | Web tabanlı tam terminal emülatörü (xterm.js) |
| ⚙️ **Süreçler** | Süreç listeleme, sonlandırma (SIGTERM/SIGKILL) |
| 🌐 **Ağ** | Bağlantılar, port kullanımı, bant genişliği |
| 💾 **Disk** | Partition kullanımı, mount noktaları, disk sağlığı |
| 📦 **Güncellemeler** | pacman güncelleme yönetimi |
| 📋 **Loglar** | journalctl log görüntüleme ve filtreleme |
| 🔧 **Servisler** | systemd servis yönetimi (start/stop/restart/enable/disable) |
| 🐳 **Docker** | Container ve image yönetimi |
| ⏰ **Cron** | Cron job görüntüleme ve düzenleme |
| 💬 **Sohbet** | Ollama ile yerel AI sohbet asistanı |
| 🔍 **OSINT** | Email, kullanıcı adı, domain, telefon sorgulama araçları (11+ araç) |
| 🛡️ **Pentest** | Nmap, SQLMap, Hydra, John, Gobuster ve 20+ güvenlik aracı |
| 🌍 **Deprem İzleme** | Kandilli + AFAD verisi ile canlı deprem takibi, sesli uyarı |
| 🔎 **Pc_Search_Engine** | Web (DuckDuckGo), yerel dosya ve sistem arama motoru |
| ⚙️ **Kurulum Sihirbazı** | İlk açılışta site adı, yönetici adı ve şifre belirleme |

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
| **OSINT** | Holehe, Maigret, Amass, PhoneInfoga, Subfinder, SocialScan, H8Mail, WhatsMyName, DNSTwist, WhatBreach, ExifTool, Sherlock |
| **Pentest** | Nmap, Masscan, SQLMap, Hydra, John, Gobuster, Nikto, Wfuzz, Dirb, SearchSploit, Metasploit, theHarvester |

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

## Güvenlik

- JWT tabanlı kimlik doğrulama
- Tüm hassas işlemler auth gerektirir
- Şifre hash ile saklanır (SHA-256)
- OSINT araçları rate-limit korumalı
- Şifre ortam değişkeni ile özelleştirilebilir (`PCMANAGER_PASSWORD`)

## Lisans

MIT
