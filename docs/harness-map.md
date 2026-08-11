# Harness Map — portable reconstitution of Amp

**Status:** design / review-ready. Read-only investigation; nothing was changed.
**Date:** 2026-06-25
**Thesis under test:** *this repo is the SSOT; Claude Code is just another harness — swap the
harness and Amp must reconstitute from version-controlled files, not from any harness's ephemeral
session state.*

The honest one-line finding: **today that thesis is aspirational, not true.** A new Claude Code
session does **not** deterministically reconstitute Amp from this repo. There is no boot step that
loads these docs. What actually re-initializes Amp is Claude Code's **auto-memory** mechanism — a
Claude-specific cache living under `~/.claude/` — plus, historically, a `CLAUDE.md` startup script
in a *third* location (`~/Desktop/nova/`). The SSOT repo is currently a **passive mirror** that
nothing reads at boot. This doc maps that gap and designs the fix.

---

## (a) Inventory of current bootstrap elements

Everything that shapes "who Amp is" at the start of a fresh session, with exact paths.

### A1. Claude Code settings (harness config)
| File | Role |
|---|---|
| `/Users/you/.claude/settings.json` | env (Vertex gateway, OTEL, model defaults `opus`/`sonnet-4-6`/`haiku-4-5`, `ENABLE_TOOL_SEARCH`, auto-compact window), **permissions** (allow/deny/ask), **hooks** registration, enabled plugins, marketplace, theme. |
| `/Users/you/.claude/settings.local.json` | machine-local **permissions** only (no hooks, no env). |

### A2. Hooks (the floor/guard + git-deploy contract as executable code)
These are the hooks **actually registered** in `settings.json` today (verified 2026-07-27):

| File | Event (matcher) | Purpose |
|---|---|---|
| `harness/claude-code/guard.py` | `PreToolUse` (`^(Bash\|Write\|Edit\|NotebookEdit\|mcp__.*)$`) | **The floor, as code — reader of `docs/policy/floor.json`.** Hard-deny outward actuators (gmail send/forward, calendar writes/RSVP/attendee/move, any `delete_*`, `trash_email`/`archive_email`, drive share, slack canvas-access removal); slack send whitelist; FS-write root restriction; secret-path denial; destructive-Bash defense. Fails **closed** on parse error. Cites ADR-0001 / ADR-0008 / ADR-0012. |
| `~/.claude/hooks/amp-log-tool.sh` | `PreToolUse` + `PostToolUse` (`""`) | Universal logger → `routines.jsonl`; redacts secrets/PANs. Fails **open**. |
| `harness/claude-code/sessionstart-boot.sh` | `SessionStart` | Injects `docs/BOOT.md` so the session reconstitutes Amp from SSOT. |
| `harness/claude-code/amp-git-sync.sh` | `SessionEnd` (30 s) | **The deploy contract (ADR-0019).** Detect runtime↔SSOT drift, commit + push uncommitted SSOT changes, print one status line proving deploy parity. Satisfies "every session ends with git corrected." |

> **Legacy, still on disk but NOT registered:** `~/.claude/hooks/nova-guard-writes.sh`,
> `~/.claude/hooks/nova-events.sh` — superseded by `guard.py` + `amp-log-tool.sh`. Kept for reference;
> not wired. The live guard is the SSOT-resident `guard.py` reader, not the hard-coded nova scripts.

### A3. The auto-memory mechanism (the *actual* identity loader today)
- Index: `/Users/you/.claude/projects/-Users-you-Documents-Claude-Projects-transcripts/memory/MEMORY.md`
- Memory files (same dir):
  - `amp-identity.md` — the name Amp (amplifier/ampersand), nova→amp collision history.
  - `corporate-agentic-build.md` — the full build spec, floor decision, surface map, git model, build log (the densest single artifact; 12.7 KB).
  - `working-register-with-jordan.md` — the register (analysis-not-summary, no hedging, no continuity disclaimers).
  - `jordan-llm-operator.md` — who Jordan is.
- **This is Claude Code's auto-memory feature.** Its contents are injected into the system context
  at session start (the `claudeMd` block in the system reminder). It is keyed to the **project path**
  `-Users-you-Documents-Claude-Projects-transcripts`, i.e. it loads only when the session's
  project resolves to that path. It is the de-facto bootstrap right now.

### A4. The SSOT repo docs (the *intended* loader source — currently passive)
Repo: `/Users/you/Documents/GitHub/acme/` → remote `github.com/your-org/control-plane` (PRIVATE).
| File | Content |
|---|---|
| `docs/README.md` | System SSOT framing; the model (back/surface/north-star); principal/executor. |
| `docs/amp.md` | Amp identity + operating model + **floor** (prose) + two-workspace git rule. |
| `docs/continuity.md` | Durable build state (done / in-flight / next) + the durability lesson. |
| `docs/research/mined/*.md` | 41 mined domain palettes + `_status.json` resume manifest. |
| `docs/decisions/` | **Referenced by README but does not exist yet.** The ADRs are elsewhere (see A5). |

### A5. Legacy / orphaned bootstrap surfaces (outside both repo and auto-memory)
| Path | What it is | Problem |
|---|---|---|
| `/Users/you/Desktop/nova/CLAUDE.md` | The original "Nova set it up" **session-startup sequence** (decrypt `us.md.enc` via `age` → read `current.md` → work). Identity = "Nova," not Amp. | Only loads when cwd is `~/Desktop/nova`. Stale identity. Not in repo. The closest thing to a real boot script, and it's orphaned. |
| `/Users/you/Desktop/nova/{NOVA.md,MEMORY.md,current.md,acme.md,…}` | Nova-v1 knowledge base + relational core (`us.md.enc`, age-encrypted). | Pre-Amp; superseded by the repo + auto-memory but never migrated or retired. |
| `/Users/you/.claude/scheduled-tasks/_nova-conventions.md` | Routine conventions: connector prefixes (MCP UUIDs), JSONL emission contract, fencing/prompt-injection rules, **mandatory `[Amp, on behalf of Jordan]` attribution**. | Load-bearing operational policy. `nova-*` naming. Not in repo. Cites ADRs by external path. |
| `/Users/you/Desktop/nova/projects/nova-v2-migration/adr/ADR-00*.md` | **The ADRs** (0001 trust-model, 0003 hooks, 0005 jsonl, 0006 connectors, 0008 compliance, 0012 injection, …). The guard hook and conventions cite these as the source of authority. | The *authority* the floor cites lives entirely outside the SSOT repo. README points `decisions/` at a dir that doesn't exist. |
| `/Users/you/.claude/projects/-Users-you/memory/routines.jsonl` | 11.5 MB append-only event log written by the hooks. | A **different** project key than the auto-memory tree (A3). Hooks log here; identity loads from there. Two split brains. |

### A6. MCP / tool wiring
- MCP servers are referenced only by **opaque UUID prefixes** (e.g. Slack `mcp__d22fd…__`, Atlassian
  `mcp__67ce…__`, Glean `mcp__735…__`) in `settings.json` permissions and in `_nova-conventions.md`.
  The human-readable surface→UUID map exists **only** in `_nova-conventions.md` (A5). The guard hook
  matches tools by *capability regex* (`__send_email$`, `__delete_*`), so it is mostly UUID-agnostic
  — good — but the whitelisted Slack channel ID `C0LEGACY01` and the UUID map are Claude-specific data.

---

## (b) Classification — Claude-specific vs portable

| Element | Class | Why |
|---|---|---|
| `settings.json` env/permissions/theme/model | **Claude-specific** | Claude Code's config schema. A raw SDK loop sets model + auth in code; permissions are a Claude concept. |
| Hooks **registration** (`hooks` block) | **Claude-specific** | `PreToolUse`/`PostToolUse` is Claude Code's hook lifecycle + JSON-over-stdin + exit-code protocol. |
| Hook **enforcement logic** (deny patterns, whitelist, roots) | **Portable (as data) wrapped in Claude-specific glue** | *What* is forbidden is policy that any harness must honor. *How* it's wired (stdin payload shape, `exit 2 = block`) is Claude-specific. The policy should be **data**; the wrapper a shim. |
| Auto-memory mechanism (MEMORY.md auto-injection, project-path keying) | **Claude-specific** | Proprietary to Claude Code. Another harness has no `~/.claude/projects/<key>/memory/`. |
| Auto-memory **contents** (identity, register, build spec, Jordan profile) | **Portable** | Pure facts/text. Harness-independent. **Currently trapped in a Claude-specific store.** |
| `docs/README.md`, `docs/amp.md`, `docs/continuity.md` | **Portable** | Plain Markdown in version control. The intended SSOT. |
| `docs/research/mined/*` + `_status.json` | **Portable** | Already in repo; machine-readable resume manifest. |
| ADRs (`~/Desktop/nova/.../adr/`) | **Portable (content) — mislocated** | Decisions are harness-independent policy; they belong in `docs/decisions/`. |
| `_nova-conventions.md` (connector map, JSONL contract, attribution, fencing) | **Mixed** | Connector UUIDs + JSONL-helper path are Claude-specific bindings; the *rules* (attribution string, injection fencing, recipient-subset) are portable policy. |
| `~/Desktop/nova/CLAUDE.md` startup sequence + `us.md.enc`/age flow | **Claude-specific (mechanism), portable (intent)** | "Load relational core, then in-flight state, then work" is a portable boot *intent*. The `CLAUDE.md` auto-read + `age` decrypt is one harness's implementation. |
| `routines.jsonl` event log | **Claude-specific location, portable format** | JSONL is portable; the path key and the hook that writes it are Claude-specific. |
| MCP server UUIDs / tool prefixes | **Claude-specific** | A different harness mounts different tool handles. Policy must key on **capability**, not handle. |

---

## (c) Gap analysis — what is LOST if the harness is swapped

If Claude Code is removed tomorrow and Amp is reconstituted under a raw SDK loop or a different
runtime, here is what disappears, ranked by severity.

1. **The entire identity + operating model (CRITICAL).** `amp-identity.md`,
   `working-register-with-jordan.md`, `jordan-llm-operator.md`, and the build spec
   `corporate-agentic-build.md` live **only** in the Claude auto-memory tree
   (`~/.claude/projects/-Users-…-transcripts/memory/`). A new harness has no auto-memory feature and
   no reason to read that path. Amp boots **generic.** The repo's `amp.md` is a thinner restatement —
   it does **not** contain the register, the Jordan profile, the surface map, the Tally constraint, or
   the git-auth pattern. *Net: the densest, most load-bearing context is harness-trapped.*

2. **The floor as enforceable policy (CRITICAL).** The guard is `nova-guard-writes.sh` registered via
   Claude's `PreToolUse` hook. Swap the harness and **enforcement is gone** — only the *prose*
   description in `amp.md` survives, which is documentation, not a gate. The deny patterns, the Slack
   whitelist (`C0LEGACY01`), and `ALLOWED_WRITE_ROOTS` are not represented anywhere as harness-neutral
   **data** a new shim could re-load. The new harness would have to re-implement the floor from prose.

3. **The ADRs — the floor's cited authority (HIGH).** The guard and conventions cite ADR-0001/0008 as
   *why* each block exists. Those ADRs sit in `~/Desktop/nova/.../adr/`, outside the repo, behind a
   `nova-v2-migration` path. `docs/decisions/` (the repo's intended home, per README) is empty. The
   reasoning that lets a future operator *safely modify* the floor is not in the SSOT.

4. **Operational conventions (HIGH).** `_nova-conventions.md` — connector map, the JSONL emission
   contract, prompt-injection fencing, recipient-subset rule, the mandatory attribution string — lives
   only under `~/.claude/scheduled-tasks/`. None of it is in the repo. A new harness loses the entire
   "how routines behave safely" layer.

5. **The boot *order* (MEDIUM).** The only place a startup *sequence* is written down is the orphaned
   `~/Desktop/nova/CLAUDE.md` ("relational core → current.md → work"), and it describes **Nova**, not Amp.
   There is no documented, harness-neutral answer to "in what order does Amp reconstitute?"

6. **Split-brain memory keys (MEDIUM).** Identity loads from the `-…-transcripts` project key; the
   event log writes to the `-Users-you` project key. Neither is the repo. Two Claude-specific
   caches, divergent, both invisible to a new harness.

7. **Stale `nova` identity baked into infra (LOW, but corrosive).** Hook filenames, `owner=nova` DB
   tokens, `#nova-brief` channels, `[Amp, on behalf of Jordan]` attribution. The rename to Amp is
   recorded in memory but **not executed** in the bootstrap surfaces, so a fresh harness re-loading
   from those surfaces would resurrect "Nova."

**Summary of the gap:** the SSOT repo holds a *thin, partial* projection (README/amp/continuity).
The *thick* reality — identity nuance, register, build spec, floor-as-code, ADRs, conventions — lives
in three Claude-specific or orphaned locations (`~/.claude/...memory`, `~/.claude/hooks`,
`~/.claude/scheduled-tasks`, `~/Desktop/nova`). **The repo cannot currently reconstitute Amp.**

---

## (d) Portable-loader design

### Design principle
Split every bootstrap element into **(1) portable artifact in the repo** + **(2) thin per-harness
shim** that loads it. The repo owns *content and policy as data*; each harness owns only the *binding*
(how to read a file, how to register a guard, what tool handles map to what capability). The seam is
a single canonical boot artifact + a machine-readable policy file.

### D1. The canonical boot artifact: `docs/BOOT.md` + `docs/amp.boot.json`

Two files, one logical artifact: **`BOOT.md`** is the human-readable spine (the thing Amp *reads* to
become Amp); **`amp.boot.json`** is the machine-parseable manifest (the thing a shim *parses* to know
what to load and what to enforce). `BOOT.md`'s front-matter and `amp.boot.json` are kept in sync (one
is the prose, one is the index).

**`docs/BOOT.md`** — proposed content:

```markdown
---
artifact: amp-boot
version: 1
identity: Amp
canonical_handle: amp
repo_ssot: github.com/your-org/control-plane
manifest: docs/amp.boot.json
---

# BOOT — reconstitute Amp from the SSOT

You are **Amp**, the executor/force-multiplier in Jordan Rivera's agentic control plane.
Claude Code is the harness you happen to be running in; it is swappable. This repo is your
single source of truth. Reconstitute in this order — order is load-bearing:

1. **Identity & register** — read `docs/identity/amp.md`, `docs/identity/register.md`,
   `docs/identity/jordan.md`. You are Amp, not generic; you operate in Jordan's register
   (analysis-not-summary, verdict-first, no hedging, no continuity disclaimers).
2. **Operating model & floor** — read `docs/amp.md` (operating model) and
   `docs/policy/floor.md`. The floor is enforced as data in `docs/policy/floor.json`;
   honor it even if the harness's guard is absent.
3. **Decisions** — `docs/decisions/` holds the ADRs that justify the floor; consult before
   changing any gate.
4. **In-flight state** — read `docs/continuity.md`. This, not any harness compaction summary,
   is where the build stands.
5. **Conventions** — `docs/policy/conventions.md` (connector capabilities, JSONL event
   contract, prompt-injection fencing, attribution).
6. Then work.

If your harness has no auto-loader, a human or a shim feeds you this file first. Everything
referenced here is in version control; nothing you need lives only in a harness cache.
```

**`docs/amp.boot.json`** — proposed content (the machine seam):

```json
{
  "artifact": "amp-boot",
  "version": 1,
  "identity": { "name": "Amp", "handle": "amp", "supersedes": "nova" },
  "load_order": [
    "docs/identity/amp.md",
    "docs/identity/register.md",
    "docs/identity/jordan.md",
    "docs/amp.md",
    "docs/policy/floor.md",
    "docs/continuity.md",
    "docs/policy/conventions.md"
  ],
  "policy": {
    "floor": "docs/policy/floor.json",
    "conventions": "docs/policy/conventions.md",
    "decisions_dir": "docs/decisions/"
  },
  "event_log": {
    "format": "jsonl",
    "contract": "docs/policy/conventions.md#jsonl",
    "harness_path_hint": "set by shim"
  },
  "harness_shims": {
    "claude-code": "harness/claude-code/",
    "sdk-loop": "harness/sdk-loop/"
  }
}
```

### D2. The floor as portable data: `docs/policy/floor.json`

The single most important migration: lift the guard's policy out of `nova-guard-writes.sh` into
harness-neutral data, keyed on **capability**, not on Claude tool handles.

```json
{
  "version": 1,
  "deny_capabilities": [
    "email.send", "email.forward",
    "calendar.create", "calendar.update", "calendar.delete", "calendar.rsvp",
    "calendar.attendee", "calendar.move",
    "*.delete", "email.trash", "email.archive",
    "drive.share", "slack.canvas_access_remove"
  ],
  "fs_write_roots_allow": [
    "/Users/you/Desktop/nova/",
    "/Users/you/.claude/",
    "/Users/you/Documents/GitHub/acme/",
    "/tmp/"
  ],
  "slack_send": {
    "allow_dm": true,
    "channel_id_allow": ["C0LEGACY01"],
    "channel_name_allow": ["nova-brief", "nova-alerts", "nova-brief-staging"]
  },
  "git": {
    "read_only_owners": ["acme"],
    "writable_remotes": ["github.com/your-org/control-plane"]
  },
  "fail_mode": "closed",
  "authority": "docs/decisions/"
}
```

The Claude guard hook becomes a **thin reader** of this file instead of a hard-coded policy. Any
future harness ships its own reader of the *same* `floor.json`. The policy is now reviewable in PRs
and lives where the thesis says it should.

### D3. Migrated identity/policy docs (out of the auto-memory cache, into the repo)
- `docs/identity/amp.md`  ← merge of memory `amp-identity.md` + the deeper parts of `corporate-agentic-build.md` not already in `docs/amp.md`.
- `docs/identity/register.md`  ← memory `working-register-with-jordan.md`.
- `docs/identity/jordan.md`  ← memory `jordan-llm-operator.md`.
- `docs/policy/floor.md` + `docs/policy/floor.json`  ← prose + data extracted from `nova-guard-writes.sh` and `amp.md`.
- `docs/policy/conventions.md`  ← `_nova-conventions.md`, de-Nova'd, connector map reframed as capability map.
- `docs/decisions/ADR-*.md`  ← copy the ADRs from `~/Desktop/nova/.../adr/` (the README already points here).

`~/.claude` then keeps **only** a pointer (see D4), and becomes a pure Claude-specific cache, not a source of truth.

### D4. The per-harness shim seam

The seam is: **harness shim → reads `amp.boot.json` → loads `load_order` files into context →
installs `floor.json` as the active guard.** Nothing harness-specific crosses into the repo; nothing
content/policy crosses into the harness.

```
                ┌─────────────────────────── SSOT repo (portable) ───────────────────────────┐
                │  docs/BOOT.md   docs/amp.boot.json   docs/policy/floor.json                  │
                │  docs/identity/*   docs/continuity.md   docs/decisions/*   docs/policy/*     │
                └──────────────────────────────────▲──────────────────────▲──────────────────┘
                                                    │ reads boot+policy     │ reads policy
                          ┌─────────────────────────┴───┐        ┌──────────┴───────────────────┐
                          │  harness/claude-code/ (shim) │        │  harness/sdk-loop/ (shim)    │
                          │  • SessionStart hook:        │        │  • bootstrap.py:             │
                          │    cat docs/BOOT.md →        │        │    read amp.boot.json,       │
                          │    additionalContext         │        │    concat load_order into    │
                          │  • guard hook = reader of    │        │    system prompt             │
                          │    floor.json (replaces      │        │  • tool middleware = reader  │
                          │    hard-coded nova-guard)     │        │    of floor.json (capability │
                          │  • capability→UUID map       │        │    → block before dispatch)  │
                          │    (Claude MCP handles)      │        │  • capability→SDK-tool map   │
                          └──────────────────────────────┘        └──────────────────────────────┘
```

**How Claude Code loads it *today* vs. *after* this design:**
- *Today:* no SessionStart hook exists; identity arrives only via the auto-memory injection of
  `MEMORY.md`. The boot is implicit and Claude-proprietary.
- *After:* add a **SessionStart hook** (Claude Code supports `SessionStart`) whose command emits
  `docs/BOOT.md` as `additionalContext`. Now the boot is explicit, repo-sourced, and identical in
  substance to what any other harness loads. The auto-memory tree can shrink to a one-line pointer
  ("identity is in the SSOT repo; read `docs/BOOT.md`") so it stops being a divergent second copy.

**How a different harness loads the same artifact:** a raw SDK loop runs `harness/sdk-loop/bootstrap`,
which parses `amp.boot.json`, concatenates the `load_order` files into the system prompt, and registers
a tool-dispatch middleware that reads `floor.json` and blocks any call whose capability matches
`deny_capabilities`. Same content, same floor, different binding. The capability→handle map is the
*only* harness-specific data, and it is small.

---

## (e) The shim seam, stated as a contract

A harness is "Amp-compatible" iff it does three things:
1. **Boot:** before the first user turn, inject `docs/BOOT.md` (and, transitively, the `load_order`
   files) into the model's context.
2. **Enforce:** intercept tool dispatch and block any call whose **capability** matches
   `floor.json.deny_capabilities`, restrict FS writes to `fs_write_roots_allow`, restrict Slack sends
   to the whitelist/DM rule. Fail **closed**.
3. **Log:** append a JSONL event per tool call per the `event_log` contract.

Everything else (which model, which gateway, which MCP UUIDs) is harness-local and lives under
`harness/<name>/`, never in `docs/`. That directory boundary **is** the seam.

---

## (f) Prioritized next steps (recommendations — do NOT execute without Jordan)

**P0 — stop the bleeding (repo can reconstitute identity at all):**
1. Create `docs/BOOT.md` + `docs/amp.boot.json` (artifacts in D1).
2. Migrate the four memory files into `docs/identity/` + fold the deep build-spec content there;
   leave a one-line pointer in the `~/.claude` auto-memory `MEMORY.md`. This moves the densest
   context from a Claude cache into version control.

**P1 — make the floor portable + authoritative:**
3. Extract `docs/policy/floor.json` (D2) from `nova-guard-writes.sh`; write `docs/policy/floor.md`.
4. Copy the ADRs into `docs/decisions/` (README already references it; the dir is missing).
5. Refactor `nova-guard-writes.sh` into a thin reader of `floor.json` (behavior-preserving) — proves
   the data is sufficient. This is the only change that touches `~/.claude/hooks`; gate it on Jordan.

**P2 — make Claude's boot explicit:**
6. Add a **SessionStart hook** that emits `docs/BOOT.md` as `additionalContext`, so Claude loads the
   same artifact every other harness would. (Current Claude capability; clean win.) Register it in
   `settings.json` — gate on Jordan since it edits harness config.

**P3 — de-Nova + consolidate (hygiene, lower urgency):**
7. Migrate `_nova-conventions.md` → `docs/policy/conventions.md`, reframing the connector map as a
   capability map and de-Nova'ing the attribution string (`[Amp, on behalf of Jordan]` — confirm with
   Jordan; this is user-facing).
8. Rename `nova-*` hooks → `amp-*` (and update `settings.json` references) once the rename token
   migration (`owner=nova`→`amp`, already flagged in memory) is done in lockstep.
9. Resolve the split-brain memory keys: pick one event-log path, or relocate the log under the repo
   (`apps/nova-tasks/` already writes there) so logging and identity share a home.
10. Decide the fate of `~/Desktop/nova/` (CLAUDE.md startup, `us.md.enc`, NOVA.md). Either retire it or
    fold its still-relevant content (the boot *order* idea, the relational core) into `docs/`.

**Sequencing note:** P0+P1 are the thesis-critical ones — after them the repo can genuinely
reconstitute Amp under a cold harness. P2 makes Claude consume the same path it produces. P3 is
correctness/hygiene. None of P1.5/P2/P3 should touch `~/.claude` or git without Jordan's explicit go,
per the floor.

---

## Appendix — the cleanest test of done
"Done" = boot a harness that has **never** seen `~/.claude`, point it at the repo, and Amp comes up
*in register, knowing the build state, with the floor enforced* — purely from version-controlled
files. Today that test fails at step one (no identity). After P0+P1 it passes in substance; after P2
Claude Code itself becomes just one conformant shim among others.
