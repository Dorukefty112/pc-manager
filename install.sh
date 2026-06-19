#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/Dorukefty112/pc-manager.git"
INSTALL_DIR="/opt/pc-manager"
VENV_DIR="$INSTALL_DIR/venv"
BACKEND_DIR="$INSTALL_DIR/backend"
FRONTEND_DIR="$INSTALL_DIR/frontend"
SERVICE_NAME="pc-manager"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
err()   { echo -e "${RED}[HATA]${NC} $1"; exit 1; }

# Dagitim algilama
_detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    else
        echo "unknown"
    fi
}

# Paket yoneticisi uzerinden kurulum
_install_pkgs() {
    case "$(_detect_distro)" in
        arch|manjaro|endeavouros|artix|arcolinux|garuda)
            pacman -S --noconfirm --needed "$@"
            ;;
        debian|ubuntu|linuxmint|pop|elementary|kali|parrot|devuan)
            apt update -qq && apt install -y -qq "$@"
            ;;
        fedora)
            dnf install -y "$@"
            ;;
        opensuse*|suse)
            zypper install -y "$@"
            ;;
        *)
            err "Desteklenmeyen dagitim ($(_detect_distro)). Lutfen bagimliliklari manuel kurun: $*"
            ;;
    esac
}

if [ "$EUID" -ne 0 ]; then err "Bu script root olarak calistirilmalidir: sudo bash install.sh"; fi

# Temel bagimliliklari kontrol et
if ! command -v git &>/dev/null; then _install_pkgs git; fi
if ! command -v curl &>/dev/null; then _install_pkgs curl; fi
if ! command -v python3 &>/dev/null; then
    case "$(_detect_distro)" in
        arch|manjaro|endeavouros|artix|arcolinux|garuda)
            _install_pkgs python python-pip
            ;;
        *)
            _install_pkgs python3 python3-pip python3-venv
            ;;
    esac
fi

info "PC Manager yukleniyor..."

if [ -d "$INSTALL_DIR" ]; then
    info "Mevcut kurulum bulundu, guncelleniyor..."
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/master
else
    info "Repo klonlaniyor: $REPO"
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

LATEST_TAG=$(git tag --sort=-creatordate | head -1)
if [ -n "$LATEST_TAG" ]; then
    info "En son surume geciliyor: $LATEST_TAG"
    git checkout "$LATEST_TAG"
fi

info "Python sanal ortam hazirlaniyor..."
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
pip install -q --upgrade pip
pip install -q -r "$BACKEND_DIR/requirements.txt"

info "Frontend derleniyor..."
cd "$FRONTEND_DIR"
if ! command -v node &>/dev/null; then
    case "$(_detect_distro)" in
        arch|manjaro|endeavouros|artix|arcolinux|garuda)
            _install_pkgs nodejs npm
            ;;
        debian|ubuntu|linuxmint|pop|elementary|kali|parrot|devuan)
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt install nodejs -y -qq
            ;;
        fedora)
            dnf install -y nodejs npm
            ;;
        opensuse*|suse)
            zypper install -y nodejs npm
            ;;
        *)
            err "Node.js otomatik kurulumu bu dagitim icin desteklenmiyor. Lutfen manuel kurun: nodejs >= 18"
            ;;
    esac
fi
npm install -q
npm run build

info "Systemd servisi kuruluyor..."
cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=PC Manager Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$BACKEND_DIR
ExecStart=$VENV_DIR/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8081 --log-level info
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

IP=$(hostname -I | awk '{print $1}')
ok "Kurulum tamam!"
echo -e "${GREEN}Web arayuz: http://$IP:8081${NC}"
echo -e "${GREEN}Giris sifresi: pcmanager${NC}"
