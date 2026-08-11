# Naturalistic decision making and Klein's Recognition-Primed Decision
> Mined via open-learning re-run (Sonnet).

## Recognition-Primed Decision (RPD) Model
**Term of art:** RPD / situation assessment
The RPD model describes how experienced decision-makers in the field rarely compare options. Instead, they recognize a situation as belonging to a type, which automatically surfaces a plausible course of action. The decision-maker then mentally simulates that action forward — running it through the situation model — to check for show-stoppers. If the action survives simulation, it is executed; if not, the next plausible action is retrieved and tested. The key mechanism is pattern recognition firing before deliberation begins, with deliberation serving only to vet, not to generate.
**Failure mode:** Breaks when the situation is genuinely novel and shares surface features with a familiar type — the pattern fires confidently on the wrong recognition. The guard it provides is against analysis paralysis in time-pressure; its vulnerability is confident misclassification.

## Sensemaking and the Data-Frame Model
**Term of art:** data-frame model (Klein, Phillips, Rall, Peluso)
Experts do not accumulate data until a picture emerges; they impose a frame (a story about what is happening) and then use data to elaborate or challenge it. The frame determines what counts as relevant signal and what is ignored. When anomalies accumulate beyond a threshold the expert cannot absorb into the current frame, they re-frame — a cognitively expensive jump that resets which data matters. The interface implication: the frame is the unit of communication, not the individual data point.
**Failure mode:** Frame fixation — the expert continues elaborating a wrong frame because each new datum is bent to fit it rather than triggering re-frame. Classic example: cockpit crews sustaining an incorrect diagnosis of the wrong engine failure until impact.

## Common Ground and Grounding Acts
**Term of art:** common ground (Clark & Brennan, adopted into NDM)
Collaborative decision-making requires both parties to maintain a shared representation of the situation — not just individual mental models, but mutual knowledge of what each party knows. Grounding acts are the specific conversational moves (confirmation, repair, readback) that update and verify common ground. In high-tempo domains this is ritualized: aviation readbacks, surgical count calls, military authentication sequences. The system's role is not just to transmit information but to verify that the human's model matches the system's model.
**Failure mode:** Phantom common ground — each party believes they share an understanding that in fact diverged. The ritual becomes rote and confirmation is given without genuine comprehension check (the readback given without the pilot actually re-checking the altimeter).

## Cognitive Work Analysis and Abstraction-Decomposition Space
**Term of art:** Abstraction-decomposition space (Rasmussen / Vicente)
Cognitive Work Analysis decomposes a domain along two axes: abstraction level (from physical form up through functional purpose, abstract function, generalized function, and work domain purpose) and decomposition level (whole system down to components). A well-designed decision support interface presents information at the abstraction level appropriate to the decision being made — not raw sensor data when the operator needs to reason about plant safety, not high-level summaries when diagnosing a specific valve. The artifact produced is an Ecological Interface Design that makes constraints and affordances visible at the right level.
**Failure mode:** Level mismatch — the display forces the operator to mentally translate between abstraction levels under time pressure, burning cognitive resources and creating translation errors. Common in alarm-rich control rooms where the operator sees hundreds of low-level alerts but must reason at the level of system integrity.

## Pre-Mortem and Mental Simulation
**Term of art:** Pre-mortem / prospective hindsight
Before a plan is executed, the team is asked to assume it has already failed — the future is narrated in the past tense — and to generate the most plausible failure story. This exploits the asymmetry that humans are far better at explaining something that already happened than at predicting future failure modes. The mechanism is prospective hindsight: imagining the failure as a fait accompli unlocks retrieval of causal chains that forward-looking risk assessment misses. Klein's version is explicitly a team ritual rather than a solo analysis.
**Failure mode:** Becomes a compliance exercise when the team treats it as a box-check rather than genuine imagination. Particularly breaks when hierarchy suppresses the voicing of the failure stories that would be most politically uncomfortable.

## Situation Awareness and Level 3 SA
**Term of art:** Situation awareness levels 1-2-3 (Endsley)
Endsley's model divides situation awareness into: Level 1 — perception of elements (I see the data), Level 2 — comprehension of their meaning in context (I understand what it means), Level 3 — projection of future states (I can anticipate what will happen next). Skilled operators spend minimal time at Level 1 because their displays are designed to deliver Level 2 directly; their competitive advantage is Level 3 projection. The implication for human-system interfaces is that a display surfacing only Level 1 data forces the human to do all the comprehension and projection work internally.
**Failure mode:** Level 1 overload — the system surfaces vast quantities of raw data under the assumption that more information is better. The operator is crushed by Level 1 work and never reaches Level 3, which is precisely where their judgment would add value.

## Critiquing Systems and Human-on-the-Loop
**Term of art:** Critiquing / human-on-the-loop
Rather than presenting information passively, a critiquing system monitors the human's current plan or action trajectory and actively flags when the plan diverges from what the system's model predicts is safe or effective. The human remains the actor; the system acts as a trained colleague who speaks up when they see a problem. The human must be able to override the critique, and the system must be transparent about why it flagged. HELP (Helping to Evaluate the Logical Process) systems in anesthesia are an early domain example; fly-by-wire envelope protection is another.
**Failure mode:** Automation complacency — the human delegates monitoring to the critiquing system and disengages from the situation model. When the system fails to flag an anomaly the human catches nothing because they stopped watching. Also: alert fatigue when the critique rate is high enough that operators dismiss flags as noise.

## Naturalistic Decision Support and the Commander's Intent
**Term of art:** Commander's intent (military NDM)
In military command, the commander does not specify every subordinate action but instead communicates the purpose of the mission (the "why" two levels up) and the desired end state, leaving method to the subordinate who has local situational awareness the commander lacks. This decouples decision authority from information: the person with the richest perception of local conditions is authorized to act, within the intent-bounded space. The artifact is the OPORD's intent paragraph, a tightly constrained natural-language statement of purpose and end state.
**Failure mode:** Intent drift — subordinates interpret intent too narrowly (waiting for permission the commander assumed they had) or too broadly (departing from the mission entirely). Also breaks when the situation changes so dramatically that the stated intent no longer applies to the new reality and no one flags it.

## What this field knows
NDM's core insight is that expertise lives in perception, not computation: the expert's advantage is seeing the right situation type instantly, not deliberating longer. This reframes the interface problem — the bottleneck is not the human's processing speed but their ability to recognize which situation they are in and to project it forward. The field uniquely understands that a system surfacing more data is often counterproductive; what closes the loop is a system that delivers at the comprehension and projection level, critiques rather than reports, and keeps common ground actively verified rather than assumed. The cost of mismatched abstraction levels and phantom common ground in high-stakes environments has been documented in disaster investigations across aviation, nuclear, and emergency medicine — making NDM one of the few fields with hard empirical grounding on exactly what breaks when system perception and human judgment are poorly coupled.
