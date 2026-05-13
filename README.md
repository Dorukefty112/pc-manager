# PC Manager

**Sistem yönetimi ve OSINT platformu** — Modern web arayüzü ile sunucu/yönetim işlemlerinizi yönetin.

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Arch%20Linux-blue)

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

## 📸 Ekran Görüntüleri

> *(Eklenecek)*

## Hızlı Başlangıç

### Tek Komutla Kurulum

```bash
bash <(curl -s https://raw.githubusercontent.com/Dorukefty112/pc-manager/master/install.sh)
```

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

Kurulum tamamlandıktan sonra `http://localhost:8081` adresinden erişebilirsiniz.

> **Varsayılan şifre:** `pcmanager`

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

## Güvenlik

- JWT tabanlı kimlik doğrulama
- Tüm hassas işlemler auth gerektirir
- Şifre hash ile saklanır (SHA-256)
- OSINT araçları rate-limit korumalı

## Lisans

MIT
