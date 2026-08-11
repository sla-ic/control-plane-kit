# ADR-0020: Email noise elimination is the priority — get the junk out of the inbox before deepening adjudication

**Status**: Proposed (path (a) auto-archive is Amp's call to build; path (b) delete-widening needs Jordan's explicit line)
**Date**: 2026-07-27
**Deciders**: Jordan (reframe), Amp
**Relates to**: ADR-0001 (floor / outward-actuation gate), ADR-0015 (inbox actuators), ADR-0017 (email plane hardening), `policy/floor.json`, `apps/amp-tasks/{cross-system-audit,label-sync,disposition-capture,router}.js`
**Supersedes as email priority**: the adjudication-depth direction implied by ADR-0016/0018 work — depth is worthless while the inbox is full of deletable junk.

## Context

After a session spent deepening the adjudication engine (resolver→actuate coverage, cross-service
reasoning), Jordan showed his **live inbox** and named the actual pain, verbatim:

> "i have fucking calendar notifications and 50 other pieces of shit in my inbox that just shouldn't
> be there and a simple system would have deleted them… fucking shitty updates you can't delete."

The inbox is dominated by **noise that should never occupy an inbox**:
- **Calendar notifications** — "Updated invitation:", "Accepted:", "Canceled event:", "Invitation:"
  (Google Calendar auto-mail; near-zero action value once the event is on the calendar).
- **Automated marketing** — Acme lifecycle mail ("Your FSA or HSA covers more than you think",
  "You're 1 step away from sharing delivery benefits"), Atlassian webinar spam.
- **Un-deletable auto-update cruft** — vendor notifications the user can't unsubscribe from.

The engine has been optimizing the *hard* problem (adjudicating threads that need Jordan) while the
*trivial* problem (removing obvious noise from the inbox view) went unsolved. Verdict-first: **the
measurable win is inbox count dropping toward zero-junk, not a better draft on thread #159.**

The blocker to "just delete them": the **floor denies delete/trash** (ADR-0001, outward/irreversible).
So "a simple system would have deleted them" collides with the safety floor. This ADR resolves how.

## Decision

**Two paths, split by reversibility and therefore by who decides.**

**Path (a) — auto-archive noise classes out of INBOX. Amp builds this now; no floor change.**
Archiving (removing the `INBOX` label) is **reversible and floor-legal** — it is not delete. The
router already classifies `route ∈ {automated, calendar}` and marketing; many such rows are already
`status=archived` in the DB, **but the last mile that removes `INBOX` in Gmail is not reliably
firing** — so the junk stays visible. The fix:
1. For rows classed `automated` / `calendar` / marketing with high router confidence, apply
   `remove_labels:['INBOX']` (archive) via the existing `update_email` actuator (ADR-0015 allows it),
   evidence-gated and reversible — never `trash_email`.
2. Extend `label-sync.js`'s declutter last mile (already built for `jordan:sent` closures) to also
   archive these noise classes, or add a focused `noise-archive` step in cycle-b.
3. **Measure**: log the INBOX-count delta each beat. Success = the count visibly drops and stays down.
4. Conservative gate: a class only auto-archives once its router precision is demonstrably high
   (reuse the calibration plane, ADR-0016); a misclassified real thread must never be archived.

**Path (b) — true delete of pure noise. Requires Jordan's explicit floor widening.**
If archive is insufficient (Jordan wants the mail *gone*, not filed), that is a **narrow, class-scoped
widening of the floor** — permit `trash_email` for `calendar-notification` and `automated-marketing`
classes **only**, nothing else. This is Jordan's call, not Amp's; it is recorded here as the decision
he would need to make, with the default staying **deny** until he says the line.

## Consequences

- The inbox becomes the north-star surface again: fewer items, all of them real. Adjudication depth
  resumes value once the noise floor is gone.
- Path (a) carries archive-misfire risk → mitigated by class-precision gating + full reversibility
  (a wrongly-archived thread is one search/label away, and self-heals if it gets a new reply).
- Path (b) stays closed until Jordan opens it; the floor's default-deny posture is preserved.
- **Banned failure modes** (Jordan, this session): do not re-frame this as generic label-tuning or a
  sync-debugging expedition; do not build intake plumbing for the 159→36 coverage gap unprompted;
  ship the reversible archive, measure, and bring the delete question to Jordan as a clean decision.
