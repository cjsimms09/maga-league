# Conditional value for CORY'S keeper roster — stacks + handcuffs, measured (2026-08-16)

**The mandate** (docs/queued/conditional-value-program.md, Cory verbatim): *"Joe
burrow probably worth more to me than other since I have chase but how much
more... is Derrick Henry's backup worth more to me than someone else? How much
more? Our model needs to take all these things into account when deciding
value. Because the question is value to me, in this league, under these
circumstances."*

**His roster this is priced for** (draft/config/keepers.json, slot 8, the only
non-provisional seat): **Ja'Marr Chase (WR, CIN)**, **Derrick Henry (RB,
BAL)**, **Kenneth Walker (RB, KC)**.

**What is measured and what is model, up front.** Correlations, availability,
and conditional production are MEASURED from the committed component stores
(2021-25 weekly rows scored under the frozen league table —
`draft/backtest/conditional_value.py`). The weekly-high pricing is a MODEL:
the champodds machinery (same generators, measured WEEKLY_SD 21.3, seeded MC,
`draft/tools/conditional_value_sim.js`) run with the measured covariance ON
vs OFF over a 10-team equal-mean field. Every number below carries its n;
five seasons of weekly rows is a noisy basis for a correlation and the n is
part of the number.

**GATED.** Nothing here touches the board, proj_mean, the composite, or any
recommendation surface. Artifact: `draft/data/conditional_value_2026.json`
(`_territory` first, ships OFF). Wiring any of it into the war room is
Cory's ruling — this doc is the evidence for that ruling.

---

## 1. The stack answer: what Burrow is worth TO CORY vs to the board

**Measured correlation.** Burrow↔Chase weekly scores, five seasons, 60 shared
weeks: **pooled r = 0.52** (per season: 0.65 / 0.54 / 0.48 / 0.56 on 16/11/10/16
weeks — and **−0.24 on the 7-week injury-broken 2025**, which is what a
7-week correlation looks like, not a regime change). The class baseline —
every NFL QB↔WR1 pair 2021-25, **151 pairs, 1,992 weeks** — pools to
**r = 0.40** (spread across pairs ±0.28). Burrow–Chase sits above the class
but inside its spread.

**What that buys in this league.** The pair adds 2·ρ·σ_QB·σ_WR ≈ **+122 pts²**
of weekly variance to Cory's team score (σ measured: Burrow 10.8, Chase 10.9
per week). Team weekly sd 21.3 → 24.0. In the 10-team weekly-high contest
(seeded MC, 20k sims, covariance ON vs OFF on common random numbers):

| arm | ΔP(weekly high)/wk | co-active wks | $/season | composite-pts equiv |
|---|---|---|---|---|
| pair ρ = 0.52 | **+1.9pp** (10.2%→12.1%) | 11.4 | **+$22.1** | **+31 season pts** |
| class ρ = 0.40 (shrunk arm) | +1.5pp | 11.4 | +$17.6 | +26 pts |
| ρ 95% band [0.31, 0.68] | +1.1pp … +2.5pp | 11.4 | **+$12.7 … +$28.8** | — |

**The number for the draft: Burrow is worth roughly +$18–22 a season to Cory
that he is worth to nobody else in the room — call it +26–31 composite
points, ~1.5–2 weekly points of mean-equivalent.** That is real and it is
not huge: about half a round of value at QB ADP 52, not a reason to reach two
rounds. If Burrow falls to Cory at market price, the stack is a genuine
tiebreaker over an equal-mean QB; it is not a reason to skip a better pick.

**The bust tail, priced, not hidden.** The same covariance raises bad weeks:
P(week's LOWEST score) +2.2pp, P(score < mean − 1sd) +3.1pp. In this league
the weekly pot pays the HIGH only and matchup means are unchanged, so the
low tail costs standings variance, not direct dollars — but stacked weeks
where Burrow+Chase both bust will lose matchups together. Both tails are in
the artifact.

## 2. Tee Higgins — Cory's instinct confirmed, with numbers

- **Higgins WITHOUT Burrow (Chase+Higgins only): the stack case is NEGATIVE.**
  Measured Chase↔Higgins r = **−0.19** (58 weeks; class WR1↔WR2 r = **0.01**,
  149 pairs, 1,947 weeks — same-team WRs do NOT rise together; they split a
  fixed pie). Priced: **−$6/season**. There is no roster-fit reason to pay
  Higgins' ADP 39. *"tee higgens probably not worth it for me to draft
  because his ADP is so high"* — correct, and now measured.
- **Higgins WITH Burrow (double stack)**: Burrow↔Higgins r = 0.35 (50 weeks)
  → **+$9.1/season, +14 composite pts** — real but small, and conditional on
  spending the QB pick first. A 4th-round price for a +$9 conditional stream
  is a bad trade; the double stack only argues for Higgins if he falls far
  past his market.

## 3. The handcuff answer: Henry's and Walker's backups, to Cory vs the field

**The class measurements (2021-25, top-24 RB1 seasons = 120 starter-seasons):**

- **P(an RB1 misses ≥1 game): 44%.** Mean 1.02 missed/season → **0.95
  expected missed starts per 15-week fantasy season** (miss rate 0.064/game).
- **Backup production in exactly the weeks his RB1 sat** (team played,
  starter had no row — the stores' own inactive signal): **12.5 pts/wk**
  (n = 111 elevated weeks, sd 7.6) vs **6.7** with the starter present. The
  elevation is real: +5.8 pts/wk.
- Replacement: measured wire RB level **7.8 pts/wk**; the field's startable
  bar (RB28 by proj) **11.5 pts/wk**.

**Premium arithmetic** (expected missed starts × max(0, elevated − bar)):

| starter | backup (board) | ADP | to CORY (class rate) | to CORY (his own rate) | to the FIELD |
|---|---|---|---|---|---|
| Derrick Henry (BAL) | **Justice Hill** (depth 2) | 217.5 | **+4.5 pts** | +7.9 pts | +0.9 pts |
| Derrick Henry (BAL) | Adam Randall (depth 3) | 306.0 | +4.5 pts | +7.9 pts | +0.9 pts |
| Kenneth Walker (KC) | **Emmett Johnson** (depth 3, market's pick) | 199.0 | **+4.5 pts** | +9.9 pts | +0.9 pts |
| Kenneth Walker (KC) | Emari Demercado (depth 2, chart's pick) | 313.0 | +4.5 pts | +9.9 pts | +0.9 pts |

The "own rate" column uses the starter's own measured availability: Henry 9
missed / 80 team-games — but 8 of the 9 are the one 2021 injury, so 0.95
(class) and 1.69 (own) bracket him; Walker 9/64 (missed games in 3 of his 4
seasons) → 2.11 expected missed starts, the higher-risk starter of the two.
Uncertainty: the elevated-week spread is sd 7.6 on n=111 — a specific
backup's elevated week can be anywhere from ~5 to ~20 pts.

**What this means at the table:**

- **A handcuff is worth ~5–10x more to Cory than to the room** (+4.5–9.9 pts
  vs +0.9) — the asymmetry Cory guessed is real — **but the absolute premium
  is small: 5–10 season points.** That is a 14th/15th-round price, never a
  mid-round one.
- **Both relevant handcuffs are FREE at market: Hill 217, Johnson 199 — both
  outside the 150-pick draft.** Round guidance: take ONE with the last pick
  (round 15) only if the board is flat there; otherwise they are week-1 wire
  claims. Walker's cuff before Henry's — Walker's own miss rate is twice the
  class rate and Henry's is class-average outside one old season.
- **KC depth-chart flag:** the market prices Emmett Johnson (ADP 199) as
  Walker's next man; the chart lists Demercado at depth 2. If the chart is
  right the market's handcuff is the wrong name — watch camp news, the
  premium follows the ROLE, not the name.
- **No WR handcuff for Chase.** Measured: elevated WR2s score **10.5**/wk
  (n = 65) — BELOW the WR wire level (11.1). A WR's absence spreads to the
  whole route tree, not to one backup. Premium ≈ 0; do not spend a pick.

## 4. Uncertainty, honestly

- **Pair correlations are noisy.** 60 shared weeks → ρ 95% band roughly
  [0.31, 0.68]; the dollar band $12.7–$28.8 is printed above, and the
  class-pooled arm (+$17.6) is the shrunk number to lean on. Class pools:
  QB-WR1 151 pairs/1,992 wks; QB-WR2 139/1,749; QB-TE1 142/1,759 (r=0.33);
  WR1-WR2 149/1,947.
- **Equal-mean field assumption:** the sim prices variance into a symmetric
  10-team contest at the measured sd 21.3. A team whose mean is already above
  the field gains a bit less from variance; below, a bit more.
- **Row-presence = "was on a field"** (the stores' rule): a healthy scratch
  and an injury read the same. For top-24 RB1s the difference is small; it
  is not zero.
- **Elevated production pools ALL top-24-RB1 backups** — committee backs and
  true bell-cow cuffs sit in one 111-week pool (sd 7.6). Justice Hill has no
  measurable elevated history behind Henry (Henry missed 0 games as a Raven)
  — his own history is ABSENT, not zero, and the class number stands in.

## 5. What ships, and what does not

- **Ships (this branch):** `draft/backtest/conditional_value.py` (measuring
  arm), `draft/tools/conditional_value_sim.js` (pricing arm, champodds
  machinery), `draft/data/conditional_value_2026.json` (the artifact, OFF),
  this doc, 35 pytest + 22 JS checks (`draft/tests/test_conditional_value.py`,
  `draft/tests/conditional_value_sim.test.js`).
- **Does NOT ship:** any change to the board, proj_mean, composite, VORP,
  seat plan, or any recommendation surface. The war-room surface that would
  read the artifact is routed TO:A in ROUTES.md; wiring the layer in is
  **Cory's ruling**, per the queued doc's own rule.

---

## 6. POSTSCRIPT — Cory ruled, and the display is wired (2026-08-17)

**The ruling, verbatim: "Yes!"** (2026-08-17, on this doc's evidence). Executed
on branch `conditional-value-wire`, exactly at the scope §5 reserved for it:

- **What renders.** On the war-room DRAFT tab, any player carrying a nonzero
  conditional premium for Cory's roster shows it as its own labelled chip
  beside board value — `stack +$18–22/season (Burrow×Chase r=0.52, n=60 wks)`
  style, always with the n — on the shortlist rec cards and the
  best-available-by-position detail. The drill-down panel carries the full
  readout: premium, mechanism, correlation (pair + class baseline, each with
  its n), the bust tail, the round-15-or-wire handcuff verdict, the KC
  market-vs-depth-chart flag, and the honest caveat that pricing ran on the
  v1 money model in the simulated-room proxy. Higgins' chip is roster-live:
  −$6 (no roster-fit case) without Burrow, +$9–10 (double stack) the moment
  Burrow is rostered.
- **What did NOT change.** No engine, composite, VORP, or build change — the
  composite score does not contain these numbers and every chip says "not in
  the score". The chip annotates; the adjudicated TAKE still owns the
  headline (no take control, no second name — pinned by test).
- **The gate, re-pinned deliberately.**
  `test_gated_by_construction_nothing_on_the_board_reads_this` fired exactly
  as designed and was replaced by the wired-state pair: the display half is
  pinned ON (a lost script tag or dropped fetch goes red), and the scoring
  half is PERMANENT — engine/composite/vorp/build/src may never read this
  layer. Separate print is the contract.
- **Plumbing.** The artifact gained display join keys (`pids` per stack —
  join by player_id, same key as the board); the builder writes a second
  byte-identical copy to `public/` (the web root) and the test suite pins the
  two together. Declared in `data_separation.test.js` as the named
  research-to-display promotion this ruling is.
- **Suites:** `test_conditional_value.py` 39 · `conditional_value_display.test.js`
  53 (new) · `conditional_value_sim.test.js` 22 (untouched) · cockpit
  contracts (rec_rows, app-wiring, panel_spec, warroom_mobile, robot-mock)
  green · `scripts/js-sweep.sh` 319 entry points all green.
  Screens: `draft/audit/screens/stack-wired-*.png` (1440×950).
