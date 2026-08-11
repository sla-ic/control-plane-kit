# Triage systems (battlefield/emergency, e.g. START, Manchester)

> Mined 32922 tok · salvaged from killed run wf_bcf74bab-7ae (Scout→Mine).

## Bind every category to a fixed, pre-authorized action — the bin IS the order. START's four colors are not severity labels, they are dispositions: RED/Immediate = treat and evacuate first; YELLOW/Delayed = can wait ~hours, monitor; GREEN/Minor ('walking wounded') = self-care, gather elsewhere; BLACK/Expectant = no resources spent now. The decision-maker never separately decides 'so what do I do' — assigning the color already committed the action and the resource claim.

**Term of art:** Triage category / disposition (Immediate, Delayed, Minor, Expectant); 'the tag is the order'

Color/category maps one-to-one to a disposition + a resource-allocation rule that is agreed in advance, so categorization and action are a single step. The interface analogue: each attention-tier an item is assigned to should already carry its joint action (act-now / hold / self-serve / suppress), not just a priority score the human must then translate into a decision.

**Failure mode:** Category inflation / under-triage: when colors drift into meaning 'how bad I feel about this' rather than a hard disposition, everything creeps toward RED and the priority signal collapses. Over-triage (too many RED) overwhelms downstream capacity just as badly as under-triage misses the dying.

## Sort on 2-4 physiologic discriminators only, deliberately discarding the rest. START uses exactly three gates in fixed order: can they walk? (RPM) Respirations — present/absent, then rate >30? Perfusion — radial pulse or cap refill >2s? Mental status — can they obey commands? That's the whole assessment. Manchester Triage uses ~50 flowcharts but each resolves through a short ordered list of 'discriminators' (e.g. life threat, hemorrhage, pain severity, acuity).

**Term of art:** Discriminators; RPM (Respiration-Perfusion-Mental status); the START algorithm

The field proved that a tiny set of high-yield, fast-to-check signals reproduces expert sorting well enough, and that adding more inputs slows the sort below the rate the inflow demands. Accuracy is knowingly traded for speed + reproducibility. Interface analogue: rise-to-attention should be gated on a handful of pre-chosen discriminators (irreversibility, blast radius, time-to-act, can-the-system-handle-it-alone), not a rich model the human must read.

**Failure mode:** Wrong discriminator choice bakes in blind spots: physiologic triage misses the patient who looks fine now but has an occult bleed. Any fixed minimal rule has a known class of items it systematically mis-sorts — and because the rule is trusted, those misses are invisible until they crash.

## Make triage a SORTING-only role, firewalled from doing the work. Doctrine is explicit: the triage officer treats nothing beyond the two life-saving actions allowed during sorting (open an airway, apply direct pressure/tourniquet) and otherwise must keep moving. Stopping to fully treat the first critical casualty is taught as the classic, named error.

**Term of art:** Triage officer; 'treat nothing, tag everything'; the 'first sick patient' trap

The person who decides what rises is structurally prevented from getting captured by any single item, because the scarce resource (their attention/judgment) must keep sweeping the whole field. Separating 'who sorts' from 'who treats' keeps the sort fast and unbiased. Interface analogue: the triage layer that decides what reaches the human must not also be where the human does deep work on one item — getting pulled into one ticket is exactly how the rest of the field goes un-sorted and someone in YELLOW dies.

**Failure mode:** Triage-officer capture: the sorter dives into one case, the queue stops being assessed, and casualties deteriorate un-noticed. The failure is silent because the one case being worked looks like productivity.

## Priority is relative to a declared operating MODE, and the mode changes the rule. The same casualty gets opposite dispositions depending on whether you've declared a Mass Casualty Incident. In MCI mode an 'expectant/black' category activates: the salvageable-but-resource-hungry patient who would be all-out RED on a normal day is now left, to save many others. Declaring the mode is a discrete, announced act that re-writes the sorting thresholds for everyone.

**Term of art:** Mass Casualty Incident (MCI) declaration; Expectant category; reverse triage (sickest LAST when sickest are unsalvageable / when you must return workers to duty)

Triage encodes that capacity is finite and shifting, so it carries multiple rule-sets and a switch between them (routine vs. MCI vs. 'reverse triage'). The switch is explicit and shared so everyone sorts by the same thresholds simultaneously. Interface analogue: the attention rule should have declared modes (normal / incident / overload) that the human can flip, and flipping it should visibly re-rank everything at once — not silently degrade.

**Failure mode:** Running routine thresholds during an overload (failure to declare) keeps the system trying to maximally treat the first few while the many go un-sorted — collapse. Conversely, staying in MCI mode after the surge passes leaves people wrongly written off as expectant.

## Everything is re-triaged on a clock; the first sort is explicitly provisional and decays. Tags carry time; protocols mandate continual re-assessment because a casualty's bin can change in minutes. Manchester effectively binds each category to a maximum time-to-be-seen (e.g. Red immediate, Orange ~10 min, Yellow ~60 min, Green ~120 min, Blue ~240 min) — the clock is part of the category.

**Term of art:** Re-triage / serial triage; time-to-treatment targets; the 'target time' per category

Triage assumes its own assessments rot: the danger isn't the item that looked bad, it's the one binned 'minor' that silently became critical. So a revisit interval is attached to every bin and the sweep repeats. Interface analogue: each attention-tier should carry a re-look SLA, and items must be re-sorted automatically as state changes — 'I already triaged that' is itself a failure mode.

**Failure mode:** Set-and-forget: a patient triaged once and parked deteriorates between sweeps. Documented ED deaths trace to GREEN/YELLOW patients who were never re-evaluated. Decay of the sort is the field's quiet killer.

## Self-clearing the low-priority en masse with a single broadcast command, to instantly shrink the field. START's first move at scene is to shout 'everyone who can walk, get up and move to [that area]' — one command self-sorts all GREENs out of the assessment population before any individual is touched. The walking-wounded triage themselves by responding.

**Term of art:** 'Walking wounded'; global sorting command; ambulatory self-triage

Instead of assessing N items one by one, a broadcast filter offloads the sort to the items themselves: ability to respond to the command IS the discriminator that clears the majority, leaving the decision-maker's scarce attention for the minority who couldn't respond. Interface analogue: a single broadcast/self-service action that lets the many low-stakes items resolve themselves and remove themselves from the human's queue, so attention concentrates on what couldn't self-clear.

**Failure mode:** The quiet ones get missed: a critically injured patient who is silent/unconscious doesn't respond to the broadcast and a not-yet-critical person who CAN walk may have a serious occult injury — self-sorting filters by ability-to-respond, not by true severity.

## State must be PHYSICAL, on the item, legible at a glance to any newcomer. The casualty wears a colored triage tag / ribbon at the scene; the bin lives on the body, in space, not in someone's head or a central list. Field layout reinforces it: RED, YELLOW, GREEN collection areas are physically separate zones so the whole scene's state is readable by walking through it.

**Term of art:** Triage tag (e.g. METTAG, SMART tag); casualty collection points / treatment areas by color

Putting the disposition on the object (and arranging objects by disposition in space) makes the entire field's triage state shared, durable, and instantly inheritable — a relief decision-maker reads the field, not a report. Interface analogue: an item's attention-state should travel WITH the item and be glanceable, and the workspace should be laid out so the human can read the whole situation's posture spatially rather than reconstructing it from a feed.

**Failure mode:** Tag falls off / state lives only centrally: if the disposition isn't physically bound to the item, a handoff loses it and the item gets re-assessed from scratch (wasting the scarce resource) or, worse, treated as un-triaged and dropped.

## Pre-built, branching decision flowcharts that any trained operator runs identically (reproducibility engineered over individual brilliance). Manchester Triage System = ~50 presentation-specific flowcharts; the nurse picks the chart matching the chief complaint, then walks ordered discriminators top-down, stopping at the first that fires, which yields the category. The chart, not the clinician's gestalt, produces the answer.

**Term of art:** Manchester Triage System (MTS) flowcharts; chief-complaint chart selection; 'first discriminator that applies wins'

Encoding the sort as shared algorithms means different humans (and shifts, and sites) produce the same priority for the same item — auditable, teachable, defensible. It deliberately constrains expert intuition to gain consistency and a paper trail. Interface analogue: the rise-to-attention logic should be an inspectable shared flowchart, so the human can see WHY something rose, trust it, and audit/override it — versus an opaque ranking.

**Failure mode:** Rigidity vs. the atypical: the patient whose real problem isn't captured by the chosen chart gets under-triaged; clinicians who 'feel' something is wrong but have no firing discriminator must override — and systems that punish overrides suppress exactly the human judgment that catches the chart's blind spots.

## An explicit override / safety-net for human judgment above the algorithm. Most formal triage systems carry a clinician-override and a hard floor (e.g. ESI level 1 = 'requires immediate life-saving intervention' short-circuits all scoring; 'up-triage on gut feeling' is sanctioned). The algorithm sets the default; a named human can jump an item over the rule and that act is recorded.

**Term of art:** Clinician override; up-triage / down-triage; ESI level-1 immediate; 'gut-feeling' discriminator

The field accepts the algorithm is a fast approximation and deliberately leaves a sanctioned channel for human perception to outrank it — but bounded and logged, so override is a first-class move, not a workaround. Interface analogue: the human must be able to pull something up to top attention (or push it down) against the system's sort, with that override captured as signal that tunes the rule.

**Failure mode:** Two-sided: too-easy override collapses back into everything-is-urgent (override inflation); too-hard override traps the operator inside a wrong sort. And overrides that aren't fed back are lost learning — the rule never improves from the cases it got wrong.

## Triage explicitly allocates a finite resource pool, not just labels danger — it answers 'who gets the next unit of scarce capacity.' Decisions are framed as 'greatest good for the greatest number' with a known number of providers/ambulances/OR slots; the expectant category exists precisely because spending the scarce resource on the unsalvageable costs many others. Secondary triage (e.g. SORT/TRTS scoring) re-ranks for transport when evac capacity is the bottleneck.

**Term of art:** 'Greatest good for the greatest number'; secondary/evacuation triage; SORT (Sort, Assess, Lifesaving interventions, Treatment/Transport); utilitarian allocation

Priority is computed against current capacity, so the sort changes as resources change — it's an allocation engine, not a severity meter. Interface analogue: what rises should be a function of the human's CURRENT remaining capacity/attention budget, not absolute importance; as the human's bandwidth shrinks, the bar to rise must rise with it.

**Failure mode:** Severity-without-capacity: ranking purely by how-bad-it-is, ignoring what capacity remains, produces a queue that can't be served and demoralizes/overwhelms the decision-maker. Ignoring the bottleneck (treating when the real constraint is transport) optimizes the wrong stage.

## What this field knows
Triage's deepest knowledge is that under overwhelming inflow you cannot assess everything well, so you deliberately assess everything BADLY but FAST against a tiny set of physiologic discriminators, then bind each resulting category to a specific action and a specific revisit interval. The category IS the order to act — there is no separate "now decide what to do" step. Crucially, triage is explicitly a sorting function, not a treatment function: the triage officer's job is to MOVE people into bins and keep moving, never to stop and fix the first sick person they find (the field's cardinal sin). The whole grammar is built so a single overwhelmed decision-maker can run it from memory, in seconds per item, with no instruments, and so that handoff between people produces the same answer (reproducibility over accuracy). Triage knows that priority is not a property of an item but a RELATION between items and current capacity: the same casualty is "treat now" on a normal day and "expectant/leave" in a mass-casualty event — so the sorting rule itself changes when the system declares a different operating mode. It also knows that the first sort is provisional and DECAYS: everything must be re-triaged on a clock because a "minor" bin-assignment silently becoming critical is the thing that kills. And it knows triage must be VISIBLE and PHYSICAL — a tag on the body, a colored tape, a position in space — so the state of the whole field is legible at a glance to anyone who walks up, including the next decision-maker.
