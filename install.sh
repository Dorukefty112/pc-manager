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

# Pentest araclari kurulumu
_install_pentest_tools() {
    if [ ! -t 0 ]; then
        info "Etkilesimli terminal algilanmadi, pentest araclari kurulumu atlandi."
        return
    fi

    echo -e "\n${CYAN}==================================================${NC}"
    echo -e "${CYAN}   Pen-Test Araçları Kurulum Seçenekleri${NC}"
    echo -e "${CYAN}==================================================${NC}"
    echo -e "PC Manager tarafından desteklenen pentest/OSINT araçlarını yüklemek ister misiniz?"
    echo -e "1) Hepsini Yükle (Önerilen)"
    echo -e "2) Seçmeli Yükle"
    echo -e "3) Hiçbirini Yükleme (Varsayılan)"
    read -rp "Seçiminiz [1-3]: " choice

    local distro
    distro="$(_detect_distro)"

    case "$choice" in
        1)
            info "Tüm pentest araçları kuruluyor..."
            if [ "$distro" = "arch" ] || [ "$distro" = "manjaro" ] || [ "$distro" = "endeavouros" ]; then
                _install_pkgs nmap masscan dnsrecon enum4linux gobuster nikto whatweb sqlmap wfuzz dirb exploitdb hydra john tcpdump gnu-netcat net-tools theharvester wireshark-cli amass subfinder dnstwist perl-image-exiftool
            elif [ "$distro" = "debian" ] || [ "$distro" = "ubuntu" ] || [ "$distro" = "kali" ]; then
                _install_pkgs nmap masscan dnsrecon enum4linux gobuster nikto whatweb sqlmap wfuzz dirb exploitdb hydra john tcpdump netcat-openbsd net-tools theharvester tshark amass subfinder dnstwist exiftool
            else
                _install_pkgs nmap sqlmap hydra john tcpdump net-tools exiftool
            fi

            info "Python tabanlı OSINT araçları kuruluyor..."
            source "$VENV_DIR/bin/activate"
            pip install -q holehe h8mail maigret sherlock-project
            ;;
        2)
            echo -e "\nYüklenecek araçların numarasını aralarında boşluk bırakarak yazın (Örn: 1 5 8):"
            echo -e "1) Nmap (Port Tarama)"
            echo -e "2) Masscan (Kitle Tarama)"
            echo -e "3) DNS Recon (DNS Keşif)"
            echo -e "4) Enum4Linux (Samba/CIFS)"
            echo -e "5) Gobuster (Web Dizin/DNS)"
            echo -e "6) Nikto (Web Tarayıcı)"
            echo -e "7) WhatWeb (Web Fingerprint)"
            echo -e "8) SQLMap (SQLi Testi)"
            echo -e "9) WFuzz (Web Fuzzer)"
            echo -e "10) Dirb (Dizin Tarayıcı)"
            echo -e "11) SearchSploit (Exploit Arama)"
            echo -e "12) Hydra (Parola Brute-Force)"
            echo -e "13) John the Ripper (Parola Kırıcı)"
            echo -e "14) TCPDump (Paket Analiz)"
            echo -e "15) Netcat (Bağlantı Aracı)"
            echo -e "16) Netstat (Ağ Bağlantıları)"
            echo -e "17) Sherlock (Kullanıcı Adı OSINT)"
            echo -e "18) theHarvester (E-posta/Subdomain)"
            echo -e "19) TShark/Wireshark (Ağ Analiz)"
            echo -e "20) Holehe (E-posta OSINT)"
            echo -e "21) H8Mail (Sızıntı Tarama)"
            echo -e "22) Maigret (Kullanıcı Adı OSINT)"
            echo -e "23) Amass (Subdomain Keşfi)"
            echo -e "24) Subfinder (Hızlı Subdomain)"
            echo -e "25) DNSTwist (Phishing Tespiti)"
            echo -e "26) Exiftool (Metadata Okuyucu)"
            read -rp "Seçimleriniz: " selections

            local pkgs=()
            local py_pkgs=()

            for sel in $selections; do
                case "$sel" in
                    1) pkgs+=("nmap") ;;
                    2) pkgs+=("masscan") ;;
                    3) pkgs+=("dnsrecon") ;;
                    4) pkgs+=("enum4linux") ;;
                    5) pkgs+=("gobuster") ;;
                    6) pkgs+=("nikto") ;;
                    7) pkgs+=("whatweb") ;;
                    8) pkgs+=("sqlmap") ;;
                    9) pkgs+=("wfuzz") ;;
                    10) pkgs+=("dirb") ;;
                    11) if [ "$distro" = "arch" ] || [ "$distro" = "manjaro" ] || [ "$distro" = "endeavouros" ] || [ "$distro" = "debian" ] || [ "$distro" = "ubuntu" ]; then pkgs+=("exploitdb"); fi ;;
                    12) pkgs+=("hydra") ;;
                    13) pkgs+=("john") ;;
                    14) pkgs+=("tcpdump") ;;
                    15) if [ "$distro" = "arch" ] || [ "$distro" = "manjaro" ] || [ "$distro" = "endeavouros" ]; then pkgs+=("gnu-netcat"); else pkgs+=("netcat-openbsd"); fi ;;
                    16) pkgs+=("net-tools") ;;
                    17) py_pkgs+=("sherlock-project") ;;
                    18) pkgs+=("theharvester") ;;
                    19) if [ "$distro" = "arch" ] || [ "$distro" = "manjaro" ] || [ "$distro" = "endeavouros" ]; then pkgs+=("wireshark-cli"); else pkgs+=("tshark"); fi ;;
                    20) py_pkgs+=("holehe") ;;
                    21) py_pkgs+=("h8mail") ;;
                    22) py_pkgs+=("maigret") ;;
                    23) pkgs+=("amass") ;;
                    24) pkgs+=("subfinder") ;;
                    25) pkgs+=("dnstwist") ;;
                    26) if [ "$distro" = "arch" ] || [ "$distro" = "manjaro" ] || [ "$distro" = "endeavouros" ]; then pkgs+=("perl-image-exiftool"); else pkgs+=("exiftool"); fi ;;
                esac
            done

            if [ ${#pkgs[@]} -gt 0 ]; then
                info "Seçilen paketler yükleniyor: ${pkgs[*]}"
                _install_pkgs "${pkgs[@]}"
            fi
            if [ ${#py_pkgs[@]} -gt 0 ]; then
                info "Seçilen Python araçları yükleniyor: ${py_pkgs[*]}"
                source "$VENV_DIR/bin/activate"
                pip install -q "${py_pkgs[@]}"
            fi
            ;;
        *)
            info "Pentest araçları kurulumu atlandı."
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

# Pentest araclarini kullanici istegine gore yukle
_install_pentest_tools

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

ok "Kurulum tamam!"
echo -e "${GREEN}Web arayuz: http://localhost:8081${NC}"
IP=$(ip -4 addr show | awk '/inet /{print $2}' | cut -d/ -f1 | grep -v '^127\.' | head -1 || true)
if [ -n "$IP" ]; then
    echo -e "${GREEN}Ag:          http://$IP:8081${NC}"
fi
echo -e "${GREEN}Giris sifresi: pcmanager${NC}"
