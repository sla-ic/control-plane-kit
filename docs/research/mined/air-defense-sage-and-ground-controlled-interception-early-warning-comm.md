# Air defense / SAGE and ground-controlled interception early-warning command
> Mined via open-learning re-run (Sonnet).

## Weapons Director / Fighter Director handoff
**Term of art:** Handoff / Transfer of control
A ground controller (Weapons Director in SAGE, Fighter Director in carrier-based GCI) owns a track from first detection through intercept geometry setup, then executes a formal verbal handoff at a designated range or phase gate — transferring authority to either the pilot or another sector. The handoff is a scripted exchange with read-back confirmation, not a status update. Control authority moves with the handoff; the previous controller immediately goes to monitor-only. This prevents dual-control ambiguity where two controllers issue conflicting vectors simultaneously.
**Failure mode:** Gaps in coverage when handoff timing is mismatched to aircraft speed/range — the track "falls between sectors" with no controller claiming authority. Guards against the inverse: two controllers both believing they own the intercept.

## Scope Dope / Track Annotation
**Term of art:** Track label / Bogey dope
In SAGE Direction Centers and manual GCI sites, every radar return that matters gets a labeled track: a grease-pencil annotation on a plotting board or a generated alphanumeric symbol on a scope, carrying identity (friendly/unknown/hostile), altitude, speed class, and assigned intercept. The annotation is the shared object that multiple operators act on — not the raw radar blip. Controllers, status boards, and commanders all read the same labeled track, not the same raw signal. The annotation collapses perceptual overload into a actionable token.
**Failure mode:** Label corruption or lag — an annotation that no longer matches the actual return because the track moved faster than the update cycle. Also: over-annotation, where so many labels crowd the scope that the underlying geometry becomes unreadable.

## Commit / No-commit Decision Gate
**Term of art:** Commit (also: weapons free / weapons tight)
At a defined range or geometry threshold, the Weapons Director calls a "commit" — the moment at which the interceptor pilot is authorized to go full afterburner on an intercept vector and the system allocates that aircraft to that target exclusively. Before commit, the aircraft is held in a CAP (Combat Air Patrol) or vector hold, preserving optionality. After commit, the system re-tasks remaining assets to cover the gap the committed aircraft leaves. The commit is irreversible on the timescale of the intercept; it burns fuel and forecloses repositioning. The gate forces the human to make a binary, time-bounded judgment on incomplete information rather than continually deferring.
**Failure mode:** Premature commit on a ghost track or sensor artifact wastes the intercept asset and creates a defensive gap. Late commit means the geometry deteriorates past the minimum intercept envelope. The gate encodes the cost of indecision as a design parameter.

## Telling / Reporting Discipline
**Term of art:** Telling (NATO term); also "reporting" in USAF GCI doctrine
Radar data was passed between stations and sectors through a highly structured verbal protocol called "telling" — standardized call formats with fixed field order (identity, bearing, range, altitude, track number, speed). Every station that received a tell was required to acknowledge and, if it conflicted with their own picture, immediately say so using a specific challenge phrase. Telling is not briefing; it is a compressed, lossless data handoff. The discipline prevented each station from operating on a private picture that diverged from adjacent sectors.
**Failure mode:** "Poisoned tell" — a corrupted or misidentified track passed with full procedural authority through the network, causing multiple sectors to act on bad data simultaneously. Guards against the opposite: stations that silently ignore incoming tells and operate on local-only picture.

## Recognized Air Picture (RAP) Compilation
**Term of art:** Recognized Air Picture (RAP); Common Operating Picture (COP) in later doctrine
The SAGE system (and its manual predecessors) maintained a continuously compiled, sector-fused picture of all tracks in the defended area — not just one radar's view. SAGE's IBM AN/FSQ-7 computers fused inputs from multiple radar sites into a single display at the Direction Center. No human was reading raw radar; every human acted on the compiled picture. The compilation was the primary perceptual artifact of the system, and human decisions were always decisions about tracks on the RAP, not about radar returns. This meant the system's perceptual synthesis was upstream of every human judgment.
**Failure mode:** RAP latency — the compiled picture lags real-time position by seconds or tens of seconds, especially during high track density. A controller acting on a stale RAP commits to intercept geometry that has already dissolved. Also: RAP confidence — the system cannot always signal which tracks are high-confidence vs. interpolated.

## Weapons Assignment Board
**Term of art:** Weapons assignment / Asset allocation board
At SAGE Direction Centers and sector operations centers, a dedicated status board (physical or electronic) showed every interceptor asset: aircraft ID, readiness state, assigned target (if any), fuel state, and controller ownership. No aircraft was assigned to a target without a corresponding board entry; no board entry existed without a controller. The board was the authoritative source for asset commitment state — not individual controller memory. Supervisors used the board to see total force posture and identify uncovered sectors at a glance, without interrogating individual controllers.
**Failure mode:** Board staleness when update discipline breaks down under high tempo — board shows an asset as "available" that a controller has already mentally committed to a developing track. The gap between board state and controller intent is where double-assignment errors occur.

## Intercept Geometry Callouts (Pure Pursuit / Lead Collision)
**Term of art:** Collision course steering; lead collision; cutoff heading
GCI controllers did not simply tell pilots to "fly toward the target." They computed and transmitted specific intercept geometries — collision-course headings designed so that pilot and target arrive at the same point simultaneously, accounting for target speed and heading. The controller owned the geometry calculation; the pilot owned aircraft execution. This division of labor was explicit: the controller had the radar picture and the math; the pilot had the aircraft. Heading callouts were updated on a timed cycle (every 30 seconds in some procedures) rather than continuously, to prevent pilot fixation on radio rather than cockpit.
**Failure mode:** Geometry error from stale target track — the collision course heading was computed on where the target was, not where it will be, introducing lag error at high target speeds. The update cycle was a tradeoff between communication overload and geometric precision.

## Sector Boundary Management
**Term of art:** Sector boundary; handover line; ADIZ (Air Defense Identification Zone)
The air defense network was divided into sectors with hard geographic boundaries. A track approaching a boundary triggered a mandatory coordination sequence between adjacent sectors before it crossed — not after. The boundary was not just a map line; it was a procedural trigger. Sectors could not simply watch a track cross and let the adjacent sector "pick it up" — the sending sector had to push the track data and the receiving sector had to confirm acceptance. This prevented the coverage gap that would otherwise exist exactly at the seam between two perceptual systems.
**Failure mode:** Boundary saturation — during a mass raid, multiple tracks cross multiple boundaries simultaneously, overwhelming the coordination protocol and creating queues of unaccepted handoffs. The procedure that prevents gaps under normal load becomes the bottleneck under adversarial load.

## What this field knows
Air defense command and control discovered that when the system perceives vastly more than any individual human can, the human's role must be precisely scoped: not to perceive, but to decide at defined gates with defined authority. The field invented a class of artifacts — track labels, assignment boards, handoff protocols — whose purpose is not to inform the human but to carry decision authority explicitly from one actor to another, making ambiguity about "who owns this" structurally impossible. It also learned that the compiled picture (the RAP) must be treated as the primary reality, and that every human judgment is a judgment about an abstraction the system built — which means the system's synthesis quality sets the ceiling on human decision quality, not the other way around.
