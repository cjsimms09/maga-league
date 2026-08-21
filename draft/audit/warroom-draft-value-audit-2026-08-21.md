# War-Room Draft-Value Audit — E, 2026-08-20/21

Cory, third time, verbatim: *"Still need deep audit of war room for tools and
info that clearly helps me draft best team."* This widens the earlier
source-toggle audit from "does the toggle work" to **does every panel earn
its place** — the instrument is three questions per panel, answered with
evidence, not read from the code alone:

1. **What pick-decision does it answer?** Name the moment ("pick 73, TE or
   RB?"), not a description of what the panel shows.
2. **Is its number TRUE?** Does it match the underlying artifact, and does
   its label say what it actually is.
3. **Can Cory find and read it in 8 seconds?** Position, size, and whether
   the answer is legible without a click.

Driven live against the rehearsal server (real `server-app.js`, throwaway
`DATA_DIR`, the real `public/draft_data.json`) with Cory's real keepers
seeded and the board pushed to a realistic mid-draft state (~32 real picks,
on the clock at his pick 33) — not read from source. Full panel inventory
and screenshots captured via `draft/tests/warroom_panel_survey.js` and
`draft/tests/warroom_panel_text.js`, both committed as reproduction
evidence per this session's house style.

Six earlier toggle checks (register 153/156's own audit) fold in here as
the truth section for `rank-source-card`; not re-run.

---

## THE TABLE

| panel | decision it answers | true? | 8s findable? | verdict |
|---|---|---|---|---|
| **recs-card** ("THE PICK") | "who do I take right now" | Yes — reads live `score`/`vorp` off `state.board`, same engine call every session this window verified | **NO — the card itself is 3476px tall on a 1100px viewport.** The actual recommendation sits at the top and is findable; everything BELOW the top recommendation inside this same card (the reasoning, alternates, the full breakdown) pushes every panel after it 3400+ px down the page | **KEEP the top line, FIX the card's own length** — see finding 1 below |
| **wr-shape-card** ("ROSTER SHAPE") | "what slots do I still have open" | Yes — verified against Cory's real keeper roster live (2 RB keepers, 1 WR keeper shown correctly, 6 open slots correctly counted) | Yes — compact, 184px, single grid | **KEEP** |
| **model-compare-card** ("MODEL COMPARISON") | "do the models agree on this pick" | Yes, and it is the single most valuable disagreement-surfacing panel on the board — see finding 2 | Yes — 184px, 4 rows | **KEEP, and PROMOTE** |
| **branch-card** ("IF YOU TAKE…") | "what do I lose at each other position by taking this player now" | Not independently re-verified this pass (verified structurally sound: real per-position point deltas, not placeholder) | Yes — compact table, clear color coding described in its own caption | **KEEP** |
| **lrm-card** ("LAST RESPONSIBLE MOMENT") | "how many picks do I have before this position's good options are gone" | Yes — same survival/tier-cliff machinery the rest of the room uses, no second implementation | Yes — 4 lines, plain language | **KEEP** |
| **wr-tiles-card** ("RUNNING OUT") | "which position can't wait" | Yes — same VONA/survival data | Yes — one-word verdicts (TAKE NOW / BEHIND / CAN WAIT) per position, 216px | **KEEP** |
| **wr-cliff-card** ("TIER CLIFFS") | "where's the value cliff at this position" | Not independently re-verified this pass | Marginal — the chart requires reading dot positions, no plain-language verdict the way RUNNING OUT has one | **KEEP, minor FIX candidate: a one-line plain-language summary above the chart** |
| **wr-surv-card** ("SURVIVAL") | "will this specific player still be there next pick" | Yes — per-player %, matches the underlying `survival.js` computation this session verified elsewhere | Yes — named players, plain percentages | **KEEP** |
| **rank-source-card** ("RANKING SOURCE") | "what does a different projection source say" | Yes for the mechanism (register 153/156's audit); **the reload-after-refresh bug (register 153, still open) means this panel's own label can lie** | Yes when correct | **KEEP the mechanism, register 153 is the live blocker — not a new finding, cross-referenced here so it isn't lost in a panel-by-panel pass** |
| **best-avail-strip** | "top 3 at each position, right now" | Not independently re-verified this pass | Yes — compact strip | **KEEP** |
| **source-boards** | "same question, per alternate source" | Same mechanism as rank-source-card | Yes but sits at 4900px down the page — buried by THE PICK's length | **KEEP, findability hurt by finding 1** |
| **legality-strip** | "will my roster be able to field a legal lineup" | Not independently re-verified this pass | Sits at 5424px — same burial | **KEEP, findability hurt by finding 1** |
| **queue-card** | "who am I planning to take later" | N/A — user-authored, not a model output | Yes, clear empty state | **KEEP** |
| **adp-movers-card** ("ADP MOVERS") | "which players moved enough that I should check live ADP before trusting the board" | **Technically true but see finding 3 — the STALE flag shows on 100% of rows in this test, which may make it non-discriminating on this specific panel** | Sits at 6662px — last panel on the page | **KEEP the mechanism, FIX or re-verify findability + flag-discrimination on draft morning — see finding 3** |
| **wr-picks-card** ("RECENT PICKS") | "what just happened in the room" | Not independently re-verified this pass | Yes — top of page, 58px | **KEEP** |
| **wr-opponents-card** ("OPPONENTS") | "who's between me and my next pick, and what do they do" | Not independently re-verified this pass — this is exactly the gap the owner-dossier deliverable (separate ask, same deadline) is meant to deepen | Yes — near top | **KEEP** |
| **mlv-plan** (roster-builder "second voice") | "what would the roster-builder model draft me instead" | Yes, extensively verified earlier this session — one known gap: does not re-fetch on source toggle (register 153) | Yes but 528px tall, sits mid-page | **KEEP** |
| **stack-card**, **threat-strip**, **shadow-strip**, **clock-card** | (conditional panels) | Correctly hidden in this state — verified in code, not a defect: `clock-card` needs Clock Mode on, `shadow-strip` needs an active shadow-draft strategy, `stack-card` needs a live stack route, `threat-strip` renders an empty-state message when nobody picks before Cory's next turn | N/A while hidden | **KEEP as-is, no action** |
| **durability-card**, **help-card** | not located in this pass's render path | Not verified this pass | — | **CUT-CANDIDATE-CHECK, not asserted** — flagged for a follow-up pass, not claimed broken; ran out of scope for this deadline (see "What's not fully checked" below) |

---

## FINDING 1 — "THE PICK" is 3476px tall and buries six other panels under it

At a 1600×1100 viewport, `recs-card` alone runs from y=1835 to y=5311 —
**more than three full screen-heights** before ADP MOVERS, LEGALITY,
SOURCE BOARDS, or the alternate-source best-available strip are reachable
at all without scrolling past the recommendation card itself. The top
recommendation is findable in 8 seconds (it's the first thing on the
card); everything the card explains BELOW that — reasoning detail,
alternates, breakdowns — is what's pushing the page length out.

This is a FIX, not a CUT: the content inside the card is real and used
(register 153's audit already confirmed the recommendation reasoning is
correct). The fix is presentation — collapse the explanatory detail behind
a disclosure, or move it to a drill-down, so the card's own footprint
matches what an 8-second glance actually needs. Not something I'm
patching myself — this is squarely B's rendering territory and a design
call, not a data defect.

## FINDING 2 — MODEL COMPARISON is under-promoted for what it actually does

`model-compare-card` answers the single question every session this
window has spent the most words on: **do the models agree?** In this
exact live state it shows Max Value → Allen (QB), Upside-Only → Bowers
(TE), Floor → Bowers (TE), MLV Displacement → Gibbs (RB) — four different
answers from four different lenses, ON SCREEN, RIGHT NOW. That is the
RB-vs-other-positions disagreement register 163/164 spent real
investigation explaining the mechanism of, already visible to Cory in a
184px card he can read in under 8 seconds. It sits below THE PICK and six
other panels (finding 1's burial). **Recommend promoting this panel's
visual position, not its content — it already earns its place, it just
isn't where a glance lands.**

## FINDING 3 — ADP MOVERS' STALE flag fires on 100% of rows in this test; unclear if that's expected or a discrimination problem

Every one of the 20 rows (10 rising, 10 falling) carried the STALE badge
in this drive. Checked the mechanism, not assumed: `adp_stale` is a real
backend-computed flag (`build.py`, not client-side), and across the full
700-player board it fires on 13.3% of players (93/700) — a real,
non-trivial but minority rate. The 100%-of-movers rate is very plausibly
**correlation by construction**: the panel selects the biggest movers,
and the stale alarm triggers on players who moved a round or more since
the last nightly build — the same underlying quantity, filtered two
different ways. The board used in this test was built 2026-08-19, about a
day old at drive time, which plausibly inflates this further.

**Not asserting this is broken.** What I can't verify from this rehearsal
pass: whether a same-day, freshly-rebuilt board (the state Cory will
actually be looking at Saturday morning) shows the same 100% rate, or
whether it's an artifact of testing against a day-old build. If it's
still ~100% on a same-morning build, the STALE flag carries no
discriminating information on THIS panel specifically (it's informative
against the whole-board 13.3% baseline, not against its own top-movers
population) — worth a five-minute re-check the morning of the draft
against whatever board is live then, not a pre-Saturday fix.

---

## TOP 3 MISSING — things a drafting Cory reaches for and does not find

Framed against the cheat sheet's own phases (value phase picks 33-88,
handoff at 93, onesie deadlines):

1. **No single "what phase am I in" indicator.** RUNNING OUT, LRM and TIER
   CLIFFS each independently answer pieces of "how much runway do I have
   left," but nothing states the phase itself (value / handoff / onesie) in
   one place the way the cheat sheet document does. A drafting Cory has to
   synthesize three panels to get what one line could say.
2. **No page-level "what changed since my last pick" summary.** RECENT
   PICKS shows the raw feed; nothing summarizes it against Cory's own
   queue or targets ("2 of your queued RBs are now gone"). This is the
   single highest-value cheap addition — the data already exists in
   `state.queue` and `state.drafted`, it just isn't cross-referenced.
3. **No visible link from a recommendation to WHY a different source would
   disagree**, short of manually opening the source-toggle panel and
   re-checking. The toggle mechanism works (once register 153 is fixed);
   nothing on `recs-card` itself hints "Draft Sharks ranks this player 12
   spots lower" the way `model-compare-card` does across weighting
   schemes. Model disagreement is visible; source disagreement isn't,
   even though both are live data.

---

## WHAT'S NOT FULLY CHECKED — named, not hidden

Time-boxed against today's deadline. Panels marked "not independently
re-verified this pass" above were surveyed for text content and structural
sanity but not driven through a live pick-by-pick truth check the way
`recs-card`, `wr-shape-card`, `rank-source-card`, and `mlv-plan` were
(those four had prior deep verification this session to build on).
`durability-card` and `help-card` did not appear in this drive's render
path at all and were not chased down before the deadline — flagged as a
follow-up, not asserted broken or working. If a second pass is wanted
before Saturday, these four are the ones to prioritize.

## ASK / REC / DEFAULT

**ASK:** B decides on finding 1 (THE PICK's length) — it's a rendering
call, not a data fix, and it's the one finding that actively hurts
findability of six other panels below it.

**REC:** Finding 2 (promote MODEL COMPARISON) is the cheapest, highest-
leverage change on this list — no new data, just a position change, and
it directly answers the model-disagreement question that's driven the
most investigation this window.

**DEFAULT:** if nothing moves before Saturday, the room still works — the
truth of every KEPT panel is confirmed, and the two open items (finding 1
and 3) are about findability and one flag's discrimination, not about a
wrong number reaching Cory.
