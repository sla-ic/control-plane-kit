#!/usr/bin/env python3
# guard.py - portable PreToolUse enforcement, driven by docs/policy/floor.json.
#
# Behavior-preserving successor to ~/.claude/hooks/nova-guard-writes.sh: same
# allow(exit 0) / deny(exit 2) decisions, proven by golden_test.py. The POLICY
# lives in floor.json (data); this file is the thin, auditable READER.
#
# Decision protocol (Claude Code hooks):
#   exit 0  -> allow
#   exit 2  -> block (stderr shown to the model)
#   parse error / missing floor -> FAIL CLOSED (exit 2)
#
# Eval order is fixed and load-bearing (see floor.json eval_order):
#   hard_deny -> slack_send -> drive_write -> fs_write -> bash_deny -> default allow
#
# Floor location resolution:
#   1) $AMP_FLOOR_JSON if set
#   2) <repo>/docs/policy/floor.json relative to this file (../../docs/policy/floor.json)

import sys, json, datetime, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FLOOR = os.path.normpath(os.path.join(HERE, "..", "..", "docs", "policy", "floor.json"))
FLOOR_PATH = os.environ.get("AMP_FLOOR_JSON", DEFAULT_FLOOR)


def fail_closed(msg):
    print(f"[amp-guard] FAIL-CLOSED: {msg}", file=sys.stderr)
    sys.exit(2)


def load_floor():
    try:
        with open(FLOOR_PATH) as f:
            return json.load(f)
    except Exception as e:
        fail_closed(f"cannot load floor {FLOOR_PATH}: {e}")


def log(floor, event):
    path = floor.get("log")
    if not path:
        return
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a") as f:
            f.write(json.dumps(event, default=str) + "\n")
    except Exception:
        pass


def deny(floor, reason, tool, payload):
    log(floor, {
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "kind": "blocked_action",
        "tool": tool,
        "reason": reason,
        "tool_input_keys": list((payload.get("tool_input") or {}).keys()),
    })
    print(f"[amp-guard] BLOCKED: {reason}", file=sys.stderr)
    sys.exit(2)


def allow(floor, tool, why=None):
    if why:
        log(floor, {
            "ts": datetime.datetime.utcnow().isoformat() + "Z",
            "kind": "guard_allow",
            "tool": tool,
            "why": why,
        })
    sys.exit(0)


def main():
    floor = load_floor()

    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        # Parse error on hook input: fail closed (matches legacy).
        fail_closed(f"hook input parse error: {e}")

    tool = payload.get("tool_name") or ""
    ti = payload.get("tool_input") or {}

    # 1) Hard-deny patterns (re.I, anchored .match)
    for entry in floor.get("hard_deny_tool_patterns", []):
        if re.match(entry["pattern"], tool, re.I):
            deny(floor, entry["reason"], tool, payload)

    # 2) Slack send: whitelist + DM allowance
    ss = floor.get("slack_send")
    if ss and _slack_matches(ss, tool):
        ch = ""
        for fld in ss.get("channel_field_candidates", []):
            if ti.get(fld):
                ch = ti.get(fld)
                break
        ch_norm = str(ch).strip()
        if not ch_norm:
            deny(floor, "slack send with no channel", tool, payload)
        prefixes = tuple(ss.get("allow_dm_prefixes", []))
        if prefixes and ch_norm.startswith(prefixes) and len(ch_norm) >= ss.get("allow_dm_min_len", 0):
            allow(floor, tool, why="slack DM")
        if ch_norm in set(ss.get("channel_id_whitelist", [])):
            allow(floor, tool, why="slack channel-id whitelist")
        names = {n.lstrip("#") for n in ss.get("channel_name_whitelist", [])}
        if ch_norm.lstrip("#") in names:
            allow(floor, tool, why="slack channel-name whitelist")
        deny(floor, f"{ss.get('deny_reason','slack channel not allowed')}: '{ch_norm}'", tool, payload)

    # 3) Drive writes: restrict to allowed roots (legacy: allow non-share)
    dw = floor.get("drive_write")
    if dw and re.match(dw["pattern"], tool, re.I) and dw.get("require_substring", "") in tool.lower():
        if dw.get("decision", "allow") == "allow":
            allow(floor, tool, why="drive write (non-share)")
        else:
            deny(floor, "drive write blocked", tool, payload)

    # 4) Local FS writes: secrets are denied first (any path), then roots.
    fw = floor.get("fs_write")
    sensitive = floor.get("sensitive_path_patterns", [])
    if fw and tool in fw.get("tools", []):
        target = ""
        for fld in fw.get("target_field_candidates", []):
            if ti.get(fld):
                target = ti.get(fld)
                break
        if target:
            t = str(target)
            # 4a) Secret material is off-limits regardless of root (cross-mechanism).
            if any(re.search(sp, t) for sp in sensitive):
                deny(floor, f"FS write to secret material blocked (no secrets into GenAI): {t}", tool, payload)
            roots = fw.get("allow_roots", [])
            if not any(t.startswith(r) for r in roots):
                deny(floor, f"FS write outside allowed roots: {t}", tool, payload)

    # 5) Bash: destructive patterns + secret access (read OR write) via any util.
    bd = floor.get("bash_deny")
    if bd and tool == bd.get("tool"):
        cmd = (ti.get(bd.get("command_field", "command")) or "")
        for pat in bd.get("deny_patterns", []):
            if re.search(pat, cmd):
                deny(floor, f"bash command blocked by guard: {cmd[:120]}", tool, payload)
        # Close the bash bypass: no reading or writing secret material via shell.
        if sensitive and any(re.search(sp, cmd) for sp in sensitive):
            wi = bd.get("sensitive_write_intent")
            ri = bd.get("sensitive_read_intent")
            if (wi and re.search(wi, cmd)) or (ri and re.search(ri, cmd, re.I)):
                deny(floor, bd.get("sensitive_reason", "bash access to secret material blocked"), tool, payload)

    # Default: allow
    sys.exit(0)


def _slack_matches(ss, tool):
    for m in ss.get("match_any", []):
        if re.match(m["pattern"], tool, re.I):
            sub = m.get("require_substring")
            if sub is None or sub in tool.lower():
                return True
    return False


if __name__ == "__main__":
    main()
