# Aviation crew resource management and the sterile cockpit rule

> Mined 20885 tok · salvaged from killed run wf_bcf74bab-7ae (Scout→Mine).

## The alert hierarchy: Warning / Caution / Advisory, ranked strictly by required crew ACTION and time-to-act, not by data severity or system importance.

**Term of art:** Alerting hierarchy / Warning-Caution-Advisory (WCA); 'red over amber over white'

Modern flight-deck alerting (codified in standards like SAE ARP4102/ARP5289 and Boeing's EICAS / Airbus's ECAM philosophy) sorts every possible annunciation into three tiers defined by the RESPONSE they demand. WARNING = immediate corrective action required (fire, stall, terrain) — gets red, the most aggressive aural (siren, voice, repeating tone), and cannot be ignored. CAUTION = immediate crew AWARENESS and likely future action — gets amber/yellow, a single attention tone. ADVISORY = awareness only, no time pressure — lowest salience, often just a quiet message line. The classification is by what the human must DO and HOW FAST, so the form (color, sound, position, persistence) is a direct encoding of urgency-of-action. A subsystem can be 'very important' yet generate only an advisory if nothing needs doing right now.

**Failure mode:** Mis-tiering: if too many conditions are classified as Warnings, the top tier loses meaning and crews start treating red as noise. The reverse — burying a time-critical condition in a low tier — delays action. Designers fight constantly over which tier a given fault belongs in.

## Sense-coded redundancy: urgency is encoded simultaneously in COLOR, SOUND, LOCATION, and MOTION so the right message penetrates regardless of where the human is looking or how saturated one channel is.

**Term of art:** Master Warning / Master Caution; stick shaker; reserved color coding; aural alert prioritization

Aviation never relies on a single sensory channel for critical alerts because the eyes may be outside, on instruments, or task-fixated. A stall is a stick-shaker (tactile vibration in the hands) PLUS aural 'STALL STALL' PLUS visual. Ground proximity is a loud voice ('PULL UP / TERRAIN'). Reserved colors are doctrine: red = warning only, amber = caution only, and these colors are forbidden for routine information so they retain meaning. Master Warning / Master Caution lights are placed in the pilot's primary forward field of view so any alert first 'announces itself' in a known fixed location before the eye is directed to the detailed message. Aural alerts use distinct, learned signatures (a specific tone for autopilot disconnect, a different one for altitude). The form is matched to the channel most likely to be free and most appropriate to the action (tactile for fly-the-airplane-now).

**Failure mode:** Color/tone vocabulary creep — using red or warning tones for non-critical states erodes the reserved meaning. Aural clutter: if too many sounds fire, crews cannot distinguish them. Tactile cues can be missed if the pilot's hands are off the controls.

## The sterile cockpit rule: a hard legal threshold below which all non-essential information and conversation is PROHIBITED — suppression as a mandated safety feature.

**Term of art:** Sterile cockpit rule; FAR 121.542; 'below ten thousand'

US FAR 121.542 / 135.100 makes it illegal for crew to engage in any activity or conversation not required for safe operation during critical phases — defined concretely as all ground operations (taxi, takeoff, landing) and ALL flight below 10,000 feet except cruise. The genius is the BRIGHT-LINE TRIGGER: 10,000 ft is an unambiguous, automatically-detectable altitude, not a judgment call, so everyone (and increasingly the automation) knows exactly when the gag is in force. It was written in blood — Eastern 212 (1974) crashed during an approach while the crew chatted about politics and used-car sales. During sterile cockpit, non-essential PA announcements, cabin calls, and chatter are forbidden; the principle is that during attention-saturated phases, the DEFAULT is silence and only operationally-required signal is allowed through.

**Failure mode:** The line can be gamed or eroded ('is this conversation really non-essential?'); crews sometimes violate it socially. It defines the phase by altitude, so a high-workload event ABOVE 10,000 ft isn't automatically protected. It governs human chatter well but the harder modern problem is gating the AUTOMATION's chatter, addressed separately by alert inhibit.

## Alert inhibit / nuisance suppression logic: the AUTOMATION self-censors during the most critical seconds, deferring non-critical alerts until the human has spare attention.

**Term of art:** Takeoff inhibit / landing inhibit; alert inhibit phases; nuisance alert suppression

The avionics implement their own sterile-cockpit equivalent. During takeoff, from roughly 80 knots through liftoff to ~400 ft, the EICAS/ECAM system INHIBITS all but the most critical cautions and warnings (Boeing's takeoff inhibit / landing inhibit phases) — a non-essential caution that would distract during rotation is held and presented only after the aircraft is safely climbing. The system knows the flight phase and modulates its own talkativeness accordingly: it raises the threshold for what's worth interrupting precisely when interruption is most dangerous. This is the machine reasoning 'the human's attention is maxed right now; this message can wait 30 seconds; only fire/config/critical gets through.' GPWS/TCAS similarly have phase-aware logic and inhibit modes to prevent nuisance alerts during normal maneuvers (e.g., flap/gear configuration suppresses certain terrain modes).

**Failure mode:** If inhibit is too aggressive it can mask a genuinely critical condition during the inhibited window. Tuning the inhibit envelope is delicate — the line between 'nuisance during takeoff' and 'must-know during takeoff' is exactly where designers agonize.

## Challenge-and-response checklists: loops are closed by a scripted two-person verbal protocol where one party calls the item and the OTHER must verbally confirm the actual state — never silent self-confirmation.

**Term of art:** Challenge-and-response; Pilot Flying / Pilot Monitoring; flow-then-checklist; electronic checklist

Critical configuration is verified through a ritualized dialogue: the Pilot Monitoring CHALLENGES ('Flaps?') and the Pilot Flying RESPONDS with the observed state ('Flaps fifteen, green'). The response must reflect what is actually observed, not what is expected — the protocol forces a fresh perception, not a memory. This decouples the actor from the verifier so a single person's error or expectation bias gets caught. Increasingly the automation participates: it can act as the challenger (electronic checklist that won't advance until a condition is sensed met) or the responder (system state displayed for the human to read back). The loop is only closed when the confirming party speaks; an unanswered challenge is itself a flag. This is the field's template for 'don't just show status — require a confirming action from a second agent.'

**Failure mode:** Rote-response / 'expectation bias': crews can chant the expected answer without actually looking (responding 'down and locked' to a gear that isn't), defeating the cross-check. Rushing or interruption causes skipped items. Mitigated by flow-then-checklist and by electronic checklists that sense actual state.

## Explicit transfer-of-control protocol: authority over the aircraft is handed off via an unambiguous three-way verbal handshake so it is never simultaneously held or dropped by both human and system.

**Term of art:** 'You have the aircraft'; positive transfer of control; autopilot disconnect warning; Flight Mode Annunciator (FMA)

Control is transferred with a closed verbal loop: 'You have the aircraft' / 'I have the aircraft' / 'You have the aircraft' (a positive three-step exchange), so at every instant exactly one agent is the designated flying pilot. The same discipline governs human-automation handoff: engaging the autopilot is announced ('autopilot engaged'), and critically, the autopilot DISCONNECTS with a loud, distinctive, deliberately-startling aural+visual warning (the red Master Warning + cavalry-charge tone) — the system refuses to silently hand control back; it forces the human to acknowledge they now have it. Mode changes are annunciated on the Flight Mode Annunciator (FMA) so the human can read 'who is doing what.' The doctrine: a transfer of authority must be an explicit, acknowledged event, never an inference.

**Failure mode:** If the autopilot drops out without the human noticing or fully grasping the new state, you get an unguarded aircraft — a core factor in Air France 447, where the crew received the airplane in an unusual state at altitude and never built a shared model of who/what was controlling it. Ambiguous transfers ('I thought YOU had it') are a classic CRM accident pattern.

## The PM/PF role split and assertive cross-checking (CRM's two-axis division of labor): one agent acts, the other independently monitors the actor AND the automation, with a duty to speak up.

**Term of art:** Crew Resource Management (CRM); Pilot Monitoring's active role; two-challenge rule; authority gradient; assertiveness (PACE)

Crew Resource Management (born from the 1977 Tenerife and 1978 United 173 disasters; United's CRM program 1981) formalized that one pilot FLIES (Pilot Flying) and the other MONITORS (Pilot Monitoring) — and the monitor's job explicitly includes watching what the AUTOMATION is doing, catching mode errors, and challenging the flying pilot. CRM trains the lower-authority person to assert concerns through escalating, scripted assertiveness (e.g., the PACE / 'two-challenge' rule: if a captain doesn't respond to two challenges, the FO is empowered to take over). This is a deliberate attack on steep authority gradients: the system/junior is given both the DUTY and the SCRIPT to interrupt the senior decision-maker when perception and plan diverge. It treats monitoring as an active, named job — not a passive byproduct of being in the seat.

**Failure mode:** 'Authority gradient' too steep: monitor sees the problem but won't speak (Tenerife: the FO's hesitant doubt didn't stop the captain). 'Monitoring is boring' — passive monitoring degrades fast; humans are poor at vigilance, so monitoring failures are a leading modern cause. Over-trust in the actor suppresses the challenge.

## TCAS / GPWS as the model of an autonomous over-perceiver that escalates from informational to COMMANDING — and that issues an unambiguous, do-it-now imperative when stakes peak.

**Term of art:** TCAS Traffic Advisory (TA) vs Resolution Advisory (RA); EGPWS 'PULL UP'; 'RA overrides ATC'; Überlingen

Collision-avoidance (TCAS) embodies a graduated escalation matched to threat. It first issues a Traffic Advisory (TA) — 'TRAFFIC, TRAFFIC' — purely to direct the eyes and build awareness, demanding no maneuver. If the threat sharpens, it escalates to a Resolution Advisory (RA) — 'CLIMB, CLIMB' / 'DESCEND' — a direct, imperative COMMAND that the crew is trained to follow IMMEDIATELY, even over an air traffic controller's contrary instruction. The interface deliberately shifts register from 'here is information, you decide' to 'do exactly this, now.' Ground-proximity (EGPWS) similarly escalates terrain cues to a non-negotiable 'PULL UP.' The system also coordinates with the OTHER aircraft's TCAS so the two resolutions are complementary — over-perceivers negotiating with each other to hand each human a non-conflicting order.

**Failure mode:** Following the human (controller) over the machine (RA) kills — Überlingen 2002: one crew obeyed ATC, the other obeyed TCAS, and they collided; the accident rewrote doctrine to 'RA always wins.' Conversely, alert fatigue from past nuisance GPWS warnings bred hesitation. The shift from advisory to command must be crisp or crews hesitate at the worst moment.

## Automation complacency, mode confusion, and 'automation surprise' — the field's named catalog of how an over-perceiving system FAILS its human, and the countermeasures.

**Term of art:** Automation complacency; mode confusion; automation surprise; out-of-the-loop performance problem; 'what's it doing now?'; FMA mode callouts

Aviation has rigorously characterized the dark side of automation. AUTOMATION COMPLACENCY: when the system is highly reliable, the human stops actively cross-checking and misses the rare failure (the monitor mentally checks out). MODE CONFUSION / AUTOMATION SURPRISE: the human holds a wrong model of which mode the automation is in and is shocked by its behavior ('why is it doing that?') — implicated in the Asiana 214 crash (crew believed autothrottle would hold speed; it would not in that mode). The countermeasures are themselves interface doctrine: the Flight Mode Annunciator forces the current mode to be continuously, explicitly displayed; 'callout the mode' procedures require crews to verbally announce mode changes ('Speed mode, captain'); training emphasizes 'what is it doing now, what will it do next, why.' The field's stance: an over-perceiving system must make its OWN STATE and INTENT legible, or the human's mental model silently diverges until surprised.

**Failure mode:** These ARE the failure modes — and the meta-lesson is that adding automation can REDUCE safety if it degrades the human's situational awareness ('automation paradox'/'out-of-the-loop' problem). Clumsy automation that demands attention precisely when workload is high makes things worse. Opaque automation breeds the very surprise it should prevent.

## Standard callouts and the 'verbalize-verify-monitor' triad: critical state CHANGES are spoken aloud to convert private perception into a shared, externally-auditable record.

**Term of art:** Standard callouts; verbalize-verify-monitor; altitude/approach deviation callouts; CVR (cockpit voice recorder) as shared record

Beyond checklists, aviation mandates spontaneous STANDARD CALLOUTS at defined trigger points: '1000 to go' approaching an altitude, 'V1 / rotate' on takeoff, 'stabilized' or 'go-around' on approach, 'localizer alive,' deviation callouts ('speed, speed' / 'sink rate'). These convert a perception that might stay locked in one person's head (or one system's display) into a SPOKEN event both agents and the cockpit voice recorder share. The triad 'verbalize, verify, monitor' captures it: say what you're about to do/what changed, confirm it happened, keep watching. Automation increasingly issues these callouts itself (radio altimeter '500... 100... 50... 30... 20... 10'). The function is to keep two divergent perceivers continuously RE-SYNCED at high-consequence moments, with the spoken word as the synchronization token.

**Failure mode:** Callouts become rote and lose meaning if chanted without attention. If only the machine calls out and the human stops verbalizing, the shared model degrades. Missing/inconsistent callouts across a crew is a known CRM breakdown; callouts in the wrong language or non-standard phrasing cause confusion.

## ECAM/EICAS action-oriented alerting: the alert doesn't just NAME the fault, it presents the PROCEDURE — the system pairs every escalation with the specific joint action to take and tracks completion.

**Term of art:** ECAM (Electronic Centralized Aircraft Monitor); EICAS; read-and-do; STATUS page; synoptic display; Qantas 32

Airbus's ECAM and Boeing's EICAS don't merely flag 'ENGINE FIRE'; they display the abnormal condition AND the corrective checklist actions in priority order, often with affected-system synoptic diagrams, and ECAM tracks which actions the crew has completed (items clear/change color as accomplished). The system reasons about consequences and presents secondary effects ('STATUS' page of inoperative systems) so the crew sees not just the problem but the new operating reality. This fuses perception with prescribed action: the over-perceiver that detects the anomaly also hands over the playbook and monitors execution. The crew works the ECAM top-down, reading-and-doing, with the system as an active partner that confirms each step is registered.

**Failure mode:** Over-reliance: crews may follow ECAM blindly without higher-level airmanship (Qantas 32's flood of cascading ECAM messages from an uncontained engine failure nearly overwhelmed the crew — too many procedures, requiring human judgment to prioritize beyond what the system sequenced). Cascading/duplicate messages in a complex failure can bury the root cause. The system's prioritization may not match the real-world tactical priority.

## What this field knows
Aviation is the field that turned "a human acting through and with an over-perceiving machine" into codified, drilled, legally-mandated doctrine — paid for in crashes. Its hard-won core insight is that attention is the scarce resource and the machine perceives far more than the pilot, so the entire discipline is about ENGINEERING ATTENTION: deciding what reaches the human, in what sensory form, with what authority, and what gets actively suppressed. Three things distinguish it. (1) Alerting is a TRIAGED HIERARCHY by required action and time-to-act, not by data importance — a warning that demands hands-on-controls-now looks/sounds categorically different from an advisory you note for later, and each tier gets a reserved color, tone, and required response. (2) Suppression is treated as a first-class safety feature, not an omission: the sterile cockpit rule and alert-inhibit logic legally and technically GAG the system during the phases where the human's attention is most saturated. The field learned that an interruption at the wrong moment kills, so silence is designed as deliberately as signal. (3) Loops are closed through scripted CHALLENGE-AND-RESPONSE dialogue and explicit authority transfer ("you have the aircraft") — the human and system don't just share a view, they execute a verbal handshake protocol so that every action has a confirmer and control is never ambiguously held. Crucially, aviation also knows the failure modes of its own solutions: alarm floods that overwhelm, alert fatigue that breeds distrust, automation complacency where the human stops cross-checking, mode confusion where the human misreads what the system is doing, and "automation surprise." It knows that an interface that over-alerts is as deadly as one that under-alerts, and it has the accident record to prove both.
