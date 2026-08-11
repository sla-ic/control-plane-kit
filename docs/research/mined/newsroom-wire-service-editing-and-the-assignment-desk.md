# Newsroom wire-service editing and the assignment desk
> Mined via open-learning re-run (Sonnet).

## The Slug System
**Term of art:** slug (also: catchline)
Every story in the system is given a short, uppercase identifier — the slug — that travels with the story across every handoff: from the wire intake, through the assignment desk, to editing, layout, and publication. The slug is not a headline; it is an internal routing token that lets every actor in the chain reference the same object without ambiguity. When an editor says "move BEIRUT-BLAST to A1," every desk in the building knows exactly what object is in motion. The slug also functions as a shared state name: it appears on the budgets, on the rundowns, and in verbal exchanges, so no translation layer is needed between the system's view and the human's language.
**Failure mode:** Slug collision — two unrelated stories share a slug, causing editors to route, kill, or overwrite the wrong story. Guard: slug discipline is enforced at intake, and wire services use dateline prefixes to namespace slugs globally.

## The Budget
**Term of art:** budget (also: story budget, news budget)
The budget is a single daily document — typically one page, circulated in print or on a shared terminal — that lists every story expected to move that day: slug, expected wordcount, reporter, and a one-line summary. It is not a status board and not a full story; it is a commitment instrument. Editors read the budget before the morning meeting and again before the print deadline to know what they can plan around. The budget forces the system's vast output into a finite, scannable human artifact: the human does not read all incoming wire copy, they read the budget and then pull specific items.
**Failure mode:** Budget drift — stories on the budget don't move, or stories move that aren't on the budget, making the budget a fiction the desk no longer trusts. The ritual of the budget meeting partially guards against this by requiring verbal confirmation.

## The Budget Meeting (News Meeting)
**Term of art:** news meeting (also: budget meeting, story conference)
At fixed times in the day — typically morning and late afternoon — all section editors physically or verbally convene around the budget. Each editor advocates for their stories: length, placement, urgency. The managing editor or news editor decides what leads, what gets cut, what gets bumped. The meeting is a structured interruption of continuous wire flow: it converts the system's perpetual stream into discrete, prioritized decisions a human hierarchy can execute. The ritual forces joint attention rather than each editor individually reacting to the wire.
**Failure mode:** The meeting becomes a performance of advocacy rather than genuine triage — editors oversell their stories, no one kills anything, and the front page is over-committed. Guard: a hard page-one slot limit makes the trade-off physical and undeniable.

## Wire Triage and the Spike
**Term of art:** spiking a story (also: the spike, kill)
The assignment desk physically or digitally receives far more wire copy than can be used. The triage practice is to read the first paragraph (the lede) and the dateline, then either route the story forward or spike it — discard it from active consideration. The spike is a named, intentional act of non-action: it closes the loop on that item rather than leaving it in an ambiguous queue. The physical newsroom once used a literal metal spike on the desk where paper copy was impaled when killed; the term survives in digital systems as a named status. Naming the discard action is the key mechanism — it distinguishes "decided no" from "never seen."
**Failure mode:** Stories linger in an unspiked queue, creating ambiguity about whether something has been reviewed. Editors assume someone else killed it; it surfaces again as a duplicate routing. Guard: queue discipline — any item older than N minutes without a routing decision is escalated.

## The Dupe Check
**Term of art:** dupe (also: matching, tracking)
Wire services file multiple versions of the same breaking event from competing agencies (AP, Reuters, AFP). The assignment desk runs a dupe check: when a new item arrives, the editor compares it against what is already in the system on the same event — checking dateline, key facts, and slug variants — to decide whether to use the new wire, merge details into a working story, or spike the duplicate. This practice makes the human the resolver of the system's redundancy; the wire is designed to over-file rather than under-file, so the human interface must handle deduplication explicitly rather than assuming the incoming signal is already deduplicated.
**Failure mode:** A dupe slips through as a separate story, and two slightly different accounts of the same event run in the same edition. Guard: the tracking slug — when a breaking story is assigned an internal slug, all subsequent wire traffic on that event is supposed to be filed under the same slug or explicitly marked as a new version (e.g., "IRAN-QUAKE-2nd LD").

## The Take System (Continuous Filing)
**Term of art:** takes (also: adds, writethrus)
Wire stories on a breaking event are not filed as complete documents; they arrive in takes — numbered segments that move as new information develops. A "1st LD" (first lead) is the initial version; a "writethru" replaces the entire story with a new version incorporating fresh facts. Editors at the desk must track which take they are holding and whether a newer version has superseded it before sending it to layout. The take system means the human is always working with a versioned object that the system is continuously rewriting; the interface problem is knowing when to lock a version for publication rather than waiting for the next take.
**Failure mode:** An editor passes an old take to layout while a writethru with corrected facts is sitting in the queue. Guard: the writethru is explicitly labeled and the desk is supposed to check the queue before releasing any wire story to print.

## The Rundown and the Clock
**Term of art:** rundown (also: show rundown, broadcast schedule)
In broadcast news, the rundown is the sequenced list of every segment in a show, with assigned times. Each item has a slug, a "reader" or "package" type, an assigned duration, and an owner. The total must equal the show's airtime exactly. The rundown is a live document that the producer updates continuously as stories develop or fall through; it is visible to every role simultaneously (anchor, director, field producers). The rundown converts continuous editorial judgment into a time-indexed commitment that has a hard physical constraint — the show ends at a fixed second.
**Failure mode:** The rundown is padded with soft items that never firm up, then collapses in the last hour as stories don't deliver. Guard: the producer holds a "kicker" — a light closing item with flexible duration — as a buffer that can expand or contract to absorb overruns.

## The Desk Editor as Loop-Closer
**Term of art:** slot (also: night editor, slot man, rim)
In traditional wire-service newsrooms, the copy desk was organized as a hub-and-spoke: the slot editor sat in the center and the rim editors sat around the outside. Rim editors received copy, edited it, and returned it to the slot, who made the final call on headlines, placement, and release. The slot editor did not read all incoming copy; they read only what rim editors routed to them, already pre-processed. The slot's job was to close loops — to make the final disposition decision on every item that reached them — not to monitor the wire directly. The physical geometry encoded the information hierarchy: the system's raw volume hit the rim, and human judgment was concentrated at the slot.
**Failure mode:** The slot becomes a bottleneck — rim editors queue up, decisions back up, and deadline passes with items still in motion. Guard: the slot has explicit authority to kill or trim without consultation, which keeps the throughput high.

## What this field knows
Newsrooms discovered early that a human decision-maker cannot be put directly in front of a firehose — the wire produces more copy per hour than any editor can read — so they invented a layered translation system: the slug converts objects to addressable tokens, the budget compresses the day's output into a scannable commitment list, and the news meeting converts continuous stream into discrete joint decisions. The field's deepest insight is that closing a loop explicitly — spiking, versioning, routing — is as important as opening one: an unspiked story is an unclosed loop that consumes attention indefinitely. The physical geometry of the copy desk (slot and rim) and the broadcast rundown both encode the same principle: concentrate irreversible judgment at a single point, pre-process volume at the periphery, and give the human at the center only what requires their specific authority to close.
