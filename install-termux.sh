#!/data/data/com.termux/files/usr/bin/bash
#
# PC Manager — Termux (Android) kurulum betiği
# Root GEREKTİRMEZ. Root varsa güç yönetimi gibi ek özellikler de çalışır.
#
# Kullanım (Termux içinde):
#   pkg install -y curl
#   bash <(curl -s https://raw.githubusercontent.com/Dorukefty112/pc-manager/claude/proje-gelistirme-arastirma-wef68g/install-termux.sh)
#
set -eu

REPO="https://github.com/Dorukefty112/pc-manager.git"
BRANCH="claude/proje-gelistirme-arastirma-wef68g"
INSTALL_DIR="$HOME/pc-manager"
PORT="${PCMANAGER_PORT:-8081}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${CYAN}[BİLGİ]${NC} $1"; }
ok()    { echo -e "${GREEN}[TAMAM]${NC} $1"; }
warn()  { echo -e "${YELLOW}[UYARI]${NC} $1"; }
err()   { echo -e "${RED}[HATA]${NC} $1"; exit 1; }

# ─── Ortam kontrolü ──────────────────────────────────────────────────────────
[ -n "${PREFIX:-}" ] && echo "$PREFIX" | grep -q "com.termux" \
  || err "Bu betik yalnızca Termux içinde çalışır. Normal Linux için install.sh kullanın."

if command -v su >/dev/null 2>&1 && su -c "id" >/dev/null 2>&1; then
  HAS_ROOT=1
  ok "Root erişimi bulundu — güç yönetimi (kapat/yeniden başlat) etkin olacak."
else
  HAS_ROOT=0
  warn "Root yok — sistem izleme çalışır, ancak kapatma/yeniden başlatma gibi işlemler devre dışı kalır."
fi

# ─── Paketler ────────────────────────────────────────────────────────────────
info "Termux paketleri güncelleniyor..."
pkg update -y >/dev/null 2>&1 || warn "pkg update atlandı"

info "Bağımlılıklar kuruluyor (python, nodejs, git, rust, psutil...)"
# rust + binutils: bcrypt/cryptography tekerleklerinin derlenmesi için gerekebilir.
# python-psutil: psutil'in PyPI kaynak paketi Android'i BİLEREK desteklemiyor
# ("platform android is not supported" hatasıyla derlemeyi reddediyor — bu rust
# veya başka bir derleyici ile çözülmez). Bunun yerine Termux'un kendi önceden
# derlediği paket kullanılıyor; birazdan venv bunu --system-site-packages ile görecek.
pkg install -y python nodejs-lts git rust binutils libjpeg-turbo python-psutil >/dev/null 2>&1 \
  || pkg install -y python nodejs git rust binutils python-psutil \
  || err "Paketler kurulamadı. 'pkg install python nodejs git rust python-psutil' komutunu elle deneyin."
ok "Sistem paketleri hazır."

# ─── Depo ────────────────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Mevcut kurulum güncelleniyor..."
  git -C "$INSTALL_DIR" fetch origin "$BRANCH" --depth 1 || warn "fetch başarısız"
  git -C "$INSTALL_DIR" checkout "$BRANCH" 2>/dev/null || true
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH" || warn "güncelleme atlandı"
else
  info "Depo indiriliyor..."
  git clone --depth 1 -b "$BRANCH" "$REPO" "$INSTALL_DIR" \
    || err "git clone başarısız. İnternet bağlantısını kontrol edin."
fi
ok "Kaynak kodu: $INSTALL_DIR"

# ─── Python ortamı ───────────────────────────────────────────────────────────
info "Python sanal ortamı ve bağımlılıklar kuruluyor (birkaç dakika sürebilir)..."
cd "$INSTALL_DIR"
# --system-site-packages: yukarıda pkg ile kurulan python-psutil'i (ve ileride
# Termux paketi olarak eklenebilecek başka native modülleri) venv içinden
# görünür kılar. psutil, requirements-termux.txt'den bilerek çıkarıldı.
python -m venv --system-site-packages venv
# Termux'ta bcrypt/cryptography'nin rust (pyo3) backend'i derlenirken bu bayraklar gerekir
export CARGO_BUILD_TARGET="" CFLAGS="-Wno-error=incompatible-function-pointer-types"
./venv/bin/pip install --upgrade pip wheel >/dev/null 2>&1 || true
./venv/bin/pip install -r backend/requirements-termux.txt \
  || err "pip bağımlılıkları kurulamadı. Yukarıdaki hata çıktısına bakın. 'rust' ve 'binutils' paketlerinin kurulu olduğundan emin olun: pkg install rust binutils"
./venv/bin/python -c "import psutil" 2>/dev/null \
  || err "psutil venv içinden görünmüyor. 'pkg install python-psutil' çalıştığını doğrulayıp '$INSTALL_DIR/venv' klasörünü silerek betiği tekrar çalıştırın."
ok "Python bağımlılıkları kuruldu."

# ─── Frontend ────────────────────────────────────────────────────────────────
info "Arayüz derleniyor..."
npm install --prefix frontend >/dev/null 2>&1 || npm install --prefix frontend \
  || err "npm install başarısız"
npm run build --prefix frontend || err "Arayüz derlenemedi"
ok "Arayüz derlendi."

# ─── Başlatma betiği ─────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/start.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# PC Manager'ı başlatır. Port değiştirmek için: PCMANAGER_PORT=9000 ./start.sh
cd "$INSTALL_DIR/backend"
export PCMANAGER_PORT="\${PCMANAGER_PORT:-$PORT}"
exec "$INSTALL_DIR/venv/bin/python" -m uvicorn main:app --host 0.0.0.0 --port "\$PCMANAGER_PORT"
EOF
chmod +x "$INSTALL_DIR/start.sh"

# ─── Telefon açılışında otomatik başlatma (Termux:Boot varsa) ────────────────
BOOT_DIR="$HOME/.termux/boot"
if [ -d "$HOME/.termux" ]; then
  mkdir -p "$BOOT_DIR"
  cat > "$BOOT_DIR/pc-manager" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
"$INSTALL_DIR/start.sh" >> "$INSTALL_DIR/pc-manager.log" 2>&1 &
EOF
  chmod +x "$BOOT_DIR/pc-manager"
  info "Termux:Boot için açılış betiği eklendi (Termux:Boot uygulamasını kurarsanız telefon açılınca kendiliğinden başlar)."
fi

# ─── Bitti ───────────────────────────────────────────────────────────────────
LAN_IP="$(ip route get 1 2>/dev/null | awk '{print $7; exit}')"
echo ""
ok "Kurulum tamamlandı!"
echo ""
echo -e "  Başlatmak için:   ${CYAN}$INSTALL_DIR/start.sh${NC}"
echo -e "  Tarayıcıdan:      ${CYAN}http://localhost:$PORT${NC}"
[ -n "${LAN_IP:-}" ] && echo -e "  Aynı Wi-Fi'dan:   ${CYAN}http://$LAN_IP:$PORT${NC}"
echo ""
echo -e "  ${YELLOW}İpucu:${NC} Termux'u arka planda tutmak için 'termux-wake-lock' çalıştırın."
[ "$HAS_ROOT" = "0" ] && echo -e "  ${YELLOW}Not:${NC} Root olmadığı için kapatma/yeniden başlatma/servis yönetimi bu cihazda kullanılamaz."
echo ""
read -rp "Şimdi başlatılsın mı? [E/h] " ans
case "${ans:-e}" in
  [Hh]*) echo "Daha sonra '$INSTALL_DIR/start.sh' ile başlatabilirsiniz." ;;
  *) command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock; exec "$INSTALL_DIR/start.sh" ;;
esac
