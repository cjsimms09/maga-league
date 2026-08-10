# PARTICIPATION TEST — prior-guided pre-registration (before any run)

Which of the eight adjuster terms, when they PARTICIPATE in the pick score, actually earn
dollars? Cory's pre-registered call: need earns, most others don't. This is the front-half
science (SESSION-A habit 10): form the prior, rank by information-per-search, search deep
where the prior is strong, and state the power honestly — not a blind 8-term sweep, not a
3-shape race. Written BEFORE the run so the prior can't be revised to fit the result.

The terms (engine DEFAULT_WEIGHTS): `value` (VONA/market), `tier` (tier-cliff urgency),
`need` (startable-slot marginal), `risk`, `ceiling` (upside), `keeper` (KOV), `bye`, `stack`.

## The prior, from mechanism + what we already know
The payout structure rewards two things: **regular-season points** (finish) and
**weekly-high** (37.5% of the pot — rewards DISTRIBUTION SHAPE / ceiling, not just mean).
So a term earns only if it moves a quantity a payout rewards, in a region the market hasn't
already priced.

| term | prior | mechanism / evidence | search depth |
|---|---|---|---|
| **need** | **STRONG +** | roster-fit earned **+$258** (keeper-B0); masking filled slots avoids the 4th-RB trap; acts directly on construction the format rewards | **DEEP** |
| **value** | **STRONG +** | the market anchor; EDGE-LEDGER #1 says ranking off a good board is our biggest edge; VONA is the anchor the others deviate from | **DEEP** |
| **stack** | **MEDIUM +** | correlation lifts weekly-high ceiling — and weekly-high is 37.5% of the pot, a payout that rewards shape. exp6 "dose pays" (but that null/win is provisional). Test **specifically against the weekly-high component**, where the mechanism lives | **MEDIUM** |
| **ceiling** | **MEDIUM−** | same weekly-high mechanism COULD reward ceiling, so not zero-prior — but it has come back null repeatedly and frontier found an inverted-U peaking near default. Test **split by payout component** (weekly-high vs RS): the only place the prior gives it a chance | **MEDIUM** |
| **tier** | **WEAK−** | tier cliffs only pay if the market hasn't priced them; exp43 says the market prices most structure; null repeatedly | **SHALLOW** |
| **risk** | **WEAK−** | floor-preference; no payout mechanism that beats mean-value in a weekly-high format; null-ish | **SHALLOW** |
| **keeper** | **WEAK−, conditional** | KOV only bites for keeper-eligible players (a handful); engine found it couldn't move the top-5 at any setting | **SHALLOW / conditional** |
| **bye** | **WEAK−** | engine found bye couldn't move the top-5 at any setting; a late-round tiebreaker at most | **SHALLOW** |

**Ranked by information-per-search (what to run first):** need and value (deep, cheap in the
existing MC, would change the whole architecture if either is decoration) → stack and
ceiling through the **weekly-high component** (medium, the only mechanism that could rescue
them, decisive for "does distribution shape pay") → tier/risk/keeper/bye (shallow, one
participation-on/off each; expected null, run only to bound them).

## Power — stated before running
The test uses the certified paired MC room (cory_conditional: paired seeds + paired weekly
luck + bootstrap CI), ablating each term's participation (weight→0) vs the full default.
From keeper-B0 at n=200 paired rooms, bootstrap CIs ran ~±40-50 dollars around a $258
effect. So at **n=200, the minimum reliably detectable participation effect is ~$30-40**;
I will run the DEEP terms at **n≥400** (CI ~±25) and the shallow terms at n=200.
**Honest limit:** a term returning |effect| < ~$30 at n=200 is reported as "≤$30 if present
— underpowered to separate from zero," NOT "earns nothing." Decoration is only claimed for
a term whose CI is tight around zero at the n used.

## Pre-registered expectation (Cory's, on record; mine below)
Cory: need earns, most others don't. Mine (mechanism): **need + value earn; stack and
possibly ceiling earn ONLY through the weekly-high component and near-zero on RS; tier /
risk / keeper / bye are decoration (≤$30).** If need or value came back null that would
overturn the architecture and I'd distrust the harness first. If ceiling earns on
weekly-high, that's the one non-obvious survivor and it sharpens the shape story.

## Design for information (habit 11) — response surface + factorial, not on/off
On/off ablation gives a leaderboard; the informative version maps SHAPE and INTERACTION:
- **need + value:** sweep each weight across a range {0, 0.5, 1, 1.5, 2, 3} and report the
  E[$] **curve with intervals** (is it monotonic? where's the optimum? does value peak at
  its 1.0 default or higher now that the board is better?). Same paired rooms/seeds across
  every point.
- **need × phase FACTORIAL:** the one interaction with a strong prior — need should matter
  MORE as slots fill. Cross need-weight × {early, mid, late} finer than Auto's designed
  2/6/10 boundaries. This is the phase sweep the tournament never ran (it moved only
  ceiling/risk), answering the Auto-audit gap in the same design.
- **ceiling × payout-component:** grade ceiling's effect separately on the **weekly-high**
  vs **regular-season** dollars — the only place the prior gives ceiling a chance (shape
  pays in weekly-high). A single pooled number would hide it.
- **tier/risk/keeper/bye:** on/off only (weak prior) — bounded, not mapped.
All arms share rooms/seeds/opponents (paired). Report curves + CIs, not a winner. An
uninformative cell (CI spanning zero at the n used) is labeled underpowered, not "null."

## What it settles
If need + value carry it and the rest are decoration, the model collapses to the defensible
core — rank by (MFL) board, mask to startable need, apply proven exceptions — and the war
room's slider panel should say plainly which controls do anything rather than presenting
eight equals. That is the cleanest ending to the architecture question.
