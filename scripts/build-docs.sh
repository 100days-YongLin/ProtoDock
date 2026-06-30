#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_SOURCE_DIR="$ROOT_DIR/docs-site"
DOCS_DIST_DIR="$ROOT_DIR/docs-dist"
NPM_CACHE_DIR="${NPM_CONFIG_CACHE:-/tmp/protodock-npm-cache}"

cd "$DOCS_SOURCE_DIR"
NPM_CONFIG_CACHE="$NPM_CACHE_DIR" npx --yes mint validate --telemetry false
NPM_CONFIG_CACHE="$NPM_CACHE_DIR" npx --yes mint export --telemetry false

rm -rf "$DOCS_DIST_DIR"
mkdir -p "$DOCS_DIST_DIR"
python3 - "$DOCS_SOURCE_DIR/export.zip" "$DOCS_DIST_DIR" <<'PY'
import sys
import zipfile
from pathlib import Path

zip_path = Path(sys.argv[1])
dist_dir = Path(sys.argv[2])
with zipfile.ZipFile(zip_path) as archive:
    archive.extractall(dist_dir)
PY
rm -f "$DOCS_SOURCE_DIR/export.zip"
