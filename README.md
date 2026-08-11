# Control Plane Kit

A working, version-controlled **AI control plane** — the set of files that define how an agent
operates, so its identity, safety rules, decisions, and memory live in git instead of in a
chat window or a single vendor's tool. The agent runtime (the "harness") is swappable; **this
repo is the source of truth.**

This is a real, running machine with the personal and confidential details removed and replaced
by a fictional principal ("Jordan Rivera") and example data. Clone it, make it yours, and you
have your own control plane.

---

## Why a control plane

An agent is only as good as what it reliably knows and what it's reliably prevented from doing.
Put both in version control and you get properties a chat history can't give you:

- **Portability** — swap the harness (a CLI, an SDK, a cron runner) without losing the agent.
- **Auditability** — every gate and decision has a file and a git history behind it.
- **Safety as data** — the "floor" (what the agent may never do unattended) is JSON, enforced by
  a hook and pinned by tests — not a paragraph in a prompt that can drift.
- **Real memory** — the agent resumes from a versioned `continuity.md`, not a lossy summary.

## The three layers

| Layer | Path | What it is |
|-------|------|------------|
| **The brain** | [`docs/`](docs/) | Identity, register (voice), the floor, decision records (ADRs), continuity, conventions, and research. This is what a fresh agent reads to become *this* agent. |
| **The harness shim** | [`harness/claude-code/`](harness/claude-code/) | The thin, swappable adapter between the brain and one agent runtime: a boot loader, the floor-enforcing guard hook, and its golden tests. |
| **The app** | [`apps/amp-tasks/`](apps/amp-tasks/) | A concrete thing the agent runs: a task/priority database with a web dashboard, an email-triage plane, and scheduled "cycle" jobs. Illustrates the whole pattern end to end. |

## The boot order (load-bearing)

An agent reconstitutes itself by reading [`docs/BOOT.md`](docs/BOOT.md), which loads, in order:

1. **Identity** ([`docs/amp.md`](docs/amp.md)) — who the agent is and its operating model.
2. **Register** ([`docs/identity/register.md`](docs/identity/register.md), [`jordan.md`](docs/identity/jordan.md)) — *how* it communicates and who the principal is.
3. **Floor** ([`docs/policy/floor.md`](docs/policy/floor.md) + [`floor.json`](docs/policy/floor.json)) — the safety policy, as data.
4. **Decisions** ([`docs/decisions/`](docs/decisions/)) — the ADRs that justify every gate.
5. **Continuity** ([`docs/continuity.md`](docs/continuity.md)) — where the work actually stands.
6. **Conventions** ([`docs/policy/conventions.md`](docs/policy/conventions.md)) — the connector map and event-log contract.

Order matters: identity before voice, floor before action, decisions before changing a gate.

## The floor (the part to understand first)

The floor is the agent's safety contract expressed as data in
[`docs/policy/floor.json`](docs/policy/floor.json) and enforced by
[`harness/claude-code/guard.py`](harness/claude-code/guard.py), a `PreToolUse` hook that runs
before every tool call and **fails closed**. Outward, irreversible actuators (sending mail,
calendar writes, deletes, external sharing, off-whitelist posts) are hard-denied; reversible,
internal work runs freely. The behavior is pinned by 101 golden tests:

```bash
python3 harness/claude-code/golden_test.py
```

Changing a gate means writing an ADR, editing `floor.json`, and adding golden tests — in that
order. The floor is the one thing you should tune deliberately, not casually.

## Run the example app

```bash
cd apps/amp-tasks
npm install
node seed-tasks.js      # populate a fresh DB with EXAMPLE tasks
./run-dash.sh           # start the dashboard (http://localhost:3737)
```

The dashboard renders the task/priority model; `public/learn/` is a self-contained course that
teaches the control-plane pattern itself.

## Make it yours

Start here, in roughly this order:

1. **Rewrite the principal** — [`docs/identity/jordan.md`](docs/identity/jordan.md) and
   [`docs/identity/register.md`](docs/identity/register.md). These define who the agent serves
   and how it speaks. (You can keep the agent's own name, "Amp", or rename it.)
2. **Tune the floor** to your risk posture — edit [`floor.json`](docs/policy/floor.json), then
   `python3 harness/claude-code/golden_test.py` until green.
3. **Map your connectors** in [`docs/policy/conventions.md`](docs/policy/conventions.md) and
   [`mcp-registry.json`](docs/policy/mcp-registry.json) — reads first; gate every write.
4. **Replace the example data** — the seed (`apps/amp-tasks/seed-tasks.js`), the stakeholder tier
   map and voice profile (`apps/amp-tasks/email/config/`), and the launchd plists
   (`apps/amp-tasks/com.example.*.plist`).
5. **Reset continuity** — clear [`docs/continuity.md`](docs/continuity.md) and let your agent
   start logging its own state.

Then `git init` and it's your control plane.

## What's fictional here

The principal ("Jordan Rivera"), colleagues, company ("Acme"), partners, connector IDs, channel
IDs, and all seed/task/email data are **examples**. The *machine* — the boot loader, the floor,
the guard, the ADRs, the app, the tests — is real and runs as-is.

See [`docs/README.md`](docs/README.md) for a full map of the brain, and
[`harness/claude-code/README.md`](harness/claude-code/README.md) for the harness seam.
