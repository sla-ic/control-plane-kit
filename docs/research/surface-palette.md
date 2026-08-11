# Surface palette — cross-field reduce

42 fields, ~250 Design DNA bullets, reduced to 12 cross-cutting surface principles for amp-tasks (port 3737).

This is the surface vocabulary that emerged when every field was on the table at once. The principles below all show up in at least four independent control-room traditions; the strongest show up in fifteen or more. Each one is stated as a commitment the amp-tasks dashboard must keep.

---

## 1. The rise is a decision, not an event

**Claim:** Across every mature control room, the unit of human attention is the smallest object that contains a decision — not a notification, not a log row, not a feed entry. SOC analysts work *cases*, not events. Air defense works *tracks*, not radar returns. Submarine sonar promotes signals into *contacts* with stable identities. The Red Box delivers a *submission* with a tick-box, not an inbox. Mission Control's Flight Director receives a *Go/No-Go poll*, not raw telemetry. The system that violates this principle force-translates raw signal into decisions inside the human's head, on the human's clock, every time.

**Drawn from:** Cybersecurity SOC/SIEM Triage, Naval CIC Doctrine, Submarine Sonar, Air Defense (SAGE/GCI), Air Traffic Control, Mission Control / NASA Flight Director, Newsroom (slug + budget), Diplomatic Dispatch / PDB, Personal Assistant / Chief of Staff, Wartime Command Map Rooms (Lagevortrag), Theater Stage Management (cue label), Sentinel Standing Orders.

**Implication for amp-tasks:** the queue's primitive is a Project Track — a stable, named, persistent object with current state, current decision-class (your_move / blocker / status_synthesis / health), recommended next move, and provenance. Raw Slack messages, Jira events, Gmail threads, and Drive changes are never queue rows; they're attached to a Track or they get spiked. New signal lands *inside* an existing Track or explicitly creates a new one — never as a free-floating row.

**Failure mode:** without Track-promotion the dashboard collapses into a unified-inbox clone and the human becomes the synthesis layer the system was built to replace.

---

## 2. Quiet by default; silence is the success condition

**Claim:** Mature control rooms produce *no* surface output when the system is healthy. Nuclear's dark-board doctrine: a correctly-running plant shows no illuminated annunciators. Shewhart says ~94% of variation is common-cause and must be absorbed silently. ICU alarm-management's Boston Medical Center result cut audible alarms ~89% by retuning a handful of defaults. The trading desk's pre-trade limits *reject at the gateway* — the human never sees the routine pass. Sheepdog handling: "interrupting a dog running well is the named failure." The default posture is silence, not summarization; surfacing is a deliberate withdrawal from a finite trust account.

**Drawn from:** Nuclear Control Room (dark-board), Anomaly Detection / SPC (Shewhart), ICU Alarm Management, Aviation CRM (alert inhibit), Industrial Process Control (ISA-18.2), Algedonic / VSM, Financial Trading Desk (pre-trade limits), Sheepdog & Falconry, Calm Technology, Cybersecurity SOC, Air Traffic Control (nuisance-alert budget), Naval CIC (suppression), Notification Science (DND).

**Implication for amp-tasks:** the steady-state dashboard at port 3737 shows an empty queue, a single peripheral health-color, and nothing else. Each surfacing rule has an owner, a rationale, and a budgeted interruption rate that the dashboard tracks and exposes. Adding a rise rule requires removing one or justifying the increase against the budget. The agent's first job is silent prevention; surfacing is what it does when prevention is no longer possible.

**Failure mode:** alert fatigue is the cardinal cross-field failure mode. Once trust drains, the real signal closes with the same reflex as the noise.

---

## 3. Synthesis-first, evidence-on-pull

**Claim:** What rises is meaning, not data. BLUF in intelligence tradecraft. Inverted-pyramid newsroom copy. ECAM presents the *procedure*, not the fault. The Red Box submission leads with the recommendation. Mission Control's Go/No-Go is a one-syllable synthesized verdict, not a data dump. Naturalistic Decision Making (Klein): Situation Awareness Level 2 (comprehension) and Level 3 (projection) are what experts *use*; Level 1 (raw perception) is what the agent layer must absorb. Auftragstaktik's Lagevortrag: "what changed, what it means, what decision is now required" — never status recital. The same pattern repeats: the human's act is to ratify, amend, or reject a recommendation, not to author one from raw signal.

**Drawn from:** Intelligence Analysis (BLUF), Diplomatic Dispatch (submission), Aviation CRM (ECAM/EICAS), Mission Control (Go/No-Go), Personal Assistant (decision memo), Naturalistic Decision Making (SA L2/L3), Wartime Command (Lagevortrag), Newsroom (the lede), Cybersecurity SOC (enrichment), ICU Alarm Management (NEWS2), Industrial Process Control (action-bound alarms).

**Implication for amp-tasks:** every queue tile is judgment-first — one line that names the recommended action ("decline this meeting", "approve PR #4711 before EOD", "draft reply to DK"). Evidence chain (the Slack threads, Jira tickets, Gmail messages that produced the read) is collapsed beneath and pulled only on demand. The dashboard refuses to forward any escalation that arrives without a structured ask in the first line — agent-generated items missing a recommendation are bounced back to the agent layer, not queued.

**Failure mode:** when synthesis is shallow the human re-derives meaning under load and the dashboard becomes a slower version of raw Slack.

---

## 4. Tiers are time-to-act, not data importance

**Claim:** Across aviation, ICU, industrial process control, financial trading, emergency dispatch, ICS, and intelligence warning, severity tiers encode *what the human must do, how fast* — never how interesting the underlying data is. Aviation's Warning/Caution/Advisory is keyed to required action and time-to-act. IEC 60601-1-8 priority is a melody encoding tempo. ISA-18.2's Critical/High/Medium/Low is a response-window ladder. EMD's Alpha→Echo determinant compresses urgency, resource recipe, and hot/cold mode into one token. Trading's soft → hard → auto-liquidate → kill-switch ladder names a different owner per rung. The "very important subsystem that produces only an advisory because nothing needs doing" is the load-bearing pattern.

**Drawn from:** Aviation CRM, ICU Alarm Management (IEC 60601-1-8), Industrial Process Control (ISA-18.2), Financial Trading Desk, Emergency Dispatch (EMD), Intelligence Warning (DEFCON/WATCHCON), Triage (Manchester time-bounds), Notification Science (SEV/P-tiers), Naval CIC, Cybersecurity SOC (L1/L2/L3), Ship's Bridge Watchkeeping, Sentinel Standing Orders.

**Implication for amp-tasks:** the four queue classes — your_move, blocker, status_synthesis, health — are time-to-act bins, each with a written response-window SLA and a joint action attached. Tier inflation is audited: when more than ~20% of items sit in the top tier, the system flags it as drift and forces a re-rationalization pass. A "very important project that's quiet" produces a status_synthesis tile, never a your_move tile, because the answer to "what does Jordan do in the next hour" is nothing.

**Failure mode:** when every project is high-priority, the loudest tone becomes background.

---

## 5. The standing contract is written when calm

**Claim:** Pre-commitment is universal. Indicator & Warning lists are pre-authored in calm conditions. NASA Flight Rules are written before the mission. ROE is fixed before contact. ATC's CPDLC trajectories are pre-loaded intent. Pronovost's stopping rule was authority pre-granted to nurses. The OCAP playbook ships with every SPC detector. The Master's Standing Orders pre-authorize the OOW's call. Sentinel general orders are memorized verbatim. Auftragstaktik's commander's intent is the durable artifact that survives the death of the specific plan. The mid-event human runs *against* a contract authored by the calm earlier self; the contract converts a generative interpretive problem into a bounded matching problem.

**Drawn from:** Intelligence Analysis (I&W), Mission Control (Flight Rules), Naval CIC (ROE), Air Traffic Control (CPDLC), Pronovost Checklists, Anomaly Detection (OCAP), Ship's Bridge (Standing Orders), Sentinel (general orders), Wartime Command (Commander's Intent), Industrial Process Control (rationalization), ICU Alarm (default-engineering), Personal Assistant (proxy authority map).

**Implication for amp-tasks:** each project carries a written, versioned standing contract — intent (one line, end state Jordan actually wants), per-project doctrine (auto-archive rules, escalation thresholds, who-pings-whom), and tripwires ("what would have to be true for this to be on fire"). The agent reads and acts against the contract; the dashboard surfaces a tripwire-firing as a first-class event. Contracts are reviewed on cadence so they don't ossify. Jordan never authors response logic at the moment of crisis — he ratifies a contract or invokes a numbered rule.

**Failure mode:** without a written contract, every decision is a fresh judgment under load and the agent layer cannot act without permission.

---

## 6. Two-stage commit: standby, then GO

**Claim:** Consequential acts are split across two beats, with mandatory acknowledgment between them. Aviation's challenge-and-response: one party calls, the other verbally confirms observed state. ATC's "your control / my control" three-way handshake. Bridge watchkeeping's "I have the conn." Theater's "Standby LX 47" / "LX standing by" / "GO." Mission Control's Go/No-Go poll by call sign. EMD's structured radio handoff with read-back. Sentinel relief-of-the-watch. Submarine sonar's contact-designation ritual. In every case, arming and committing are separate signals on separate beats — and the receiver's explicit confirmation is what closes the loop.

**Drawn from:** Aviation CRM (challenge-and-response), Air Traffic Control (positive transfer), Ship's Bridge Watchkeeping (relief), Theater Stage Management (standby/GO), Mission Control (Go/No-Go), Emergency Dispatch (read-back), Sentinel (relief), Submarine Sonar (designation), Maritime VTS (pilot card), Naval CIC, Aircrew Checklists.

**Implication for amp-tasks:** high-stakes commits (sending a reply on Jordan's behalf, declining a meeting with Alex Chen, closing a blocker as resolved) are two-staged in the UI — a pre-attention "standby" tile that requires acknowledged readiness, then a separate commit click. The acknowledgment is captured as a structured event. The commit-verbs (approve, send, ship, archive, close) are a small reserved vocabulary that never appears in advisory or narrative copy at the token level.

**Failure mode:** collapsing standby and GO into one alert forces the human to both notice and act in the same instant — the cue that fires while attention is elsewhere becomes the wrong action.

---

## 7. Ownership is singular, escalation is automatic

**Claim:** Nothing is owned by "the team." Air defense's Weapons Assignment Board: every asset has one controller. ATC: ownership is singular, transferred by acknowledged handshake. ICU escalation: every alarm has a named chain with timeouts. Personal Assistant: every item in the action register has an owner and a deadline. The hebdomadarius rotates: someone is always the named owner this week. NASA call signs: when EECOM says something, it carries domain authority. Sentinel: the general orders define exactly when to call the corporal. Items that broadcast to everyone reach no one — diffusion of responsibility is named as the failure mode in every field.

**Drawn from:** Air Defense (Weapons Board), Air Traffic Control (your/my control), ICU Alarm Management, Personal Assistant (action register), Liturgy (hebdomadarius), Mission Control (call signs), Sentinel (corporal of the guard), Naval CIC (TAO), Maritime VTS (sector handoff), Ship's Bridge, Theater Stage Management (department prefix).

**Implication for amp-tasks:** every queue item carries a single named owner (Jordan, DK, a specific stakeholder, or a specific agent) and a timeout-to-escalate. Items unacted-on past their SLA auto-escalate visually (position promotion, color shift, agent-generated nudge) — and the dashboard's own escalation ladder substitutes for an external on-call peer. No item ever sits in a "shared" state without a tie-breaker rule.

**Failure mode:** alarms that broadcast to everyone reach no one.

---

## 8. The handoff is the artifact

**Claim:** Session boundaries are the highest-risk window in every field. ATC strip-passing externalizes intent. Mission Control's "worries list" passes informal anomalies that are not yet formal issues. Bridge watchkeeping refuses to accept the watch until the brief is complete. Sentinel relief physically walks the post with the outgoing. Sonar turnover passes the *suspicions* nobody yet formalized. Maritime VTS sector handoff is a formal call. SOC tiered triage: L1 writes structured escalations. Industrial process control: logbook countersignature. The system that lets handoffs happen implicitly loses the texture — facts transfer but concern does not.

**Drawn from:** Air Traffic Control (strip-passing), Mission Control (worries list), Ship's Bridge (relief), Sentinel (turnover brief), Submarine Sonar (suspicions), Maritime VTS, Industrial Process Control (logbook), Intelligence I&W (watch turnover), Cybersecurity SOC, Theater Stage Management, Personal Assistant (morning brief), Epidemiological Surveillance (sitrep).

**Implication for amp-tasks:** session-start (Jordan opens port 3737) reconstitutes from a structured handoff artifact: what changed since last session, what's active, what's anomalous, what to keep eyes on, the agent's current "worries list" of soft anomalies not yet escalated. Session-end generates the same artifact for the next session. The artifact is the durable common ground; Jordan's mental model is rebuilt from it, not from "I think I remember."

**Failure mode:** unspoken texture means the incoming party inherits clean-looking state that hides un-passed suspicion — the slow-burn anomaly survives every handoff without action.

---

## 9. Silence is a measured quantity

**Claim:** Absence-of-signal is the most under-read signal in naive systems. Calm Technology's heartbeat: the *break* in rhythm is the alert. Trading desks treat loss of liveness as auto-trigger. Submarine sonar reads "no contact" against the sonar equation — empty water means little in bad acoustic conditions, much in good. Intelligence I&W's "dog that didn't bark" — absence of expected activity catalogued explicitly because surprise hides in absence that naive alerting never catches. EMD: a vessel that misses a reporting point is a ghost track. Wildland fire's seen-area map: "no smoke" in a covered sector is meaningful, in a blind corridor is meaningless. Across the board: silence from a project that should be live reads as alarming; silence from a project legitimately quiet reads as fine.

**Drawn from:** Calm Technology (heartbeat), Financial Trading Desk (dead-man's switch), Submarine Sonar (sonar equation), Intelligence I&W (pattern of life), Naval CIC (expected behavior), Maritime VTS (POSREP miss), Wildland Fire Lookout (seen area), Air Traffic Control, Industrial Process Control, Cybersecurity SOC.

**Implication for amp-tasks:** every project carries a learned baseline cadence (commit frequency, Slack-mention rhythm, ticket-velocity envelope, expected check-in interval). The dashboard rises *absence* of expected activity as a first-class signal — "this project went silent" is a tile, not a non-event. Each project's silence is annotated with its blind-spot map: silence in covered channels is meaningful, silence behind known blind spots (private DMs, vendor portals, executive backchannel) is labeled as such and never read as health.

**Failure mode:** treating "no news is good news" as a default is the most dangerous comfort in every field.

---

## 10. Asymmetric autonomy: trusted to brake, gated to accelerate

**Claim:** Across financial trading, aviation TCAS, industrial safety-instrumented systems, sheepdog handling, and Pronovost's stopping rule, the agent layer is trusted to *halt* without permission but gated to *initiate*. Kill switches, auto-liquidations, alarm inhibits, and the safety-instrumented system fire autonomously because the cost of a runaway is unbounded while the cost of an unnecessary stop is bounded. TCAS overrides the human pilot when its perception is authoritative. The nurse can stop a physician. The sheepdog's stop whistle is the most important command in the vocabulary. The principle is sharper than "automation level": autonomy is *directional* by the irreversibility of the action.

**Drawn from:** Financial Trading Desk (kill switches), Aviation CRM (TCAS RA), Industrial Process Control (SIS), Pronovost Checklists (stopping rule), Sheepdog & Falconry (stop whistle), Theater Stage Management (HOLD), Cybersecurity SOC (auto-quarantine), Joint Cognitive Systems (LOA per stage).

**Implication for amp-tasks:** the agent fleet is empowered to auto-decline obvious meeting conflicts, auto-snooze runaway notification floods, auto-archive stale FYIs, auto-route obvious blockers — these are brake actions, reversible, scoped by blast-radius. Outbound communication, escalations to DK or Alex Chen, and any commitment on Jordan's behalf require explicit confirmation regardless of agent confidence. Confidence does not unlock acceleration; only blast-radius and reversibility do. The dashboard always exposes a single reserved "HOLD" command that pauses all autonomous agent action with a clean resume.

**Failure mode:** an agent layer that hesitates on brakes lets runaway noise consume the human; an agent layer trusted to accelerate consumes the human's authority without ever asking.

---

## 11. Modes are declared and visible

**Claim:** Every mature control room has a mode register that re-writes the meaning of every signal when flipped. Aviation's sterile cockpit (below 10,000 ft, non-essential comms prohibited by law, machine-detectable trigger). Diplomatic crisis-mode reconfiguration (Situation Room standup). Triage's MCI declaration (re-writes thresholds simultaneously for everyone, activates the Expectant category). Naval CIC's manual/semi-auto/auto modes. ICU's alarm-pause with auto-revert. Wartime command's Schwerpunkt (declared point of main effort that subordinates everything else). Notification science's DND with cross-system coherence. The mode is itself the message; the playbook for each mode is pre-agreed in calm conditions; declaration is an explicit act, never inferred.

**Drawn from:** Aviation CRM (sterile cockpit), Diplomatic Dispatch (crisis mode), Triage (MCI declaration), Naval CIC (Aegis modes), ICU Alarm Management (alarm pause), Wartime Command (Schwerpunkt), Notification Science (DND/Focus), Theater Stage Management (tech vs. show), Mission Control (mission phase), Liturgy (Great Silence), Air Traffic Control (exec/planner split).

**Implication for amp-tasks:** the dashboard has a small set of named modes — *deep work*, *triage*, *crisis*, *sabbatical/OOO*, *meeting-heavy* — each with a written pre-agreed playbook for what rises, how often, and which agent autonomy boundaries shift. The active mode is always visible in the chrome and impossible to mistake. Mode flips are deliberate Jordan-acts (or calendar-driven auto-flips with a clear bright line) and are themselves logged. Crisis mode declares a Schwerpunkt — the one project that wins all ties this week.

**Failure mode:** running routine thresholds during overload (failure to declare crisis) or staying in crisis after the surge has passed both corrupt the rationing logic.

---

## 12. The surface is itself an audited artifact

**Claim:** What rises is governed by rules that have owners, rationales, and review cadences. ISA-18.2 alarm rationalization. NUREG-0700 mandates the interface itself pass human-factors review. EMD's QA case review feeds protocol revision. SOC dispositions (TP/FP/BTP) train future surfacing. Independent risk function in trading is structurally separate from the desk. VSM's POSIWID: the filter is a political artifact; audit who controls it. Cybernetic System Three-star sporadic audit channel. SPC: every threshold has an owner and a rationale; treating any default as sacred is how alarm fatigue quietly reasserts itself. The right to interrupt the human is a rationed, defended, audited resource — not a default.

**Drawn from:** Industrial Process Control (ISA-18.2), Nuclear Control Room (NUREG-0700), Emergency Dispatch (QA), Cybersecurity SOC (disposition feedback), Financial Trading Desk (independent risk), Algedonic / VSM (POSIWID, S3*), Anomaly Detection (3-sigma justification), ICU Alarm Management (alarm burden as metric), Sentinel (officer's rounds), Notification Science (rationalization).

**Implication for amp-tasks:** every surfacing rule in amp-tasks is written down, has an owner, a rationale, and a review date. The dashboard exposes its own interruption rate per channel per day as an auditable metric Jordan can pull. Jordan's dispositions on queue items (acted / spiked / deferred) are captured as structured training signal that tunes future surfacing. The interface specification itself is versioned in the SSOT, reviewed on cadence, and changes require justification — not allowed to accrete ad hoc.

**Failure mode:** unreviewed interface growth is the default state in every field; invisible until the upset that needs everything at once.

---

## What this palette refuses

- **No infinite scroll, no unbounded feed.** The Red Box closes. The newsroom budget is one page. The queue at port 3737 is bounded per session; if the cap is hit, the agent layer must triage harder before more rises. Infinite scroll is incompatible with bounded human attention.

- **No notification badges without a decision attached.** A bare count ("17 new") forwards the synthesis problem to the human. Every badge resolves to specific tiles with specific recommended actions or it doesn't exist.

- **No "FYI" notifications outside the digest.** If the answer to "what does Jordan do in the next hour because of this?" is "be aware," it belongs in the morning brief or the EOD digest — never in a push interrupt. Aviation, ICU, SOC, and CRM all converge here.

- **No severity score the human must translate into an action.** Every tier ships with its joint action. A bare "high priority" tag is forbidden — the tier is the action class, not a feeling.

- **No status row that is also an actionable item.** Status_synthesis tiles and your_move tiles are visually and structurally distinct categories; conflating them trains Jordan to dismiss real signal with the same reflex he's built for noise.

- **No command-as-status.** "Agent drafted the reply" and "Jordan sent the reply" are never the same tile. The TMI PORV lesson: status indication reflects actual measured state, never the command issued.

- **No silent autonomy.** Every agent action that affects Jordan's surface is loggable, attributable, and reviewable; the agent's current mode, current goal, and next intended action are continuously legible. Strong-but-silent automation is how the human's mental model diverges into a crash.
