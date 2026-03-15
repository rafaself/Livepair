#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
env_file="${repo_root}/.env"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

trim_leading_whitespace() {
  local value="$1"
  printf '%s' "${value#"${value%%[![:space:]]*}"}"
}

trim_trailing_whitespace() {
  local value="$1"
  printf '%s' "${value%"${value##*[![:space:]]}"}"
}

trim_whitespace() {
  trim_trailing_whitespace "$(trim_leading_whitespace "$1")"
}

require_command() {
  local name="$1"
  local message="$2"

  if ! command -v "$name" >/dev/null 2>&1; then
    fail "$message"
  fi
}

has_non_empty_env_value() {
  local key="$1"
  local line=""
  local trimmed_line=""
  local value=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    trimmed_line="$(trim_leading_whitespace "$line")"

    if [[ -z "$trimmed_line" || "${trimmed_line:0:1}" == "#" ]]; then
      continue
    fi

    if [[ "$trimmed_line" == export[[:space:]]* ]]; then
      trimmed_line="$(trim_leading_whitespace "${trimmed_line#export}")"
    fi

    if [[ "$trimmed_line" =~ ^${key}[[:space:]]*=(.*)$ ]]; then
      value="$(trim_whitespace "${BASH_REMATCH[1]}")"

      if [[ -z "$value" || "${value:0:1}" == "#" ]]; then
        continue
      fi

      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
        value="$(trim_whitespace "$value")"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
        value="$(trim_whitespace "$value")"
      fi

      if [[ -n "$value" ]]; then
        return 0
      fi
    fi
  done < "$env_file"

  return 1
}

require_command "node" "node is not installed. Install Node.js first."
require_command "pnpm" "pnpm is not installed. Install it from: https://pnpm.io/installation"
require_command "docker" "docker is not installed. Install it from: https://docs.docker.com/engine/install/"

if [[ ! -f "$env_file" ]]; then
  fail "Missing root .env. Copy .env.example -> .env and try again."
fi

if ! has_non_empty_env_value "GEMINI_API_KEY"; then
  fail "Missing GEMINI_API_KEY in the root .env. Set it to a non-empty value before starting the local flow."
fi

if ! (cd "$repo_root" && docker compose config >/dev/null 2>&1); then
  fail "docker compose config failed. Ensure Docker Compose is available and the repository config is valid, then re-run: docker compose config"
fi

printf '%s\n' \
  'Setup preflight passed.' \
  '' \
  'Next commands:' \
  '  pnpm install' \
  '  docker compose up -d' \
  '  pnpm run dev'
