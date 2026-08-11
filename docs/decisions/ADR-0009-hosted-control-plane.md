# ADR-0009: Host the control plane on the Mac with git-backed state; treat Acme cloud as a costed, deferred flip

**Status**: Accepted (revised 2026-07-01 after empirically costing the Acme-cloud options)
**Date**: 2026-07-01
**Deciders**: Jordan, Amp
**Supersedes**: the 2026-07-01 morning draft of this ADR (which proposed a full InternalCloud + AuthService + SSO + SecretStore multi-user service — over-scoped for a personal tool; see "History" below)
**Relates to**: ADR-0002 (substrate), ADR-0005 (JSONL event log), ADR-0008 (compliance constraint — this operates *inside* it)

## Context

The control plane (amp-tasks: tasks API + Cycle-B adjudication + fleet audit) runs
as a local launchd service on Jordan's Mac (`com.example.amp-tasks`, port 3737, SQLite
at `~/.local/share/amp-tasks/`). It is always-on across terminal-close and crash.

> **Addendum 2026-07-23 — lid-close correction (was stale).** An earlier version of
> this line claimed the plane was "always-on across lid-close on AC." That was
> **false**: `pmset -g custom` shows AC `sleep 0` (no *idle* sleep) but closing the
> lid still sleeps the Mac unless a `PreventSystemSleep` assertion is held — and none
> was (`pmset -g assertions`, `ps aux | grep caffeinate` both empty). A sleeping Mac
> does not fire launchd `StartInterval`/`StartCalendarInterval` beats; they coalesce
> to the next wake, so Cycle B silently missed its 07/12/17/21 slots and the 15-min
> fast loop halted. **Tier-1 fix shipped:** `com.example.amp-awake` LaunchAgent runs
> `caffeinate -s`, which holds `PreventSystemSleep` **while on AC only** (safe on
> battery / in a bag — the assertion doesn't hold there, the Mac sleeps normally).
> Contract is now honest: *runs lid-closed while on the charger.* True lid-**off** /
> away-from-power autonomy remains the Tier-2 InternalCloud flip below.

The open question Jordan pressed, correctly: **is there an Acme-cloud host that is
just mine, always-on, without the enterprise-service machinery?** Not the whole
company (InternalCloud + SSO + SecretStore), not ephemeral (CloudRunner) — a middle ground. "Can I not
host in the Acme cloud just for me?"

We investigated the real, sanctioned options empirically rather than by assertion.

## What we found (measured, not guessed)

| Option | Cloud? | Just me? | Always-on? | Verdict |
|---|---|---|---|---|
| **Mac + launchd** (today) | no | yes | yes on AC + `caffeinate` (see addendum) | ✅ right-sized now |
| **devbox remote** | yes (Acme EC2) | yes | *fights it* | ❌ wrong tool — see below |
| **CloudRunner** | yes | yes | **no** (per-run ephemeral) | good for scheduled Cycle-B bursts only |
| **InternalCloud (headless, single-user)** | yes | yes | yes | ✅ correct 24/7 host, high setup ceremony — the deferred flip |

**devbox remote — investigated and rejected on evidence:**
- It *is* a personal EC2 box in Acme's cloud (`devbox remote create/ssh/tmux/...`),
  and the "carrot monorepo" coupling is NOT fatal — a stub `CARROT_DIR` +
  `GITHUB_USERNAME=your-org` unlocks the remote commands with no monorepo checkout.
- BUT it is a **disposable, hibernating dev box**, not a durable service host.
  From Acme's own DevBox Remote User Manual: instances are auto-patched and recycled,
  snapshotted every 30 min, and *"Never rely on transferring data between instances
  as a permanent persistence mechanism."* Pool configs set `Hibernate: true`,
  `MaxAge: 4h`.
- **Hibernation directly defeats scheduled autonomy**: a hibernated box runs no
  cron, so Cycle B wouldn't fire. Keeping it awake 24/7 means paying full price.
- **Cost + entitlement**: Jordan is not registered in devbox's instance-type
  permission system (`/admin/instance-type-permissions/users/jordan.rivera →
  404 user not found`); the only eligible instance is `r6a.2xlarge` — **64 GiB /
  8 vCPU, ~$10.89/day ≈ $327/mo** — a full-carrot dev box, absurd overkill for a
  three-file Node app + SQLite.

Net: devbox remote is the wrong shape (disposable + hibernating) at the wrong price
($327/mo) requiring an onboarding request. Not the middle ground it looked like.

## Decision

1. **Host stays local (Mac + launchd)** for now — it is already always-on and
   right-sized. No cloud spend, no new processor, no new ceremony.

2. **Durability is made host-independent via git-backed state**, which is the
   thing we actually wanted from "cloud." A portable SQL dump of `tasks.db` is
   pushed to the PRIVATE `control-plane` origin on a dedicated `amp-state` ref
   (`snapshot-to-git.sh`, git plumbing — never touches the working branch). This
   is exactly what devbox's own manual prescribes ("keep data in GitHub"), matches
   the SSOT model, and means any future host is a `git restore` away. The host
   debate dissolves once state is portable.

3. **Off-terminal autonomy runs under launchd today** (`com.example.amp-cycle-b`,
   `cycle-b.sh`): scheduled Cycle B reasons over the flagged delta via the Acme
   llm-gateway and escalates to the floor-whitelisted #amp-alerts. All paths live in
   `~/.local/share` because launchd has no Full Disk Access to `~/Documents`.

4. **InternalCloud headless single-user service is the documented flip to true 24/7 cloud** —
   pursued only when "must run with the laptop fully off" becomes a real need. It
   is a small ECS task (cheap, durable, cron-capable), NOT the AuthService/SSO/SecretStore
   multi-user web app of the superseded draft. See the runbook.

## Why this is inside ADR-0008

No new third-party processor, no new egress. Model calls stay on the Acme llm-gateway
(`llm.js`). State is pushed only to Jordan's own private Acme-org GitHub repo. #amp-alerts
posts are to a channel Jordan owns. PCI hard-block and no-auto-send (Gmail drafts
only) carry over unchanged. The multi-user seam (`identity.js`, AuthService-JWT `sub`
resolution) is retained as dormant code for the InternalCloud flip — it costs nothing to keep.

## Consequences

- ✅ Zero recurring cloud spend; zero onboarding dependency; autonomy today.
- ✅ Durable, off-machine, versioned audit trail (survives laptop loss / host swap).
- ✅ Portable: whatever host we pick later restores from `amp-state`.
- ⚠️ Not laptop-*off* resilient. If the Mac is fully powered down, scheduled runs
  pause (state is safe). Closing that gap = the InternalCloud flip, costed and documented.
- ✅ Off-machine `snapshot-to-git.sh` is now **automated under launchd** (corrected
  2026-07-23; the prior "must run interactively, NOT wired into launchd" claim is
  stale). `cycle-b.sh:222` runs it watchdog-wrapped on every slow beat via a TCC-free
  bare object store at `~/.local/share/amp-tasks/state-git` (never touches
  `~/Documents`) with osxkeychain creds in the `gui/$UID` domain. Verified live:
  `state.last_amp_state_push_at` stamps each cycle (e.g. 2026-07-23 16:00:30).

> **Addendum 2026-07-27 — snapshots moved off a branch to `refs/snapshots/amp-state`.**
> The DB-dump chain was stored on `refs/heads/amp-state` — a *branch*. Being an orphan
> ref (no shared history with `main`), GitHub's branch view reported it as perpetually
> "N behind / M ahead" of main (100/16 and growing every snapshot) — meaningless noise
> that made the branch view unreadable and looked like broken git hygiene. Fixed: the
> identical chain now lives at **`refs/snapshots/amp-state`** (a ref outside
> `refs/heads/*`), so it never appears as a branch nor is compared to main. Durability
> is byte-identical. `snapshot-to-git.sh` fetches/updates/pushes `$SNAP_REF`; the old
> `refs/heads/amp-state` history was migrated to the new ref and the branch deleted on
> origin. The branch view is now just `main`. Retrieve a snapshot with
> `git fetch origin 'refs/snapshots/amp-state:refs/snapshots/amp-state'`. See ADR-0019
> (deploy contract) for the companion "git == deployed" enforcement.

## History (superseded draft)

The first 2026-07-01 draft promoted the control plane to a full **InternalCloud + AuthService +
SSO + SecretStore + RDS multi-user service** and wrote a provisioning runbook of IT
tickets and Terraform. That was a scope error: Jordan asked to host a *personal*
tool for himself, not to ship an official Acme service. The InternalCloud container
artifacts (`Dockerfile`, `entrypoint.sh`, `identity.js`, `/monitors/health`) are
kept — they are cheap, correct, and make the InternalCloud flip real if we ever want it —
but the multi-user productization is explicitly deferred, not in flight.

## References
- DevBox Remote Tutorial / User Manual — internal infra runbook
- `docs/ops/hosted-control-plane-provisioning.md` (InternalCloud flip runbook — deferred)
- ADR-0008 (compliance), ADR-0002 (substrate), ADR-0005 (event log)
- `apps/amp-tasks/cycle-b.sh`, `snapshot-to-git.sh`, `~/Library/LaunchAgents/com.example.amp-cycle-b.plist`
