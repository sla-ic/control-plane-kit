# How we write product docs — the method (SSOT)

**Status:** Canonical. Living — we iterate as we build. Date: 2026-07-27.
**Owner:** Jordan (method); Amp (maintenance).
**Purpose:** The single source of truth for how we structure and write product docs here — the
Project/Product **Brief**, the **PRD**, and the **ERD**. This doc is the anchor every doc we draft
points back to, and it is the seed of the eventual PRD-writing skill. It is *method*, not any one
product; your first PRD (e.g. under `docs/prd/<product>/`) is the first application of it.

In practice a `00-stage-setting.md` captures the early "provisional read" and open questions for a
product; once the method below is applied, those open questions get answered in the PRD itself and
the stage-setting doc becomes background research.

---

## The anchors (non-negotiable, they decide every other call)

1. **One truth, many renderings. The narrative for humans and AI is the same — only presentation
   differs.** There is a single truth of the product (problem, goals, non-goals, requirements,
   acceptance criteria, constraints, edge cases). A human reviewing it and an agent building from it
   consume *that same truth*. A review may render a journey as prose while QA renders it as WHEN/THEN
   and an agent consumes it as structured context — that is **rendering**, not a second document. So:
   we write **one grounded doc**, never audience-forked docs, and presentation stays downstream
   (tooling's job, not the author's). Acceptance criteria and constraints are **not** an "AI layer" —
   they are what a requirement *is* when stated completely.

2. **Correct grounding, not lean-vs-comprehensive.** Length is a symptom, never a target. Because the
   doc is the SSOT, the only axis is: is each claim *correct* and *grounded*? Cut ceremony
   (dates-as-commitments, prose padding) **and** cut nothing load-bearing — both are the same failure.
   Every assertion carries its grounding (a source, a decision, or a measured fact).

3. **Every section earns its place.** A section exists only when it carries correctness *for this
   product*. **Not every doc has every section, and shouldn't.** The catalog below is a menu of
   load-bearing parts, not a checklist to fill.

4. **Solve the problem, don't fill a template.** These structures are scaffolding for correct
   thinking, not a form. Reason from the product to what must be true; the sections are where that
   truth lands.

---

## The three docs — and the one rule for what goes where

They are not three sizes of one doc. They are **three different questions, with different owners and
different rates of change** — which is exactly why the split reduces cross-functional distraction
(a legal reviewer shouldn't diff around an architecture change; an engineer shouldn't re-read the
market case to find a changed acceptance criterion):

| Doc | Answers | Audience | Changes when… |
|-----|---------|----------|---------------|
| **Brief** (Project/Product Brief) | *Should we, and why?* — strategy, opportunity, business case, XFN/partner/market framing | Leadership + all XFN | **strategy** changes |
| **PRD** | *What exactly is true about what we build?* — the requirements Eng relies on | Eng, Design, QA, XFN, and any agent building it | **requirements** change |
| **ERD** | *How do we implement it?* — technical design | Eng (owned by Eng) | the **technical approach** changes |

**The boundary rule** (the only line we enforce, because it's where docs bleed):
- Answers *should we / how much is it worth* → **Brief**
- Answers *what's true about what we build* → **PRD**
- Answers *how* → **ERD**

The PRD carries a *tight* problem framing so it stands alone; the deep strategy stays in the Brief.
The PRD names the technical constraints Eng must honor but does not design the solution — that's the
ERD.

---

## PRD — the section catalog

The PRD's one job: be the single true answer to *"what are we building, and what makes each part
correct?"* Every section below either **grounds** a requirement, **states** one, or **bounds** it.
Grouped by the role each plays. Omit any that carries no correctness for the product at hand.

### Layer 1 — Why these are the right requirements (grounding)
- **Problem** — the grounded truth of what's broken/needed. Tight; the deep strategy is in the Brief.
- **Goals / Non-goals** — what we're solving for, and the explicit boundary. Non-goals are
  load-bearing: they are how both a human and an agent know what *not* to build (the "no idea what
  wasn't asked" failure mode).
- **Success metrics + counter-metrics** — the definition of "did we get it right," and what we refuse
  to break getting there. A requirement with no measure of correctness is ungrounded.

### Layer 2 — The requirements themselves (the truth)
- **Users & journeys** — who, and the flows the requirements live inside. Prefer the journey as the
  *spine*, with functional requirements hung off each step, over a flat list divorced from the flow.
- **Functional requirements** — the core. **Each requirement carries, inline: its acceptance criteria
  (testable — the definition of correct for *that* requirement), its constraints, and its priority.**
  Criteria and constraints are not quarantined into separate sections — that is the "one truth"
  anchor applied.
- **Non-functional requirements** — performance, security, privacy, compliance, accessibility,
  reliability. Where a domain has hard regulatory rules, they live here as a **"🚫 Never" tier**:
  stated as testable rules an implementer (human or agent) cannot paraphrase away.
- **Edge cases / unhappy paths / error handling** — where correctness in regulated / money-moving
  products actually lives (partial states, failures mid-flow, unsupported conditions).

### Layer 3 — What isn't resolved (honesty)
- **Open questions / decisions needed** — the decision-forcing surface; each with an owner. This is
  the part of the PRD that does the most work and that weak PRDs fake.
- **Risks** — what could make this wrong, and the mitigation.
- **Dependencies** — external and internal (XFN), including any partner/regulatory dependencies.

### Layer 4 — The path to correct in production
- **Rollout / phasing / launch gates** — in regulated domains these are *requirements*, not a plan
  (e.g. certification/testing gates that must pass before launch).
- **Instrumentation** — how we observe correctness in the wild; ties directly back to the success
  metrics.

### Layer 5 — Grounding
- **References** — the sources every claim rests on. SSOT discipline: nothing asserted without
  grounding.

**Formalizing acceptance criteria:** default to plain, testable statements. Escalate to strict
WHEN/THEN only where ambiguity is itself a defect (e.g. money-movement / eligibility / compliance
rules). Don't formalize prose that gains nothing from it.

---

## Brief — the section catalog (macro)

The Brief is the decision-and-alignment surface. Lighter and more narrative than the PRD; it holds
the *why* and the shape, not the detailed requirements.

- **Summary / the bet** — what we're proposing and why it's worth it, in a few lines.
- **Problem & opportunity** — why this, why now; the size and shape of the opportunity.
- **Strategic context** — how it fits the company's strategy and roadmap; what it unlocks / blocks.
- **Market & competitive / partner landscape** — the outside view, and any make-vs-buy / sourcing
  decision (e.g. which partner or processor, and why).
- **Proposed approach** — the solution *shape* at macro level (not requirements).
- **Scope & phasing** — macro scope and the phase sequence.
- **Business case / sizing** — the numbers that justify the bet.
- **XFN & stakeholders** — the cross-functional map; who owns what, who must be aligned.
- **Success definition** — the macro outcomes (the PRD's metrics operationalize these).
- **Risks & key decisions** — the big bets and the decisions leadership must make.
- **Open questions.**

---

## ERD — boundary only

Owned by Eng; answers *how*. The PRD hands it a correct, bounded set of requirements + constraints;
the ERD chooses the technical design against them. We don't template Eng's doc here — we only hold the
boundary: **the PRD decides *what* and *what makes it correct*; the ERD decides *how*.**

---

## How this seeds the skill

The eventual PRD-writing skill operationalizes this doc: it drives the *specification discipline*
(problem-first, testable acceptance criteria, explicit non-goals and constraints, a hard "Never" tier
where the domain demands it, grounded claims) and treats presentation as a downstream rendering of the
one truth. It layers on top of — not against — whatever tooling helps. The method is the point;
tooling is interchangeable.
