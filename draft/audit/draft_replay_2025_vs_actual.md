<!-- TERRITORY: A -->
# THE DRAFT REPLAY — would the tool have drafted a better team for Cory? — 2026-08-16

## 0. The question, verbatim, and the direct answer

Cory, 2026-08-16:

> "Have we tested our draft model vs previous year? Would it have drafted a
> better or worse team for me?"

The honest answer when he asked: **no, we had never tested it.** The test now
exists (`draft/tools/draft_replay_2025.py`, artifact
`draft/data/draft_replay_2025.json`, tests
`draft/tests/test_draft_replay_2025.py`), and under his follow-up ruling
("Do 1, 2, 3, 6!!") it replays **2023, 2024 and 2025** — the tool in Cory's
real seat, his real keepers, everyone else's picks exactly as history
recorded them, graded on actual weekly points.

**THE DIRECT ANSWER: a slightly WORSE team, on the primary measure, in all
three years — and that is the finding, published at full volume.** On
hindsight-optimal weekly lineups (the roster-quality measure) Cory's actual
drafted rosters outscored the tool's rosters by **17 / 58 / 122 points**
(2025 / 2024 / 2023), a pooled mean of **−66 points per season (−3.9/week)**
against the tool. On the realistic start-of-week lineup arm the pooled gap
narrows to **−6.5/season** and 2025 flips to the tool by **+78** — the one
bright cell, with the caveats in §5. Cory wins the pooled optimal-arm
head-to-head **31 weeks to 20**.

Three samples, one alternative history each, a policy arm weaker than the
shipped product (§6) — this is not proof the tool is bad at drafting. But
the claim "the tool would have drafted you a better team" is now TESTED and
is, on the evidence, **false for the tested arm**. Nobody gets to imply
otherwise at the table on the 22nd.

## 1. What exactly was replayed (and what "the tool" means here)

- **Seat, keepers, opponents:** Cory is roster 1 in every recorded season.
  His real keepers apply exactly (2025: Chase/Nabers/Henry; 2024: Chase;
  2023: Chase +2, from the 30-pick keeper-ledger draft record). Every other
  owner's pick stays byte-identical to history — **fixed-opponents
  counterfactual, no butterfly effects**; when the tool takes a player an
  opponent took later in reality, that pick is counted as *shadowed*
  (5 / 8 / 3 per year), never cascaded.
- **The pick policy — the arm actually tested, said plainly:** the full
  shipped engine (VONA wire, KOV, survival, market fields) cannot run
  period-correct — it is wired to the 2026 board. What ran is the
  **value-policy core: BPA-by-VORP with needs rails** (replacement from the
  repo's own `vorp.py` under the real league config; primary caps
  QB≤2/RB≤7/WR≤7/TE≤2 — a third onesie can never start; starter-feasibility
  rail; K/DEF mirrored from Cory's actual picks, so they cancel exactly).
- **Projections — walk-forward, season-vintage:** the graded own_v6
  construction rebuilt per year with only strictly-prior seasons (fit Y−2 →
  Y−1, predict Y; 2021-22 points scored from the committed component stores
  under the frozen table). **The market arm is removed** — v5/v6's market
  input IS the season-Y league draft, the event being replayed; feeding it
  back would be circular. A leakage test traces every file open on the
  projection path and fails if any ≥ replay-season store is touched.
- **Grading:** both rosters frozen as drafted, scored on actual weekly
  points (weeks 1–17), two arms: (a) hindsight-optimal lineups — the
  roster-quality measure and the primary number; (b) realistic
  start-of-week lineups (rank by season-to-date ppg, week 1 by projection;
  no scored row that week ⇒ treated as known-inactive and benched — the
  named approximation, applied to both rosters identically).

## 2. The verdict tables

**Primary arm — hindsight-optimal lineups, skill slots, weeks 1–17
(K/DEF mirrored and excluded — they cancel):**

| year | tool total | Cory-drafted total | Δ tool−Cory | h2h weeks |
|---|---|---|---|---|
| 2025 | 1423.9 | 1440.7 | **−16.9** | 10–7 tool |
| 2024 | 1979.1 | 2037.1 | **−58.0** | 11–6 Cory |
| 2023 | 1572.8 | 1694.9 | **−122.1** | 13–4 Cory |
| **pooled mean** | | | **−65.7/season (−3.9/wk)** | **31–20 Cory** |

**Realistic arm — start-of-week lineups:**

| year | tool | Cory-drafted | Δ | h2h |
|---|---|---|---|---|
| 2025 | 1335.6 | 1257.7 | **+77.9** | 12–5 tool |
| 2024 | 1743.6 | 1741.3 | +2.3 | 10–7 Cory |
| 2023 | 1391.0 | 1490.8 | −99.8 | 11–6 Cory |
| **pooled mean** | | | **−6.5/season** | |

**Record replay (informational)** — the frozen counterfactual rosters
(realistic arm + the shared K/DEF's league-recorded weekly points) against
Cory's real schedule and his opponents' REAL full-season scores, weeks 1–15.
Both frozen rosters carry the same no-waivers bias, so read the tool-vs-
drafted gap, not the levels:

| year | tool W-L | Cory-drafted W-L | Cory actual W-L (waivers and all) |
|---|---|---|---|
| 2025 | 3–12 | 1–14 | 5–10 (7th) |
| 2024 | 6–9 | 5–10 | 9–6 (5th) |
| 2023 | 8–7 | 10–5 | 9–6 (4th) |

The champodds machinery was deliberately NOT run — it is built around 2026
inputs; the schedule replay above is the honest substitute.

## 3. The pick-by-pick story (where the gaps actually came from)

**2025 (Δ −16.9 optimal, +77.9 realistic — essentially a wash, the tool's
best year).** Shared: Chase/Nabers/Henry keepers, and the tool re-drafts
Kittle, Walker and B. Robinson at different slots. The divergences:

- R4: tool **Jayden Daniels** (proj 375.6, actual 128.3 — hurt) where Cory
  took Kittle (127.6). A wash by luck, not by design.
- R6: tool **Joe Mixon** (proj 182.5, actual **0.0** — never played; the
  room itself spent pick 68 on him, so the mistake was the market's too).
- R7: tool **Jared Goff 347.8** where Cory took pid 12530 (49.8, out after
  week 7) — **+298, the single biggest pick swing in the whole replay.**
- R9: Cory's **Chris Olave 218.0** vs tool's Rachaad White 117.9 (−100) —
  Cory's WR instincts beat the tool's RB value read.
- Net: Cory's WR room out-scored the tool's by 404; the tool's QB room
  out-scored Cory's by 335 and its optimal QB slot carried it to 10–7 in
  weeks — but Cory's roster concentrated points in startable slots better,
  so the optimal totals still lean Cory by 17.

**2024 (Δ −58.0 optimal — the rookie year).** The tool's R2 **Josh Allen
(428.3)** over Cory's Marvin Harrison (150.7) is +278... and then the
structural limit eats all of it: **five of Cory's picks were rookies the
tool cannot see** (no prior NFL season ⇒ no walk-forward projection):
Daniels (401.6), Nabers (204.2), Caleb Williams (281.6), MHJ (150.7),
Brooks (6.0) — 1044 actual points the tool's board did not contain, against
which it drafted Thielen (108.6), Hopkins (119.0), Lockett (92.7). Cory
also found **Chase Brown (228.0)** at R10 where the tool took Thielen. His
actual 2024 draft was genuinely good, and most of its edge came from
exactly the players a stats-only walk-forward board can never hold.

**2023 (Δ −122.1 optimal — the worst year, and the most instructive).**
The tool's board prices **Tom Brady at 323 projected points (actual: 0 —
retired in February, as every human knew)** and takes him R5; it takes
**Fournette (2.0, unsigned)** R8 and Dalvin Cook (32.7, washed) R4 — the
room passed on Brady/Fournette entirely. This is the **no-news structural
limit**: the committed stores carry no roster-status information. Cory
meanwhile drafted Kittle 170.7, James Cook 204.0, Montgomery 189.2,
Pickens 177.0. Restricting the tool's pool to players the room actually
drafted (the bracket arm, §4) recovers 43 points of the 122 — the rest is
Cory out-picking the projections.

## 4. The sensitivity grid — the verdict does not hinge on one design choice

Optimal-arm Δ (tool − Cory) per cell; primary = onesie caps × unfiltered
walk-forward board:

| year | PRIMARY (QB2/TE2, open board) | room caps (QB3/TE3) | room-draftable pool | both |
|---|---|---|---|---|
| 2025 | −16.9 | +17.2 | +40.8 | −50.8 |
| 2024 | −58.0 | −92.7 | −21.0 | −21.5 |
| 2023 | −122.1 | −202.9 | −79.3 | −131.9 |

Read: 2024 and 2023 are **negative in every cell** — no defensible
configuration has the tool beating Cory's real drafts in those years. 2025
flips sign cell to cell, i.e. it is a coin-flip year, consistent with its
−17/+78 split across arms. The room-draftable filter (which imports the
room's news knowledge AND its value opinions about the event being
replayed — leak direction named)
recovers 37–43 points in 2023/2024 but never the verdict. The 12530-as-FLEX
bound moves 2025's primary from −16.9 to −33.4: the verdict survives its
own unknown.

## 5. Why the tool loses — the mechanisms, named

1. **No rookies exist on a walk-forward stats board.** 2024 alone: 1044
   actual points of Cory's draft were literally invisible. Real drafting
   competence includes rookies; this test cannot price that part of the
   tool's eventual product (the live 2026 board carries rookie
   projections via market inputs — the exact arm this replay had to
   remove).
2. **No news exists on the committed stores.** Brady-2023 is not a
   projection error, it is an information-set hole; a real August tool
   with any ADP feed would never surface him. Bracketed in §4, but the
   bracket itself leaks the room's opinions, so the honest primary keeps
   the hole and names it.
3. **Raw VORP over-buys QBs in this 6-pt-pass-TD league** — the exact §5
   pathology `roster_construction_2026-08-16.md` documented in
   simulation, now visible against real history: under the room caps the
   tool buys a third QB and third TE every year and the grid column gets
   WORSE everywhere it matters (2023 −202.9 vs −122.1; 2024 −92.7 vs
   −58.0); even contained by the onesie caps, 2025's +335 QB surplus over
   Cory could not win the year, because a surplus QB's points mostly
   cannot start. Value the caps can contain but not convert into the
   WR/RB points the projections don't believe in.
4. **The walk-forward projections under-rank ascending WRs** (Olave,
   Pickens, London, JSN, Chase Brown-class RBs) — recency-blended stats
   boards price last season, not trajectory; Cory's actual picks
   repeatedly beat the model exactly there. This is REC-3's known 3–9
   MAE projection error doing its work on real drafts.
5. **What the +78 realistic-2025 cell is worth:** it says the tool's 2025
   roster was deeper in startable floor (three usable QBs, six RBs) so a
   week-to-week manager following simple rules would have out-pointed
   Cory's injury-hit actual room. Real, but one cell of eighteen, and the
   optimal arm — the roster-quality measure — still leans Cory.

## 6. What this licenses, and what it does not

- It does NOT license "the draft tool is worse than Cory, full stop." The
  tested arm is the value-policy core over a market-less, rookie-less,
  news-less season-vintage board — strictly weaker than the shipped 2026
  engine, whose largest measured projection gains (the market arm,
  +1.0–2.6 MAE at RB/WR/TE in v5's ablation) were exactly what the replay
  had to strip for circularity. That weakness is structural to any honest
  replay of this league's history, and it is why the headline is phrased
  about THE TESTED ARM.
- It DOES license two product conclusions for the 22nd: **(1)** the edge,
  if any, is not in raw value-vs-projection picking — Cory's own reads
  beat that arm three years running; the engine's market anchoring and
  needs machinery are load-bearing, not decoration (the same conclusion
  the archetype tournament reached in simulation). **(2)** the known
  projection weakness — ascending second-year skill players — is where
  Cory's human reads add measurable value over the model; at the table,
  when Cory's read disagrees with the board on a trajectory player, this
  is the documented evidence his read has been right before.
- One year is one sample; three are three. No CI is quotable on n=3 and
  none is quoted.

## 7. Machinery, tests, and the rule-10 record

- Tool: `draft/tools/draft_replay_2025.py` (pure functions; deterministic
  byte-for-byte artifact; `_territory` first). Artifact:
  `draft/data/draft_replay_2025.json` (all three years, both arms, the
  grid, pick logs, rosters, record replays, every counter).
- Tests: `draft/tests/test_draft_replay_2025.py`, 24 checks — replay
  determinism; the **leakage guard** (traces every file open during the
  projection build for each year and fails on any ≥ replay-season weekly
  or component store, league history, or board-market file; the one
  multi-season Vegas file is pinned to its week-1-only call site);
  pick-availability and fixed-opponents correctness against the real
  draft (including the shadow-counter identity); needs-rail and cap
  fixtures with a forced-pick case; hand-computed optimal and realistic
  lineup cases with flex-boundary flips; substrate parity pins
  (`weekly_points_of(2024)`, `features_of(2025/2024)` bit-equal to the
  graded own-model modules); artifact-shape and internal-consistency
  identities; and the committed-artifact regeneration pin
  (`repo_parity`-marked, registered in `test_gate_selection.py`).
- Rule 10, discharged: the availability rail was deliberately broken
  (candidate loop ignoring `taken`) and the board-consistency test went
  red by name in all three years ("picked twice") before the rail was
  restored; the leakage tracer was verified non-vacuous by asserting it
  saw the expected store opens.

## 8. Named limitations (the full honesty list, also carried in the artifact)

1. One alternative history per year; three samples total.
2. Fixed opponents — no reactions, no butterfly effects; shadowed picks
   counted (5/8/3), never cascaded.
3. Season-vintage construction minus the market arm — tests the model as
   it could have existed that August, not the 2026 product.
4. No rookies and no roster-status news on the tool's board (counted and
   bracketed per year).
5. Vegas week-1 lines close after a late-August draft; kept because the
   graded v6 construction carries them (preseason-market proxy), named.
6. Both rosters frozen as drafted — no waivers/trades; the record replay
   pits frozen rosters against fully-managed real opponents (biased low
   for both counterfactual arms equally).
7. K/DEF mirrored and excluded from lineup arms — they cancel exactly;
   their league-recorded points enter only the record replay,
   identically for both sides (missing weeks counted zero: 10/11/7).
8. The realistic arm treats row-absence as the inactive report (in-game
   exits count as foreseen) — same rule both rosters.
9. Cory's 2025 pick 64 (pid 12530) is absent from the committed positions
   record (the repo's own known gap); excluded from lineups in the base
   arms, FLEX-eligible in a bound arm — the verdict survives both.
