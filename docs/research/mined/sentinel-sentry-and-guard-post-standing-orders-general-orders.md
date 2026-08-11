# Sentinel / sentry and guard-post standing orders (general orders)
> Mined via open-learning re-run (Sonnet).

## General Orders
**Term of art:** General Orders (U.S. Army/Marine Corps — the eleven General Orders for sentinels)
The eleven General Orders are a fixed, numbered set of standing instructions that every sentinel memorizes verbatim and can recite on demand. They define the sentinel's jurisdiction ("my post and all government property in view"), authority to act without further command (take charge, challenge, sound the alarm, call the corporal of the guard), and the precise conditions under which they may leave their post. The orders are not situational guidance — they are algorithmic decision rules pre-loaded into the human so that the perimeter can operate during the gap between observation and the arrival of a higher authority. A sentinel does not deliberate; they execute the order matching the condition they have identified.
**Failure mode:** Order rigidity — a sentinel who encounters a situation not covered by the general orders may freeze or default to the nearest rule in a way that creates a gap; the system assumes the orders are complete, so novel threats fall through.

## Challenge and Parole (Password)
**Term of art:** Challenge-and-parole / countersign
When a sentinel detects movement, they issue a formal verbal challenge ("Halt — who goes there?"). The approaching party must respond with the parole (the night's secret word); the sentinel replies with the countersign. The exchange is a two-step cryptographic handshake performed in the dark, at a distance, where visual identification is impossible. The parole is issued at the start of each watch cycle and distributed only to those with a need to traverse the perimeter. The sentinel is the perceptual system's final gate: they hold the human judgment layer that the password protocol cannot cover (a captured password, a hesitant delivery, a wrong direction of approach).
**Failure mode:** Password compromise or relay — if the parole leaks, the cryptographic guarantee collapses and the sentinel must fall back on behavioral cues alone; overreliance on a correct password suppresses the sentinel's judgment about anomalous context.

## Relief and Turnover Brief
**Term of art:** Relief of the guard / post turnover
Sentinels are relieved on a defined cycle (historically two hours on, four off, to preserve alertness). The outgoing sentinel does not simply leave — they brief the incoming sentinel on everything observed during the watch: unusual activity, who passed and when, whether any challenge was issued, the current status of all items on post. The incoming sentinel physically walks the post with the outgoing before assuming it. This ritual converts tacit perceptual memory (what the human saw) into explicit handoff knowledge so continuity of awareness survives the personnel rotation.
**Failure mode:** Thin turnover — when the outgoing sentinel is fatigued or the handoff is rushed, the incoming sentinel inherits the perimeter but not the ambient context; they are blind to patterns that accumulated across the watch, and the first minutes of a new watch are historically the highest-risk window.

## Post Orders (Special Orders)
**Term of art:** Special Orders / Post Orders
Where General Orders are universal, Post Orders are location-specific written instructions issued for a particular guard post. They specify: what to inspect and how often, who has authorized access at which hours, what constitutes a reportable event versus a loggable event versus an alarm, and what specific action to take for each category. Post Orders transform a generic sentinel into a calibrated sensor for that specific environment. They are reviewed and signed by the sentinel at the start of each watch, creating accountability for knowledge of the local context.
**Failure mode:** Staleness — Post Orders are written at a point in time; if the operational environment changes (new equipment, changed access roster, new threat) and the orders are not updated, the sentinel operates with a stale model and may let through or escalate the wrong things.

## Corporal of the Guard / Chain of Escalation
**Term of art:** Corporal of the Guard (COGG) / Officer of the Guard
The sentinel is explicitly not the decision-maker for anything beyond their defined authorities. They are required to "call the corporal of the guard" for a defined list of conditions: a prisoner escaping, an alarm condition, a disturbance, any situation the general orders do not resolve. The corporal is the first human escalation node; above them is the officer of the guard. The chain means the sentinel's role is detection and initial containment, not resolution — they hold a situation until judgment arrives. This cleanly separates perception (sentinel) from decision (officer chain).
**Failure mode:** Escalation hesitation — sentinels undertrained in what rises to the corporal may either over-escalate (crying wolf, degrading the signal quality of the chain) or under-escalate (handling situations beyond their authority alone, creating gaps in the record and accountability structure).

## Rounds and Inspection (Officer's Check)
**Term of art:** Officer of the Day rounds / Sergeant of the Guard inspection
At irregular but frequent intervals, a superior makes unannounced rounds to each post. The sentinel challenges the inspector using the same challenge-and-parole protocol they use for any unknown — rank does not exempt. The inspector verifies the sentinel is awake and at their post, queries them on the general orders, checks that the post log is current, and confirms the physical state of protected assets. The irregularity is the mechanism: predictable rounds can be timed and avoided; random rounds maintain behavioral compliance across the full watch cycle.
**Failure mode:** Inspection theater — if inspections become predictable in practice (even if irregular in policy), sentinels learn the rhythm and compliance degrades between checks; the system measures sentinel behavior at inspection moments, not the full distribution.

## Guard Mount and Orders Brief
**Term of art:** Guard mount / Mounting the guard
Before each watch cycle begins, all sentinels for that cycle assemble for a formal inspection and orders brief. The officer or sergeant reviews the general orders, issues the parole and countersign for the coming period, communicates any special intelligence or changed conditions, and physically inspects personnel for readiness (uniform, weapon, alertness). Guard mount is the synchronization ritual: it resets shared situational awareness across the entire sentinel force before they disperse to their individual posts where they will have no further group communication.
**Failure mode:** Information decay — guard mount is a point-in-time sync; any intelligence that arrives after mounting but before the next guard mount must be relayed to individual posts through the corporal chain, and this relay is lossy; sentinels at remote posts may act on the pre-mount picture hours into a changed situation.

## Post Log (Blotter Entry)
**Term of art:** Post log / Blotter / Desk blotter (law enforcement derivative)
Every significant event observed during a watch is recorded in sequence in the post log: time, description, action taken, disposition. The log is not a summary — it is a contemporaneous record, written at the moment of observation or action. The log creates an audit trail that survives the rotation of personnel, allows patterns across watches to be reconstructed by supervisors, and provides legal accountability for use of authority. Entries are brief and factual, not interpretive.
**Failure mode:** Log discipline drift — under low-event conditions, sentinels stop writing entries for "minor" observations, and the log becomes a record of only the things the sentinel already judged significant; supervisors reviewing the log inherit the sentinel's classification of what mattered, losing the raw signal.

## What this field knows
The sentinel tradition understands that a single human cannot sustain reliable perception across time — attention degrades, context is lost at shift boundaries, and novel situations will always exceed standing instructions. Its solution is not to improve the human but to build the interface: pre-loaded decision rules (general orders), a cryptographic challenge protocol for the perimeter edge, a mandatory escalation chain that separates detection from resolution, structured handoffs that convert tacit perception into explicit knowledge, and a contemporaneous log that outlasts any individual watch. The field's deepest insight is that the sentinel's value is not their raw perceptual capacity but their position as the final human gate — and that gate must be maintained not by vigilance alone but by ritual, rhythm, and layered redundancy that compensates for the human's finite attention.
