#!/data/data/com.termux/files/usr/bin/bash
#
# PC Manager — Termux (Android) kurulum betiği
# Root GEREKTİRMEZ. Root varsa güç yönetimi (kapat/yeniden başlat) da çalışır.
#
# Kullanım (Termux içinde):
#   bash <(curl -fsSL https://raw.githubusercontent.com/Dorukefty112/pc-manager/master/install-termux.sh)
#
# Tasarım notu: telefonda HİÇBİR ŞEY kaynaktan derlenmez.
#   - Native Python paketleri (psutil, cryptography, bcrypt, lxml) Termux'un
#     hazır paketlerinden gelir; pip yalnızca saf Python tekerlekleri kurar
#     (--only-binary=:all:). Önceki sürümde pip cryptography için Rust ile
#     yüzlerce paket indirip derlemeye çalışıyor ve yarıda kalıyordu.
#   - Arayüz, CI'ın derleyip 'frontend-dist' dalına koyduğu hazır hâliyle
#     indirilir (32-bit ARM'de tailwind/lightningcss'in Android sürümü yok).
#
set -eu

REPO_SLUG="Dorukefty112/pc-manager"
REPO="https://github.com/$REPO_SLUG.git"
BRANCH="${PCMANAGER_BRANCH:-master}"
INSTALL_DIR="$HOME/pc-manager"
PORT="${PCMANAGER_PORT:-8081}"
DIST_URL="https://github.com/$REPO_SLUG/archive/refs/heads/frontend-dist.tar.gz"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${CYAN}[BİLGİ]${NC} $1"; }
ok()    { echo -e "${GREEN}[TAMAM]${NC} $1"; }
warn()  { echo -e "${YELLOW}[UYARI]${NC} $1"; }
err()   { echo -e "${RED}[HATA]${NC} $1"; exit 1; }

# ─── Ortam kontrolü ──────────────────────────────────────────────────────────
[ -n "${PREFIX:-}" ] && echo "$PREFIX" | grep -q "com.termux" \
  || err "Bu betik yalnızca Termux içinde çalışır. Normal Linux için install.sh kullanın."

ARCH="$(uname -m)"
info "Mimari: $ARCH"

if command -v su >/dev/null 2>&1 && su -c "id" >/dev/null 2>&1; then
  HAS_ROOT=1
  ok "Root erişimi bulundu — güç yönetimi (kapat/yeniden başlat) etkin olacak."
else
  HAS_ROOT=0
  warn "Root yok — izleme ve yönetim çalışır; kapatma/yeniden başlatma ve sistem geneli CPU yüzdesi kullanılamaz."
fi

# ─── Paketler ────────────────────────────────────────────────────────────────
# Kısmi güncelleme Termux'ta kütüphane uyumsuzluğu yaratır (ör. "CANNOT LINK
# EXECUTABLE curl: cannot locate symbol ..."). Önce sistemi tamamen güncelle.
info "Termux paketleri güncelleniyor (ilk seferde birkaç dakika sürebilir)..."
export DEBIAN_FRONTEND=noninteractive
APT_OPTS=(-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
apt-get update -q || warn "Paket listesi güncellenemedi; mevcut liste ile devam ediliyor."
apt-get "${APT_OPTS[@]}" full-upgrade \
  || err "Termux güncellenemedi. Elle deneyin: 'termux-change-repo' ile başka bir ayna seçip 'pkg upgrade'."

# clang + libffi: python-cryptography kurulurken cffi'yi derlemek için gerekir
info "Temel paketler kuruluyor (python, git, clang...)"
apt-get "${APT_OPTS[@]}" install python python-pip git util-linux clang libffi openssl curl tar \
  || err "Temel paketler kurulamadı. Elle deneyin: pkg install python git clang libffi"

info "Native Python paketleri Termux deposundan kuruluyor (psutil, cryptography, bcrypt, lxml)..."
apt-get "${APT_OPTS[@]}" install python-psutil python-cryptography python-bcrypt python-lxml \
  || err "Native paketler kurulamadı. Elle deneyin: pkg install python-psutil python-cryptography python-bcrypt python-lxml"

MISSING="$(python - <<'PY'
import importlib
bad = []
for mod in ("psutil", "cryptography", "bcrypt", "lxml", "cffi"):
    try:
        importlib.import_module(mod)
    except Exception as e:
        bad.append(f"{mod} ({e.__class__.__name__}: {e})")
print("; ".join(bad))
PY
)"
[ -z "$MISSING" ] || err "Şu Termux paketleri Python'dan yüklenemiyor: $MISSING — 'pkg reinstall python-psutil python-cryptography python-bcrypt python-lxml' deneyin."
ok "Sistem paketleri hazır."

# ─── Depo ────────────────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Mevcut kurulum güncelleniyor ($BRANCH)..."
  git -C "$INSTALL_DIR" remote set-url origin "$REPO"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" \
    || err "Depo güncellenemedi. İnternet bağlantısını kontrol edin."
  git -C "$INSTALL_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
  git -C "$INSTALL_DIR" reset -q --hard "origin/$BRANCH"
else
  info "Depo indiriliyor..."
  git clone --depth 1 -b "$BRANCH" "$REPO" "$INSTALL_DIR" \
    || err "git clone başarısız. İnternet bağlantısını kontrol edin."
fi
VERSION="$(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo "?")"
ok "Kaynak kodu: $INSTALL_DIR (v$VERSION)"

# ─── Python ortamı ───────────────────────────────────────────────────────────
info "Python ortamı hazırlanıyor..."
cd "$INSTALL_DIR"
# --system-site-packages: yukarıdaki Termux paketlerini venv içinden görünür kılar.
# --clear: önceki başarısız denemelerden kalan yarım ortamı temizler.
python -m venv --clear --system-site-packages venv
PIP=(./venv/bin/python -m pip --disable-pip-version-check --retries 10 --timeout 60)
"${PIP[@]}" install -q --upgrade pip || warn "pip güncellenemedi, mevcut sürümle devam."
# --only-binary=:all: pip'in hiçbir paketi kaynaktan derlemeye çalışmamasını garanti eder
"${PIP[@]}" install --only-binary=:all: -r backend/requirements-termux.txt \
  || err "Python bağımlılıkları indirilemedi. İnternet bağlantınızı kontrol edip betiği tekrar çalıştırın (kaldığı yerden devam eder)."

info "Uygulama yüklenebiliyor mu kontrol ediliyor..."
( cd backend && ../venv/bin/python -c "import main" ) >/dev/null 2>"$INSTALL_DIR/install-check.log" \
  || { cat "$INSTALL_DIR/install-check.log"; err "Uygulama başlatılamıyor (ayrıntılar yukarıda, $INSTALL_DIR/install-check.log)."; }
rm -f "$INSTALL_DIR/install-check.log"
ok "Python bağımlılıkları kuruldu."

# ─── Arayüz ──────────────────────────────────────────────────────────────────
DIST="$INSTALL_DIR/frontend/dist"
fetch_prebuilt() {
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL --retry 5 --retry-delay 3 "$DIST_URL" -o "$tmp/dist.tar.gz" || { rm -rf "$tmp"; return 1; }
  tar -xzf "$tmp/dist.tar.gz" -C "$tmp" || { rm -rf "$tmp"; return 1; }
  local src
  src="$(find "$tmp" -maxdepth 1 -type d -name '*frontend-dist*' | head -n1)"
  [ -n "$src" ] && [ -f "$src/index.html" ] || { rm -rf "$tmp"; return 1; }
  PREBUILT_VERSION="$(cat "$src/VERSION" 2>/dev/null || echo "?")"
  rm -rf "$DIST" && mkdir -p "$DIST" && cp -r "$src"/. "$DIST"/
  rm -rf "$tmp"
}

build_locally() {
  case "$ARCH" in
    aarch64|x86_64) ;;
    *) return 1 ;;  # 32-bit ARM için tailwind/lightningcss Android sürümü yok
  esac
  apt-get "${APT_OPTS[@]}" install nodejs-lts || apt-get "${APT_OPTS[@]}" install nodejs || return 1
  npm ci --prefix frontend --no-audit --no-fund && npm run build --prefix frontend
}

info "Hazır derlenmiş arayüz indiriliyor..."
PREBUILT_VERSION=""
if fetch_prebuilt; then
  if [ "$PREBUILT_VERSION" = "$VERSION" ]; then
    ok "Arayüz hazır (v$PREBUILT_VERSION)."
  else
    warn "İndirilen arayüz v$PREBUILT_VERSION, uygulama v$VERSION — yerelde derlemeyi deniyorum..."
    build_locally && ok "Arayüz yerelde derlendi." \
      || warn "Yerelde derlenemedi; v$PREBUILT_VERSION arayüzü kullanılacak (çoğu özellik çalışır)."
  fi
else
  warn "Hazır arayüz indirilemedi, yerelde derleniyor (birkaç dakika sürebilir)..."
  build_locally && ok "Arayüz yerelde derlendi." \
    || err "Arayüz indirilemedi ve bu cihazda ($ARCH) derlenemiyor. İnternet bağlantısını kontrol edip tekrar deneyin."
fi

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
mkdir -p "$BOOT_DIR"
cat > "$BOOT_DIR/pc-manager" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
"$INSTALL_DIR/start.sh" >> "$INSTALL_DIR/pc-manager.log" 2>&1 &
EOF
chmod +x "$BOOT_DIR/pc-manager"

# ─── Bitti ───────────────────────────────────────────────────────────────────
LAN_IP="$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
echo ""
ok "Kurulum tamamlandı! (v$VERSION)"
echo ""
echo -e "  Başlatmak için:   ${CYAN}$INSTALL_DIR/start.sh${NC}"
echo -e "  Tarayıcıdan:      ${CYAN}http://localhost:$PORT${NC}"
[ -n "${LAN_IP:-}" ] && echo -e "  Aynı Wi-Fi'dan:   ${CYAN}http://$LAN_IP:$PORT${NC}"
echo -e "  İlk açılışta kurulum sihirbazı yönetici şifresini belirlemenizi ister."
echo ""
echo -e "  ${YELLOW}İpucu:${NC} Arka planda canlı tutmak için 'termux-wake-lock'; telefon açılışında"
echo -e "  kendiliğinden başlaması için F-Droid'den Termux:Boot uygulamasını kurun."
[ "$HAS_ROOT" = "0" ] && echo -e "  ${YELLOW}Not:${NC} Root olmadığı için kapatma/yeniden başlatma ve sistem geneli CPU yüzdesi bu cihazda gösterilemez."
echo -e "  ${YELLOW}Not:${NC} Termux'ta web araması ve mDNS otomatik keşfi devre dışıdır (eşleştirme QR/IP ile çalışır)."
echo ""
if [ -t 0 ]; then
  read -rp "Şimdi başlatılsın mı? [E/h] " ans
else
  ans="h"
fi
case "${ans:-e}" in
  [Hh]*) echo "Daha sonra '$INSTALL_DIR/start.sh' ile başlatabilirsiniz." ;;
  *) command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock; exec "$INSTALL_DIR/start.sh" ;;
esac
