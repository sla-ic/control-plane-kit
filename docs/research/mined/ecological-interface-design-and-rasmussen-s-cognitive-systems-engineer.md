# Ecological Interface Design and Rasmussen's cognitive systems engineering

> Mined 20859 tok · salvaged from killed run wf_bcf74bab-7ae (Scout→Mine).

## Build an Abstraction Hierarchy (AH) of the work domain — a 5-level means-ends model — BEFORE designing any screen. The levels: Functional Purpose (why the system exists / goals), Abstract Function (the governing laws: mass/energy/information balances, conservation principles), Generalized Function (the processes/flows that do work), Physical Function (the capabilities/condition of components), Physical Form (the physical layout/appearance). Every adjacent pair is linked by a 'why/what/how' relation: looking UP answers WHY a thing exists, looking DOWN answers HOW it's achieved.

**Term of art:** Abstraction Hierarchy (AH); means-ends links; why-what-how relations; the 'structural means-ends' model

This is Rasmussen's signature artifact. The analyst maps the domain as a lattice where each node at one level is connected to the nodes above (the ends it serves) and below (the means that achieve it). It is a model of the CONSTRAINTS that govern the domain, not of tasks or user goals. The power: an operator facing a novel disturbance can traverse the why-what-how links to reason about a situation no procedure covers — because the structural relationships hold even when the specific scenario is unanticipated. It deliberately captures the domain independent of any particular operator, task, or event.

**Failure mode:** Collapsing the AH to just the top (goals) and bottom (physical components) — the 'tennis without a net' error — loses the middle levels (mass/energy balances, functional flows) which are EXACTLY where unanticipated-fault reasoning happens. A second failure: analysts build an AH of the automation/software instead of the underlying work domain, producing an interface that shows what the computer is doing rather than what the world is doing.

## Cross the AH with a part-whole Decomposition to form the Abstraction-Decomposition Space (ADS) — a 2D grid (levels of abstraction × levels of aggregation, e.g. total system / subsystem / component). Analysts trace diagonal paths through this space to model how experts shift resolution AND abstraction together when diagnosing.

**Term of art:** Abstraction-Decomposition Space (ADS); Work Domain Analysis (WDA); diagonal traversal; the first phase of Cognitive Work Analysis (CWA)

The ADS is the canonical Work Domain Analysis worktable in Cognitive Work Analysis (CWA). It forces the designer to represent the domain at multiple zoom levels simultaneously, so the interface can support both 'big picture' (high abstraction, whole system) and 'drill-in' (low abstraction, single component) without losing the connective tissue between them. Expert troubleshooting characteristically moves diagonally: a high-level functional anomaly (energy not balancing) is chased down to a specific component fault.

**Failure mode:** Building displays that lock the user at one cell of the ADS (e.g. only component-level mimics) so the human can never see functional-level meaning, or can only see it by mentally integrating dozens of low-level readings — pushing them into knowledge-based reasoning under time pressure.

## Design displays to the SRK taxonomy: deliberately engineer the interface so routine work can be handled at the Skill-Based (direct perception-action, pattern) and Rule-Based (if-condition-then-action, familiar cues) levels, and so that the structure needed for Knowledge-Based (analytical, model-driven) reasoning is ALSO present and perceptible for novel situations. The mantra: 'support all three levels; don't force KB reasoning where SB/RB would do, but make KB possible when it's truly needed.'

**Term of art:** Skills-Rules-Knowledge (SRK) framework; signals/signs/symbols; the three EID design principles (Vicente & Rasmussen, 1992)

Rasmussen's Skills-Rules-Knowledge framework is the cognitive backbone. SB: smooth sensorimotor response to continuous signals (a moving pointer you track). RB: recognition of a familiar situation triggering a stored procedure (signs that cue a known rule). KB: effortful reasoning from a mental model toward a goal when the situation is unfamiliar (symbols you must interpret). EID's first principle (Vicente & Rasmussen 1992) is literally to map display features to these levels — time-space signals for SB, perceptual cues/signs for RB, and an externalized domain model (the AH made visible) for KB.

**Failure mode:** The 'symbol-processing trap': presenting everything as alphanumeric data (symbols) forces even routine monitoring into slow KB interpretation. Conversely, over-automating the RB level (hiding the cues) leaves the operator unable to drop to KB reasoning when the automation hits its boundary — they lack the perceptual ground to even start reasoning.

## Make constraints and higher-order relationships DIRECTLY PERCEPTIBLE as emergent visual forms — configural / polygon / 'object' displays where the GEOMETRY of the whole encodes a functional invariant, so a violated constraint shows up as a broken symmetry the eye catches pre-attentively, not as a number to be read and compared.

**Term of art:** configural display; emergent features; the 'mapping principle'; direct perception (Gibsonian ecological psychology); the proximity-compatibility principle (Wickens); Beltracchi's display; DURESS

The exemplar is the Rankine-cycle display and Beltracchi's polar 'star' display for a power plant thermodynamic cycle, and the EID feedwater displays from Vicente's DURESS microworld. Multiple raw variables are mapped to vertices of a polygon; when the process is healthy the polygon is a regular, recognizable shape; a fault distorts it into an asymmetric form. The mass/energy balance (an Abstract-Function-level invariant) becomes a single visual gestalt. This is the operationalization of Gibson's ecological 'direct perception': the affordances/constraints of the domain are specified in the optic array itself.

**Failure mode:** Naive 'emergent feature' design that creates a salient visual pattern NOT mapped to a real domain constraint — the eye is drawn to a meaningless coincidence. Also: configural displays that hide the individual variables, so when the gestalt breaks the operator can't decompose it to find which element caused the break (the 'can't read the parts' problem).

## Treat 'what rises to attention' as an emergent property of a faithfully-mapped display, NOT as a curated alert list. EID's stance: if the display correctly externalizes the domain's constraints, the abnormal state will be perceptually salient on its own. This is explicitly opposed to alarm-driven design.

**Term of art:** the critique of 'alarm-based' / threshold-based design; 'representation aiding'; keyhole effect (the opposite of what EID wants)

Rather than a designer pre-deciding 'show alarm X when threshold Y', the interface shows the functional field continuously; deviations manifest as departures from expected visual form. The human's attention is drawn by the structure of the representation matching or mismatching the structure of the world. This is what lets the operator notice the UNANTICIPATED — the situation no alarm was ever written for — because the constraint violation is visible even if no one predicted that specific failure.

**Failure mode:** Alarm avalanche / alarm flood (Three Mile Island: ~100+ alarms in the first minutes, no functional organization, operators overwhelmed) — the canonical failure EID was built to prevent. Each alarm was a true local fact; collectively they buried the functional story (the relief valve stuck open) that a means-ends display would have shown as a single energy-balance anomaly.

## Diagnose and design against 'clumsy automation' and the out-of-the-loop problem: analyze the JOINT cognitive system (human + automation as one unit), and keep the human perceptually coupled to what the automation is doing and why, so authority can transfer smoothly at the automation's competence boundary.

**Term of art:** joint cognitive system; out-of-the-loop unfamiliarity (OOTLUF); clumsy automation; automation surprise; mode error; 'lumberjack effect'; ironies of automation (Bainbridge, 1983)

From Cognitive Systems Engineering (Hollnagel & Woods, who coined the term, and Wiener's 'clumsy automation'), the unit of analysis is the JOINT cognitive system, not the human or machine alone. The interface must reveal the automation's MODEL and INTENT (what mode it's in, what it's tracking, what it will do next) so the human isn't surprised. EID extends to automation by treating the automation itself as part of the work domain to be made transparent.

**Failure mode:** Bainbridge's 'Ironies of Automation': automating the easy parts deskills the operator and dumps the hardest, rarest, least-practiced cases on a human who has been reduced to a passive monitor and is now 'out of the loop' precisely when expert intervention is needed. Mode error / automation surprise: the human acts on a wrong belief about which mode the system is in because the interface didn't make the active constraint set perceptible (Air France 447, the Therac-25 lineage of mode confusion).

## Run the full Cognitive Work Analysis (CWA) sequence of five phases — Work Domain Analysis → Control Task (Activity) Analysis → Strategies Analysis → Social-Organizational/Cooperation Analysis → Worker Competencies Analysis — as nested CONSTRAINT layers, each narrowing the space of possible behavior rather than prescribing one correct path.

**Term of art:** Cognitive Work Analysis (CWA); formative analysis; the Decision Ladder; shunts and leaps; constraint-based design; the five phases; 'finite but flexible'

Vicente's 'Cognitive Work Analysis' (1999) formalized Rasmussen's framework into a layered method. The defining move is 'formative' rather than normative/descriptive: instead of modeling how work IS done (descriptive) or one ideal way it SHOULD be done (normative), CWA models the BOUNDARIES of all acceptable ways it COULD be done — the space of possibilities. The Decision Ladder (a Control Task tool) maps the states of knowledge and information-processing steps in a decision, with characteristic expert 'shortcuts' (shunts and leaps) that bypass steps. This tells the designer what information must be available for any strategy the human might adopt.

**Failure mode:** Designing for one anticipated strategy/procedure (normative capture) so the interface supports the expected path but starves any alternative strategy an operator must improvise under novel conditions. Also: the sheer effort of full CWA leads teams to skip the upper phases and build only from a task analysis — reintroducing exactly the event-dependence EID exists to avoid.

## Anchor the whole approach to the ECOLOGICAL stance: design for the demands of the ENVIRONMENT/work domain (the 'ecology'), not for a model of the user's head. The interface is judged by how faithfully it specifies the domain's constraints, on the premise that a well-specified environment lets adaptive humans self-organize their behavior to it.

**Term of art:** ecological psychology; affordances; Brunswik's lens model; representational vs ecological validity; event-independent design; 'work domain' as 'ecology'

The 'ecological' in EID is a direct borrowing from Gibson's ecological approach to perception and Brunswik's lens model. The design target is the structure of the work environment; the bet is that if you reveal that structure honestly, skilled operators will perceive affordances and act appropriately without the designer having to anticipate every situation. This is why EID is 'event-independent': the constraints displayed are invariant across the specific events that might occur.

**Failure mode:** Slipping back into 'user-centered' surface design — chasing user preferences, mental-model snapshots, or current task flows — which produces interfaces tuned to today's familiar scenarios and brittle to the novel event. EID's whole point is that the domain's constraints, not the user's current model, are the stable design target.

## Represent the system's current state as a position within the FIELD of possibilities (the goal-relevant state space with its boundaries), not as an isolated status readout — so the human sees not just where things are but how close they are to constraint boundaries and which way the safe envelope lies.

**Term of art:** the safety boundary / 'migration toward the boundary'; Rasmussen's dynamic safety model; operating point; defence-in-depth made visible; affordance of margin; 'making the boundaries visible'

Rasmussen's later 'Risk Management in a Dynamic Society' (1997) framed operation as movement inside a space bounded by an economic-failure boundary, a workload boundary, and a 'boundary of functionally acceptable performance' (the accident edge). Systems drift toward the accident boundary under cost/effort gradients. An EID display ideally shows the operating point relative to these margins, making 'safe envelope' and 'distance to the edge' directly perceptible — turning safety from a hidden property into a visible spatial relation.

**Failure mode:** Drift to danger: when margins are invisible, local optimizations (faster, cheaper, less effort) silently erode the gap to the accident boundary until a small perturbation crosses it. An interface that shows only the current value, with no representation of the boundary or the trajectory toward it, gives the operator no perceptual warning of this migration.

## Validate EID empirically by testing performance specifically on UNANTICIPATED / unfamiliar fault scenarios against conventional (single-sensor / mimic) displays, using controlled microworlds — because EID's claimed advantage is precisely in the novel cases, not the routine ones.

**Term of art:** DURESS microworld; P vs P+F displays (physical vs physical+functional); 'unanticipated fault' paradigm; representative design (Brunswik) in experiments

Vicente's DURESS (DUal REservoir System Simulation) thermal-hydraulic microworld is the canonical testbed. The signature experimental result: EID and conventional 'P' (physical) displays perform similarly on normal/anticipated faults, but EID (the 'P+F', physical-plus-functional, display) shows a marked advantage on UNANTICIPATED faults, where the functional-level view lets operators diagnose problems no procedure covered. This is how the field earns the claim that means-ends displays uniquely support the novel event.

**Failure mode:** Evaluating an interface only on normal-operations usability or anticipated faults — where EID and conventional displays look equivalent — and wrongly concluding the functional-level investment isn't worth it, then getting bitten by the rare unanticipated event the functional view would have caught.

## Apply EID well beyond its nuclear/process-control birthplace — aviation, medicine/anaesthesia, network/cyber operations, military command-and-control, finance — by first asking whether the domain is 'correspondence-driven' (governed by physical laws, ideal for WDA) or 'intention-driven' (governed by social/regulatory constraints, needing more emphasis on the social-organizational and activity phases of CWA).

**Term of art:** correspondence-driven vs intention-driven domains; causal vs intentional constraints; generalizing CWA; EID in 'soft' domains

Burns & Hajdukiewicz's 'Ecological Interface Design' (2004) and later work generalized the method. A key practical distinction: in causal/physical domains (a reactor) the Abstract Function level is the conservation laws and WDA carries most of the load; in 'intentional' or social domains (a hospital ward, a command center, a trading desk) the constraints are partly conventions, policies, and goals, so the analyst leans harder on Control-Task, Strategies, and Social-Organizational analyses. Examples: Effken's hemodynamic displays, EID for anaesthesia monitoring, EID for computer-network defense.

**Failure mode:** Mechanically transplanting reactor-style configural displays into an intentional domain where the 'laws' are actually negotiable policies — producing a display that reifies one contested interpretation of the goals as if it were physics, and hides the very value-tradeoffs the human is there to adjudicate.

## Distinguish DATA from INFORMATION as a first design commitment: information is the meaningful relation between data and the goals/constraints of the domain, so the designer's job is to display higher-order RELATIONS (ratios, balances, margins, trends-relative-to-limits), not to pump raw measured variables to the screen.

**Term of art:** data overload; the data-information distinction; higher-order variables / derived variables; 'representation aiding'; Woods' 'finding the meaning in the data'

A throughline from Rasmussen through Woods' 'data overload' work: more data does not equal more information, and a system that perceives more (more sensors, more channels) makes the human's overload WORSE unless the interface transforms data into goal-relevant relations. EID answers by displaying derived, higher-order variables (the mass balance, the efficiency ratio, the distance-to-limit) that directly carry functional meaning, so one perceptual act conveys what would otherwise require integrating many readings.

**Failure mode:** The keyhole effect / data overload: a vast perceptive system feeding a small viewport of raw values, forcing the human to serially sample and mentally integrate — the exact condition that collapses performance to slow KB reasoning and causes critical relations (the thing that's actually wrong) to be missed in the flood.

## What this field knows
This field's core, hard-won conviction is that the interface must show the DEEP STRUCTURE of the work domain — its goals, physical/functional constraints, and means-ends relationships — not the surface state of a system. Rasmussen's foundational insight: humans operate at three cognitive levels (skills, rules, knowledge), and the catastrophic failures happen when an operator is forced down to slow, effortful KNOWLEDGE-based reasoning during a crisis because the interface only showed raw data, not the relationships that data implies. EID's answer is to externalize the problem-solving — to make the constraints of the domain directly perceptible so the human can offload reasoning onto perception and action (skill/rule level), and only invoke deliberate problem-solving when the situation is genuinely novel. Crucially, this field rejects the idea that "what rises to attention" should be decided by alarm thresholds or task lists. Instead it builds a model of the ENTIRE work domain (the Abstraction Hierarchy) and displays the whole means-ends field, so the human can SEE where in the space of possibility the system currently sits — including states no designer anticipated. The field knows, from nuclear/aviation/medicine, that the deadliest failure mode is an interface optimized for normal operations that becomes a trap during the unanticipated event. It is fundamentally a field about partnership with a more-perceptive system: the automation/sensors perceive vast detail; the interface's job is to render the FUNCTIONAL MEANING of that detail at the right level of abstraction so a human can act through it with judgment — and stay in the loop rather than being a passive monitor who is "out of the loop" when intervention is suddenly needed.
