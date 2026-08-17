<!-- TERRITORY: A -->
# KEEPER SLATE 2026 — RE-RUN AGAINST THE CURRENT BOARD, 2026-08-16

**Asked:** has the 2026 slate ever been run through `keeper_optimize.py` /
`keepers.py` against the CURRENT board — and what is the answer.

**Answer to the first half: NO, and the tool cannot do it any more.** The only
recorded run (`draft/KEEPER-OPTIMIZER.txt`, quoted in `STATUS.md` §K0) is
against a board `built_at 2026-08-07T09:08:24Z` on `adp_source ffc`. The live
board is `2026-08-15T17:52:22Z` on `adp_source fantasypros`, and has since
been through the v4 → v6 own-model promotions. **Nine days and two model
promotions of drift, never re-checked.** Re-running `keeper_optimize.py`
today prints **"RECOMMENDED: keep 0 — nobody"** and offers Cameron Dicker.
That output is a silent-join defect, not a finding — §DEFECT-1.

---

## ✅ VERDICT — KEEP ALL THREE. NO CHANGE TO THE STANDING DESIGNATION.

**Keep Ja'Marr Chase, Derrick Henry, Kenneth Walker.** This is what Cory has
already designated on Sleeper, so **the action is: do nothing before the lock.**

| | surplus over the pick it forfeits |
|---|---|
| Ja'Marr Chase (WR) — costs round 1 | **+41.6** |
| Derrick Henry (RB) — costs round 2 | **+26.6** |
| Kenneth Walker (RB) — costs round 3 | **+40.4** |
| **total** | **+108.6 VORP** |

Margin over the best alternative trio (Henry / Chase / **Olave** in place of
Walker): **+21.5**. Margin over keeping only two: **+40.4**. This is **not** a
coin flip — see §4 for exactly how wrong the projections must be to flip it.

Everything below is stated against `public/draft_data.json` built
2026-08-15T17:52:22Z. Nothing here was written to the board, no designation
was changed, and `draft/KEEPER-OPTIMIZER.txt` was restored after the run.

---

## 0. GROUND TRUTH — WHAT IS CONFIRMED AND WHAT IS A GUESS

**Cory's own three are DESIGNATED, and that is a fact.** `kept_player_ids =
[3198 Henry, 7564 Chase, 8151 Walker]` on the artifact, matching
`draft/config/keepers.json` (`_designations_source: "sleeper"`) and the
league-history roster. They are the only keepers on the live board.

**The LEAGUE slate is NOT confirmed.** `keeper_slate.status = "predicted"`,
`confirmed: false`, `safe_to_treat_as_truth: false`. 4 of 10 teams have
designated; **no commissioner keeper placements exist on the draft yet**, so
even the four designations are intentions, not placements.

**Three OTHER teams have now designated — 8 players — and this is newer than
anything in STATUS.md:**

| owner | designated on Sleeper (FACT) |
|---|---|
| cashworth | Ashton Jeanty, Chase Brown |
| B8T3S | Jonathan Taylor, Drake London, Jahmyr Gibbs |
| MarianSaar | Justin Jefferson, De'Von Achane, Jaxon Smith-Njigba |

**Six teams are silent** (ds7mmet, Jreis, mhagen, Richard2121, Schmelley,
Sadbru). Under the repo's own rail — *empty is not none* — they are UNKNOWN,
not keeping zero. What they might keep is `predicted_keepers.json`, a **model
output** explicitly stamped *"PREDICTED slates for MOCK/REHEARSAL ONLY"*, and
the board correctly withholds all of it (`withheld_from_board: 3 teams / 8
keepers`).

### The rules (verified, `draft/config/league_config.json` → `keepers`)

`count: 3` · `cost_model: "top_picks_flat"` · `max_years: 3` ·
`undrafted_round: 10` · `undrafted_rule: "assigned_round"`.

**top_picks_flat = keeping N keepers forfeits rounds 1..N flat**, regardless of
where the player was originally drafted. So the cost is *positional*, the
highest-VORP keeper is charged round 1, and the decision is genuinely
"how many, and which" rather than "who is cheap". D2 is settled (STATUS §K0).

---

## 1. WHAT EACH CANDIDATE IS WORTH — and which baseline that is

The surplus definition is **`keepers.py`'s, reused, not reinvented**
(`optimize_keeper_count`, the `surp = (k.get("vorp") or 0.0) - alt` at line
449 that mirrors line 381):

> **surplus = the keeper's VORP − `expected_best_available(pool, pick,
> SAME POSITION)`** — i.e. the ADP-weighted expected VORP of the best player
> *at that same position* still on the board at the pick the keeper costs.

Two things about that baseline a reader must know:

1. **It is position-matched.** Keeping Chase is priced against the best *WR*
   expected at pick 8, not the best player of any position. That is a real
   modelling choice and it flatters a keeper whose position is thin at the
   forfeited pick. Priced instead against the **best player of any position**,
   the trio's total falls from +108.6 to **+84.0** and the order of the answer
   does not change (§3).
2. **`expected_best_available` walks candidates in ADP order and takes the
   first survivor**, so it assumes ADP order ≈ value order. Inside a position
   that is roughly true; across positions it is not (QBs). A second reason to
   read the position-matched number as the primary one.

VORP itself is the board's own: `proj_mean − replacement_points[pos]`, verified
to the cent against non-kept players. The three kept players carry no `vorp`
field on the artifact (§DEFECT-1), so it was recomputed with that identity.

**My 16 rostered players, all with a projection — 0 excluded for absence.**

| player | pos | VORP | | player | pos | VORP |
|---|---|---|---|---|---|---|
| **Ja'Marr Chase** | WR | **121.9** | | Jayden Daniels | QB | 0.0 |
| **Derrick Henry** | RB | **85.1** | | Cameron Dicker | K | 0.0 |
| **Kenneth Walker** | RB | **67.6** | | Quentin Johnston | WR | −25.8 |
| Chris Olave | WR | 50.6 | | Deebo Samuel | WR | −33.6 |
| Mike Evans | WR | 28.9 | | Aaron Jones | RB | −57.2 |
| Malik Nabers | WR | 27.1 | | Tyreek Hill | WR | −92.0 |
| Drake Maye | QB | 26.0 | | Zach Charbonnet | RB | −121.7 |
| Joe Burrow | QB | 20.4 | | George Kittle | TE | 0.9 |

(Daniels at exactly 0.0 is not a missing value — he *is* the QB replacement
player, proj 341.72 = `replacement_points["QB"]`.)

---

## 2. THE OPTIMAL SET, AND THE FULL RANKING

Three pool scenarios, because who else keeps changes what the forfeited pick
would have returned:

| scenario | keep 1 | keep 2 | **keep 3** |
|---|---|---|---|
| **S0** board as shipped (opponents' designations still in the pool) | +49.0 | +65.8 | **+106.2** |
| **S1** minus the 8 already-designated opponent keepers ← *best current truth* | +41.6 | +68.2 | **+108.6** |
| **S2** S1 + the model's predicted keepers for the 6 silent teams | +44.2 | +81.7 | **+122.0** |

**Keep 3 wins in every scenario**, and the third keeper is worth almost exactly
the same in all three (+40.4 / +40.4 / +40.3) because the players who leave the
pool were never going to reach pick 28 anyway. Keeping fewer is never close.

**Full keep-3 ranking (S1), top 12 of 560:**

| # | set | surplus |
|---|---|---|
| **1** | **Henry, Chase, Walker** | **+108.6** |
| 2 | Henry, Chase, **Olave** | +87.0 |
| 3 | Chase, Olave, Walker | +69.5 |
| 4 | Evans, Henry, Chase | +65.3 |
| 5 | Maye, Henry, Chase | +64.6 |
| 6 | Nabers, Henry, Chase | +63.5 |
| 7 | Henry, Burrow, Chase | +59.0 |
| 8 | Henry, Chase, Dicker | +58.2 |
| 9 | Evans, Chase, Walker | +47.8 |
| 10 | Maye, Chase, Walker | +47.1 |
| 11 | Nabers, Chase, Walker | +45.9 |
| 12 | Burrow, Chase, Walker | +41.4 |

**#1 beats #2 by 21.5 points — 20% of the whole decision.** That is not noise
(§4). The only realistic contender is Olave-for-Walker, and Walker beats him
because the *RB* board at pick 28 is barren (alt 27.2) while the *WR* board
there is deep (alt ≈ 31.8 against a much lower VORP).

---

## 3. WHAT IT COSTS IN DRAFT CAPITAL — the explicit trade

Keeping three forfeits **rounds 1, 2 and 3**. From the artifact's own
`pick_order`:

- my picks **without** keepers: 8, 13, 28, 33, 48, 53, 68, 73, …
- my picks **keeping three**: **33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148** — 12 picks, first at 33.
- first pick by keeper count (artifact `arithmetic_check`): keep 0 → 8, keep 1 → 13, keep 2 → 28, **keep 3 → 33**.

| keep | forfeits | that pick would have returned | net |
|---|---|---|---|
| Chase (WR 121.9) | R1 = board pick **8** | best WR expected there: **80.3** | **+41.6** |
| Henry (RB 85.1) | R2 = board pick **13** | best RB expected there: **58.5** | **+26.6** |
| Walker (RB 67.6) | R3 = board pick **28** | best RB expected there: **27.2** | **+40.4** |

**Is any of those rounds too steep to give up?** Read against the board's own
tiers and survival (S1 pool, >25% survival):

- **pick 8** — James Cook RB 93.1 (51%), Bowers TE 80.9 (85%), Lamb WR 79.0
  (90%), Barkley RB 73.4 (90%). A rich pick. Chase still clears it by 41.6 on
  a like-for-like basis and by 35.5 against the best player of any position.
- **pick 13** — Bowers 80.9 (71%), Barkley 73.4 (40%), A.J. Brown 65.6 (99%),
  Nico Collins 64.8 (100%). Henry clears it by 26.6 / 23.9.
- **pick 28** — the step down is sharp: DeVonta Smith 44.4, Zay Flowers 42.6,
  Loveland TE 38.0, McConkey 38.0, Breece Hall RB 35.9. **The best thing on
  the board at 28 is worth about half of Kenneth Walker.** This is the round
  where the flat cost model pays best, and it is why the third keeper is the
  *most* profitable of the three, not the least.

The honest counter-argument, priced: **against the best player of ANY position
at each pick** the totals become Chase +35.5, Henry +23.9, Walker +24.6 =
**+84.0**, still monotonically increasing in keeper count. **Keep 3 survives
the harsher baseline.**

**Structural cost not captured by VORP:** rounds 1-3 gone means the roster
enters the draft with RB1/RB2/WR1 filled and **twelve picks starting at 33**,
so QB / TE / WR2 / flex all come from pick 33 onward. That is already the
board's live assumption (`grab_by`, the keeper-need rule, the dead-zone
marker), so it is priced elsewhere and is not double-counted here.

---

## 4. SENSITIVITY — how much projection error does it take to flip this?

**First, a correction to the premise of the question.** `proj_sd` on the board
is **not** a measured 2023-25 error band. `draft/projections.py:241` sets it to
`proj_mean × player_variance` — a modelled season-outcome volatility from
heuristics (bell-cow usage, age). The **measured** error is elsewhere and is
not wired into the board at all: `draft/backtest/projection_error_calibration.json`
(1,304 graded players, 2023-25 walk-forward, 20 cells, none unmeasurable),
applied via `projection_error.proj_sd_for` — which is **referenced only by its
own tests**. I used the measured file, by position × projection-rank band.
(`draft/audit/roster_construction_2026-08-16.md`, cited in the brief for a
"3-9 MAE" figure, **does not exist in this tree**; the newest is `..._2026-08-12.md`,
which carries no such number. I did not use a figure I could not find.)

### (a) Break-even — the assumption-free answer

How far must each keeper's projection be **over-stated** before the
recommended set changes at all?

| player | proj | measured band | must be over-stated by | in measured sd |
|---|---|---|---|---|
| Ja'Marr Chase | 295.1 | WR 1-3, sd_ratio 0.231 | **24% (71 pts)** | 1.04 sd |
| Derrick Henry | 274.2 | RB 4-8, sd_ratio 0.355 | **14% (39 pts)** | 0.40 sd |
| Kenneth Walker | 256.6 | RB 9-16, sd_ratio 0.477 | **8% (22 pts)** | 0.18 sd |

Read this correctly: those are the thresholds at which the *set* changes —
and in every case the change is a **swap of one name, not a change in how many
to keep**. The keep-3 decision itself never flips in this exercise. Walker's
8% is the soft spot; if his projection is 22+ points hot, Olave is the better
third keeper, worth 21.5 points.

### (b) Bootstrap under the measured error — 400-600 draws, S0 and S1

Perturbing **every** projection on the board by its measured band and
re-running `optimize_keeper_count`:

- **keep-3 is the answer in 93-95% of draws** (keep-2 in 3-5%, keep-1/0 in <2%).
  Under every variant, both centred and with the measured bias applied, and in
  both pool scenarios. **The COUNT is robust.**
- **The exact trio is the modal winner in only 3-6% of draws.** Inclusion
  frequencies (S1, centred): Chase 50%, Henry 39%, Walker 37%, Daniels 29%,
  Maye 28%, Burrow 26%, Olave 24%.

**Do not misread the second bullet as "it's a coin flip".** The measured
`sd_ratio` is *total realized dispersion* — projection error **plus** a whole
season of football — running 0.23 to 0.67. Applied to 300-point projections it
swings players by 70-160 points, so ex post almost anyone can end up the best
keeper. That is a statement about season variance, not about the decision. The
decision-relevant quantities — the **+21.5** margin over the best alternative
set and the **+40.4** margin over keeping two — sit well outside what
plausible *projection* error moves, per (a). The repo holds **no measurement
of uncertainty in the projected mean** (the previous-years skill test,
EXP-FP-HIST-PROJ, is built and pre-registered but **has never been dispatched**
— `draft/audit/projection_skill_backtest_2026-08-15.md`), which is why (a) is
the primary sensitivity answer and (b) is the honest upper bound.

**Verdict on Q4: the keep-3 call is not inside the noise. The identity of the
third keeper has ~20 points of headroom and is the only part worth watching.**

---

## 5. OTHER OWNERS' KEEPERS — how much foresight is being assumed

**Almost none, and that is deliberate.** The recommendation above is S1, which
uses only the 8 designations Sleeper actually reports. S0 (assume nothing) and
S2 (trust the model for all six silent teams) both give the same answer, and
the total moves only **+106.2 → +108.6 → +122.0**. **The keeper decision does
not depend on forecasting nine owners.** It shifts the *level* of surplus, never
the *choice*, because the players in question are all top-20 and would be gone
before pick 8/13/28 in any scenario.

**But the prediction model's accuracy is now measurable, and it is mixed.**
Grading `predicted_keepers.json` against the three opponents who have since
designated:

| owner | model predicted | actually designated | score |
|---|---|---|---|
| B8T3S | Gibbs, Taylor, London | Taylor, London, Gibbs | **3/3 ✅** |
| MarianSaar | JSN (low), **Bowers (high)**, Jefferson (high) | Jefferson, **Achane**, JSN | 2/3 |
| cashworth | **keeps nobody** | **Jeanty, Chase Brown** | 0/2 ❌ |

**5 of 8 players (62%), 1 of 3 teams exactly.** The model got the *count* wrong
on cashworth in the direction that matters most (predicted 0, got 2 — though
Jeanty was its `next_best`, one notch under the line).

### 🔴 Two intel claims are now contradicted or untested — flagged, not acted on

1. **"MarianSaar keeps Bowers — HIGH confidence, source: Cory intel"**
   (STATUS.md:505) is **contradicted by Sleeper**. Marian designated Jefferson,
   Achane and JSN. **Brock Bowers is NOT designated** — VORP 80.9, tier 1,
   tier_drop 24.94, surviving **85% to pick 8, 71% to 13, 19% to 28, 8% to 33**.
2. STATUS.md:507 declares **"⚡ THE TE FORK COLLAPSED … both-TEs-gone is the new
   PRIMARY scenario"** on the strength of Bowers (Marian) *and* McBride
   (Richard2121) both being kept. Half of that premise is now false, and
   Richard2121 has not designated at all, so the other half is untested.

**This does not change the keeper answer** — Bowers is on someone else's
roster and Cory cannot keep him. It changes the **pick-33 dossier**, which
currently reads WR-feast / early-QB on the assumption that no elite TE reaches
the board. Filed as a DECISIONS-NEEDED item; not acted on here.

---

## DEFECTS FOUND — reported, not fixed (per the brief)

### DEFECT-1 🔴 `keeper_optimize.py` silently drops the players it exists to evaluate

`keeper_optimize.py:36-43` joins the roster to `art["players"]`. The board now
**removes designated keepers from that list** — they live in `art["kept_players"]`
— so `by_id.get(pid)` returns `None` for Chase, Henry and Walker and line 48's
bare `continue` drops them **without a word**. The tool then optimises over the
ten leftovers and prints:

```
RECOMMENDED: keep 0 — nobody  (total surplus 0.0)
  keep 1: Cameron Dicker   surplus -10.0
```

A plausible, confident, completely wrong answer to the highest-stakes pre-draft
decision — the exact "a filter over a real board always returns something
plausible" failure `gen_keepers_json.py`'s own docstring was written about.
It is also an **absent-is-not-zero** violation: three players vanish and
nothing is counted. Two sub-parts: (a) the join must fall back to
`kept_players`, (b) `kept_players` rows carry **no `vorp` field**, so the
consumer must recompute `proj_mean − replacement_points[pos]` or the join is
useless anyway. **A fix should also make the drop loud** — refuse, don't
`continue`.

### DEFECT-2 🟡 the run reads a stale roster export

`keeper_optimize.py` takes Cory's roster from `draft/data/league_history.json`,
which `gen_keepers_json.py`'s docstring already documents as a cached export
behind a `workflow_dispatch` flag the nightly rebuild never sets. It is
currently 2026-08-14 and shows only **2** designating teams where live Sleeper
(`draft/config/keepers.json`, 2026-08-15) shows **4**. The keeper answer is
unaffected — Cory's own roster has not moved — but the same file is a stale
input to anything else that reads it.

### DEFECT-3 🟡 `expected_best_available` ignores `replacement_by_pos` entirely

`keepers.py:499-516` accepts `replacement_by_pos` and never references it.
Every caller computes and passes one — `keeper_optimize.py:65-70` builds a
*median-VORP* map for the purpose. Harmless today (VORP is already
replacement-relative), but it is a parameter that looks load-bearing and is
not, and one of the callers does real work to feed it.

### DEFECT-4 🟡 scale mismatch, already documented next door, still live here

`keepers.py:317` (`live_index_of`) documents at length that `adjusted_adp` is
on the **live-selection** scale while pick numbers are **board** slots, and that
mixing them understates survival. `expected_best_available` compares
`adjusted_adp` against a raw board pick from `_pick_for_round`. With only three
keeper slots on the board the bias is small and pushes the alternative *down*
— i.e. it makes keepers look slightly **better** than they are. It does not
threaten a 21.5-point margin, but it is the same bug the neighbouring docstring
warns about.

### DEFECT-5 🟡 `predicted_keepers.json` prices Cory's own keepers off a magic 150

`predict_keepers.py:63-67` gives kept players `vorp = proj_mean − 150` because
`kept_players` carries no `vorp` (the same DEFECT-1 root). The board's actual
replacement is **WR 173.22 / RB 189.02**, so the artifact reports Chase at
**145.1** where the board's own arithmetic says **121.9**, Henry 124.2 vs 85.1,
Walker 106.6 vs 67.6 — every one of Cory's keeper surpluses inflated by 20-40
points. It also prices the round cost differently again (`vorp_at(5/15/25)`, the
6th/16th/26th best VORP on the whole board — a cross-position threshold, not
`expected_best_available`'s same-position one). **This is the mock/rehearsal
artifact, not the live board, so nothing shipped is wrong** — but any number
read out of `predicted_keepers.json` is on a third scale and must not be
compared with the two above. The keep-3 conclusion is the same on all three.

---

## WHAT I COULD NOT DETERMINE

- **Whether the four designations will hold.** No commissioner keeper
  placements exist on the draft yet; `keeper_slate.confirmed` is false and
  `keeper_lock_passed` is false. Designations can be changed until the lock.
- **What the six silent teams will do.** Model only, 62% player-accuracy on its
  first three graded teams. Immaterial to this decision (§5), material to the
  pick-33 plan.
- **Uncertainty in the projected mean.** Nothing in the repo measures it. The
  previous-years skill test exists, is pre-registered, and has never been run
  (one `workflow_dispatch` away). Until it runs, §4(a) break-evens are the
  honest sensitivity and §4(b) is the upper bound.
- **The brief's cited `draft/audit/roster_construction_2026-08-16.md` and its
  "3-9 MAE per position per player-season".** That file is not in this tree and
  no such figure appears in the 08-12 version or anywhere under `draft/audit/`.
  I used the measured calibration file instead and said so.
- **Whether `max_years: 3` binds anyone.** 2023 and 2025 carry no keeper
  designations at all in `league_history`, so years-kept cannot be reconstructed
  for opponents — `predicted_keepers.json` says the same in its own note. It
  does not bind Cory's three (first kept 2024/2026).

---

## REPRODUCTION

Read-only; nothing in `draft/` or `public/` was modified.

- `draft/keeper_optimize.py` run as-is → the DEFECT-1 output above;
  `draft/KEEPER-OPTIMIZER.txt` restored with `git checkout` afterwards.
- The corrected run reuses `keepers.optimize_keeper_count`,
  `keepers.expected_best_available`, `keepers.survival_probability` and
  `keepers._pick_for_round` unmodified; only the roster→board join and the
  VORP recovery for kept players are done by the harness.
- Suite at the time of writing: `pytest draft/tests -q -m "not repo_parity"` →
  **2174 passed, 1 failed, 6 skipped** (130s). The single failure is
  `test_core_needs_no_reviewer.py::test_NO_WORKFLOW_MAKES_A_MODEL_JOB_DEPEND_ON_THE_REVIEWER`
  — `config-check.yml` references the reviewer. Pre-existing on this tree,
  unrelated to keepers, untouched by this work.
