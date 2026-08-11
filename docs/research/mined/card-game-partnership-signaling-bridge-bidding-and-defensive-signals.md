# Card-game partnership signaling (bridge bidding and defensive signals)
> Mined via open-learning re-run (Sonnet).

## Bidding System as Shared Grammar
**Term of art:** Bidding system (e.g., Standard American, 2/1 Game Force, Precision Club)
Partners adopt a pre-agreed bidding system before play begins — a codified language where each bid carries a specific meaning beyond its face value. A bid of "1 Club" in Precision, for example, is an artificial bid showing 16+ high-card points with no natural club suit implied. The system converts the infinite space of possible hands into a finite vocabulary of calls, so the partner (the "system") can decode intent even from a single word. Both players carry the same codebook in their heads; no negotiation happens at the table.
**Failure mode:** System mismatch — a player bids from one system's assumptions while partner interprets from another's, producing catastrophic misdirection. Also degrades when the system vocabulary is too sparse to express the hand type held (forcing a "lie").

## Alert and Announcement
**Term of art:** Alert / Announcement (ACBL and WBF regulations)
When a player makes a bid whose meaning is not what opponents would naturally expect, their partner must alert opponents (tap the table or say "alert") and explain the bid's actual meaning if asked. This is a transparency protocol imposed on a private-language system: the signaling pair must expose their code to a third party. The mechanism separates "what my partner hears" from "what the opponents hear," preventing the partnership from weaponizing opacity.
**Failure mode:** Failure to alert — partner forgets or doesn't recognize a bid as alertable, leaving opponents playing against a hidden code. Also exposes a pathology where a signaling system can become so sophisticated that the signalers gain unfair informational advantage over the very parties they're required to inform.

## Cue Bid (Control Showing)
**Term of art:** Cue bid / Control bid
After a trump suit is agreed, one partner bids a side suit not to suggest it as trumps but to show first-round control (an ace or void) in that suit. The partner responds by cue-bidding their own controls or signing off. This is a relay protocol for probing slam viability: neither player knows the full picture, but the exchange of control bids assembles a composite picture no single player has. Each bid is simultaneously an offer of information and a request for the partner's corresponding disclosure.
**Failure mode:** Bypassing — if a player skips a control bid at a lower level, it denies that control by inference. Misreading a skip (or forgetting what was bypassed) corrupts the composite picture irreparably by the time the contract is set.

## Defensive Signals: Attitude
**Term of art:** Attitude signal (standard high-low = encouraging; low-high = discouraging)
On defense, when a partner leads and the other follows suit or discards, the card played communicates desire: a high card says "continue this suit / I like it," a low card says "shift." The signal is a one-bit message — positive or negative — encoded in a card the player had to play anyway. It repurposes an inevitable action as a channel. Because defenders cannot communicate verbally, they co-opt the compulsory card play into a signaling medium.
**Failure mode:** Restricted count — when a player holds only one card in a suit, they have no choice and can send no attitude signal, creating a blind spot the partnership must infer around. Also: falsecarding by declarer (playing cards out of sequence) can corrupt the signal chain, making a high card look like a low one to partner.

## Defensive Signals: Count
**Term of art:** Count signal (even number of cards: high-low; odd: low-high)
Separate from attitude, a defender can signal the parity of their holding in a suit by the order in which they play their cards over successive tricks. High then low suggests an even number; low then high suggests odd. This gives partner a card-counting anchor to reconstruct the distribution, enabling inference about what declarer holds. The mechanism converts a sequence of plays into a binary encoding of suit length.
**Failure mode:** Signal collision — a player cannot simultaneously signal attitude and count with the same card; a single card is one bit. Partnerships must pre-agree which signal takes priority in a given context (e.g., "on partner's lead, attitude first; on declarer's lead, count first"). Getting this wrong produces a misread in the most common situations.

## Suit Preference Signal (McKenney)
**Term of art:** Suit preference signal / McKenney signal
When a player returns or leads a card in a suit where attitude and count are irrelevant (typically when a ruff is clearly coming), they use the rank of the card — highest vs. lowest — to indicate which of the two remaining side suits they prefer partner to shift to. The highest card says "shift to the higher-ranking side suit"; the lowest says "shift to the lower-ranking." This is a context-triggered disambiguation: the same card that would be an attitude signal in one situation becomes a directional pointer in another, with context defining which mode is operative.
**Failure mode:** Context confusion — if partners disagree on which situations trigger suit preference vs. attitude, they read the same card with opposite interpretations. The mechanism requires both parties to model the situation identically to switch modes simultaneously.

## Forcing Pass
**Term of art:** Forcing pass
In competitive auctions at high levels, after the partnership has shown a strong hand or committed to game, a pass by one player stops being neutral — it becomes a forcing bid that says "I cannot make the best decision alone; your judgment is required." Partner is obligated to either bid on or double. The pass transfers decision authority upward, functioning as a meta-communication: "I have reached the boundary of what my hand alone tells me."
**Failure mode:** Boundary ambiguity — partners may disagree on whether a pass is forcing or not in a given auction, leaving one player passing when the other expects them to bid. The mechanism requires both players to have identical calibration of when game commitment has been established.

## System Notes and Convention Cards
**Term of art:** Convention card (ACBL Convention Card)
Partnerships are required to document their complete bidding system on a standardized form — the convention card — which must be made available to opponents before play. This externalizes the shared grammar into a persistent artifact. The card functions as a contract between partners (forcing alignment) and a disclosure document for opponents (enforcing transparency). Mid-session, when a player is uncertain of partner's agreement, consulting the card is permitted and serves as ground truth over faulty memory.
**Failure mode:** Card drift — the convention card documents what was agreed at registration but practice evolves and partners diverge from the written document. When the lived system no longer matches the documented system, the card creates false confidence: opponents play against the card; partner plays against something else.

## What this field knows
Bridge bidding and defensive signaling encode a deep understanding of the cost of attention asymmetry: partners see different halves of an invisible whole, and every legal act — bid, card play, pass — is simultaneously a decision and a transmission. The field invented persistent grammar artifacts (convention cards, bidding systems) to pre-load a shared codebook so that in-the-moment bandwidth can be devoted to inference rather than negotiation. It also discovered that any sufficiently rich private signaling language requires a transparency protocol toward third parties, or the informational advantage becomes illegitimate — a lesson about the accountability structure that must accompany perceptual superiority. Finally, bridge formalized the forcing pass as an explicit mechanism for transferring decision authority when one actor recognizes they have hit the limit of what their local information can determine — making "I defer to you" itself a meaningful, structured act rather than an abdication.
