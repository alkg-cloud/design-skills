#!/usr/bin/env bash
# ensure-deps — resolve design-feature's skill dependencies into a per-user cache.
# Fetches missing upstream skills (superpowers via shallow git clone of a moving branch,
# frontend-design via a single curl) into ~/.markup-design/deps, honoring a TTL, and
# prints a JSON manifest to stdout. The agent — not this script — decides installed-vs-not
# and only calls this for deps that are NOT already installed as plugins.
#
# Usage:  ./ensure-deps.sh <dep> [<dep> ...]      dep ∈ { superpowers, frontend-design }
# Output: JSON manifest to stdout AND to <deps-dir>/manifest.json:
#         { "<dep>": { "path", "mode", "fetchedAt", "stale" }, ... }
#         mode ∈ { cached, unavailable }; stale ∈ { true, false }
# Exit:   0 = every requested dep is usable (fresh, refreshed, or stale-but-present)
#         1 = a requested dep could not be fetched AND no cache exists for it
#         4 = bad arguments
#
# Env overrides (defaults target the real upstreams; tests point them at local fixtures):
#   DESIGN_SKILLS_DEPS_DIR       cache root         (default: ~/.markup-design/deps)
#   DESIGN_SKILLS_DEPS_TTL_DAYS  refresh threshold  (default: 30)
#   SUPERPOWERS_REPO             git URL/path       (default: https://github.com/obra/superpowers)
#   SUPERPOWERS_REF              branch             (default: main)
#   FRONTEND_DESIGN_URL          raw SKILL.md URL   (default: anthropics/claude-code @ main)
set -euo pipefail

DEPS_DIR="${DESIGN_SKILLS_DEPS_DIR:-$HOME/.markup-design/deps}"
TTL_DAYS="${DESIGN_SKILLS_DEPS_TTL_DAYS:-30}"
SUPERPOWERS_REPO="${SUPERPOWERS_REPO:-https://github.com/obra/superpowers}"
SUPERPOWERS_REF="${SUPERPOWERS_REF:-main}"
FRONTEND_DESIGN_URL="${FRONTEND_DESIGN_URL:-https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md}"

[ "$#" -ge 1 ] || { printf 'usage: ensure-deps.sh <dep> [<dep> ...]  (dep: superpowers|frontend-design)\n' >&2; exit 4; }

[[ "$TTL_DAYS" =~ ^[0-9]+$ ]] || { printf 'DESIGN_SKILLS_DEPS_TTL_DAYS must be a non-negative integer, got: %s\n' "$TTL_DAYS" >&2; exit 4; }

mkdir -p "$DEPS_DIR/.stamps"
MANIFEST="$DEPS_DIR/manifest.json"
now_epoch=$(date +%s)
ttl_secs=$(( TTL_DAYS * 86400 ))

root_path() { case "$1" in
  superpowers)     printf '%s/superpowers' "$DEPS_DIR";;
  frontend-design) printf '%s/frontend-design/SKILL.md' "$DEPS_DIR";;
esac; }

sentinel_path() { case "$1" in
  superpowers)     printf '%s/superpowers/skills/brainstorming/SKILL.md' "$DEPS_DIR";;
  frontend-design) printf '%s/frontend-design/SKILL.md' "$DEPS_DIR";;
esac; }

fetch_superpowers() {
  local dir="$DEPS_DIR/superpowers"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" remote set-url origin "$SUPERPOWERS_REPO" >/dev/null 2>&1 \
      && git -C "$dir" fetch --depth 1 origin "$SUPERPOWERS_REF" >/dev/null 2>&1 \
      && git -C "$dir" reset --hard "origin/$SUPERPOWERS_REF" >/dev/null 2>&1
  else
    rm -rf "$dir"
    git clone --quiet --depth 1 --branch "$SUPERPOWERS_REF" "$SUPERPOWERS_REPO" "$dir" >/dev/null 2>&1
  fi
}

fetch_frontend_design() {
  local dir="$DEPS_DIR/frontend-design" tmp=""
  mkdir -p "$dir"
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"; trap - RETURN' RETURN
  if curl -fsSL "$FRONTEND_DESIGN_URL" -o "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    mv "$tmp" "$dir/SKILL.md"
  else
    return 1
  fi
}

do_fetch() { case "$1" in
  superpowers)     fetch_superpowers;;
  frontend-design) fetch_frontend_design;;
esac; }

entries=""
overall_exit=0
append() { [ -z "$entries" ] && entries="$1" || entries="$entries,$1"; }

for dep in "$@"; do
  case "$dep" in superpowers|frontend-design) ;; *) printf 'unknown dep: %s\n' "$dep" >&2; exit 4;; esac

  sentinel="$(sentinel_path "$dep")"
  root="$(root_path "$dep")"
  # JSON-escape backslash + double-quote in the path (DEPS_DIR is user-controlled).
  root=${root//\\/\\\\}; root=${root//\"/\\\"}
  stamp="$DEPS_DIR/.stamps/$dep.stamp"

  present=0; [ -e "$sentinel" ] && present=1
  s_epoch=0; s_iso=""
  if [ -f "$stamp" ]; then
    s_epoch="$(sed -n 1p "$stamp" | tr -cd '0-9')"; [ -n "$s_epoch" ] || s_epoch=0
    s_iso="$(sed -n 2p "$stamp")"
  fi
  age=$(( now_epoch - s_epoch ))
  fresh=0
  if [ "$present" -eq 1 ] && [ "$s_epoch" -gt 0 ] && [ "$age" -lt "$ttl_secs" ]; then fresh=1; fi

  if [ "$fresh" -eq 1 ]; then
    append "\"$dep\":{\"path\":\"$root\",\"mode\":\"cached\",\"fetchedAt\":\"$s_iso\",\"stale\":false}"
    continue
  fi

  if do_fetch "$dep"; then
    now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '%s\n%s\n' "$now_epoch" "$now_iso" > "$stamp"
    append "\"$dep\":{\"path\":\"$root\",\"mode\":\"cached\",\"fetchedAt\":\"$now_iso\",\"stale\":false}"
  elif [ "$present" -eq 1 ]; then
    printf 'ensure-deps: %s fetch failed; using stale cache\n' "$dep" >&2
    [ -n "$s_iso" ] || s_iso="unknown"
    append "\"$dep\":{\"path\":\"$root\",\"mode\":\"cached\",\"fetchedAt\":\"$s_iso\",\"stale\":true}"
  else
    printf 'ensure-deps: %s fetch failed and no cache present\n' "$dep" >&2
    append "\"$dep\":{\"path\":null,\"mode\":\"unavailable\",\"fetchedAt\":null,\"stale\":false}"
    overall_exit=1
  fi
done

_tmp_manifest="$(mktemp "$DEPS_DIR/.manifest.XXXXXX")"
printf '{%s}\n' "$entries" | tee "$_tmp_manifest"
mv "$_tmp_manifest" "$MANIFEST"
exit "$overall_exit"
