# Anomaly detection and statistical process control (Shewhart/control charts)

> Mined 21090 tok · salvaged from killed run wf_bcf74bab-7ae (Scout→Mine).

## The control chart itself: plot a metric over time with a center line (process mean) and Upper/Lower Control Limits (UCL/LCL) drawn at +/- 3 sigma of the process's OWN variation (NOT spec limits, NOT targets). A point inside the limits = stay silent, do nothing. A point outside = the process has likely changed; raise it. The chart is a perception-filter that renders the question 'is this worth acting on?' as a visual yes/no.

**Term of art:** Shewhart control chart; center line (CL); Upper/Lower Control Limits (UCL/LCL); 3-sigma limits; voice of the process vs. voice of the customer

The 3-sigma limits are derived empirically from the process's natural variability during a stable baseline period, so 'normal' is defined by the system's own behavior, not by an external wish. Roughly 99.7% of points from a stable process fall inside, so a point outside is improbable-enough-to-investigate. The center line and limits are the system's learned model of 'what normal looks like here'; the human is only pulled in when reality violates that model.

**Failure mode:** Confusing CONTROL limits (what the process does) with SPECIFICATION limits (what you want it to do) — the single most common error; it makes the chart either scream constantly or go silent when it shouldn't. Also: computing limits from too few points, or from a period that already contained special causes, bakes the abnormal into 'normal.'

## Common-cause vs. special-cause as the master filter. Before anything rises, the system must classify the variation: is this the inherent jitter of a stable process (leave the human alone) or evidence the process itself shifted (interrupt)? This is THE decision about what deserves attention.

**Term of art:** Common-cause (chance/unassignable) variation; special-cause (assignable) variation; 'in statistical control' = stable & predictable, NOT 'good'

Common cause = many small, ever-present, unassignable influences that produce a stable, predictable distribution. Special cause = a specific, assignable, often newly-introduced influence (a changed input, a broken step) that the data can localize in time. The whole point is to NOT treat noise as signal. Deming estimated ~94% of problems are common-cause (system-level, not visible as any single event), which is exactly why event-by-event human attention is the wrong default.

**Failure mode:** Two symmetric errors named by Deming: (Mistake 1) reacting to common-cause as if it were special — i.e., tampering; (Mistake 2) ignoring special-cause as if it were common — missing a real signal. Both are guaranteed losses; the discipline exists to minimize their combined cost.

## Tampering / the Funnel Experiment: a demonstration that reacting to every fluctuation makes results WORSE. Deming's funnel: try to hit a target by adjusting after each (random) miss, and the variance grows vs. leaving the funnel fixed. Directly relevant to an interface: surfacing every blip and inviting the human to respond is not neutral — it degrades the outcome.

**Term of art:** Tampering / over-adjustment; Deming's funnel rules (Rule 1 = leave alone; Rules 2-4 = escalating overcorrection that increases variance); over-control

When you adjust a stable system in response to common-cause noise, your correction becomes a new source of variation that compounds with the next random deviation. The math (random walk) shows variance increasing without bound under naive 'correct-to-target' rules. The lesson institutionalized: do not act unless the chart signals; restraint is an active, correct decision, not passivity.

**Failure mode:** Operator (or executive) feels pressure to 'do something' about every downtick, retunes constantly, and induces oscillation/instability — the human's own well-intentioned responsiveness is the damage. An interface that rewards reaction to noise manufactures tampering.

## Sensitizing rules / runs rules (Western Electric Rules, Nelson Rules): a layered set of pattern tests beyond the single 'outside 3-sigma' rule, so the chart can detect not just big jumps but subtle, sustained drifts and non-random structure — and tell the human WHICH kind of abnormality it is.

**Term of art:** Western Electric Rules (WECO); Nelson Rules; runs/zone tests; Zones A/B/C; run, trend, shift, cycle, stratification, mixture patterns

Zones A/B/C are marked at 1, 2, 3 sigma on each side. Rules fire on patterns like: 1 point beyond 3 sigma; 2 of 3 points beyond 2 sigma (same side); 4 of 5 beyond 1 sigma; 8+ consecutive points on one side of the center line (a shift); 6 points steadily increasing/decreasing (a trend); 14 alternating up/down (overcontrol/sawtooth); 15 in a row within 1 sigma (stratification/too-good-to-be-true). Each pattern has a distinct diagnostic meaning, so the alert carries a hypothesis about cause, not just 'anomaly.'

**Failure mode:** Rule proliferation inflates the false-alarm rate: each added rule lowers the effective threshold, so stacking all eight rules can drop the in-control run length to ~90-100 points (frequent false alarms). Practitioners deliberately choose a SUBSET of rules to balance sensitivity vs. nuisance trips — a direct analog of tuning what's allowed to interrupt.

## Average Run Length (ARL) as the explicit design currency for interruption frequency. ARL0 = expected number of samples between FALSE alarms when the process is fine (you want this LARGE — rare needless interruptions). ARL1 = expected samples to DETECT a real shift of a given size (you want this SMALL — fast true detection). Charts are engineered to a chosen ARL, not left to chance.

**Term of art:** Average Run Length (ARL); ARL0 (in-control, false-alarm spacing) vs. ARL1 (out-of-control, detection speed); Type I (alpha, false alarm) vs. Type II (beta, missed detection); power

ARL turns 'how often should we bother the human?' into a number you solve for. A standard 3-sigma Shewhart chart has ARL0 ~ 370 (a false alarm roughly every 370 in-control samples). Designers trade ARL0 against ARL1: tighten limits to detect shifts faster (lower ARL1) and you necessarily get more false alarms (lower ARL0), and vice versa. The interface analog: the interrupt threshold is a dial with a quantified cost on each side, set deliberately for the decision's stakes.

**Failure mode:** Optimizing one number in isolation — e.g., demanding fast detection (low ARL1) without accounting for the resulting flood of false alarms (low ARL0). The ARL is also an AVERAGE of a skewed (geometric) distribution, so 'expected 370' hides that early false alarms are common; naive interpretation overstates how quiet the chart will be.

## Matching the detector to the shift you care about: Shewhart charts for LARGE sudden shifts (>=1.5-2 sigma), CUSUM and EWMA for SMALL persistent drifts. The choice encodes a judgment about which kind of change is worth a human's attention and how fast.

**Term of art:** CUSUM (cumulative sum), V-mask, decision interval h, reference value k; EWMA (exponentially weighted moving average), smoothing constant lambda; 'memory' charts vs. memoryless Shewhart

Shewhart looks only at the latest point, so it's fast on big jumps but blind to slow creep. CUSUM (cumulative sum) accumulates deviations from target so a small but sustained bias builds up and trips a threshold (the V-mask / decision interval) quickly — it has memory. EWMA (exponentially weighted moving average) smooths recent points with a decay factor lambda; small lambda = long memory, sensitive to tiny drifts; lambda near 1 collapses back toward Shewhart. You pick the detector by the size/speed of deviation that actually matters operationally.

**Failure mode:** Using a memoryless Shewhart chart to catch slow drift (it won't, until the drift is large and damage is done), or conversely using a twitchy small-shift detector where only big breaks matter (needless alarms). CUSUM/EWMA can also be slow to react to a LARGE sudden shift because their averaging dilutes it — wrong tool, missed big event.

## Rational subgrouping: deliberately structuring HOW data is sampled and grouped so that within-group variation captures only common-cause noise, making between-group differences a clean signal. The act of deciding what to compare against what is itself a design decision about detectability.

**Term of art:** Rational subgroup; within-subgroup vs. between-subgroup variation; subgroup size n and sampling frequency; X-bar & R / X-bar & S charts

You form subgroups so that special causes you care about would show up as differences BETWEEN subgroups, not be hidden inside them (e.g., sample 5 consecutive units, not 5 units spread across a shift change). The within-subgroup spread becomes the yardstick (sigma estimate) for the control limits. Get the grouping right and the chart is sensitive to the right things; get it wrong and real shifts are masked or phantom ones appear.

**Failure mode:** Irrational subgrouping — grouping across known sources of variation (different machines, shifts, operators) inflates within-group sigma, widening control limits until the chart can no longer see real differences (it goes quiet when it shouldn't). The structure of attention is corrupted at the sampling layer, before any analysis.

## Out-of-Control Action Plan (OCAP): a pre-written, standing decision tree that specifies EXACTLY what the human/operator does when a given chart signal fires — the joint action is agreed in advance, not improvised at alarm time. Detection is bound to response.

**Term of art:** Out-of-Control Action Plan (OCAP); reaction plan; assignable-cause investigation; corrective action log; 'react to the signal, not the point'

An OCAP is a flowchart keyed to specific out-of-control signals: 'IF rule 2 trips on the temperature chart THEN check X, adjust Y, if not resolved escalate to Z, and log the assignable cause.' It converts an alert into a rehearsed loop the human and system close TOGETHER: the system detects and frames; the human diagnoses and acts along a known path; the outcome is recorded to improve the model. This is the field's answer to 'for what joint action.'

**Failure mode:** Charts maintained with no OCAP ('wallpaper charts' / 'charting for the auditor') — signals fire and nothing happens, or each operator reacts differently, so the detection apparatus produces no action and decays into ignored decoration. Detection without a pre-agreed response is theater.

## Establish stability BEFORE judging capability/quality (Phase I vs. Phase II). Phase I: retrospectively study a baseline to learn the process's true common-cause variation and remove special causes, setting trustworthy limits. Phase II: monitor new data live against those frozen limits to detect change. You cannot meaningfully alarm until you've learned 'normal.'

**Term of art:** Phase I (retrospective, limit-setting) vs. Phase II (prospective, monitoring); baseline period; process capability indices Cp/Cpk; 'stable then capable'

In Phase I you iterate: plot history, find/explain out-of-control points, remove assignable causes, recompute limits until the baseline is stable — this is the system learning its own noise floor. Only then (Phase II) are the limits a valid reference for real-time interruption. A process must be IN CONTROL (predictable) before its capability (Cp/Cpk: does it meet spec?) is even a meaningful question.

**Failure mode:** Computing capability or trusting alarms on an out-of-control (unstable) process — the numbers are meaningless because there's no single distribution to describe. Equally: never re-baselining after a legitimate process change, so the chart fights a new reality and floods the human with stale 'alarms' that are actually the new normal.

## Attribute vs. variables charts, and rare-event handling — choosing the representation to fit what's being measured (continuous magnitudes vs. counts/proportions of events) so the alarm logic stays statistically valid, especially for very rare events.

**Term of art:** Variables charts (X-bar/R, I-MR); attribute charts (p, np, c, u); time-between-events / g-chart / t-chart; binomial vs. Poisson basis; overdispersion

Variables data (continuous: time, dollars, latency) use X-bar/R, I-MR charts. Attribute/count data (defectives, incidents) use p/np charts (proportion/number nonconforming, binomial) and c/u charts (count of events, Poisson). For VERY rare events, counting per-period yields mostly zeros and useless limits, so the field switches to charting the TIME (or units) BETWEEN events (g-chart / t-chart / time-between-events) — a representational change so rare but important events still produce a usable signal.

**Failure mode:** Forcing count data into a normal-theory chart, or charting rare-event RATES per period (long runs of zeros punctuated by spikes that falsely look out-of-control). Overdispersion (more variation than the assumed model) makes limits too tight and triggers chronic false alarms — the model's assumption mismatch becomes a nuisance-alarm generator.

## Multivariate monitoring and contribution decomposition: when many correlated signals stream at once, monitor them JOINTLY (one statistic) and, on alarm, decompose to point the human at WHICH variables drove it — surfacing a single prioritized signal rather than N separate charts the human must mentally correlate.

**Term of art:** Hotelling's T-squared; multivariate SPC (MSPC); contribution plots; MYT decomposition; PCA/PLS-based monitoring; SPE/Q-statistic (squared prediction error)

Hotelling's T-squared collapses many correlated metrics into one distance-from-normal score with a single control limit, catching anomalies that no individual variable would flag (an unusual COMBINATION). When it alarms, contribution plots / MYT decomposition attribute the T-squared value back to the responsible variables, handing the human a ranked 'these moved together, abnormally' diagnosis. Used heavily in multivariate SPC and batch-process monitoring (often with PCA to reduce dimensions first).

**Failure mode:** Watching dozens of univariate charts independently — you miss correlation-breaking anomalies and simultaneously drown in alarms from naturally correlated variables all tripping at once. And a T-squared alarm WITHOUT contribution analysis tells the human 'something is wrong somewhere,' which is an unactionable interruption.

## Alarm management doctrine (ISA-18.2 / EEMUA-191, from process-control rooms): an entire engineering discipline devoted to NOT overwhelming the human operator with alarms — rationalization, prioritization, suppression of nuisance/chattering alarms, and keeping alarm rate within human cognitive limits. This is the field's direct, lived theory of protecting scarce human attention.

**Term of art:** ISA-18.2 / EEMUA-191; alarm rationalization; nuisance/chattering/stale/fleeting alarms; deadband & hysteresis; shelving & suppression; alarm flood; priority distribution (the 80/15/5 guide); 'every alarm requires a defined operator response'

Alarms are rationalized (each must have a defined operator response or it shouldn't be an alarm), prioritized by consequence severity and time-to-respond, and engineered against known pathologies: deadbands/hysteresis stop a signal hovering at threshold from chattering; ON/OFF delays filter transients; shelving lets an operator temporarily silence a known nuisance; state-based suppression hides alarms irrelevant to the current mode; flood suppression collapses alarm storms. Benchmarks: a target of <=1 alarm per operator per ~10 minutes in steady state, and explicit limits on alarm-flood conditions.

**Failure mode:** Alarm flood (operators get hundreds/thousands of alarms in an upset and cannot triage — a documented contributor to industrial disasters like Texaco Milford Haven), and alarm fatigue (so many low-value alarms that operators silence/ignore them, missing the real one). The core failure is treating every detectable condition as worth an interrupt — exactly the trap the interface must avoid.

## Limits as a TUNABLE economic decision (Taguchi loss + cost-of-errors framing): where to set the alarm threshold is chosen by weighing the cost of false alarms (investigation, lost time, eroded trust) against the cost of missed/late detection (defects, harm). The boundary of 'what rises' is an explicit business choice, revisited as costs change.

**Term of art:** 3-sigma as economic compromise; cost of Type I vs. Type II error; Taguchi loss function; warning limits (2-sigma) vs. action limits (3-sigma); modified/widened limits for capable processes

3-sigma is a famous default Shewhart chose as an economic compromise (rare false alarms while still catching meaningful shifts), not a statistical mandate — you can widen limits (fewer interruptions, more misses) or tighten them (faster catches, more false alarms) deliberately. Taguchi's loss function reframes 'in/out of spec' as a continuous cost that grows with distance from target, sharpening the case for acting on drift early vs. waiting for a hard breach. The threshold is owned, justified, and adjusted, not inherited blindly.

**Failure mode:** Treating 3-sigma (or any threshold) as sacred and never tuning it to the actual stakes — so a high-consequence process under-alarms while a low-stakes one over-alarms. Or tightening limits purely to 'catch more' without owning the false-alarm cost, which quietly reintroduces alarm fatigue and tampering.

## What this field knows
This field's core competence is a hard-won, formalized answer to the exact question the interface faces: out of a continuous flood of signals, WHICH deviations deserve a human's scarce attention, and which are just noise the system should absorb silently. Its foundational insight (Shewhart, Bell Labs, 1920s) is the distinction between COMMON-CAUSE variation (the inherent, expected jitter of a stable process — never worth interrupting a human over) and SPECIAL-CAUSE variation (a genuine signal that the system has changed — worth acting on). The field's deepest doctrine is that BOTH error types are costly and must be traded off explicitly: a false alarm (Type I) that interrupts the human needlessly trains them to ignore the system (alarm fatigue), while a missed detection (Type II) lets real harm propagate. Crucially, the field insists the human must NOT react to every data point — "tampering" (Deming's funnel experiment) proves that responding to common-cause noise actively makes outcomes WORSE than doing nothing. So the interface's job is not to show everything; it is to stay SILENT through normal variation and to raise a signal only when statistically warranted — and when it does raise one, to hand the human a pre-structured diagnostic frame (which rule tripped, where, since when, what pattern) that points toward a cause and a decision, not just a number. The field also knows that the threshold for interruption is a TUNABLE economic choice, not a law of nature, and that detection logic should be matched to the SIZE and SPEED of the shift you care about (small persistent drifts vs. large sudden jumps need different detectors). Finally, it knows that all of this is meaningless unless the alarm connects to a standing, rehearsed response protocol (OCAP) — detection without a pre-agreed joint action is theater.
