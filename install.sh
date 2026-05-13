#!/bin/bash
set -euo pipefail

REPO_URL="https://github.com/Dorukefty112/pc-manager"
INSTALL_DIR="/opt/pc-manager"
SERVICE_NAME="pc-manager"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

if [[ $EUID -ne 0 ]]; then
    err "Bu script root olarak çalıştırılmalıdır."
    info "Kullanım: sudo bash install.sh"
    exit 1
fi

cat << "EOF"
  ____   ____     ____  __  __
 / ___| |  _ \   |  _ \|  \/  |
| |     | |_) |  | |_) | |\/| |
| |___  |  __/   |  __/| |  | |
 \____| |_|      |_|   |_|  |_|
  ____  __  __   ____
 / ___||  \/  | / ___|
 \___ \| |\/| || |  __
  ___) | |  | || | |_|
 |____/|_|  |_| \____|

Sistem Yönetimi ve OSINT Platformu
EOF
echo ""

info "Kurulum başlatılıyor: PC Manager"
echo ""

# Bağımlılıkları kontrol et
info "Gerekli paketler kontrol ediliyor..."
MISSING=()
for pkg in python nodejs npm git; do
    if ! pacman -Qi "$pkg" &>/dev/null; then
        MISSING+=("$pkg")
    fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
    info "Eksik paketler yükleniyor: ${MISSING[*]}"
    pacman -S --noconfirm "${MISSING[@]}"
    log "Paketler yüklendi"
else
    log "Tüm bağımlılıklar mevcut"
fi

# Projeyi clone'la (veya güncelle)
if [[ -d "$INSTALL_DIR/.git" ]]; then
    warn "$INSTALL_DIR zaten mevcut, güncelleniyor..."
    git -C "$INSTALL_DIR" pull --ff-only
    log "Proje güncellendi"
else
    info "Proje klonlanıyor..."
    if [[ -d "$INSTALL_DIR" ]]; then
        rm -rf "$INSTALL_DIR"
    fi
    git clone "$REPO_URL.git" "$INSTALL_DIR"
    log "Proje klonlandı: $INSTALL_DIR"
fi

# Python venv
if [[ ! -d "$INSTALL_DIR/venv" ]]; then
    info "Python sanal ortam oluşturuluyor..."
    python -m venv "$INSTALL_DIR/venv"
    log "Python venv oluşturuldu"
else
    log "Python venv mevcut"
fi

info "Python bağımlılıkları yükleniyor..."
"$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/backend/requirements.txt"
log "Python bağımlılıkları yüklendi"

# Frontend build
info "Frontend bağımlılıkları yükleniyor..."
npm install --prefix "$INSTALL_DIR/frontend" --silent
log "npm bağımlılıkları yüklendi"

info "Frontend build alınıyor..."
npm run build --prefix "$INSTALL_DIR/frontend" --silent
log "Frontend build tamamlandı"

# Tailscale IP tespiti (varsa)
TAILSCALE_IP=""
if command -v tailscale &>/dev/null; then
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || true)
    if [[ -n "$TAILSCALE_IP" ]]; then
        info "Tailscale tespit edildi: $TAILSCALE_IP"
    fi
fi

# systemd servisi
info "systemd servisi oluşturuluyor..."
cat > /etc/systemd/system/$SERVICE_NAME.service << SERVICEEOF
[Unit]
Description=PC Manager Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pc-manager/backend
Environment="PATH=/opt/pc-manager/venv/bin:/usr/local/bin:/usr/bin:/bin"
$(if [[ -n "$TAILSCALE_IP" ]]; then echo "Environment=\"TAILSCALE_IP=$TAILSCALE_IP\""; fi)
ExecStart=/opt/pc-manager/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8081 --log-level info
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICEEOF
log "systemd servisi oluşturuldu"

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

echo ""
log "Kurulum tamamlandı!"
echo ""
info "Web arayüzü:  http://localhost:8081"
if [[ -n "$TAILSCALE_IP" ]]; then
    info "Tailscale:     http://${TAILSCALE_IP}:8081"
fi
info "API dökümanı: http://localhost:8081/docs"
echo ""
info "Varsayılan şifre: pcmanager"
info "Kurulumdan sonra ilk açılışta yönetici şifresi belirleyebilirsiniz."
echo ""
info "Servis yönetimi:"
info "  sudo systemctl status $SERVICE_NAME"
info "  sudo systemctl restart $SERVICE_NAME"
info "  sudo systemctl stop $SERVICE_NAME"
echo ""

if systemctl is-active --quiet $SERVICE_NAME; then
    log "PC Manager çalışıyor! 🚀"
else
    err "PC Manager başlatılamadı. Loglar: journalctl -u $SERVICE_NAME -n 50"
fi
