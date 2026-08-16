# Projection correctness — the two Cory-ruled fixes, evidence-first (2026-08-16)

**The ruling, verbatim (Cory, 2026-08-16):** *"Don't agree with timelines we fix
now"* — overriding every audit's defer-to-post-draft recommendation on the two
open projection-correctness items: **DECISIONS-NEEDED #0** (DEF `def_fum_td`
maps to nothing) and **#000** (WR/TE FP-vs-Sleeper ~20% scale gap). Both are now
FIXED, on evidence fetched for the purpose, with the fixes live in the code path
AND applied to the committed board. Draft is 2026-08-22, six days out.

**The evidence file everything below reads from:**
`draft/audit/proj_correctness_evidence_2026-08-16.json` — raw provider rows
fetched in CI (Sleeper and FantasyPros are 403 at the sandbox egress proxy, the
same policy denial rule12 hit), committed by the probe workflow, **scored by
nothing at capture time** (rule12_statline_probe.py discipline: the conversion
under audit must not be performed by the file that fetches its inputs). Probe:
`draft/proj_correctness_probe.py`. Before anything was changed, the capture was
proven to BE the build's own input record: all 32 DEF rows and 413 of 423
name-joined FP rows rescore to the committed board **to the cent** under the
old code path.

*Mechanical note for the record: GitHub only resolves `workflow_dispatch` by
filenames registered on the default branch, so the branch's copy of
`rule12-statlines.yml` (registered on main) was temporarily repointed at the
new probe for exactly one dispatch (commit `2a49214d`), then restored
byte-identical to main's version in the fix commit. The permanent workflow
`proj-correctness-probe.yml` is on this branch for future runs once merged.*

---

## #0 — DEF projections: the missing TD vocabulary (was "12 points short")

### What the league actually pays (from the league's own Sleeper settings)

`draft/data/sleeper_league_settings.json` (and the identical committed
`league.scoring`): **`def_td: 6.0`** (defensive TDs — fumble returns AND
pick-sixes), **`def_st_td: 6.0`** (DST special-teams TDs — kick/punt returns),
with the component duplicates zeroed (`def_kr_td`/`def_pr_td` 0.0) and the
individual-player forms zeroed (`st_td` 0.0). Realized rows speak this
vocabulary: LAR's 2025 prior-season row (rule12_statlines.json) carries
`def_td: 1.0`, `def_st_td: 1.0` and **no component keys**.

**Correction to the 2026-08-15 re-check recorded in #0:** that re-check read
`def_kr_td: 0.0` as "this league deliberately does not reward kick/punt-return
TDs." Incomplete: the league prices the **aggregate** `def_st_td` at 6.0 —
zeroing `def_kr_td` is how a Sleeper league avoids paying the same event twice
when both keys fire, not a decision that return TDs are worthless. A projected
DST return TD is worth 6.0 in expectation under this league's real scoring.

### What Sleeper's projections actually say (all 32, measured, not sampled)

Key census across ALL 32 DEF projection rows in the capture:

| projection key | rows | realizes as | league pays |
|---|---|---|---|
| `def_fum_td` (fumble-return TD) | 1 (LAR: 2.0) | `def_td` | 6.0 |
| `pass_int_td` (pick-six) | 4 (ARI 1, JAX 2, MIN 1, NE 1) | `def_td` | 6.0 |
| `def_kr_td` (DST kick-return TD) | 4 (DAL, DET, LAR, NO) | `def_st_td` | 6.0 |
| `pr_td` (DST punt-return TD) | 5 (CAR, HOU, MIN, NE, SEA) | `def_st_td` | 6.0 |
| `def_td` / `def_int_td` / `def_st_td` / `fum_rec_td` | **0** | — | — |

**The double-count question #0 recorded as the trap, answered by measurement:
the aggregates never appear in any of the 32 projection rows**, so folding the
components into them cannot double-pay any row Sleeper served. `pass_int_td` is
exactly the "`def_int_td`-style key" the re-check predicted might exist —
found, under a different spelling. And the no-hidden-double-count arm: for all
32 rows, Sleeper's own `pts_std` reconstructs as `sack×1 + int×2 + fum_rec×2 +
blk_kick×2` — their own totals exclude the TD components too (their default
scorer skips them for the same reason ours did), so the components are new
value everywhere, never a second counting of something already inside a paid
stat.

**Scope trap, measured:** individual returners' projection rows carry the same
keys (`def_kr_td` on 1 RB, `def_kr_td`+`pr_td` on 2 WR in the capture) and the
league prices an individual ST TD at `st_td: 0.0` — so normalization applies
ONLY to team-defense rows. The gate is the id shape (Sleeper keys DSTs by team
code, never a numeric id), pinned by test.

### The fix

* `draft/scoring.py` — `DEF_PROJ_TD_ALIASES` + `normalize_def_stat_line()`:
  components SUM into their aggregate **only when the provider did not send the
  aggregate**; an arriving aggregate wins outright and components are dropped
  (first-writer-wins — C's alias discipline, pinned by a synthetic-both-present
  test so the silent undercount can never become a silent overcount).
* `draft/projections.py` — `baseline_from_projections()` normalizes
  non-numeric-id (DST) rows before scoring. Live for every future build.
* Committed board regenerated through the real generators (below).

### The Rams case, by hand (the ruled acceptance test)

`sack 52×1 + int 15×2 + fum_rec 11×2 + blk_kick 1×0 + pts_allow_0 1×10 =`
**114.00** (the shipped defect) `+ def_fum_td 2×6 + def_kr_td 1×6 =` **132.00**.
Pinned in `test_projection_correctness.py::test_rams_recomputed_by_hand` as an
independent sum, not a call into the scorer. (The original #0 measured −12 on
the Rams; the full-vocabulary sweep found the third TD hiding in the same row —
the actual shortfall was 18.)

### Board impact (11 of 32 DEFs move; replacement 99.0 → 103.0)

ARI 74→80 · CAR 89→95 · DAL 94→100 · DET 100→106 · HOU 112→118 · JAX 99→111 ·
LAR 114→132 · MIN 100→112 · NE 100→112 · NO 85→91 · SEA 111→117.

| DEF | proj_mean | vorp | overall rank | pos rank |
|-----|----------|------|--------------|----------|
| LAR | 114 → 132 | 15 → 29 | 52 → 35 | 1 → 1 |
| HOU | 112 → 118 | 13 → 15 | 55 → 53 | 2 → 2 |
| SEA | 111 → 117 | 12 → 14 | 56 → 56 | 3 → 3 |
| NE | 100 → 112 | 1 → 9 | 78 → 60 | 7 → 4 |
| MIN | 100 → 112 | 1 → 9 | 79 → 61 | 8 → 5 |
| JAX | 99 → 111 | 0 → 8 | 88 → 64 | 10 → 6 |
| PHI | 106 → 106 | 7 → 3 | 65 → 74 | 4 → 7 |
| DET | 100 → 106 | 1 → 3 | 81 → 76 | 9 → 8 |
| DEN | 104 → 104 | 5 → 1 | 69 → 80 | 5 → 9 |
| BAL | 103 → 103 | 4 → 0 | 72 → 83 | 6 → 10 |
| DAL | 94 → 100 | −5 → −3 | 105 → 96 | 15 → 11 |
| PIT | 96 → 96 | −3 → −7 | 96 → 107 | 11 → 12 |

The DEF pecking order genuinely changes (NE/MIN/JAX enter the streamable top
six; PHI/DEN/BAL fall out) — this is why the fix was gated on a ruling and not
shipped silently. 132 players' vorp/rank/tier cells moved in total (the DEF
rows themselves plus everyone whose overall_rank shifted under them).

---

## #000 — the WR/TE FP gap: dropped receptions, not a scale opinion

### The mechanism, found in the payload

FantasyPros' live 2026 projections payload
(`api.fantasypros.com/v2/json/nfl/2026/projections?...scoring=HALF&week=draft`)
serves receptions as **`rec_rec`**. `_FP_STAT_MAP` knows `rec`/`receptions` —
neither appears anywhere in the payload (raw key census, all 596 rows: 437
`rec_rec`, zero `rec`). So every FP projection on the board was scored **with
receptions dropped**:

* **WR 0.824 / TE 0.810** median FP/Sleeper — reception points are ~19–25% of a
  receiver's total at 0.5/rec;
* **QB 1.001** — nothing to lose;
* **RB ~1.02** — the control that blocked the original diagnosis for four days:
  RBs *did* lose their reception points, and FP's genuinely higher rushing
  volumes happened to mask it (post-fix RB ratio 1.14 — FP simply likes RBs
  more than Sleeper does, which was invisible while the reception hole offset it).

### Proof the recovery is exact (not a rescale)

For 249 board WR/TE with an unambiguous FP row:
`score_stat_line(mapped stats) + 0.5×rec_rec (+2×2pt_tds)` equals **FP's own
`points_half`** — median error 0.00, IQR ±0.01. Receptions were the *whole*
gap, and our scoring table at WR/TE is exactly half-PPR, so the recovered
column is FP's intended number under compatible units. The structural test the
diagnosis asked for ("points-per-season under WHOSE scoring?") answers:
**standard-scoring shape at WR/TE**, purely because the reception term was
dropped in our parse — not a genuine FP opinion and not a different season
basis. A multiplicative rescale would have been strictly worse: FP's reception
opinions are real, independent signal (Chase: FP 121.1 rec vs Sleeper 109;
Bowers: FP 96.5 vs Sleeper 102) that a position-level factor would have erased.

Historical cross-check: `exp_fp_hist_proj` (FP ARCHIVE endpoints, 2023–25)
graded with near-zero WR/TE bias — the archive payloads serve `rec` and parsed
correctly, which is why the historical grades looked sane while the live column
was broken. The archive-based grades are unaffected and untouched.

### The fix

* `draft/adp.py` — `recover_fp_dropped_stats()` re-parses the raw payload and
  injects `rec_rec` (as `rec`) and `2pt_tds` (only under uniform 2pt pricing)
  into the parsed rows **before scoring**, with alias discipline (an
  already-mapped `rec` wins; duplicate raw names are skipped, never guessed) —
  wired into `build_fantasypros_projections`, live for every future build.
  Deliberately NOT a `_FP_STAT_MAP` edit: draft/backtest is a read-only record
  of graded experiments this pass, and the archive endpoints its grades parsed
  serve `rec` and must keep parsing unchanged.
* Committed board `proj_fantasypros` recovered on **309 players** (of 426
  carrying both sources; 10 skipped because FP's numbers drifted since the
  board build — a stale join is not patched, it self-heals on the next CI
  rebuild; 35 board names had no unambiguous FP row and are untouched; the
  rest recomputed to the same value, i.e. no receptions to recover).

New live ratios: **QB 1.001 · RB 1.138 · WR 1.039 · TE 1.059** — the two
providers now disagree the way two opinions do, not the way two unit systems
do. Per #000's own standing rule, genuine disagreement is averaged, not
corrected: no further rescale applied.

### Measured board impact — top-30 consensus movement

`proj_mean` itself (Sleeper-blend) is untouched by #000 — the FP column feeds
the consensus/sanity surfaces (`consensus.js rawProjection`, proj_feed's
`sleeper_fp_average` source) and the source-disagreement machinery. The
consensus ordering movement (mean of present sources, the rawProjection rule):

| # | player | pos | consensus before | after | rank before | move |
|---|--------|-----|-----------------:|------:|------------:|-----:|
| 1 | Josh Allen | QB | 402.7 | 402.7 | 1 | — |
| 2 | Lamar Jackson | QB | 356.0 | 356.0 | 2 | — |
| 3 | Drake Maye | QB | 348.2 | 348.2 | 3 | — |
| 4 | Jalen Hurts | QB | 343.8 | 343.8 | 4 | — |
| 5 | Matthew Stafford | QB | 339.4 | 339.4 | 5 | — |
| 6 | Jared Goff | QB | 335.9 | 335.9 | 6 | — |
| 7 | Caleb Williams | QB | 333.5 | 333.5 | 7 | — |
| 8 | Joe Burrow | QB | 331.8 | 331.8 | 8 | — |
| 9 | Patrick Mahomes | QB | 330.4 | 330.4 | 9 | — |
| 10 | Dak Prescott | QB | 329.8 | 329.8 | 10 | — |
| 11 | Bo Nix | QB | 329.0 | 329.0 | 11 | — |
| 12 | Justin Herbert | QB | 326.4 | 326.4 | 12 | — |
| 13 | Trevor Lawrence | QB | 324.5 | 324.5 | 13 | — |
| 14 | Baker Mayfield | QB | 317.9 | 317.9 | 14 | — |
| 15 | Brock Purdy | QB | 317.4 | 317.4 | 15 | — |
| 16 | Jayden Daniels | QB | 314.4 | 314.4 | 16 | — |
| 17 | Jaxson Dart | QB | 306.2 | 306.2 | 17 | — |
| 18 | Jahmyr Gibbs | RB | 290.2 | 302.1 | 20 | +2 |
| 19 | Jordan Love | QB | 300.8 | 300.8 | 18 | −1 |
| 20 | Sam Darnold | QB | 300.7 | 300.7 | 19 | −1 |
| 21 | Bijan Robinson | RB | 276.9 | 290.2 | 21 | — |
| 22 | Kyler Murray | QB | 266.0 | 266.0 | 22 | — |
| 23 | Puka Nacua | WR | 245.6 | 265.1 | 29 | +6 |
| 24 | C.J. Stroud | QB | 263.7 | 263.7 | 23 | −1 |
| 25 | Tyler Shough | QB | 263.1 | 263.1 | 24 | −1 |
| 26 | Daniel Jones | QB | 260.6 | 260.6 | 25 | −1 |
| 27 | Jonathan Taylor | RB | 249.3 | 256.8 | 27 | — |
| 28 | Bryce Young | QB | 255.0 | 255.0 | 26 | −2 |
| 29 | Christian McCaffrey | RB | 235.7 | 248.8 | 32 | +3 |
| 30 | Geno Smith | QB | 247.2 | 247.2 | 28 | −2 |

(The QB wall is the cross-position consensus in raw points, not draft order —
the point of the table is the RB/WR climbs: every skill player's consensus was
carrying a one-third-weight column that silently docked receivers ~19%.)

---

## How the committed board was regenerated (no hand-typed numbers)

`draft/tools/apply_projection_correctness_2026_08_16.py`:

1. **Preflight A** — refuses to run unless every evidence row rescores to the
   committed board to the cent under the OLD path (proof the capture is the
   build's input record; also makes the tool idempotent — a second run refuses).
2. **Preflight B** — refuses unless re-running `vorp.apply_vorp` +
   `vorp.assign_tiers` + `grab_by.report` on the UNCHANGED board reproduces the
   committed board byte-for-byte (proof the offline re-run equals the build's
   own arithmetic before it is trusted with changed inputs).
3. Applies both fixes via the new live-path functions, recomputes floor/
   ceiling/sd from the same constants `blend()` uses (DEF is on the flat
   POSITION_VARIANCE path, all 32 at 0.38, opportunity_adj 0.0), reruns the
   real downstream generators, and records the whole action in board
   `provenance.projection_correctness_2026_08_16`.

Regenerated with it: `public/draft_data.json`, `draft/data/opening_script.json`
+ `.md` (fingerprint freshness is verify check #5), and **baseline v18**
(`draft/baseline/v18.json` + pinned board `artifact_v18.json`,
`freeze_baseline.js --freeze --version v18 --why "<Cory's ruling ...>"` —
recommendation surfaces move when DEF vorp moves, so the ruled change freezes a
new reference per binding rule 6; v17 stays on the books as the pre-ruling
reference).

**Suites:** full pytest 2470 passed (2457 pre-existing + 13 new pins in
`draft/tests/test_projection_correctness.py`), js-sweep 293 entry points all
green, `verify-relay-session.sh` **7/7** with the refusal set unchanged at 42
files (no B/C-lane file touched — no TERRITORY appendix needed). One JS repin:
`position_timing.test.js`'s K/DEF control pinned "DEF drop ≤ 8" — a fact about
the undercounted board; repinned to ≤ 15 with the dated reason (DEF's
collectable drop is now a real 14 points ≈ 0.8/wk, still under the ~1.2/wk
TAKE-NOW bar, so the roster rule hides nothing actionable — if that ever stops
being true the control SHOULD fail).

## Honesty notes — what this pass deliberately did NOT do

* **`draft/data/proj_series.json` is left as-recorded.** The frozen FP
  snapshots dated 2026-08-09 through 2026-08-15 carry the dropped-receptions
  defect (WR/TE ~19% low). The archive is append-only precisely so it can't be
  retro-edited; the January 2027 projection grade must read FP rows *from
  2026-08-16 onward* (first corrected capture) or account for the defect in the
  earlier rows. Recorded here and in DECISIONS #000's closing entry.
* **FP serves full DEF projections** (`def_td`, `def_sack`, `def_int`,
  `def_pa_*` buckets — 32 rows in the capture). The board's K/DEF columns are
  single-source Sleeper (a known, recorded weakness). Wiring FP as a DEF second
  opinion is now demonstrably possible — left unbuilt, unruled, noted in
  DECISIONS.
* **`rush_att` mapping oddity observed, not fixed:** `_FP_STAT_MAP` maps
  `rush_att → rush_att`, which no scoring key prices — harmless, untouched
  (backtest is read-only this pass).
* **Individual returners keep scoring their return TDs at 0** — that IS the
  league's setting (`st_td: 0.0`), not a gap.
* The 10 FP rows skipped as drifted and 35 with no unambiguous FP name-join
  self-heal at the next full CI rebuild, which runs the fixed code path
  end-to-end with the build's own crosswalk.
