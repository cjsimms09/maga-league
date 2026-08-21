# WAR-ROOM DRAFT AUDIT — 2026-08-21, draft eve

**TERRITORY: relay audit (Cory's order, verbatim: "audit board, needs to be
clean, professional, mistake free, easy to use, lost of info. send audit
results to B, be very picky. Act as a website designer for fantasy website and
as a fantasy drafter who want all the tools and analytics that matter").
B owns the surface and every fix decision; A merges anything that is code.**

Method: professional-practice research first (FantasyPros Draft Wizard, Draft
Sharks War Room's 17 live value indicators, DraftEdge's pick-with-reasoning,
4for4/Yahoo strategy-lab patterns), then a read of `warroom.ejs` + the render
paths in `app.js`/`movers.js`/`survival.js` against that checklist and against
Cory's three named asks. This is a code-level audit; B should confirm each
finding on the rendered page before acting — at 8 seconds a pick, only the
rendered page is the truth.

## THE VERDICT IN ONE LINE

The machinery matches or beats the commercial tools (clock card with a WHY
line, tier cliffs, three-layer survival with live run detection, branch
lookahead, per-source boards, ADP movers, legality and bye warnings — Draft
Sharks advertises 17 indicators; we render more). **The gaps are in the last
foot: three of Cory's asks are either un-normalized, unexplained, or unframed
on the surface — all three are fixable by Saturday without touching model
logic.**

## SHIP-BY-SATURDAY (small, low-risk, all presentation-layer)

### 1 · THE FALLING BADGE IGNORES `adp_sd`, WHICH IS THE EXACT "NORMAL" CORY ASKED FOR — severity HIGH
`app.js` ~7001: `falling = (curPickNo - p.adjusted_adp) >= 10` — a FLAT ten
picks. Cory, verbatim: *"If someone has fallen further than **normal** I need
to know."* Normal is player-specific and we already carry it: every row has
`adp_sd`. A round-2 player six picks past ADP is a z≈3 screaming steal the
flat rule NEVER fires on; a round-12 player ten picks past is z≈0.5 noise it
fires on every time. **Fix: z = (curPickNo − adjusted_adp) / adp_sd; badge at
z ≥ 2, louder at z ≥ 3; keep a picks-count in the tooltip ("14 past ADP —
further than ~95% of drafts let him slide").** The commercial tools can't do
this — most don't carry per-player ADP spread. Ours does; this is a free
differentiator sitting one predicate away. Guard: rows with
`adp_sd_source` fallback/clamped should use the flat rule as before, labeled.
Also: the badge renders ONLY in the recs card — mirror it in the position
rails and position boards, where steal-hunting actually happens.

### 2 · VONA AND beats_wire_by SHARE A SCREEN WITH NO SENTENCE SAYING WHICH TO TRUST — severity HIGH
Cory, verbatim: *"How to best use Vona vs +wire points."* Grep across every
war-room module and the explainer table: **no line joins the two concepts.**
The ruling already exists in measured work (bench-option prereg §16: friction
only prices ABOVE-wire value; the replay's K/DEF/TE wire-parity numbers) — it
just never made it to the glass. **Fix: one sentence in the recs-card and
MLV-panel explainers,** e.g.: *"Filling a STARTING slot → follow VONA (what
survives to your next pick). Filling BENCH or K/DEF → follow 'beats wire by'
(the wire refills those for free — VONA overpays there). When they disagree,
the slot you're filling decides."* Wording is B's; the content is already
ruled and graded, so this is zero new claims.

### 3 · ROUND-VALUE IS COMPUTED BUT NEVER FRAMED AS ROUNDS — severity MEDIUM
Cory: *"Need to know where best value picks are each round, should be
obvious."* VONA IS round-relative value, but nothing on the surface says so in
round language — the professional pattern (every cheat-sheet tool) prices
players in rounds ("rd-3 price, rd-2 production"). **Fix: on each rec card,
one computed clause from numbers already present: round(ADP) vs the current
round — "market prices him rd 4; you're at rd 5 — a round of surplus."** Same
arithmetic for the best-avail strip: retitle "Best value left at each
position" and add the per-player round-delta chip. No model change — labeling.

### 4 · DEFAULT DENSITY VS THE 8-SECOND PICK — severity MEDIUM
~20 cards render on the draft tab; the ⏱ "One answer" clock card is exactly
the right escape hatch but it is opt-in (`display:none` until clicked).
**Fix: when it IS my pick, default to clock-mode ON (one name, the why, the
confidence, Take-him), full board one tap away — and remember the choice.**
Between picks, full density is right. Draft Sharks/DraftEdge both converge on
this shape: one recommended answer with reasoning, depth behind a click.

### 5 · TIER CLIFFS ARE FOLDED WHEN THEY ARE THE ALARM — severity MEDIUM
`tier-cliff-wrap` is a `<details>` (collapsed). The moment that matters —
"last player of WR tier 3 on the board, next tier is −18 pts" — should not
live behind a disclosure. **Fix: keep the chart folded, but surface a
one-line cliff strip at top level whenever a positional tier has ≤2 players
left and the drop to the next tier exceeds a threshold B picks. The
run-banner already interrupts correctly; cliff-imminence deserves the same
treatment.** (Tie the wording to the response: "your tier empties in ~N picks
by survival odds" — survival.js already computes this.)

## POST-DRAFT (real, not urgent)

6. **Wording sweep against a first-time reader.** Panel titles like "MLV",
   "Doctrine", "LRM" assume the reader built them. The explainer contract
   (what/read/DO/src — genuinely better than anything commercial) covers this
   when opened; the TITLES should not need it. Rename on the glass, keep
   internal names in code.
7. **The FALLING badge z-history capture**: log every z ≥ 2 faller Cory takes
   or passes on (shadow ledger already captures picks) so "do steals
   outperform their ADP" becomes a gradeable P-row under the decision-null
   standard — the draft-pick null just shipped, this is its natural first
   customer.
8. **Post-lock render check, Saturday morning**: after the 08:00 UTC rebuild
   lands the final keeper-released pool, B eyeballs every percentage on the
   page against its artifact (the survival-collapse class fc55104c just
   fixed — one member of that class existed, so sweep for siblings on the
   REAL final board, not the preseason one).

## WHAT IS ALREADY RIGHT — DO NOT CHURN
The clock card's name+why+confidence+Take-him is the DraftEdge pattern done
properly. Branch lookahead ("If you take… what's left at your next pick") is
ahead of every commercial tool surveyed. The explainer contract, the legality
strip, the rehearsal/slot watermarks, the print queue, the ADP movers panel
(Cory's own ask, shipped faithfully), and the three-layer survival model with
live run detection are the spine of the page — every Saturday fix above is
additive labeling or thresholds, none of it touches these.

## SOURCES (the research pass, per Cory's order)
FantasyPros Draft Wizard & draft-tools roundups · Draft Sharks War Room (17
live indicators; live-sync cheat sheet) · DraftEdge AI draft coach
(pick-with-reasoning, live mirror) · 4for4 expert cheat-sheet practice ·
Yahoo Strategy Lab / draft kit · tier-based drafting and positional-scarcity
write-ups (footballnationusa, draftvalueanalytics, sticktothemodel).
