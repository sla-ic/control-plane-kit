# Emergency dispatch (911 / EMD protocols)

> Mined 20788 tok · salvaged from killed run wf_bcf74bab-7ae (Scout→Mine).

## The Case Entry / 'shunt' question — four answers triage AND dispatch at once

**Term of art:** Case Entry; Chief Complaint Protocol; the 'shunt'; determinant code (Alpha/Bravo/Charlie/Delta/Echo/Omega)

Every EMD call opens with a fixed Case Entry sequence (address, callback, then 'Tell me exactly what happened?' / 'Is the patient conscious? Is the patient breathing?'). These four questions are deliberately ordered so that the FIRST signals — chief complaint, consciousness, breathing — instantly 'shunt' the call onto one of ~33 Chief Complaint Protocols and produce a provisional dispatch determinant (e.g. 9-E-1 cardiac arrest) BEFORE any detail is gathered. The system, not the human, holds the full branching tree; the human just reads the next prompt. Triage and resource-assignment are fused: an ambulance is rolling on the determinant while Key Questions are still being asked.

**Failure mode:** Premature shunt / wrong chief complaint lock-in — caller says 'he fell' so the calltaker enters Falls (Protocol 17) when the real event was a cardiac arrest that caused the fall (Protocol 9). The determinant path then never surfaces the right Key Questions. Codified countermeasure: 're-shunt' rules allow jumping protocols mid-call when new info contradicts the entry.

## Determinant levels Alpha→Echo: a perceived severity lattice that maps symptom to response tier

**Term of art:** Determinant value (e.g. 6-D-2); ALS vs BLS; 'hot' (Code 3, lights & siren) vs 'cold' (Code 2/1) response; Echo-level

MPDS encodes acuity as a letter ladder — Omega (lowest, may not need an ambulance), Alpha (basic life support, cold response), Bravo, Charlie, Delta (advanced life support, hot/lights-and-siren), Echo (highest, immediate — e.g. not breathing, drowning). The letter is what 'rises': a supervisor or CAD doesn't see the whole transcript, they see '6-D-2' and instantly know the form of response. The system computes the level from the structured answers; the human confirms. This is a compression of a vast perceptual field into a single token that is simultaneously a priority, a resource recipe, and a mode (hot vs cold).

**Failure mode:** Over-triage and under-triage both kill — under-triage sends a slow/low response to a true emergency; over-triage burns scarce ALS units and creates lights-and-siren crash risk for non-emergencies. Systems are formally audited on their under-triage rate as the dangerous-direction metric, accepting some over-triage as the safer error.

## Pre-Arrival Instructions (PAIs) / DLS — the interface makes the HUMAN ON SCENE the actuator while help travels

**Term of art:** Pre-Arrival Instructions (PAIs); Dispatch Life Support (DLS); 'Telephone CPR' (T-CPR); Post-Dispatch Instructions (PDIs)

Once a life-threat determinant is set, the protocol forks the dispatcher into a SECOND simultaneous loop: scripted, verbatim Pre-Arrival Instructions read to the caller (CPR compressions counted aloud, Heimlich, childbirth, bleeding control, Narcan). This is 'Dispatch Life Support.' The key design move: the dispatcher closes a treatment loop through a remote untrained human (the caller) in parallel with the responder loop. The script is word-for-word and pace-controlled ('push hard and fast, I'll count with you... 1, 2, 3, 4') because under panic the human actuator needs metronomic external drive, not information.

**Failure mode:** Caller non-compliance / the dispatcher 'releasing' the caller too early (saying 'help is on the way, hang up') — a recognized cause of preventable death. Counter-doctrine: STAY ON THE LINE until responders physically take over; T-CPR fraction is now a tracked survival metric and dispatchers are coached that hanging up is breaking the loop.

## ProQA / card-set as the externalized agent — the protocol perceives the option space, the human supplies judgment at named gates

**Term of art:** ProQA; Q-cards / card set; Key Questions; 'protocol compliance' score; Additional / Repetitive Persistence prompts

The dispatcher runs either physical fanned Q-cards or ProQA software. The software enforces sequence, auto-computes the determinant, blocks skipping, and surfaces only the next legal question — an explicit division of labor where the SYSTEM holds the exhaustive decision tree (thousands of branches) and the HUMAN holds rapport, voice, and the authority to invoke a small set of overrides. The interface deliberately narrows the human's visible field to one prompt at a time to prevent overload, while the machine tracks the whole graph.

**Failure mode:** 'Protocol on autopilot' / compliance-vs-cognition trap — strict scripting can deskill the human into a question-reading robot who misses obvious cues outside the script (caller screaming a detail the next scripted question ignores). QA reviews specifically grade whether the calltaker exercised judgment, not just whether they read every line.

## The CAD status lifecycle — a loop that is literally not closed until a status transition confirms it

**Term of art:** CAD; unit status (10-codes / plain-status); 'mark enroute', 'on scene', 'clear'; disposition code; pending queue; timers/'time on task'

Computer-Aided Dispatch represents every unit and call as a state machine with mandatory transitions: Dispatched → Enroute → On Scene (10-23/Arrival) → Transport → At Hospital → Clear/Available. The dispatcher's screen 'rises' the units that are OVERDUE in a state (e.g. dispatched but never went enroute). The loop-closing discipline is structural: a call cannot be cleared until a disposition is entered, and a unit cannot be 'available' until it confirms clear. Status is the shared truth between human and system, and stale status is itself an alert.

**Failure mode:** Lost/forgotten unit & the stale-status gap — a crew arrives but forgets to mark on-scene, so CAD shows them still enroute and the dispatcher mis-reasons about coverage. Mitigation: automatic status timers that flash and force a verbal status check ('Engine 7, status check') if a unit sits too long in one state.

## Radio discipline as bandwidth protection — terse, structured, acknowledged, never-overlapping speech

**Term of art:** Radio discipline; 'priority/emergency traffic'; 'KMA / copy'; readback; talkgroup; 'stepping on' / doubling; the emergency button (orange button) that seizes the channel

The voice channel is treated as a scarce, collision-prone resource. Rules: brevity codes, the unit identifies first ('Medic 12, go ahead'), readback/confirmation of critical info, 'priority traffic' and 'emergency traffic' phrases that pre-empt routine chatter, and a hard taboo on stepping on a transmission. The dispatcher arbitrates WHO gets the channel and WHAT rises to air — a live human bandwidth allocator. Critical messages get a forced acknowledgment ('copy direct'); silence is not assumed to be receipt.

**Failure mode:** 'Stepping on' / doubling — two transmissions collide and both are lost, often the exact moment a unit calls a mayday. Also the unanswered-officer 'silent gap.' Countermeasures: officer-down/emergency-activation button that hard-seizes the talkgroup and ID's the unit, and mandated 30-second/periodic status checks on units at risk.

## Reflex / pre-plans & MUTual-aid run cards — the system pre-computes the response so the human doesn't decide under load

**Term of art:** Run card / running assignment; response plan; pre-incident plan ('pre-plan'); recommended units; move-up/cover assignments; box alarm

For a given address + call type, CAD auto-recommends the exact apparatus complement via a 'run card' / response plan built in advance (e.g. 'structure fire at a high-rise = 3 engines, 2 trucks, 1 BC'). Pre-fire plans attach building hazards, hydrant locations, knox-box, hazmat to the address record so they RISE automatically when that address is dispatched. The human's scarce judgment is reserved for deviation; the routine assignment is precomputed and just presented for confirmation.

**Failure mode:** Stale or wrong pre-plan / 'the map is not the territory' — auto-recommendation sends the nearest-on-paper unit that is actually committed elsewhere, or a pre-plan reflects a building that's been renovated. Dispatchers are trained to treat the recommendation as a default to verify against live AVL, not gospel.

## AVL / closest-unit recommendation — the machine perceives geography the human can't hold

**Term of art:** AVL/AVLS; closest-unit dispatch; drive-time/response polygons; MDT/MDC (mobile data terminal); SSM (System Status Management) posting

Automatic Vehicle Location feeds real-time GPS of every unit into CAD, which computes and recommends the CLOSEST AVAILABLE appropriate unit (not the closest in the static beat). The system perceives the live spatial field — traffic, current positions, drive-time polygons — far beyond what a dispatcher could track mentally, and surfaces a ranked unit list. The human retains veto (local knowledge: 'that bridge is out,' 'that medic just had a bad call').

**Failure mode:** Over-reliance on automated nearest-unit causing 'churn' — constantly re-posting units to chase coverage exhausts crews and can send a unit that's closest-by-GPS but blocked by a river/highway with no near crossing. SSM-driven 'dynamic deployment' is critiqued for treating humans as chess pieces and ignoring fatigue.

## ANI/ALI, RapidSOS & enhanced location — perceived data is auto-surfaced and cross-checked against the caller

**Term of art:** ANI/ALI; Phase I / Phase II wireless; Next-Generation 911 (NG911); RapidSOS; ACN (Automatic Crash Notification); 'verify the location'

Enhanced 911 auto-populates the caller's number (ANI) and location (ALI) onto the screen before the calltaker speaks; modern Next-Gen 911 / RapidSOS pulls device-GPS, crash telematics, and sensor data. The design principle: machine-perceived identity/location RISES automatically and is then VERBALLY VERIFIED against the human ('I show you at 123 Main, is that correct?') — never trusted blindly because the auto-data can be the billing address, a wireless tower, or wrong.

**Failure mode:** Mislocation / 'phantom address' — wireless calls bounce off a distant tower or default to the carrier's centroid, sending units miles away; the infamous failure mode behind many wrong-address deaths. Doctrine: always confirm location by voice first and early, because the displayed location is a hint, not a fact.

## ECHO / 'hot' broadcast & the all-call — escalation that breaks normal triage to seize every channel at once

**Term of art:** Tone-out / station alerting; all-call; 'emergency traffic — all units hold'; MCI declaration & START triage; alert tones (Hi-Lo); 'signal 100' / clear-the-air

For the rarest top-acuity events (working structure fire, officer down, active shooter, MCI), the interface has an explicit escape hatch from one-to-one dispatch: a tone-out / all-call / general broadcast that pushes one alert to ALL units and stations simultaneously, plus alert tones that pre-empt and grab attention before voice. This is the field's answer to 'when does something bypass the queue entirely' — a named, audible, hardware-backed interrupt reserved for defined trigger conditions.

**Failure mode:** Alert fatigue & crying-wolf — if interrupts are overused they stop interrupting; and a poorly-declared MCI floods the scene with self-dispatching units ('freelancing') that overwhelm command. Counter: strict trigger criteria for the all-call and ICS/span-of-control rules so escalation produces structured response, not a mob.

## The structured verbal handoff — closing the loop is a confirmed transfer, not a broadcast into the void

**Term of art:** Call transfer / 'pass the call'; warm handoff; SBAR/MIST report (Mechanism, Injuries, Signs, Treatment); 'do you copy / confirm'; transfer of patient care

When a call is passed (calltaker→radio dispatcher, agency→agency, EMS→ER), the field uses a structured, acknowledged handoff: a compact packet (location, chief complaint, determinant, hazards, patient status) delivered in a fixed order and READ BACK or explicitly accepted. The loop is defined as open until the receiver confirms custody. This mirrors aviation's positive transfer of control — 'you have the call' / 'I have the call' — so responsibility is never ambiguously in the air.

**Failure mode:** Dropped handoff / diffusion of responsibility — calltaker assumes radio took it, radio assumes calltaker is still on it, and the call falls between two consoles. Multi-agency transfers (call lands in wrong PSAP) add a conference-and-confirm step precisely because silent transfers get lost.

## Recorded lines + QA case review — the rules for what-rises are rewritten from the worst recorded calls

**Term of art:** QA/QI; AQUA (Advanced Quality Assurance) compliance scoring; case review / sentinel event review; ED-Q (quality dispatcher); the recorded/logged line; ACE accreditation (Accredited Center of Excellence)

Every call and radio transmission is recorded and time-stamped; a QA/QI unit (often using a compliance rubric like the AQUA tool against MPDS) randomly and event-triggered samples calls, scores protocol compliance and judgment, and feeds findings back into retraining and protocol revision. Sentinel events get full case review. This is the field's continuous-improvement engine: the interface and its triage rules evolve from analysis of real failures, with the recording as ground truth — the rare domain where worst-case outcomes are systematically dissected and re-fed into doctrine.

**Failure mode:** QA as punishment vs learning — if review is used to discipline rather than improve, dispatchers game compliance (read every line robotically) and hide near-misses, killing the feedback signal. Just-culture frameworks separate blameworthy acts from system-induced error so the loop-improvement data keeps flowing.

## Frequent-caller flags & address history — perceived context rises, with an explicit anti-desensitization guard

**Term of art:** Premise/hazard flags; 'caution notes' / officer-safety alert; frequent caller / chronic caller; medical alert; BOLO; 'stage for PD'

CAD attaches history to a location/number: prior calls, 'caution' / officer-safety flags (weapons, violent occupant, hazmat, vicious dog), medical alerts, and 'frequent caller' notes. This machine-held memory RISES on the screen the instant the call hits, giving the human context no individual could remember across thousands of calls. It shapes the response (extra units, stage-and-wait for PD).

**Failure mode:** The 'frequent flyer' desensitization bias — flags meant to inform instead prime the dispatcher to under-triage ('it's just her again') and the one time it's real, it's missed. Explicit training counter: every call gets fresh triage regardless of history; the flag adds caution, it does not subtract acuity.

## Repetitive Persistence & 'control the call' — scripted tactics to extract signal from a non-cooperative human source

**Term of art:** Repetitive Persistence; 'control the call'; the calm-firm voice; 'I can't help you until you...'; emotional content & cooperation score (ECCS)

When a caller is hysterical, EMD scripts a specific technique — Repetitive Persistence: calmly repeating the same critical question in the same words until it lands ('Listen to me. Is. He. Breathing?'), plus the 'Customer Service' and 'control the call' doctrines that put the calltaker, not the panicking caller, in charge of cadence. The interface acknowledges the primary sensor (the caller) is noisy and degraded, and gives the human a tested protocol to denoise it rather than improvising.

**Failure mode:** Caller escalation / the calltaker losing control and matching the caller's panic — the channel then yields no usable data. Also third-party/4th-party calls (caller isn't with patient) where Key Questions can't be answered, forcing a conservative high determinant on incomplete info.

## What this field knows
Emergency dispatch has solved a brutal version of the interface problem: a single human (the calltaker/dispatcher) must convert a chaotic, high-stakes perceptual inflow (a panicked caller, multiple radio channels, CAD alerts, AVL maps, sensor feeds) into ranked, structured, action-coupled decisions for responders who are not on scene — in seconds, under legal liability, while never going silent. Its deepest insight is that triage and action are FUSED, not sequential: the very first structured question (the "shunt") routes the call onto a determinant path that simultaneously assigns a response BEFORE the picture is complete, then refines. It treats the human's voice and attention as a scarce safety-critical channel to be protected by scripting the ROUTINE so cognition is freed for the EXCEPTIONAL. It knows that the protocol is the agent: a card-based or software-driven system perceives the decision-tree of possibilities the human cannot hold in memory, and the human supplies judgment, rapport, and override at named decision points. Crucially, it has codified the loop-closing mechanic — a structured handoff, continuous status states, and a "the loop is not closed until confirmed" discipline — plus an exhaustive taxonomy of how this fails (tunnel vision, the "frequent caller" desensitization, premature determinant lock-in, radio step-on, the silent gap). It is the rare field where the WORST outcomes are publicly reviewed (NTSB-style, QA case review, recorded line) so the rules for what-rises are continuously rewritten from failure.
