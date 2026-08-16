#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/skills/protodock-canvas/SKILL.md"
SOURCE_VALIDATOR="$ROOT_DIR/scripts/protodock-validate"
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

if [[ ! -x "$SOURCE_VALIDATOR" ]]; then
  printf 'ProtoDock validator not found or not executable: %s\n' "$SOURCE_VALIDATOR" >&2
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
  local target_validator="$destination/scripts/protodock-validate"
  mkdir -p "$destination"
  if [[ -f "$target_file" ]] && ! cmp -s "$SOURCE_FILE" "$target_file"; then
    cp "$target_file" "$target_file.backup.$(date +%Y%m%d-%H%M%S)"
  fi
  if [[ ! -f "$target_file" ]] || ! cmp -s "$SOURCE_FILE" "$target_file"; then
    local temporary_file="$destination/.SKILL.md.tmp.$$"
    cp "$SOURCE_FILE" "$temporary_file"
    mv "$temporary_file" "$target_file"
  fi
  mkdir -p "$(dirname "$target_validator")"
  local temporary_validator="$target_validator.tmp.$$"
  printf '#!/usr/bin/env bash\nexec %q "$@"\n' "$SOURCE_VALIDATOR" > "$temporary_validator"
  chmod +x "$temporary_validator"
  mv "$temporary_validator" "$target_validator"
  printf 'Installed ProtoDock Skill and validator for %s: %s\n' "$tool" "$destination"
}

if [[ "$AGENT" == "codex" || "$AGENT" == "both" ]]; then
  install_for codex
fi

if [[ "$AGENT" == "claude" || "$AGENT" == "both" ]]; then
  install_for claude
fi
