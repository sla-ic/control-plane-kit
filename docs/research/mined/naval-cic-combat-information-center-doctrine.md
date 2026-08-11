# Naval CIC / Combat Information Center doctrine

> Mined 19909 tok · salvaged from killed run wf_bcf74bab-7ae (Scout→Mine).

## Track-before-attention: nothing reaches the commander as a raw signal. Every radar/sonar/ESM return is first promoted by the watch team into a numbered TRACK — a persistent object with a track number, a kinematic solution (course/speed/altitude), an identity (friend/hostile/neutral/unknown), and a threat evaluation — before it is allowed to compete for command attention. The commander reasons over evaluated entities, never over the sensor feed.

**Term of art:** Track / Track Number (TN); detection-to-track promotion; 'firm track'; Tactical Information Coordinator (TIC)

Raw contacts are detected by sensors and held by operators/consoles. A contact only becomes a 'track' once a human or the system has correlated returns over time, assigned it a Track Number (a stable handle everyone references by), and attached identity + kinematics. The Tactical Information Coordinator / track supervisors groom this set continuously. The commander's display shows tracks, symbols, and threat rankings — an already-interpreted world — so attention is spent on 'what is this and does it matter,' not on 'is there something there.'

**Failure mode:** A mislabel attached at promotion (e.g., a civilian airliner tracked as a descending military attacker — Vincennes, Iran Air 655, 1988) propagates downstream as fact; everyone after inherits the bad identity because the track, not the raw return, is what circulates. The abstraction that protects attention also launders errors into apparent certainty.

## The single shared geo-spatial PLOT as the common object both human and system touch. Historically the literal vertical plexiglass status board / dead-reckoning tracer plotted by sailors with grease pencils (writing backwards from behind the glass); today the NTDS-descended Common Tactical Picture / Common Operational Picture on consoles. It is ONE object, not a feed each person reads privately — designating, hooking, or annotating a track on it is simultaneously a communication, a command input, and a shared belief.

**Term of art:** The Plot; Dead Reckoning Tracer (DRT); vertical plot / status board; Naval Tactical Data System (NTDS); Common Tactical Picture (CTP) / Common Operational Picture (COP); 'hooking' a track; track designation

Every track lives at a position on a common plot that the whole team and the combat system share. An operator 'hooks' (selects) a track to pull up its full data; designating a track and assigning it hands the same object to the weapons/engagement chain. Because the plot is the shared substrate, a human action ON the object IS the loop-closing act — the system reads the designation, acts, and the object's state updates for everyone. Status boards were deliberately spatial and persistent so a glance reconstituted the whole tactical situation.

**Failure mode:** Picture divergence / 'dual tracks': the same real object held under two track numbers, or the human's mental plot drifting from the system's plot, so people act on different versions of reality while believing they share one. Also: a cluttered plot (too many symbols) destroys the at-a-glance property it exists to provide.

## Pre-negotiated authority and weapon-release doctrine: the human's decision is collapsed in advance to a confirm/veto. Rules of Engagement, weapon-release authority, and 'doctrine statements' (pre-programmed conditional logic) are agreed BEFORE contact, so in the compressed seconds of an inbound threat the operator isn't deciding from scratch — the system proposes an action consistent with pre-set doctrine and the human authorizes or vetoes.

**Term of art:** Rules of Engagement (ROE); weapon-release authority; Aegis 'doctrine statements'; engageability / firing doctrine; Auto-Special / Auto / Semi-Auto modes

Commanders set ROE and engagement criteria ahead of time; Aegis lets operators load 'doctrine statements' — conditional rules (if a track meets these identity/kinematic/zone criteria, take this action / recommend this) that the system evaluates automatically. This shifts cognitive work off the critical-time path: the deliberation happened earlier, under low stress; at the moment of threat the human exercises a small, fast authorizing judgment over a system recommendation.

**Failure mode:** Automation bias and over-trust: the pre-authorized recommendation becomes the decision, the human rubber-stamps. Conversely, mis-set doctrine fires or warns on the wrong criteria. The hard part migrates to whether the pre-set rules fit the actual situation — which no one re-examines under load.

## Explicit automation MODES with the human placed at a chosen rung of a control ladder. Aegis defines discrete operating doctrines — manual / semi-automatic / automatic / Auto-Special (casualty mode) — that fix exactly how much the system does on its own and where the human sits in the firing loop. The mode is set deliberately for the expected threat tempo: high-saturation missile raids justify more autonomy; ambiguous low-tempo environments keep the human in tighter control.

**Term of art:** Automation modes; semi-automatic vs. automatic; Auto-Special (anti-air-warfare casualty mode); 'human-in-the-loop' vs. 'human-on-the-loop'; doctrine 'lights' showing active mode

Each mode is a contract about who acts: in semi-auto the system detects/tracks/recommends but a human must authorize engagement; in full-auto/Auto-Special the system can engage qualifying threats within set parameters without per-shot human action, for when raid density exceeds human reaction time. The mode is a single, legible setting that defines the human-machine division of labor for the whole engagement, rather than negotiating it contact-by-contact.

**Failure mode:** Mode confusion: the team misremembers which rung is active and is surprised by what the system does (or doesn't do) autonomously — a classic automation-surprise. Choosing high autonomy to survive tempo simultaneously removes the human check exactly when errors are most consequential.

## The watch-team organization IS the attention filter. The CIC is a designed division of labor among specialist watchstanders (sector/identification/track supervisors, coordinators like the TAO and the warfare coordinators) who each own a slice of the picture and escalate only what crosses their threshold to the Tactical Action Officer, who holds the commander's pre-delegated authority to act. Curation is distributed across trained humans before anything reaches the top.

**Term of art:** Tactical Action Officer (TAO); watch team / GQ stations; warfare coordinators (AAWC, ASWC, SUWC); Tactical Information Coordinator; delegated/pre-delegated authority; battle rhythm; 'reporting by exception'

Sensing is parsed by domain (air/surface/subsurface/EW), each with operators who groom their own tracks and resolve identity locally. Warfare-area coordinators integrate their domain and pass only decision-relevant items up. The TAO sits at the apex of the watch team with delegated weapon-release authority, acting in the commander's stead so the commander/CO is reserved for the genuinely novel or strategic call. Escalation thresholds are doctrinal, not ad hoc — the org chart is the prioritization algorithm.

**Failure mode:** Curation collapse under saturation: when contact density or comms traffic exceeds the team's capacity, the filtering layer breaks down, everything escalates at once, and the commander is flooded with the very raw flood the structure existed to prevent. Also: a coordinator's local threshold suppresses something that mattered globally (information siloed by sector).

## Standardized, compressed reporting protocol so signals arrive in a fixed, parseable shape. CIC voice and data reporting is rigidly formatted — Bearing-Range, contact reports, the NATO/USN 'track' lexicon, brevity codes, and standardized symbology (MIL-STD-2525 / NTDS symbols: geometric shapes for affiliation, fill/modifiers for type) — so a report's form is predictable and a symbol's meaning is unambiguous at a glance and under stress.

**Term of art:** Brevity codes; contact report format (bearing/range); MIL-STD-2525 / NTDS symbology; affiliation-by-shape; 'tracks' lexicon (skunk/bogey/bandit historically); Link 11/16/22 tactical data links

Reports follow set templates ('new contact, bearing 270, range 15 miles, closing') and brevity words compress complex meaning into single tokens. Symbology encodes affiliation by SHAPE (e.g., friendly vs. hostile geometry) and identity/type by internal modifiers, so the eye decodes friend/foe/unknown pre-cognitively. The fixed grammar means low bandwidth carries high, reliable meaning when seconds count.

**Failure mode:** Brevity/format failure under stress: a malformed or ambiguous report, or symbology overload, breaks the parseability the protocol guarantees; and a shared symbol that's subtly wrong (affiliation misset) is trusted precisely because the grammar makes it look authoritative.

## Tactical data links broadcast the fused picture so every node shares ONE picture without re-sensing. Link 11/16/22 distribute tracks across ships and aircraft; one platform's sensor contribution becomes a track everyone in the net holds, with deconfliction rules so the same object isn't multiply counted. The 'system that perceives more' is itself a distributed fusion of many sensors presented as a single coherent world.

**Term of art:** Tactical Data Links (Link 11 / Link 16 / Link 22); data-link track / remote track; Force Track Coordinator; track-number management / deconfliction; 'gridlock' (registration of multiple units' pictures to a common reference)

Each unit contributes contacts to a netted track database; protocols assign track responsibility and reconcile duplicates so the force operates from a common, fused tactical picture rather than each ship's private radar view. This is fusion made shareable — the interface to the human is the same agreed picture regardless of which sensor saw what, decoupling 'who perceived it' from 'what we collectively believe is out there.'

**Failure mode:** Gridlock/registration error and dual-tracking: if platforms' coordinate references aren't aligned, the same object appears at offset positions as separate tracks, fracturing the 'single picture'; latency or dropouts make nodes act on stale shared beliefs.

## Threat evaluation and weapon assignment (TEWA): the system doesn't just show contacts, it RANKS them by danger and proposes responses, turning perception into a prioritized action queue. Tracks are continuously scored for threat (closing geometry, classification, weapons envelope, time-to-intercept) and the most dangerous are surfaced first with a recommended response — the human is handed a triaged list, not a flat field of equals.

**Term of art:** Threat Evaluation and Weapon Assignment (TEWA); threat prioritization / ranking; weapon-target pairing; engageability; time-critical targeting; 'leakers' (threats that get through)

Automated and operator-assisted logic assesses each track's threat (is it inbound, is it within/approaching weapons range, what is it, how long until it can hurt us) and produces an ordered threat priority plus weapon-pairing recommendations. The display elevates the top threats; the engagement chain is offered a pre-computed 'what to shoot with what' so the human's scarce attention lands on the few that matter in the order they matter.

**Failure mode:** Mis-ranking and tunnel vision: a wrongly scored track (over- or under-threat) reorders attention against reality; operators fixate on the system's top-ranked item and miss the unranked 'leaker.' Ranking by a fixed model fails on the novel threat the model wasn't built to score.

## Designed sensory/ambient signaling and the deliberately darkened, instrumented room. The CIC is darkened and arranged so glowing displays dominate perception; distinct alarm tones, the 1MC/announcing circuits, and 'General Quarters' states modulate the whole team's arousal and attention as one. The environment itself is an interface that shifts everyone's attention regime in lockstep.

**Term of art:** Darkened ship / red-lighting heritage; General Quarters / Condition I; 1MC and internal comms circuits; brevity alert calls ('Vampire,' 'Birds away'); audible threat warning tones

Low ambient light maximizes display contrast and keeps eyes on the curated picture; standardized audible alarms and verbal callouts ('Vampire! Vampire!' for an inbound anti-ship missile) instantly redirect collective attention with a single token; readiness conditions (Condition I/General Quarters) reconfigure who is manning what. Attention is steered at the level of the room and the crew, not just the individual screen.

**Failure mode:** Alarm saturation / alert fatigue: too many simultaneous tones and callouts overwhelm rather than direct attention (a documented contributor in high-stress CIC incidents); and a darkened, screen-dominated room can induce over-immersion in the displayed picture at the expense of doubt about whether the picture is right.

## Scenario/'what-if' tracking and intention assessment, not just current position. The watch team and system don't only hold where a contact IS; they project where it's GOING and infer intent — assigning behavioral expectations to a track and watching for violations (a contact that should be following an air corridor but isn't). The human is alerted to deviations from expected behavior, a higher-order signal than raw motion.

**Term of art:** Intention/intent assessment; trajectory extrapolation; warning and engagement zones (e.g., 'crossing the line'); IFF (Identification Friend or Foe) interrogation; air corridors / ATO deconfliction

Tracks carry expected behavior (commercial air route, known patrol pattern); the system/operators extrapolate trajectories and flag when a track departs its expected envelope or enters a warning/engagement zone. This converts continuous kinematics into discrete, meaning-laden events ('this track just turned toward us / left its corridor'), which is what actually merits attention.

**Failure mode:** Scenario fulfillment: under stress the team interprets ambiguous behavior to fit a feared expected scenario, seeing the deviation they dread rather than the one occurring (cited in the Vincennes/Iran Air 655 analysis — a climbing airliner perceived as a descending attacker). Expectation-based alerting becomes expectation-driven misperception.

## What this field knows
The CIC is the original engineered answer to "a system perceives more than any human can, yet one human must decide and act through it." Its deepest, transferable insight is that attention is not managed at the display — it is managed by ORGANIZATION. The CIC interposes a layer of human-and-machine processing (the "fusion" watch team) between raw sensing and the commander, whose entire job is to convert a flood of contacts into a single curated, decision-shaped picture and a small set of pre-authorized actions. Three structural commitments make this work: (1) Track-before-attention — nothing reaches the commander as a raw signal; everything is first turned into a TRACK (a persistent, identified, evaluated object with a number, a classification, and a threat assessment) so the human reasons over evaluated entities, not noise. (2) The picture is a shared, single, geo-spatial OBJECT (the plot / common tactical picture) that human and system both touch and annotate, not a feed each reads separately — so "closing a loop" means manipulating the same object (designating a track, assigning a weapon) and the system executes and reflects it back. (3) Authority is pre-negotiated, not improvised under load — doctrine, ROE, weapon-release conditions and automation "modes" (semi-/full-auto) are agreed BEFORE the engagement, so in the compressed seconds of a threat the human's decision shrinks to a single confirm/veto on a system-proposed action. The field also knows, viscerally and from blood (Vincennes 1988, Stark 1987, friendly-fire shootdowns), the precise FAILURE MODES of this arrangement: automation bias, "scenario fulfillment" under stress, track mislabeling that propagates, alarm/comms saturation, mode confusion about what the system is doing autonomously, and the collapse of the curation layer when tempo exceeds the watch team's capacity. The unique knowledge for an interface designer: the scarce human's attention is protected by an upstream team+doctrine that pre-evaluates, pre-prioritizes, and pre-authorizes — and the gravest dangers live in that very abstraction layer.
