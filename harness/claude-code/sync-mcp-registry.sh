#!/bin/zsh
# sync-mcp-registry.sh — restore ~/.claude.json mcpServers from SSOT registry.
#
# Built after the 2026-05-12 drift incident: 7 guMCP entries silently
# disappeared from ~/.claude.json with no record of when/why. This script
# makes the MCP set self-healing.
#
# Usage:
#   sync-mcp-registry.sh           — apply registry (idempotent; backs up old)
#   sync-mcp-registry.sh --check   — report drift, exit nonzero if any
#   sync-mcp-registry.sh --dry-run — print intended change, no write
#
# Token: shared_mcpgw_token entries pull from $MCPGW_TOKEN env var, else
# from ~/.config/amp/mcpgw.token, else from the existing ~/.claude.json entry
# (for in-place re-sync). Errors if none of these are available.
#
# Secrets posture: SSOT registry contains URL templates only, never the token.
# The token file at ~/.config/amp/mcpgw.token is mode 600 outside the repo.

set -euo pipefail

REGISTRY="$(dirname "$0")/../../docs/policy/mcp-registry.json"
CLAUDE_JSON="$HOME/.claude.json"
TOKEN_FILE="$HOME/.config/amp/mcpgw.token"

MODE="apply"
case "${1:-}" in
  --check)   MODE="check" ;;
  --dry-run) MODE="dry-run" ;;
  "") ;;
  *) echo "usage: $0 [--check|--dry-run]" >&2; exit 2 ;;
esac

[[ -f "$REGISTRY" ]]    || { echo "registry not found: $REGISTRY" >&2; exit 1; }
[[ -f "$CLAUDE_JSON" ]] || { echo "~/.claude.json not found" >&2; exit 1; }

python3 - "$REGISTRY" "$CLAUDE_JSON" "$TOKEN_FILE" "$MODE" "${MCPGW_TOKEN:-}" <<'PY'
import json, os, sys, re, shutil
reg_path, claude_path, token_file, mode, env_token = sys.argv[1:6]

reg = json.load(open(reg_path))
cfg = json.load(open(claude_path))
cur = cfg.get("mcpServers", {})

def get_token():
    if env_token:
        return env_token.strip()
    if os.path.isfile(os.path.expanduser(token_file)):
        return open(os.path.expanduser(token_file)).read().strip()
    # Last resort: harvest from any existing mcpgw URL in cfg
    for v in cur.values():
        u = v.get("url","")
        m = re.match(r"https://mcp\.mcpgw\.com/[^/]+/([^/]+)/mcp", u)
        if m:
            return m.group(1)
    return None

want = {}
need_token = any(s.get("auth") == "shared_mcpgw_token" for s in reg["servers"])
token = get_token() if need_token else None
if need_token and not token:
    sys.stderr.write("ERROR: shared_mcpgw_token needed but not found.\n")
    sys.stderr.write(f"  Set $MCPGW_TOKEN, or write to {token_file}, or keep a working\n")
    sys.stderr.write("  mcpgw entry in ~/.claude.json so the token can be harvested.\n")
    sys.exit(3)

for s in reg["servers"]:
    name = s["name"]
    url = s.get("url") or s["url_template"].replace("{TOKEN}", token or "")
    want[name] = {"type": s["type"], "url": url}

# Diff
added, removed, changed = [], [], []
for k, v in want.items():
    if k not in cur:
        added.append(k)
    elif cur[k] != v:
        changed.append(k)
for k in cur:
    if k not in want:
        removed.append(k)

def fmt():
    out = []
    if not (added or removed or changed):
        out.append("IN SYNC — no drift.")
    if added:   out.append(f"  + add:    {added}")
    if changed: out.append(f"  ~ change: {changed}")
    if removed: out.append(f"  - remove: {removed}")
    return "\n".join(out)

print(fmt())

if mode == "check":
    sys.exit(0 if not (added or removed or changed) else 1)
if mode == "dry-run":
    sys.exit(0)

# Apply
if added or removed or changed:
    bak = claude_path + ".bak-pre-sync-mcp-registry"
    shutil.copy2(claude_path, bak)
    cfg["mcpServers"] = want
    with open(claude_path, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"applied. backup: {bak}")
else:
    print("no changes to apply.")
PY
