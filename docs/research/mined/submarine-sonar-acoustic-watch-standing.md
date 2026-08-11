# Submarine sonar / acoustic watch standing

> Mined 21339 tok · salvaged from killed run wf_bcf74bab-7ae (Scout→Mine).

## Separation of the three jobs: Detection, Classification, Localization (DCL). A contact is first DETECTED (something is there), then CLASSIFIED (what is it — submarine, surface ship, biologic, geologic, rain), then LOCALIZED (where, how fast, what course). These are distinct stages with distinct evidence, distinct operators, and distinct standards — you can hold a contact for many minutes, fully tracked, before you dare classify it.

**Term of art:** DCL (Detection, Classification, Localization); 'holding contact' vs 'classifying contact'

The processing chain detects energy cheaply and promiscuously (it surfaces far more than is real), but classification is gated behind much harder evidence — tonal signatures, blade-rate counts, propulsion harmonics. The system is allowed to over-detect; the human is the one who refuses to classify until the evidence earns it. Each stage has its own vocabulary and its own artifact, so the pipeline never collapses 'I see energy' into 'it is a threat.'

**Failure mode:** Premature classification — calling a biologic a submarine, or a merchant a warship — anchors the whole tracking team on a wrong identity and is extremely hard to unwind. The opposite, refusing to ever commit to a classification, leaves the conn unable to act. Doctrine deliberately decouples the stages so over-detection never auto-promotes to a threat call.

## The waterfall / lofargram as the canonical display: time on the vertical axis scrolling down, bearing or frequency on the horizontal, intensity as brightness. The operator's eye is trained to see a faint vertical TRACE slowly coalesce out of noise over MINUTES — detection is a temporal-integration act, not an instantaneous alarm.

**Term of art:** Waterfall display; LOFARGRAM (Low Frequency Analysis and Recording); 'gram'; broadband vs narrowband display

A single moment of energy is meaningless; a contact reveals itself as a persistent line that holds bearing or drifts coherently while the background speckle does not. The display is deliberately built to reward patience and persistence-over-time rather than instantaneous magnitude. The human integrates across time in a way that beats a per-frame threshold detector, because real contacts are coherent and noise is not.

**Failure mode:** Display saturation / clutter — too many marks and the real trace is lost in the visual noise; gain set too high and everything blooms, too low and the faint real contact never appears. Operators speak of 'tuning the gram' as a constant manual act because no fixed setting is right for all conditions.

## Broadband vs narrowband as two complementary attention modes. BROADBAND listens for the total acoustic energy of a contact (the 'rushing' of water over a hull, cavitation) — good for detecting that SOMETHING is there. NARROWBAND hunts for discrete frequency tonals — the hum of specific machinery — good for telling WHAT it is. Operators deliberately switch between a wide cheap net and a narrow expensive identifier.

**Term of art:** Broadband; narrowband; tonals; DEMON (Detection of Envelope Modulation On Noise) for blade-rate; cavitation

Broadband is the wide-aperture early-warning mode tuned for sensitivity (it rises easily, false-alarms more). Narrowband is the high-evidence confirmation mode: a specific tonal line at a known frequency is a near-signature, almost a fingerprint of a class of machinery. The operator uses broadband to decide WHERE to point narrowband attention — coarse net first, then expensive precise look.

**Failure mode:** Spending scarce narrowband analysis on a clutter contact, or conversely getting a broadband hit and never confirming it with narrowband so the contact stays forever 'unclassified.' Quiet modern targets may show neither cleanly — the absence of tonals is itself ambiguous.

## The contact designation ritual: the moment a perception crosses threshold, the operator makes a scripted verbal report — 'New contact! Designate Sierra-three-five, bearing two-seven-zero, broadband' — which instantly mints a tracked OBJECT with a permanent label (Sierra-N for sonar contacts) that the whole boat now shares and references.

**Term of art:** 'New contact, designate Sierra-N'; contact designator (Sierra for sonar, Romeo for radar, etc.); 'gaining/holding/losing contact'

The report is the interface. Before the call, the contact lives only in one operator's eyes and headphones; the instant of designation converts a private faint perception into a public, persistent, referenceable entity with an ID, a bearing, and a means of detection. From then on every update is logged against that designator, and any watchstander can ask 'status on Sierra-three-five.' The naming is what makes joint action possible.

**Failure mode:** Designating the same physical contact twice under two Sierra numbers (track duplication / 'contact splitting'), or merging two real contacts under one number ('track coalescence'). Both corrupt the shared picture, and reconciling them mid-engagement burns the very attention the system exists to protect.

## Tiered watch hierarchy as an attention filter: individual sonar operators each own a sector/stack and watch raw displays; the Sonar Supervisor integrates across operators and decides what is worth reporting upward; only filtered, classified, actionable contacts reach the Officer of the Deck / conn / Fire Control. No single human looks at everything — attention is partitioned and then funneled.

**Term of art:** Sonar Supervisor ('Sonar Sup'); Officer of the Deck (OOD); the conn; 'Conn, Sonar...' report protocol; sound room

Each layer is a deliberate compression stage. Operators perceive widely on raw signal; the supervisor is a human filter who knows the difference between 'interesting to an operator' and 'the captain needs this'; the conn receives only decision-relevant contacts in decision-relevant form. The hierarchy exists specifically so that the scarce attention at the top is spent only on what has survived two layers of human judgment.

**Failure mode:** Either the supervisor over-filters (a real contact never reaches the conn — the missed-detection failure pushed up a level) or under-filters (floods the conn with raw clutter so the decision-maker is swamped). The reporting protocol 'Conn, Sonar' vs 'Sonar, Conn' enforces direction and prevents cross-talk chaos when tension is high.

## Standardized contact report content: bearing, then signal type, then any classification and confidence — and crucially, what is NOT yet known. A report is structured to carry uncertainty explicitly: 'bearing only, no range yet,' 'possible submarine, low confidence,' 'contact zig — possible course change.' Ambiguity is transmitted, not hidden.

**Term of art:** 'Bearing-only'; 'contact zig'; 'up Doppler / down Doppler / no Doppler'; confidence qualifiers ('possible,' 'probable,' 'certain')

Passive sonar gives bearing but not range, so every initial report is honest about being bearing-only. The format forces the operator to separate what is measured (bearing) from what is inferred (classification) from what is guessed (intent). The decision-maker receives calibrated uncertainty and can decide how much to act on a low-confidence call versus wait for more.

**Failure mode:** Stripping the uncertainty in transmission — a 'possible submarine' becomes 'submarine' as it goes up the chain (false certainty amplification), or a hard-won bearing rate is reported as a range it never was. Doppler can also lie if the operator confuses own-ship motion for contact motion.

## Target Motion Analysis (TMA) and the ownship-maneuver-to-resolve doctrine: because passive sonar yields only bearing, the submarine must deliberately CHANGE ITS OWN COURSE (a 'TMA leg' / maneuver) to triangulate the contact's range, course, and speed over time. The act of resolving ambiguity is a planned physical maneuver, not a button press.

**Term of art:** TMA (Target Motion Analysis); 'legs'; bearing rate; Ekelund range; the strip plot / time-bearing plot; Manual Spruance Plot

A single bearing line is consistent with infinitely many target solutions (close-and-slow vs far-and-fast). By changing ownship's position and watching how the bearing rate changes, the team collapses that ambiguity. The doctrine builds the maneuver-to-disambiguate directly into operations: you spend time and motion to buy certainty, and you know you must, because the geometry forbids a static fix.

**Failure mode:** A 'stale' or under-constrained solution: acting on a TMA fix before enough legs have been run produces a confidently-wrong range. A contact that maneuvers during your TMA leg invalidates the solution silently — you can be converging on a number that the target's own zig has already made false.

## Aural monitoring kept alongside the visual processing — the operator still puts the headphones on and LISTENS to the raw acoustic stream, because the trained human ear classifies transients and biologics the automated processor misses or misreads.

**Term of art:** Aural monitoring; 'biologics'; transients; 'rain on the hull'; the 'golden ears' operator reputation

The machine is excellent at steady detection and tonal extraction but brittle on novel, brief, or ambiguous sounds — a hull pop, a transient, the call of a whale, a fishing-boat clang. The human ear, with experience, recognizes these instantly and keeps the classifier honest. Doctrine deliberately preserves the human's direct access to the raw signal rather than letting them see only the system's derived products.

**Failure mode:** Over-trusting automated classification and tuning out the raw audio — the system labels a biologic as a contact (or vice versa) and an operator who has stopped truly listening never catches it. Conversely, fatigue degrades the ear specifically, which is why this skill is watch-rotated.

## Deliberate search-sector assignment and rotation: operators are assigned bearing sectors / frequency bands to search rather than told to 'watch everything,' and watches are rotated on a fixed schedule because acoustic vigilance is known to decay sharply with time-on-task.

**Term of art:** Search sector; 'covering a stack'; watch rotation / watch bill; vigilance decrement; 'cold' vs 'hot' bearings

Coverage is achieved by partitioning the perceptual field across operators (you own these bearings, I own those) so the union is complete but no individual is overloaded. Rotation exists because the literature on vigilance decrement is brutal — sustained detection performance on rare faint signals falls off within tens of minutes — so fresh attention is rotated into the demanding stacks on purpose.

**Failure mode:** Sector seams — a contact transiting the boundary between two operators' sectors falls through the gap, held by neither. And rotation itself creates the turnover-gap risk: the moment of handoff is when a faint contact is most likely to be dropped, which is why a formal turnover brief is mandated.

## The formal watch turnover / relief brief: an off-going operator does not simply leave — they verbally hand over every held contact, its history, its solution, and any 'things I'm suspicious of,' and the relief explicitly accepts ('I have the watch') only once the picture is transferred. Continuity of the perceptual state is a ritualized handoff.

**Term of art:** Watch turnover / relief; 'I relieve you' / 'I have the watch'; the turnover log; pass-down log

The tracked picture is perishable institutional memory that lives partly in the current operator's head — what's been ruled out, what's nagging, what to keep an eye on. The turnover brief externalizes that tacit state so it survives the personnel change. The explicit acceptance of the watch makes the moment of responsibility-transfer unambiguous; there is never a gap where 'no one had it.'

**Failure mode:** A rushed or incomplete turnover — the off-going operator forgets to mention a faint intermittent contact they'd been nursing, and it is effectively lost at the seam of the watch change. The relief inherits a clean-looking screen that hides an un-passed suspicion.

## Signal-to-noise and the sonar equation as an explicit, taught mental model of when you SHOULD and SHOULD NOT expect to hear something — operators reason quantitatively about detection conditions (own noise, ambient noise, propagation) so the absence of a contact is interpreted, not assumed to mean empty water.

**Term of art:** The sonar equation; signal-to-noise ratio (SNR); transmission loss; figure of merit; detection threshold; array gain; self-noise

The sonar equation (source level minus transmission loss minus noise plus array gain vs a detection threshold) lets the operator estimate detectability. Crucially this means 'we hold nothing' is read against expected conditions: in bad acoustic conditions, silence means little; in good conditions, silence is meaningful. The model turns negative evidence into calibrated information instead of false comfort.

**Failure mode:** Treating 'no contact' as 'no threat' regardless of conditions — the most dangerous comfort. A quiet contact in a bad sound environment is undetectable by design, and an operator who forgets the equation reads an empty screen as a safe ocean.

## Environmental layer awareness — the shadow zone, the sound channel, and the thermocline/layer. Operators interpret EVERY detection (and non-detection) through the ocean's acoustic structure, knowing that a contact can be acoustically invisible because it sits below a layer that bends sound away ('hiding under the layer').

**Term of art:** The layer / thermocline; shadow zone; sound (SOFAR) channel; convergence zone (CZ); bathythermograph (BT); 'going below the layer'

Sound speed varies with depth, bending acoustic rays and creating zones where contacts are hidden and zones (convergence zones) where distant contacts appear surprisingly loud. The operator's picture of 'where could something be that I can't hear' is shaped by these structures. The interface to the ocean includes a model of the medium itself, not just the signals — you reason about where your own blind spots physically are.

**Failure mode:** Being blindsided by a contact that was under the layer the whole time, or misjudging range by a full convergence-zone annulus (a contact that's 'close' on bearing may be one CZ — tens of miles — away). The medium creates structured, predictable blind spots that a naive reading of the display completely misses.

## Trip wire / threshold alerting tuned with an explicitly accepted false-alarm rate: automated detectors and alerting gates are set knowing they will cry wolf at some rate, and that rate is a deliberate tuning decision balancing the cost of a miss against the cost of alarm fatigue — sensitivity is purchased with accepted false alarms.

**Term of art:** Detection threshold; false-alarm rate; ROC (receiver operating characteristic) curve; CFAR (constant false-alarm rate) processing; 'crying wolf'

There is no threshold that catches every real contact and never false-alarms; the operator/system chooses where on that ROC curve to sit. In a high-threat posture you lower the threshold (more false alarms, fewer misses); in transit you raise it. The acceptance of a non-zero false-alarm rate is doctrine, not failure — the system is openly tuned to over-warn when the cost of a miss is mortal.

**Failure mode:** Two opposite poisons: a threshold set so loose the watch drowns in false alerts and starts ignoring them (alarm fatigue — the real one gets dismissed as 'another false'), or set so tight the faint real contact never trips it. Both are failures of calibration, and the field treats finding the right point as a continuous, posture-dependent act.

## Cross-sensor / multi-array correlation: a contact held on one sensor (towed array, hull array, sphere) is sought on the others, and a contact is more believed when independent apertures agree — the bow array, the towed array, and intercept all 'voting' on the same bearing raises confidence and helps resolve the towed-array left/right ambiguity.

**Term of art:** Towed array; spherical/bow array; hull array; conformal array; left/right (port/starboard) ambiguity; sensor fusion / correlation

Different arrays have different geometries, frequency sensitivities, and blind spots. Correlating a contact across them both confirms it (independent confirmation beats a single noisy channel) and resolves geometric ambiguities a single array can't — notably the towed array's inherent inability to tell port from starboard, which a maneuver or the hull array can break. Agreement across independent perceivers is the currency of confidence.

**Failure mode:** Spurious correlation — forcing two different physical contacts into one because their bearings happen to align momentarily, or chasing the 'ghost' image on the ambiguous side of a towed array as if it were real. Confidence from agreement is only valid if the sensors are truly independent.

## The contact log / sonar log as the persistent narrative record: every contact's birth, every bearing, every classification change, every loss-of-contact is timestamped and logged, creating an auditable history that supports reconstruction, handoff, and the rebuilding of a solution after contact is regained.

**Term of art:** Contact log; sonar log; 'last known' bearing/course/speed; reacquisition; the narrative / event log

Live attention is fleeting; the log is the durable memory that lets the team reconstruct what happened, hand a contact across a watch, or re-acquire a lost contact using its last known motion. It also makes the picture auditable after the fact — every classification call is traceable to the evidence and the time it was made, which is how the institution learns from both good calls and errors.

**Failure mode:** Logging that lags the action (in a fast-developing situation the log falls behind and stops being trustworthy), or a contact 'lost' with a stale last-known so reacquisition searches the wrong water. A log nobody updates becomes a confidently-wrong history.

## What this field knows
This field has spent a century solving a precise version of the core problem: a human operator must act on a faint, ambiguous signal extracted from an acoustic environment that carries vastly more information than any person can consciously hold — and the consequences of both missing a real contact and crying wolf on a false one are severe. What sonar uniquely knows is that the perceptual layer (the machine/processing) and the judgment layer (the human) must be DIFFERENT and KEPT different — the system is trusted to perceive widely and the human is trusted to classify and decide, and the entire ritual of the watch is engineered around that division. Its deepest lessons: (1) Detection, classification, and localization are separate disciplines with separate evidentiary standards — a thing can be "held" long before it is "classified" and far before it is "a threat," and conflating these stages is the canonical error. (2) Attention is a managed, perishable resource — it is rationed by deliberate search sectors, rotated watches, and an explicit hierarchy (operator -> supervisor -> conn) so no one stares at everything. (3) The escalation path is a scripted verbal ritual ("new contact, designate Sierra-X, bearing...") that forces a faint perception into a shared, actionable object the moment it crosses a threshold — the report IS the interface. (4) The human is deliberately kept in the analytic loop on the raw signal (the operator still LISTENS, still reads the waterfall) precisely because the machine's classifier is brittle at the edges and biologics/transients fool it. (5) Ambiguity is preserved, not resolved prematurely — contacts carry confidence, bearing-only fixes carry a known left/right ambiguity, and the doctrine builds maneuvers (TMA legs) to resolve uncertainty rather than papering over it. (6) The whole apparatus is tuned against two named, opposite failure modes — the missed detection and the false contact / "crying wolf" that erodes trust — and it accepts measured false-alarm rates as the price of sensitivity. The transferable core: build the interface as a disciplined PIPELINE of escalating evidentiary stages, give the human curated derived products while preserving their access to raw signal, ration attention deliberately, make the moment-of-rising a scripted joint act that creates a shared tracked object, and design explicitly against both the miss and the false alarm rather than optimizing one.
