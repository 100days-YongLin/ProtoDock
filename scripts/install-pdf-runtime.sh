#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${PROTODOCK_PDF_RUNTIME_DIR:-$ROOT_DIR/.pdf-runtime}"

python3 -m venv "$RUNTIME_DIR"
"$RUNTIME_DIR/bin/pip" install --disable-pip-version-check -r "$ROOT_DIR/requirements-pdf.txt"

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
fi
if [[ "${VERSION_ID:-}" == 26.* ]]; then
  export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="${PLAYWRIGHT_HOST_PLATFORM_OVERRIDE:-ubuntu24.04-x64}"
fi

"$RUNTIME_DIR/bin/playwright" install chromium
printf 'ProtoDock PDF runtime installed at %s\n' "$RUNTIME_DIR"
