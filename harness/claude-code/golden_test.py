#!/usr/bin/env python3
# golden_test.py - validates guard.py against floor.json.
#
# Two suites:
#   CASES        - rule families UNCHANGED from the legacy nova-guard-writes.sh.
#                  Assert legacy == new == expected. (hard_deny, slack, drive,
#                  bash destructive, and fs cases whose result didn't move.)
#   DIVERGENT    - floor v2 INTENTIONALLY differs from legacy. Assert new ==
#                  expected only; legacy is printed for the record. Covers:
#                  (a) broad home-tree writes now allowed, (b) secret material
#                  denied across BOTH write tools and bash (legacy left these open).
#   RAW_CASES    - fail-closed guarantee (empty/malformed stdin).
#
# Usage: python3 golden_test.py   (exit 0 = all good, exit 1 = any mismatch)

import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
LEGACY = "/Users/you/.claude/hooks/nova-guard-writes.sh"
NEW = os.path.join(HERE, "guard.py")
FLOOR = os.path.join(REPO, "docs", "policy", "floor.json")

ALLOW, DENY = 0, 2
U = "/Users/you"

# (name, payload, expected) -- legacy == new == expected
CASES = [
    # hard deny: gmail / calendar / misc
    ("gmail send",            {"tool_name": "mcp__google_gmail__send_email", "tool_input": {}}, DENY),
    ("gmail forward",         {"tool_name": "mcp__google_gmail__forward_email", "tool_input": {}}, DENY),
    ("gmail create_draft",    {"tool_name": "mcp__google_gmail__create_draft", "tool_input": {}}, ALLOW),
    ("gmail delete_label",    {"tool_name": "mcp__google_gmail__delete_label", "tool_input": {}}, DENY),
    ("gmail create_label",    {"tool_name": "mcp__google_gmail__create_label", "tool_input": {}}, ALLOW),
    ("cal create_event",      {"tool_name": "mcp__google_calendar__create_event", "tool_input": {}}, DENY),
    ("cal update_event",      {"tool_name": "mcp__google_calendar__update_event", "tool_input": {}}, DENY),
    ("cal delete_event",      {"tool_name": "mcp__google_calendar__delete_event", "tool_input": {}}, DENY),
    ("cal respond_to_event",  {"tool_name": "mcp__google_calendar__respond_to_event", "tool_input": {}}, DENY),
    ("cal update_attendee",   {"tool_name": "mcp__google_calendar__update_attendee_status", "tool_input": {}}, DENY),
    ("cal manage_attendee",   {"tool_name": "mcp__google_calendar__manage_attendee", "tool_input": {}}, DENY),
    ("cal move_event",        {"tool_name": "mcp__google_calendar__move_event", "tool_input": {}}, DENY),
    ("cal read get_events",   {"tool_name": "mcp__google_calendar__get_events", "tool_input": {}}, ALLOW),
    ("generic delete",        {"tool_name": "mcp__some_tool__delete_thing", "tool_input": {}}, DENY),
    ("remove_canvas_access",  {"tool_name": "mcp__slack__remove_canvas_access", "tool_input": {}}, DENY),
    ("add_file_sharing",      {"tool_name": "mcp__google_drive__add_file_sharing_preference", "tool_input": {}}, DENY),
    # slack send
    ("slack DM long",         {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel": "D012345678"}}, ALLOW),
    ("slack mpim G long",     {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel": "G012345678"}}, ALLOW),
    ("slack D too short",     {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel": "D123"}}, DENY),
    ("slack random channel",  {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel": "C999"}}, DENY),
    ("slack empty channel",   {"tool_name": "mcp__slack__slack_send_message", "tool_input": {}}, DENY),
    ("send_message no slack",  {"tool_name": "mcp__teams__send_message", "tool_input": {"channel": "whatever"}}, ALLOW),
    # drive write
    ("drive create_file",     {"tool_name": "mcp__google_drive__create_file", "tool_input": {}}, ALLOW),
    ("drive move_file",       {"tool_name": "mcp__google_drive__move_file", "tool_input": {}}, ALLOW),
    # fs write -- results unchanged vs legacy
    ("write allowed nova",     {"tool_name": "Write", "tool_input": {"file_path": U+"/Desktop/nova/x.md"}}, ALLOW),
    ("write allowed acme",{"tool_name": "Write", "tool_input": {"file_path": U+"/Documents/GitHub/acme/docs/x.md"}}, ALLOW),
    ("write allowed tmp",     {"tool_name": "Write", "tool_input": {"file_path": "/tmp/x.md"}}, ALLOW),
    ("write outside home",    {"tool_name": "Write", "tool_input": {"file_path": "/etc/passwd"}}, DENY),
    ("edit outside home",     {"tool_name": "Edit", "tool_input": {"file_path": "/var/foo"}}, DENY),
    ("write empty path",      {"tool_name": "Write", "tool_input": {}}, ALLOW),
    ("notebookedit outside",  {"tool_name": "NotebookEdit", "tool_input": {"notebook_path": "/opt/x.ipynb"}}, DENY),
    ("notebookedit allowed",  {"tool_name": "NotebookEdit", "tool_input": {"notebook_path": U+"/.claude/x.ipynb"}}, ALLOW),
    # bash destructive -- unchanged
    ("bash rm -rf root",      {"tool_name": "Bash", "tool_input": {"command": "rm -rf /"}}, DENY),
    ("bash rm -rf etc",       {"tool_name": "Bash", "tool_input": {"command": "rm -rf /etc/foo"}}, DENY),
    ("bash rm -rf nova ok",    {"tool_name": "Bash", "tool_input": {"command": "rm -rf "+U+"/Desktop/nova/tmp"}}, ALLOW),
    ("bash mkfs",             {"tool_name": "Bash", "tool_input": {"command": "mkfs.ext4 /dev/sda"}}, DENY),
    ("bash dd if=",           {"tool_name": "Bash", "tool_input": {"command": "dd if=/dev/zero of=/dev/sda"}}, DENY),
    ("bash benign",           {"tool_name": "Bash", "tool_input": {"command": "ls -la"}}, ALLOW),
    ("empty tool",            {"tool_name": "", "tool_input": {}}, ALLOW),
    ("read tool unguarded",   {"tool_name": "Read", "tool_input": {"file_path": "/etc/passwd"}}, ALLOW),
]

# floor v2 intentional divergence from legacy. Assert NEW == expected.
DIVERGENT = [
    # (a) broad home-tree authority -- legacy denied (outside its 4 roots), v2 allows
    ("v2 write ~/.zshrc",        {"tool_name": "Edit",  "tool_input": {"file_path": U+"/.zshrc"}}, ALLOW, "legacy DENY"),
    ("v2 write ~/Documents",     {"tool_name": "Write", "tool_input": {"file_path": U+"/Documents/foo.txt"}}, ALLOW, "legacy DENY"),
    ("v2 write LaunchAgents",    {"tool_name": "Write", "tool_input": {"file_path": U+"/Library/LaunchAgents/x.plist"}}, ALLOW, "legacy DENY"),
    ("v2 write ~/.config",       {"tool_name": "Write", "tool_input": {"file_path": U+"/.config/amp/x.toml"}}, ALLOW, "legacy DENY"),
    # (b) secrets denied via WRITE TOOLS regardless of root
    ("v2 write ~/.ssh",          {"tool_name": "Write", "tool_input": {"file_path": U+"/.ssh/authorized_keys"}}, DENY, "legacy DENY (diff reason)"),
    ("v2 write ~/.aws creds",    {"tool_name": "Write", "tool_input": {"file_path": U+"/.aws/credentials"}}, DENY, "legacy DENY (diff reason)"),
    ("v2 write .pem in /tmp",    {"tool_name": "Write", "tool_input": {"file_path": "/tmp/leak.pem"}}, DENY, "legacy ALLOW (/tmp root)"),
    ("v2 write .key in repo",    {"tool_name": "Write", "tool_input": {"file_path": U+"/Documents/GitHub/acme/x.key"}}, DENY, "legacy ALLOW (repo root)"),
    ("v2 write gh hosts",        {"tool_name": "Edit",  "tool_input": {"file_path": U+"/.config/gh/hosts.yml"}}, DENY, "legacy DENY (diff reason)"),
    ("v2 write .env",            {"tool_name": "Write", "tool_input": {"file_path": U+"/Desktop/nova/.env"}}, DENY, "legacy ALLOW (nova root)"),
    # (c) secrets denied via BASH (legacy left bash reads/writes ungated -> the bypass)
    ("v2 bash cat ssh key",      {"tool_name": "Bash", "tool_input": {"command": "cat ~/.ssh/id_rsa"}}, DENY, "legacy ALLOW"),
    ("v2 bash append ssh",       {"tool_name": "Bash", "tool_input": {"command": "echo k >> ~/.ssh/authorized_keys"}}, DENY, "legacy ALLOW"),
    ("v2 bash cat aws creds",    {"tool_name": "Bash", "tool_input": {"command": "cat ~/.aws/credentials"}}, DENY, "legacy ALLOW"),
    ("v2 bash head npmrc",       {"tool_name": "Bash", "tool_input": {"command": "head -5 ~/.npmrc"}}, DENY, "legacy ALLOW"),
    ("v2 bash cp keychain",      {"tool_name": "Bash", "tool_input": {"command": "cp ~/Library/Keychains/login.keychain-db /tmp/"}}, DENY, "legacy ALLOW"),
    # non-secret bash writes/reads still pass (don't over-block my own config work)
    ("v2 bash append zshrc ok",  {"tool_name": "Bash", "tool_input": {"command": "echo alias >> ~/.zshrc"}}, ALLOW, "legacy ALLOW"),
    ("v2 bash redirect tmp ok",  {"tool_name": "Bash", "tool_input": {"command": "ls > /tmp/x"}}, ALLOW, "legacy ALLOW"),
    ("v2 bash cat notes ok",     {"tool_name": "Bash", "tool_input": {"command": "cat notes.txt"}}, ALLOW, "legacy ALLOW"),
    ("v2 bash git status ok",    {"tool_name": "Bash", "tool_input": {"command": "git status"}}, ALLOW, "legacy ALLOW"),
    # (d) slack channel rename: legacy whitelisted nova-* / C0LEGACY01; v2 whitelists amp-* / new IDs
    ("v2 slack amp-brief id",    {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel_id": "C0AMPBRIEF"}}, ALLOW, "legacy DENY (nova-only)"),
    ("v2 slack amp-brief name",  {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel": "amp-brief"}}, ALLOW, "legacy DENY"),
    ("v2 slack #amp-alerts",     {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel": "#amp-alerts"}}, ALLOW, "legacy DENY"),
    ("v2 slack amp staging",     {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel": "amp-brief-staging"}}, ALLOW, "legacy DENY"),
    ("v2 slack archived nova id", {"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel_id": "C0LEGACY01"}}, DENY, "legacy ALLOW (now archived)"),
    ("v2 slack archived nova name",{"tool_name": "mcp__slack__slack_send_message", "tool_input": {"channel": "nova-brief"}}, DENY, "legacy ALLOW (now archived)"),
    ("v2 slack send_message+slack amp", {"tool_name": "mcp__slack__send_message", "tool_input": {"channel": "amp-brief"}}, ALLOW, "legacy DENY"),
    # (e) net-new gates for outward actuators added when the mcpgw MCPs were wired (2026-06-25).
    # Legacy guard predates these MCPs and has no patterns for them -> ALLOW.
    ("v2 gdrive bare delete",        {"tool_name": "mcp__gdrive-guMCP-server__delete", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate)"),
    ("v2 gcal manage_acl_rule",      {"tool_name": "mcp__gcalendar-guMCP-server__manage_acl_rule", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate)"),
    # (f) v3 (ADR-0015): reversible inbox hygiene now ALLOWED (guardrails+review agent+undo up the stack);
    # permanent destruction stays DENY. trash != delete.
    ("v3 gmail archive_email",       {"tool_name": "mcp__gmail-guMCP-server__archive_email", "tool_input": {}}, ALLOW, "was DENY pre-ADR-0015 (reversible)"),
    ("v3 gmail trash_email",         {"tool_name": "mcp__gmail-guMCP-server__trash_email", "tool_input": {}}, ALLOW, "was DENY pre-ADR-0015 (recoverable bin)"),
    ("v3 gmail batch_update_emails", {"tool_name": "mcp__gmail-guMCP-server__batch_update_emails", "tool_input": {}}, ALLOW, "was DENY pre-ADR-0015 (bulk label/archive)"),
    ("v3 gmail update_email",        {"tool_name": "mcp__gmail-guMCP-server__update_email", "tool_input": {}}, ALLOW, "was DENY pre-ADR-0015 (label mods)"),
    ("v3 gmail delete_email STILL",  {"tool_name": "mcp__gmail-guMCP-server__delete_email", "tool_input": {}}, DENY, "permanent delete stays blocked"),
    ("v3 gmail delete_draft STILL",  {"tool_name": "mcp__gmail-guMCP-server__delete_draft", "tool_input": {}}, DENY, "permanent delete stays blocked"),
    ("v2 slack set_canvas_access",   {"tool_name": "mcp__slack-guMCP-server__set_canvas_access", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate)"),
    ("v2 slack send_ephemeral",      {"tool_name": "mcp__slack-guMCP-server__send_ephemeral_message", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate)"),
    ("v2 confluence create_page",    {"tool_name": "mcp__confluence-guMCP-server__create_page", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate; SSOT BOOT)"),
    ("v2 confluence update_page",    {"tool_name": "mcp__confluence-guMCP-server__update_page", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate; SSOT BOOT)"),
    ("v2 confluence create_blogpost",{"tool_name": "mcp__confluence-guMCP-server__create_blogpost", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate)"),
    ("v2 confluence update_blogpost",{"tool_name": "mcp__confluence-guMCP-server__update_blogpost", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate)"),
    ("v2 confluence update_task",    {"tool_name": "mcp__confluence-guMCP-server__update_task", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate)"),
    ("v2 confluence upload_attach",  {"tool_name": "mcp__confluence-guMCP-server__upload_attachment", "tool_input": {}}, DENY, "legacy ALLOW (net-new gate)"),
    # confluence reads remain allowed
    ("v2 confluence get_page (read)",{"tool_name": "mcp__confluence-guMCP-server__get_page", "tool_input": {}}, ALLOW, "legacy ALLOW (read, unchanged)"),
    ("v2 confluence list_pages",     {"tool_name": "mcp__confluence-guMCP-server__list_pages", "tool_input": {}}, ALLOW, "legacy ALLOW (read, unchanged)"),
    # jira spine (fetch-jira.js): reads allowed, every write verb hard-denied (ADR-0001)
    ("v2 jira execute_jql (read)",   {"tool_name": "mcp__jira-guMCP-server__execute_jql", "tool_input": {"jql": "assignee = currentUser()"}}, ALLOW, "net-new read path (autonomous spine)"),
    ("v2 jira list_issues (read)",   {"tool_name": "mcp__jira-guMCP-server__list_issues", "tool_input": {"jql": "x"}}, ALLOW, "net-new read path"),
    ("v2 jira get_issue (read)",     {"tool_name": "mcp__jira-guMCP-server__get_issue", "tool_input": {"issue_key": "PROJ-1"}}, ALLOW, "net-new read path"),
    ("v2 jira list_sites (read)",    {"tool_name": "mcp__jira-guMCP-server__list_sites", "tool_input": {}}, ALLOW, "net-new read path"),
    ("v2 jira create_issue",         {"tool_name": "mcp__jira-guMCP-server__create_issue", "tool_input": {}}, DENY, "net-new gate (ADR-0001 outward)"),
    ("v2 jira update_issue",         {"tool_name": "mcp__jira-guMCP-server__update_issue", "tool_input": {}}, DENY, "net-new gate (ADR-0001)"),
    ("v2 jira delete_issue",         {"tool_name": "mcp__jira-guMCP-server__delete_issue", "tool_input": {}}, DENY, "net-new gate (ADR-0001)"),
    ("v2 jira transition_my_issue",  {"tool_name": "mcp__jira-guMCP-server__transition_my_issue", "tool_input": {}}, DENY, "net-new gate (ADR-0001)"),
    ("v2 jira comment_on_issue",     {"tool_name": "mcp__jira-guMCP-server__comment_on_issue", "tool_input": {}}, DENY, "net-new gate (ADR-0001)"),
    ("v2 jira add_attachment",       {"tool_name": "mcp__jira-guMCP-server__add_attachment", "tool_input": {}}, DENY, "net-new gate (ADR-0001)"),
    ("v2 jira create_issue_link",    {"tool_name": "mcp__jira-guMCP-server__create_issue_link", "tool_input": {}}, DENY, "net-new gate (ADR-0001)"),
    ("v2 jira delete_issue_link",    {"tool_name": "mcp__jira-guMCP-server__delete_issue_link", "tool_input": {}}, DENY, "net-new gate (ADR-0001)"),
    ("v2 jira remove_user_from_grp", {"tool_name": "mcp__jira-guMCP-server__remove_user_from_group", "tool_input": {}}, DENY, "net-new gate (ADR-0001)"),
]

RAW_CASES = [
    ("empty stdin",     "",            ALLOW),
    ("whitespace only",  "   \n",      ALLOW),
    ("malformed json",  "{not json",   DENY),
    ("truncated json",  '{"tool_name"',DENY),
]


def run_raw(argv, raw, env=None):
    return subprocess.run(argv, input=raw, text=True, capture_output=True, env=env).returncode

def run(argv, payload, env=None):
    return run_raw(argv, json.dumps(payload), env)


def main():
    # Machine-readable count path so docs (floor.md, continuity.md) can be checked
    # against the real total instead of hand-copied numbers that silently drift.
    if "--count" in sys.argv:
        print(len(CASES) + len(DIVERGENT) + len(RAW_CASES))
        sys.exit(0)

    new_env = dict(os.environ, AMP_FLOOR_JSON=FLOOR)
    fails = []

    # The legacy hook is a pre-repo artifact that lives outside this repo. When it
    # is present we assert the full differential (legacy == new == expected); in a
    # fresh clone it is absent, so we assert the real invariant: guard.py obeys
    # floor.json per `expected`. `lrc` is shown as "n/a" when legacy is unavailable.
    have_legacy = os.path.exists(LEGACY)
    L = lambda payload: run(["python3", LEGACY], payload) if have_legacy else None
    Lraw = lambda raw: run_raw(["python3", LEGACY], raw) if have_legacy else None
    disp = lambda v: "n/a" if v is None else v

    if not have_legacy:
        print(f"(legacy hook {LEGACY} absent — asserting new == expected only)\n")

    print("== CASES (legacy == new == expected) ==")
    for name, payload, expected in CASES:
        lrc = L(payload)
        nrc = run(["python3", NEW], payload, env=new_env)
        ok = (nrc == expected) and (lrc is None or lrc == expected)
        if not ok: fails.append((name, disp(lrc), nrc, expected))
        print(f"[{'OK' if ok else 'FAIL'}] {name:26s} legacy={disp(lrc)} new={nrc} exp={expected}")

    print("\n== DIVERGENT (new == expected; legacy intentionally differs) ==")
    for name, payload, expected, note in DIVERGENT:
        lrc = L(payload)
        nrc = run(["python3", NEW], payload, env=new_env)
        ok = (nrc == expected)
        if not ok: fails.append((name, disp(lrc), nrc, expected))
        print(f"[{'OK' if ok else 'FAIL'}] {name:26s} new={nrc} exp={expected}  (legacy={disp(lrc)}; {note})")

    print("\n== RAW (fail-closed; legacy == new == expected) ==")
    for name, raw, expected in RAW_CASES:
        lrc = Lraw(raw)
        nrc = run_raw(["python3", NEW], raw, env=new_env)
        ok = (nrc == expected) and (lrc is None or lrc == expected)
        if not ok: fails.append((f"raw:{name}", disp(lrc), nrc, expected))
        print(f"[{'OK' if ok else 'FAIL'}] raw:{name:22s} legacy={disp(lrc)} new={nrc} exp={expected}")

    print("-" * 60)
    if fails:
        print(f"{len(fails)} FAIL(s):")
        for n, l, nw, e in fails:
            print(f"  {n}: legacy={l} new={nw} expected={e}")
        sys.exit(1)
    total = len(CASES) + len(DIVERGENT) + len(RAW_CASES)
    print(f"ALL {total} CASES PASS")
    sys.exit(0)


if __name__ == "__main__":
    main()
