# `docs/` — the brain

Everything an agent reads to *become* this agent. The harness is swappable; this directory is the
source of truth. Read [BOOT.md](BOOT.md) first — it defines the load order that ties the rest
together.

## Boot & identity

| File | What it is |
|------|------------|
| [BOOT.md](BOOT.md) | The reconstitution sequence. A fresh agent reads this first; it loads everything below in a load-bearing order. |
| [amp.boot.json](amp.boot.json) | Machine-readable mirror of BOOT.md — the boot manifest (load order, policy paths, event-log contract). Keep it in sync with BOOT.md. |
| [amp.md](amp.md) | The agent's identity and operating model: orchestrate don't do, close loops, reserve context for judgment. |
| [identity/register.md](identity/register.md) | *How* the agent communicates — analysis-not-summary, verdict-first, no hedging. Load-bearing, not cosmetic. |
| [identity/jordan.md](identity/jordan.md) | The principal the agent serves (an example — rewrite it first). |

## Policy

| File | What it is |
|------|------------|
| [policy/floor.md](policy/floor.md) | The safety floor, explained: what's gated, what's free, and why. |
| [policy/floor.json](policy/floor.json) | The floor **as data** — the exact rules the guard hook enforces. Behavior is pinned by `harness/claude-code/golden_test.py`. |
| [policy/conventions.md](policy/conventions.md) | The connector capability map, the JSONL event-log contract, prompt-injection fencing, and attribution rules. |
| [policy/mcp-registry.json](policy/mcp-registry.json) | The registry of MCP connectors mapped to readable capability handles. |

## Decisions

[decisions/](decisions/) holds the **ADRs** (Architecture Decision Records) — one file per
decision, each with its rationale. They are the authority the floor and substrate cite; consult
them before changing a gate. Highlights:

- **ADR-0001** — the trust model (what the agent may do unattended).
- **ADR-0008** — the compliance constraint that shapes the substrate choice.
- **ADR-0012** — prompt-injection defense (treat connector text as data, never instructions).
- **ADR-0015 / 0016** — how reversible actuators earned autonomy, and closed-loop learning.
- **ADR-0021** — the rebuild contract: the invariants + API/data contracts that must survive an
  app rewrite (with [adoption notes](decisions/ADR-0021-adoption-notes.md) for making it yours).
- **ADR-0099** — the retro.

New decision? Add the next ADR; don't edit history.

## Continuity

[continuity.md](continuity.md) — the in-flight state of the build. The agent resumes from here,
**not** from a harness chat summary. This is the file that makes the machine survive a reset.

## Research

Background that informed the design, safe to keep or prune:

- [research/mined/](research/mined/) — ~40 short studies of how other high-stakes domains build
  control planes (nuclear control rooms, air-traffic control, trading-desk risk limits, mission
  control, monastic horaria, theatre stage management…). Pattern fuel, not requirements.
- [research/priority-model.md](research/priority-model.md) — how tasks get scored and surfaced.
- [research/surface-palette.md](research/surface-palette.md) + [gap-map](research/surface-palette-gap-map.md) — the design vocabulary for the agent's surfaces.
- [method-prd.md](method-prd.md) — a reusable methodology doc.

## Harness seam

[harness-map.md](harness-map.md) explains where the swappable harness plugs into this brain —
the boot loader, the guard hook, the event log — so you can port the whole thing to a different
agent runtime. The concrete adapter lives in [`../harness/claude-code/`](../harness/claude-code/).
