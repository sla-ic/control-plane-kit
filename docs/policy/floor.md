# The Floor — portable safety policy as data

The **floor** is the non-negotiable safety boundary every harness Amp runs in must enforce. It is
expressed once as data ([floor.json](floor.json)) and read by a thin, auditable per-harness reader.
This decouples *policy* (portable) from *mechanism* (harness-specific) — the seam described in
[../harness-map.md](../harness-map.md).

## Why data, not a script
The legacy enforcement lived in `~/.claude/hooks/nova-guard-writes.sh` (a Python hook with a `.sh`
name). That works for Claude Code but is invisible/unportable to any other harness. Extracting the
*decisions* into `floor.json` means:
- one source of truth a human can audit at a glance;
- any harness can ship a ~120-line reader that enforces the identical floor;
- changes to policy are diffs to data, reviewable without re-reading enforcement logic.

## What the floor enforces (ADR-0001 trust model + ADR-0008 egress) — **v2**
Evaluated in fixed order — `hard_deny → slack_send → drive_write → fs_write → bash_deny → default allow`:

1. **Hard denies (29 tool-name patterns).** No gmail send/forward; no calendar create/update/delete/
   RSVP/attendee-change/move; any bare `*delete*` (permanent destruction); slack canvas access
   changes + ephemeral sends; drive `add_file_sharing_preference` (egress); all confluence writes
   (create/update page/blogpost/task, upload); all jira writes (create/update/delete/transition/
   comment/add/remove — reads pass). Args-independent. (NB: `trash_email`/`archive_email`/
   `batch_update_emails` are NOT here — ADR-0015 made reversible inbox hygiene default-allow.)
2. **Slack send.** Allowed only to a DM/mpim (channel id starting `D`/`G`, len ≥ 9), an id in the
   whitelist (`C0LEGACY01` = #nova-brief), or a whitelisted name (`nova-brief`, `nova-alerts`,
   `nova-brief-staging`). Everything else denied. (Match preserves the legacy Python precedence:
   `slack_send_message` OR (`send_message` AND name contains "slack").)
3. **Drive writes.** Non-share writes allowed; sharing changes already hard-denied above.
4. **Local FS writes** (`Write`/`Edit`/`NotebookEdit`). Secret material is denied first **regardless of
   root** (`sensitive_path_patterns`: `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube`, gh hosts,
   `.git-credentials`, keychains, `.env`, `*.pem`, `*.key`, `id_rsa`/`ed25519`/…, `secrets/`,
   `credentials/`, etc.). Otherwise allowed anywhere under `allow_roots` = the whole home tree
   (`/Users/you/`) + `/tmp/`. Empty target → allow.
5. **Bash.** Denies `rm -rf /<not Desktop/nova>` and `mkfs`/`dd if=` (defense in depth), **plus** any
   command that references secret material AND shows read intent (`cat`/`less`/`head`/`strings`/
   `base64`/`scp`/…) or write intent (`>`/`>>`/`tee`/`cp`/`mv`/`dd`/`sed -i`/`truncate`/…). This
   closes the legacy bash bypass.
6. **Default allow.** The hook is scoped to write-side tools via settings.json matchers; reads pass.

**Fail mode: closed.** Hook-input parse error, or a missing/unreadable floor, → deny (exit 2).

## v2 — intentional divergence from the legacy nova-guard
The floor is **no longer behavior-preserving** — it diverges from `~/.claude/hooks/nova-guard-writes.sh`
on purpose, in two coupled moves:
- **(a) Broader local authority.** Amp is a first-party coder; `fs_write.allow_roots` is the whole home
  tree + `/tmp/` (legacy was 4 narrow roots: `~/Desktop/nova`, `~/.claude`, the acme repo, `/tmp`).
- **(b) Secrets denied across BOTH mechanisms.** In exchange for the wider write surface, secret material
  is hard-denied through the write tools **and** through Bash (legacy left bash file reads/writes
  ungated — the door used to write `~/.zshrc`). `sensitive_path_patterns` is the single shared gate.

The outward gates (hard_deny, slack, drive) are **unchanged** from legacy.

## Golden test
[../../harness/claude-code/guard.py](../../harness/claude-code/guard.py) is the reader.
[../../harness/claude-code/golden_test.py](../../harness/claude-code/golden_test.py) runs **101 cases** in
three suites: **CASES** (40 — `legacy == new == expected`, the unchanged surface), **DIVERGENT** (57 —
`new == expected`, legacy decision printed for contrast: home-tree writes now allow, secrets now deny
across both mechanisms, confluence + jira writes now hard-denied while reads pass), **RAW** (4 —
fail-closed on bad input). Current status: **all 101 pass**. Re-run after any floor.json edit:

```bash
python3 harness/claude-code/golden_test.py   # exit 0 = all suites green
```

## Deploy / revert — **DONE, LIVE**
The swap is complete. `~/.claude/settings.json` PreToolUse points at
`python3 ~/Documents/GitHub/acme/harness/claude-code/guard.py` (env `AMP_FLOOR_JSON` optional;
defaults to this floor.json). The SessionStart boot hook is also wired.
- **Instant revert:** restore the matcher to `~/.claude/hooks/nova-guard-writes.sh` (never deleted) and
  the floor reverts to legacy behavior. Settings backup: `settings.json.bak-20260625`.

## Changing the floor
Edit `floor.json` only. Add/adjust patterns or roots, re-run the golden test (add a case for the new
behavior first so the matrix proves it), then redeploy. Never widen the floor without Jordan's explicit
line — outward actuators (Jira/Confluence writes, email send, calendar) stay denied until then.
