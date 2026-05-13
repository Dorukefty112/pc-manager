# Changelog

## [1.0.0] — 2026-05-14

İlk sürüm. PC Manager — Sistem yönetimi ve OSINT platformu.

### Eklenenler

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

### Teknik

- Backend: Python 3 + FastAPI + Uvicorn
- Frontend: React 19 + Vite + Tailwind CSS
- Auth: JWT (python-jose)
- Deployment: systemd servisi, curl ile tek komut kurulum

---

Sürüm notları: [GitHub Releases](https://github.com/Dorukefty112/pc-manager/releases)
