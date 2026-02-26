#!/usr/bin/env bash
set -eu

##############################################################################
# OpenPaean CLI Install Script
#
# Installs the latest 'openpaean' CLI from npm using bun or npm.
#
# Usage:
#   curl -fsSL https://paean.ai/openpaean/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/paean-ai/openpaean/main/install.sh | bash
#
# Environment variables:
#   OPENPAEAN_VERSION  - Specific version, e.g. "0.4.1" (default: latest)
##############################################################################

PACKAGE_NAME="openpaean"
VERSION="${OPENPAEAN_VERSION:-latest}"

# --- 1) Detect package manager ---
PM=""
PM_CMD=""

if command -v bun >/dev/null 2>&1; then
  PM="bun"
  if [ "$VERSION" = "latest" ]; then
    PM_CMD="bun add -g ${PACKAGE_NAME}@latest"
  else
    PM_CMD="bun add -g ${PACKAGE_NAME}@${VERSION}"
  fi
elif command -v npm >/dev/null 2>&1; then
  PM="npm"
  if [ "$VERSION" = "latest" ]; then
    PM_CMD="npm install -g ${PACKAGE_NAME}@latest"
  else
    PM_CMD="npm install -g ${PACKAGE_NAME}@${VERSION}"
  fi
else
  echo ""
  echo "Error: Neither 'bun' nor 'npm' found."
  echo ""
  echo "Please install one of the following:"
  echo "  - Bun:  curl -fsSL https://bun.sh/install | bash"
  echo "  - Node: https://nodejs.org/"
  echo ""
  exit 1
fi

echo ""
echo "Installing OpenPaean CLI via ${PM}..."
echo "  ${PM_CMD}"
echo ""

# --- 2) Install ---
set +e
$PM_CMD
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 0 ]; then
  if [ "$PM" = "npm" ]; then
    echo ""
    echo "Installation failed. If you see permission errors, try:"
    echo "  sudo ${PM_CMD}"
    echo ""
    echo "Or configure npm to use a user-writable directory:"
    echo "  mkdir -p ~/.npm-global"
    echo "  npm config set prefix '~/.npm-global'"
    echo "  export PATH=~/.npm-global/bin:\$PATH"
    echo ""
  else
    echo ""
    echo "Installation failed. Please check the error above and try again."
    echo ""
  fi
  exit 1
fi

# --- 3) Verify ---
set +e
INSTALLED_VERSION=$(${PACKAGE_NAME} --version 2>/dev/null)
set -e

echo ""
echo "   ___                   ____"
echo "  / _ \\ _ __   ___ _ __ |  _ \\ __ _  ___  __ _ _ __"
echo " | | | | '_ \\ / _ \\ '_ \\| |_) / _\` |/ _ \\/ _\` | '_ \\"
echo " | |_| | |_) |  __/ | | |  __/ (_| |  __/ (_| | | | |"
echo "  \\___/| .__/ \\___|_| |_|_|   \\__,_|\\___|\\__,_|_| |_|"
echo "       |_|"
echo ""

if [ -n "${INSTALLED_VERSION:-}" ]; then
  echo "OpenPaean CLI v${INSTALLED_VERSION} installed successfully!"
else
  echo "OpenPaean CLI installed successfully!"
  echo ""
  echo "If 'openpaean' is not found, make sure your global bin directory is in PATH."
  if [ "$PM" = "bun" ]; then
    echo "  export PATH=\$HOME/.bun/bin:\$PATH"
  else
    echo "  export PATH=\$(npm config get prefix)/bin:\$PATH"
  fi
fi

echo ""
echo "Get started:"
echo "  openpaean login    # Authenticate"
echo "  openpaean           # Start agent mode"
echo "  openpaean --help    # Show all commands"
echo ""
