#!/usr/bin/env bash
# DualView — Build macOS (.dmg) et Linux (.AppImage + .deb)
# Version : lue dynamiquement depuis package.json
#
# Usage :
#   ./installer/build-installer.sh           # build pour la plateforme courante
#   ./installer/build-installer.sh --mac     # macOS uniquement (x64 + arm64)
#   ./installer/build-installer.sh --linux   # Linux uniquement (x64)
#   ./installer/build-installer.sh --all     # macOS + Linux (depuis macOS)
#
# Prérequis :
#   - Node.js >= 22   (https://nodejs.org)
#   - macOS : Xcode Command Line Tools  → xcode-select --install
#   - Linux : rpm, dpkg                 → sudo apt install rpm dpkg
#
# Le build croise macOS → Linux est possible via Docker (non couvert ici).
# Le build Windows depuis macOS/Linux nécessite Wine (non recommandé).

set -euo pipefail

APP_VERSION=$(node -pe "require('./package.json').version")
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
NODE_MIN="22"

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}>>> $1${NC}"; }
ok()    { echo -e "    ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "    ${YELLOW}[!!]${NC} $1"; }
error() { echo -e "    ${RED}[ERR]${NC} $1"; exit 1; }

echo ""
echo "  DualView v${APP_VERSION} — Build macOS / Linux"
echo "  ================================================"
echo ""

cd "$ROOT_DIR"

# ── 1. Node.js ────────────────────────────────────────────────────────────────
step "Vérification Node.js"
if ! command -v node &>/dev/null; then
    error "Node.js n'est pas installé. Téléchargez-le sur https://nodejs.org (v${NODE_MIN}+)"
fi
NODE_VERSION=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VERSION" -lt "$NODE_MIN" ]; then
    error "Node.js v${NODE_VERSION} détecté — v${NODE_MIN}+ requis."
fi
ok "Node.js v$(node --version)"

# ── 2. Dépendances npm ────────────────────────────────────────────────────────
step "Installation des dépendances"
npm ci --prefer-offline 2>/dev/null || npm install
ok "Dépendances installées"

# ── 3. Vérification des assets icônes ─────────────────────────────────────────
step "Vérification des assets"
MISSING_ICONS=()
[[ "$(uname)" == "Darwin" ]] && [[ ! -f "assets/icon.icns" ]] && MISSING_ICONS+=("assets/icon.icns")
[[ "$(uname)" == "Linux"  ]] && [[ ! -f "assets/icon.png"  ]] && MISSING_ICONS+=("assets/icon.png")

if [ ${#MISSING_ICONS[@]} -gt 0 ]; then
    warn "Icônes manquantes : ${MISSING_ICONS[*]}"
    warn "Voir assets/README.txt pour les instructions de génération."
    warn "Le build continue sans icône personnalisée."
fi

# ── 4. Build ───────────────────────────────────────────────────────────────────
TARGET="${1:-}"

step "Build electron-builder"
case "$TARGET" in
    --mac)
        ok "Cible : macOS (.dmg x64 + arm64)"
        npm run build:mac
        ;;
    --linux)
        ok "Cible : Linux (.AppImage + .deb x64)"
        npm run build:linux
        ;;
    --all)
        ok "Cible : macOS + Linux"
        npm run build:mac
        npm run build:linux
        ;;
    *)
        # Auto-détection
        if [[ "$(uname)" == "Darwin" ]]; then
            ok "Cible auto-détectée : macOS"
            npm run build:mac
        else
            ok "Cible auto-détectée : Linux"
            npm run build:linux
        fi
        ;;
esac

# ── 5. Résultat ────────────────────────────────────────────────────────────────
step "Artefacts produits"
if [ -d "$DIST_DIR" ]; then
    ls -lh "$DIST_DIR"/*.dmg "$DIST_DIR"/*.AppImage "$DIST_DIR"/*.deb 2>/dev/null \
        | awk '{print "    " $NF " (" $5 ")"}' \
        || warn "Aucun artefact trouvé dans dist/"
fi

echo ""
echo -e "  ${GREEN}Build terminé.${NC}"
echo ""