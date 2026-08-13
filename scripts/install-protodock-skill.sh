#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/skills/protodock-canvas/SKILL.md"
AGENT="${1:-both}"
SCOPE="${2:-user}"
PROJECT_DIR="${3:-$PWD}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/install-protodock-skill.sh <codex|claude|both> [user|project] [project-directory]

Examples:
  ./scripts/install-protodock-skill.sh both
  ./scripts/install-protodock-skill.sh codex user
  ./scripts/install-protodock-skill.sh claude project /path/to/prototype-project
EOF
}

if [[ ! -f "$SOURCE_FILE" ]]; then
  printf 'ProtoDock Skill source not found: %s\n' "$SOURCE_FILE" >&2
  exit 1
fi

if [[ "$AGENT" != "codex" && "$AGENT" != "claude" && "$AGENT" != "both" ]]; then
  usage >&2
  exit 2
fi

if [[ "$SCOPE" != "user" && "$SCOPE" != "project" ]]; then
  usage >&2
  exit 2
fi

if [[ "$SCOPE" == "project" && ! -d "$PROJECT_DIR" ]]; then
  printf 'Project directory does not exist: %s\n' "$PROJECT_DIR" >&2
  exit 1
fi

install_for() {
  local tool="$1"
  local skill_root

  if [[ "$SCOPE" == "user" ]]; then
    if [[ "$tool" == "codex" ]]; then
      skill_root="$HOME/.agents/skills"
    else
      skill_root="$HOME/.claude/skills"
    fi
  elif [[ "$tool" == "codex" ]]; then
    skill_root="$PROJECT_DIR/.agents/skills"
  else
    skill_root="$PROJECT_DIR/.claude/skills"
  fi

  local destination="$skill_root/protodock-canvas"
  local target_file="$destination/SKILL.md"
  mkdir -p "$destination"
  if [[ -f "$target_file" ]] && cmp -s "$SOURCE_FILE" "$target_file"; then
    printf 'ProtoDock Skill for %s is already up to date: %s\n' "$tool" "$target_file"
    return
  fi
  if [[ -f "$target_file" ]]; then
    cp "$target_file" "$target_file.backup.$(date +%Y%m%d-%H%M%S)"
  fi
  local temporary_file="$destination/.SKILL.md.tmp.$$"
  cp "$SOURCE_FILE" "$temporary_file"
  mv "$temporary_file" "$target_file"
  printf 'Installed ProtoDock Skill for %s: %s\n' "$tool" "$target_file"
}

if [[ "$AGENT" == "codex" || "$AGENT" == "both" ]]; then
  install_for codex
fi

if [[ "$AGENT" == "claude" || "$AGENT" == "both" ]]; then
  install_for claude
fi
