# EXPERIMENT 43 — THE FULL-BOARD PICK AUDIT (pre-registration)

_Pre-registered BEFORE any numbers, per the honesty clause. This is Cory's message #1
("why are we only grading my 41 picks") built on exp36's praised full-board spine.
It grades EVERY real pick by EVERY owner across all three drafts (~450 decisions)
market-relative — the cleanest analysis we can run, because it grades what ACTUALLY
happened against contemporaneous ADP and realized outcome, with **no replay and no
counterfactual** (so the frozen/simulated leak does not apply to any of it)._

## Data (reuses exp36, egress in CI)

Per drafted, gradeable player, across 2023–25, every owner: `{season, roster_id
(owner), pick_no (overall), round, position, adp (overall ADP rank), realized
(rest-of-season points, era-correct 6-pt), realized_4pt (QB companion)}`. A pick is
gradeable iff it matched an FFC ADP entry AND has realized weekly data (exp36's join;
~588/606 players/season). Keepers excluded (not decisions). 2025 realized may be
unavailable upstream → that season SKIPPED and said plainly.

## Definitions (fixed now)

- **Reach distance** = `pick_no − adp`. Positive = drafted EARLIER than the market
  (a reach); negative = fell to the owner (value). Units: overall pick slots.
- **Market-relative outcome (residual)** = `realized − E[realized | adp]`, where
  `E[realized | adp]` is the leaguewide realized-vs-ADP curve, estimated as the mean
  realized within the pick's ADP decile (isotonic-free, decile bins so it is robust
  and transparent). Residual > 0 = beat what that draft slot returned on average.
  This is the market-relative "was it a good pick" — roster-AGNOSTIC (see caveat).
- **Forgone value (descriptive companion)** = realized of this pick minus the best
  realized among players with ADP within ±6 of this pick still undrafted at pick_no.
  Roster-agnostic; reported as a cross-check, not the headline.

## Questions and PRE-REGISTERED verdict bars

1. **Which kinds of picks beat the market** — mean residual by (round-band ×
   position), exp36's bands (R1-3/4-7/8-11/12+). A cell is REPORTED only at n≥8
   (exp36's floor); below floor = THIN, no verdict.
2. **Does reaching ever pay, and where** — mean residual by reach-distance bucket
   (≤ −20 fell far, −20..−6, −6..+6 at-market, +6..+20 reached, > +20 big reach),
   overall and within position. A bucket "pays" iff mean residual > 0 AND its
   **bootstrap 95% CI (2000 resamples) excludes 0**. Pre-registered expectation:
   reaching does NOT pay on average; the interesting cell is any position×region
   where it does (e.g., does reaching for the elite RB before the dead zone pay).
3. **Who drafts well** — mean residual per owner (roster_id), with bootstrap CI.
   Separated from schedule luck BY CONSTRUCTION: this measures draft-value captured,
   not standings. An owner is "drafts above market" iff CI excludes 0 and positive.
4. **Are Cory's picks different** — Cory's seat vs the field: two-sample on residual
   (Cory's picks vs all others), report effect size + CI. Also his reach profile vs
   field. Null-honest: with ~41 Cory picks vs ~400, expect wide CIs; report them.
5. **Does the dead zone show up here too** — mean residual for RB in the mid-round
   region (overall pick 51–90) vs WR same region, as an independent cross-check on
   exp25/BBM using ACTUAL picks + residuals (not replay).

## Guards (pre-registered)

- **Floor** n≥8 per reported cell/bucket (exp36's floor). Thin = reported thin, no
  verdict, never smoothed.
- **Multiple comparisons made visible**: every table prints the number of cells/
  buckets/owners tested; a per-family Benjamini-Hochberg FDR flag at q=0.10 marks
  which "CI-excludes-0" results survive multiplicity. A result that clears its own CI
  but fails FDR is labeled "nominal only."
- **Held-out season**: any position×region or owner verdict must hold sign on a
  leave-one-season-out refit to be called STABLE (else "single-season, unstable").
- **Roster-conditional caveat (Cory's, carried verbatim)**: other owners' picks
  reflect THEIR rosters and needs, so "was this a good pick" (market-relative,
  answered here) ≠ "would this have been a good pick FOR CORY" (roster-conditional,
  NOT answered here). The residual is the market-relative quantity; the
  roster-conditional question requires the strategy grid (exp 44) and is deferred
  to it explicitly.

## What it does NOT claim

No install, no re-weighting. It is a reliability/skill SURFACE (like exp36), the
descriptive substrate the strategy grid and the B0 decomposition consume. Dollars
are not per-pick clean (a pick's dollars depend on the roster it joins), so this
LEADS in realized POINTS residual — the robust quantity — exactly as exp36 does;
the dollar translation lives in the roster-level grid.
