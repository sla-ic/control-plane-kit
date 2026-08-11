# Maritime Vessel Traffic Services (VTS) and harbor pilotage
> Mined via open-learning re-run (Sonnet).

## Mandatory Position Reporting
**Term of art:** POSREP / traffic lane reporting
VTS operators require vessels to make mandatory radio reports at defined waypoints — sector boundaries, fairway entrances, traffic separation scheme crossing points. The vessel declares identity, position, course, speed, and destination. The VTS operator correlates the radio call against the radar plot to confirm the contact is the vessel it claims to be. This fuses two independent perception streams (self-reported and sensor-derived) into a single authoritative track. The human operator does not manage every radar blip; they manage a set of declared, named actors.
**Failure mode:** Breaks when a vessel misses its reporting point and the system has no mechanism to escalate silence — the contact becomes a ghost track, present on radar but unresolved. Guards against: anonymous traffic overwhelming operator attention by forcing actors to identify themselves at consequential moments.

## Sector Handoff Protocol
**Term of art:** Transfer of contact / sector coordination
VTS areas are divided into geographic sectors, each monitored by a dedicated operator console. When a vessel transits a sector boundary, formal transfer of monitoring responsibility occurs between operators via a structured coordination call: the handing-off operator passes identity, last known status, any watch notes, and any pending traffic conflicts. The receiving operator acknowledges and assumes responsibility. Neither operator is tracking everything; the interface between them is the explicit handoff, not continuous shared situational awareness.
**Failure mode:** Breaks when handoff is implicit or skipped under high traffic load — the vessel falls into a seam where neither operator owns it. Guards against: diffusion of responsibility in a system where two humans each believe the other is watching.

## Pilot Boarding and Authority Transfer
**Term of art:** Pilot card / compulsory pilotage
Harbor pilots board vessels at a designated boarding ground outside the port approach. Before the vessel enters confined waters, the pilot receives a standardized briefing document — the pilot card — listing the vessel's draft, air draft, maneuvering characteristics, engine type, bow thruster availability, and any defects. The master of the vessel nominally retains command; the pilot holds navigational conduct. This is a formal role split: the master has vessel knowledge, the pilot has waterway knowledge, and the pilot card is the structured transfer artifact that makes two partial knowers act as one complete one.
**Failure mode:** Breaks when the pilot card is outdated or the master under-declares defects (engine or thruster limitations), leaving the pilot operating on false maneuvering assumptions in a confined channel. Guards against: the expert-in-the-system (pilot) being blind to vessel-specific constraints that only the operator (master) knows.

## Traffic Separation Scheme
**Term of art:** TSS / COLREGS Rule 10
IMO-designated Traffic Separation Schemes divide high-density waterways into inbound and outbound lanes separated by a traffic separation zone. Vessels are required to proceed in the correct lane, enter or leave at the ends of the scheme, cross at right angles if crossing is necessary, and keep to the starboard side of the lane. The scheme off-loads a class of collision-avoidance decisions from individual vessel operators by making the correct action the default spatial arrangement. The VTS operator monitors compliance rather than directing every movement.
**Failure mode:** Breaks when a vessel operates in reduced visibility and the scheme creates false confidence — lanes do not prevent overtaking collisions within a lane. Guards against: the combinatorial explosion of vessel-to-vessel negotiation in a high-density corridor where VTS cannot individually direct every interaction.

## Vessel Traffic Image (VTI) Compilation
**Term of art:** Vessel Traffic Image / recognized maritime picture
The VTS operator synthesizes radar, AIS transponder data, POSREP calls, tide and current data, and weather into a single compiled picture called the Vessel Traffic Image. This is not a raw feed — it is an interpreted, annotated state. Individual contacts are tagged with vessel name, intended destination, and any operational constraints. The VTI is what the operator acts from; it is also what they brief to relieving operators. The image is the human-legible layer over the sensor layer.
**Failure mode:** Breaks when AIS data is spoofed or when a vessel is not AIS-equipped, creating a radar contact with no identity tag — the operator must hold an unresolved contact in working memory, degrading their capacity to act on named, known actors. Guards against: the raw sensor layer presenting more contacts than a human can hold and reason about simultaneously.

## Minimum Under-Keel Clearance Calculation
**Term of art:** UKC / squat allowance
Before a deep-draft vessel enters a tidal or dredged channel, the pilot and VTS together calculate the vessel's minimum under-keel clearance: the difference between the water depth (corrected for tide height at the time of transit) and the vessel's draft, minus a safety margin for squat (hydrodynamic sinkage at speed) and wave allowance. This calculation produces a specific, agreed transit window — a time range and a maximum speed. The system (tidal prediction, chart depth data) perceives the physical constraint; the human (pilot, VTS) translates it into a go/no-go decision with a named time window.
**Failure mode:** Breaks when tide prediction error or a vessel's failure to reduce speed for squat closes the margin silently — the vessel grounds without any alarm because the system reported expected depth, not actual depth under the keel. Guards against: the human operating on nominal rather than dynamic physical parameters in a situation where margins are measured in decimeters.

## VHF Channel Discipline and Working Frequencies
**Term of art:** Guard channel / working channel / channel 16
Maritime radio protocol separates distress and calling (Channel 16, monitored continuously by all vessels and VTS) from working communications (sector-specific channels). VTS assigns vessels to designated working channels upon entry to a sector. This creates a managed attention architecture: Channel 16 is the interrupt channel; working channels are the task channels. The operator monitors multiple channels but with explicit priority ordering. Vessels do not crowd the distress channel with routine coordination.
**Failure mode:** Breaks when a vessel transmits a distress call on a working channel rather than Channel 16 — the call is heard by vessels in one sector but not monitored universally. Guards against: the single-channel overload problem where high-frequency routine traffic masks low-frequency high-urgency signals.

## Pre-Departure and Pre-Arrival Notification
**Term of art:** PANS / ETA notification / berth window
Port authorities and VTS require vessels to submit a pre-arrival notification — typically 24 hours and again 2 hours before arrival — declaring ETA, cargo, draft, any hazardous materials, and crewing. VTS uses these notifications to pre-sequence traffic: assigning pilot boarding times, tug arrangements, and berth windows before the vessel is within radar range. The human decision-maker (port captain, VTS supervisor) acts on a future state that the system has already mapped; the interface surface is the notification schedule, not real-time reaction.
**Failure mode:** Breaks when actual arrival deviates significantly from notified ETA — a vessel running late cascades into a stacked berth queue where every subsequent vessel's window is invalidated, forcing reactive rather than pre-emptive management. Guards against: the port collapsing into pure real-time reaction, which overwhelms the human's ability to coordinate multi-vessel sequences in confined water.

## What this field knows
Maritime VTS understands that human judgment is not a continuous stream but a series of discrete, high-stakes interventions — and the system's job is to make each intervention well-structured and actionable rather than to deliver raw sensor data. The field invented formal role splits (master/pilot, sector operator/coordination operator) precisely because no single human can hold complete situational awareness; partial knowledge is made complete through structured handoff artifacts, not through trying to give one person everything. The deepest insight is that loop closure — the moment a human decision actually changes the physical world — requires the system to have already pre-computed constraints (UKC windows, berth sequences) so the human is choosing between bounded options, not constructing them from scratch under time pressure.
