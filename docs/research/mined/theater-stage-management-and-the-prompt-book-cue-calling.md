# Theater stage management and the prompt book / cue calling

> Mined 19882 tok · salvaged from killed run wf_bcf74bab-7ae (Scout→Mine).

## Calling 'cues' from the prompt book: the SM speaks only the cue label and the trigger word ('LX 47... GO'), never a description of what should happen. The operator already knows what LX 47 does — that was loaded in advance. The live signal carries only timing, not content.

**Term of art:** Calling the show / calling cues / 'on the book'

The information payload is split across time. WHAT happens (the cue content) is pre-loaded into the operator and the board during tech rehearsal; the live transmission carries ONLY the timing bit ('now'). This compresses the live channel to its irreducible minimum — a single bit per cue — which is why it can be fast, unambiguous, and fired under pressure. The interface lesson: do not re-explain at the moment of action; pre-load the meaning, transmit only the trigger.

**Failure mode:** If an SM ad-libs an instruction in the moment ('LX 47, bring up the blue a bit') the operator must now interpret in real time, latency and error spike, and the cue lands wrong. Over-describing at go-time is the classic novice error.

## The Standby/Warning then GO two-beat. Before any cue, the SM says 'Standby LX 47, Sound 12' several seconds out; the operators each answer 'LX standing by,' 'Sound standing by.' Only after readiness is confirmed does the SM later say 'GO.'

**Term of art:** Standby (or 'Warning') and 'Go' / the standby–go sequence

Surfacing is deliberately two-staged: an ARMING signal that raises attention and demands an explicit readiness acknowledgment, then a separate COMMIT signal. The standby does three things at once — it pre-focuses the human's scarce attention on exactly the right control, it converts silence into a positive confirmation handshake ('standing by' = I have my hand on it and I'm ready), and it surfaces a problem EARLY (if an operator doesn't answer, the SM knows before the irreversible moment). The commit ('GO') is then a clean, instant act because all the readiness-checking already happened.

**Failure mode:** Collapsing warning and commit into one alert means the human is asked to both notice AND act in the same instant — guaranteeing either missed cues or reflexive wrong action. Also: a standby with no acknowledgment that proceeds anyway (firing into an operator who wasn't ready) causes a botched cue; the handshake is mandatory, not decorative.

## 'GO' is always the LAST word, and 'go' is a forbidden word in all other show chatter — operators are trained that an isolated terminal 'GO' is the only thing their finger may move on.

**Term of art:** 'Go' as the operative/trigger word; reserved-word discipline

The trigger channel is engineered against false positives. By making the commit word positionally final ('LX 47 ——— GO') the operator never acts on a half-heard sentence and never jumps the gun on a clause that merely contains 'go.' The whole headset vocabulary is disciplined so the trigger token is unambiguous and reserved: you say 'proceed' or 'fire' in conversation, never 'go.' This is a protocol-level guarantee that the act-now signal cannot be accidentally synthesized from ordinary traffic.

**Failure mode:** Sloppy comms where someone says 'do you want to go to the next look?' over an open channel can fire a cue if the reserved-word discipline isn't kept. The known failure is a 'phantom GO' — the reason the word is sacred and terminal.

## Cues are pegged to observable in-world events, not to wall-clock time. The prompt book marks each GO against a specific spoken line, a precise word within that line, a footfall, a door close, or a visual 'point' the SM watches for.

**Term of art:** Calling on the line / visual cue / 'taking the cue off' an action

The system fires relative to the actual unfolding reality, which the human is reading live, rather than to a schedule. A live performance breathes — lines run long, an actor pauses, the audience laughs — and time-based firing would drift catastrophically. By anchoring the trigger to a perceivable event, the cue stays correct no matter how the timeline stretches. The SM's live job is precisely to perceive the real state of the world and map it onto the pre-authored trigger points. This is event-driven, not time-driven, coordination — with a human as the event detector for the ambiguous cases a machine can't reliably catch (irony, a fluffed line, an unscripted beat).

**Failure mode:** Calling a cue 'on faith' to the script timing when the actor has actually skipped or jumped lines — the cue lands in the wrong reality (lights change on an empty stage). SMs are drilled to call to what is ACTUALLY happening, abandoning the book's expected timing when the live event diverges.

## The prompt book itself: a single master artifact, one line of dialogue per region, with every department's cues notated in the margin against the exact text, plus standbys placed a measured distance upstream of each GO. Built and revised live during tech.

**Term of art:** The prompt book / the book / 'the bible'; calling script

All perceived streams from all departments are collapsed into ONE spatially-organized surface, indexed by the one timeline everyone shares (the script). Crucially the standby notations are physically placed ABOVE/before the GO at a hand-tuned lead distance, so the page itself paces the SM's attention — turning the page IS the act of looking ahead. The book is the frozen output of all the hard upstream decisions: it is the interface authored once and then merely executed. It is also the single source of truth that lets a substitute run the identical show.

**Failure mode:** An out-of-date or poorly-noted book (standbys placed too late, cues not updated after a change) produces rushed or missed cues. A book that lives only in one person's head (un-notated 'I just know it') fails the moment that person is out — the craft insists on externalizing it.

## The SM can 'HOLD' or stop the entire show at any instant, and there is a rehearsed protocol for resuming ('we'll pick up from...'). The authority to freeze everything sits with one person.

**Term of art:** Holding the show / 'hold, hold, hold'; abort and restart points

Among many actors who can each only act locally, exactly one node holds a global pause authority and the resync procedure. This makes the human-system pairing safe to run fast: because there is always a clean abort that everyone obeys instantly, the routine cues can be fired with confidence. The hold is the counterpart to GO — a single reserved command that overrides all in-flight action and returns control to deliberation. Resumption is itself pre-planned (known restart points) so recovery is fast and unambiguous.

**Failure mode:** Hesitating to call a hold when something is genuinely wrong (a set piece stuck, a performer down) because the show 'should' continue — letting automated cues keep firing into a broken state. The craft trains decisiveness: when in doubt, hold; ambiguity resolves toward safety.

## Layered, redundant signaling channels with a strict fallback ladder: primary is the headset 'comms' (ring intercom), backup is the cue-light system (a light = standby, light out = GO) for operators who can't have a voice in their ear (e.g. fly crew over noise), and final fallback is hand signals and pre-placed glow tape.

**Term of art:** Cue lights (standby/go lights); comms/cans (ring intercom); glow tape and spike marks

The field assumes its primary channel WILL fail and pre-builds graceful degradation. Cue lights encode the same standby/GO grammar in a non-verbal medium for positions where voice is impossible or unsafe. Glow tape and spike marks push critical state into the physical environment so it's perceivable even with all comms dead. Each fallback preserves the SAME two-beat protocol, so operators don't have to relearn the interaction when the medium changes — only the carrier degrades, not the grammar.

**Failure mode:** A single-channel dependency (everything on one headset ring) means one dead battery or one feedback squeal blinds a department mid-show. Known disasters trace to no rehearsed fallback — crew left guessing in the dark when comms dropped.

## Hard separation of two SM modes: the 'creation/tech' mode where the show is designed, negotiated, and the book is built (slow, deliberative, everyone talks), versus 'performance/calling' mode where it is executed (terse, protocol-only, near-silent except cues).

**Term of art:** Tech / cue-to-cue; 'dry tech' and 'wet tech'; the difference between rehearsal-room and show-mode

The craft explicitly time-separates judgment from execution. During tech ('cue-to-cue' rehearsal) the SM and designers stop, argue, set levels, decide placement, write it down — this is where all the perception is digested into decisions. In performance that deliberation is OVER; the SM only executes the frozen plan plus exception-handling. The interface a human touches at go-time is intentionally dumb and fast because all the intelligence was front-loaded. Mixing the modes (re-deciding during a live show) is the cardinal sin.

**Failure mode:** Trying to make creative/judgment calls during live performance (re-balancing, second-guessing placements) overloads the SM's attention exactly when it must be reserved for timing and exceptions — leading to cascade misses. Conversely, rushing tech to 'figure it out in performance' guarantees a shaky run.

## Cue numbering and 'point' cues that let cues be inserted, split, or killed without renumbering the world: LX 47, then 47.5, then 47.7 squeeze new cues between existing ones; a 'cue zero / pre-set' establishes the known starting state before anything moves.

**Term of art:** Point cues (47.5); cue numbering; pre-set / 'cue zero'; deck/setting state

The naming scheme is built for constant revision under time pressure. Decimal/point cues mean a new trigger can be added mid-tech without disturbing the labels everyone has already memorized — stability of reference survives change of content. The pre-set / blackout-state 'cue zero' guarantees every run starts from an identical, known baseline so the whole sequence is deterministic from a clean origin. This is version control for a live coordination plan.

**Failure mode:** Renumbering cues late in the process so an operator's muscle-memory label now points at the wrong action — a notorious source of error after a 'simple' insert. The point-cue convention exists precisely to avoid touching existing identifiers.

## The 'autofollow' vs. SM-called distinction: trivially tight or mechanically-linked cues are pre-programmed to fire automatically off a prior cue (autofollow / 'q-to-q link'), while cues needing human judgment of the live moment are reserved for the SM to call by voice.

**Term of art:** Autofollow / auto-continue; cue link; 'called' vs. 'programmed' cues

The field draws an explicit line between what the SYSTEM should fire on its own and what must wait for the HUMAN's read of reality. Cues whose timing is deterministic (a 2-second fade that always follows the blackout) are handed to automation so they don't consume the SM's attention at all. Cues whose timing depends on un-modelable live judgment (when the laugh dies, when the actor reaches the mark) stay manual. The SM's scarce attention is thereby spent ONLY where human perception adds something the machine cannot supply.

**Failure mode:** Automating a cue that actually needed human judgment (an autofollow that fires the next look before the actor has gotten into position because they were slow tonight) — the machine fires on schedule into a world that wasn't ready. The craft is careful about which cues are 'safe' to automate.

## Department-prefixed addressing so every standby/GO names WHO it is for: 'LX' (electrics/lighting), 'SQ/Sound', 'Fly', 'Automation', 'Deck', 'Spot 1.' Each operator listens for their prefix and ignores the rest of the traffic.

**Term of art:** Channel/department prefixes; 'on a visual'; spot calling (Spot 1, pick up...)

On one shared channel that everyone hears, the prefix is a routing tag that lets each perceiver filter the firehose down to only their own actionable items. The SM perceives and transmits across all departments, but each recipient's attention is protected by only ever acting on their own label. Simultaneous multi-department cues are handled by listing prefixes in a fixed order ('Standby LX 47, Sound 12, Fly 3') so each operator hears their slot. Addressing is identity-scoped action routing over a broadcast medium.

**Failure mode:** Ambiguous addressing ('standby, go on my mark') with no department prefix leaves multiple operators unsure if it's for them — either all fire or none do. Spotlight ops in particular get layered, sequenced calls; muddled addressing causes the wrong light to pick up the wrong actor.

## The pre-show readiness ritual and 'clearance to start': the SM polls the house ('house manager, do you have clearance?'), confirms every department present and set, confirms actors are in places, and only then calls the top of show. Nothing begins until a full positive go/no-go is collected.

**Term of art:** Clearance / 'half-hour, places' calls; the pre-show checklist; top-of-show go/no-go

Before entering the high-speed execution phase, the SM runs an explicit, authority-bounded go/no-go poll across all human and physical systems — house, cast, crew, set state. It is a structured handshake that converts the diffuse question 'are we ready?' into a sequence of named confirmations the SM is responsible for collecting. The show cannot start until launch authority (often shared with front-of-house for the audience's sake) clears. It bounds when the autonomous-feeling cue sequence is allowed to begin.

**Failure mode:** Starting before clearance (curtain up while a performer is still off-position, or before the house manager has seated latecomers) — an unrecoverable bad start. The poll exists because skipping any one confirmation has bitten shows badly.

## What this field knows
Theater stage management is a centuries-refined craft for the exact problem in question: one human (the stage manager, "on book") sits at the nexus of every department — lighting, sound, fly, automation, deck, wardrobe, actors, orchestra — perceives more streams than any single person could act on, and yet must emit only the ONE precise trigger at the ONE precise instant that causes many people to move in coordination. What this field uniquely knows: (1) Attention is rationed by PRE-COMMITMENT, not in the moment. The hard cognitive work — deciding what matters, in what form, who acts — is done in advance during "tech" and frozen into an artifact (the prompt book / cue script), so that live operation is near-zero-deliberation execution. The interface is authored before it is run. (2) Surfacing is SEPARATED into a two-beat structure: "Standby" (pre-arm attention, get the operator's hand on the control, acknowledge readiness) then "Go" (the irreversible trigger). The warning and the commit are never collapsed into one signal — this is the field's deepest move and the antithesis of a dashboard alert. (3) The trigger word's POSITION is sacred: "GO" comes LAST so that the operator's finger never moves on a half-heard instruction; the channel is engineered against ambiguity and false-positive firing. (4) Cues are bound to OBSERVABLE EVENTS in the live world (a line, a footfall, a visual "point"), not to clock time — the human reads the actual unfolding reality and the system fires relative to it, absorbing the natural variance of a live performance. (5) The SM holds a contract for WHO decides: routine cues are called automatically, but the SM can "hold" the entire show, and there is a strict, rehearsed protocol for what authority transfers to whom in an emergency. (6) Everything is built to survive degradation: redundant comms, hand signals when headsets die, glow-tape and cue-lights when voice fails, a deputy who can take the book. The craft assumes the channel will fail and designs the fallback in advance. This is a body of practice about turning overwhelming perception into a single, unambiguous, jointly-executed, reversible-where-possible act — authored once, called live.
