# DATA & ASSUMPTIONS AUDIT — 2026-08-15

_Directive (Cory, verbatim): "let's look for more areas of improvement and check
for other errors in data, assumptions, etc." Every prior audit checked
mechanisms; this pass checked the FACTS the mechanisms stand on. Every finding
carries the command that shows it. Honest negatives are listed — a
checked-and-clean item is a result._

Tree: worktree from main + `origin/claude/fantasy-football-research-926y6z`
merged (d9bae254). Board under audit: `built_at 2026-08-15T17:52:22Z`, 677
players. New tests: `draft/tests/test_data_assumptions.py` (7, all green).

**Score: 5 fixed (each with the test that would have caught it), 3 routed
(two judgment calls TO:A, one territory-gated docstring fix TO:C — all in
ROUTES.md), 4 flagged (low-risk drift, not touched), 9 checked-and-clean.**

---

## §1 · KEEPER COHERENCE — the opening script's PRIMARY branch is contradicted by live Sleeper. ROUTED TO:A (highest draft impact)

**The fact.** `draft/config/keepers.json` (`_designations_source: "sleeper"`,
4 teams, 11 keepers) contradicts the predicted slate that drives
`draft/opening_script.py`'s PRIMARY branch in two places:

1. **Marian did NOT keep Bowers.** Owner `461443264013135872` is MarianSaar —
   pinned by the certification gate's own identity table
   (`draft/tests/test_money_grade_certification.py:28`), and the designated
   slate overlaps Marian's predicted slate 2/3 vs Richard's 0/3. Designated:
   JSN + Justin Jefferson + **De'Von Achane** (the prediction's own listed
   `next_best`). Predicted: JSN + **Bowers** + Jefferson, confidence "high,
   intel". **Brock Bowers (adp 21.33) is in the live draftable pool.** The
   script's CONTINGENCY branch ("Bowers available — Marian keeps someone
   else") is reality; "PRIMARY — both TEs gone" is the counterfactual — on the
   document Cory holds during the draft.
2. **A predicted-zero team keeps two.** Owner `434921916734631936` (cashworth's
   row is the only empty-slate prediction whose `next_best` was Jeanty)
   designated **Ashton Jeanty + Chase Brown**. Both ADP ≤ 15, so no printed
   pick-33/48/53 slate row is wrong (they fail the 25% survival floor), but
   every predicted-board pool simulation carries two phantom draftables.

For balance: **Bates confirmed 3/3** (JT/London/Gibbs = predicted exactly);
**Cory's own 3 match everywhere** (keepers.json = board `kept_player_ids` =
predicted); **Richard has NOT designated** — his "certain" Bijan/Nico/McBride
slate is still a prediction, NOT contradicted.

**The commands.**
```
python3 - <<'EOF'
import json
k=json.load(open('draft/config/keepers.json'))
p=json.load(open('draft/data/predicted_keepers.json'))['predictions']
for t in k['teams']: print(t['owner_id'], [x['name'] for x in t['keepers']])
print('MarianSaar predicted:', [x['name'] for x in p['MarianSaar']['predicted_keepers']])
EOF
grep -n 461443264013135872 draft/tests/test_money_grade_certification.py
python3 -c "import json; d=json.load(open('public/draft_data.json')); print([ (x['name'],x['adp']) for x in d['players'] if x['name']=='Brock Bowers'])"
```

**The mechanism gap.** `opening_script.py` reads ONLY
`predicted_keepers.json` (line 43) — never `keepers.json`. Its fingerprint
(board hash + predicted-slates hash) regenerates the script when designations
land (the board's keeper_slate block moves the content hash), but the
regenerated script **re-asserts the contradicted branch as PRIMARY** — nothing
diffs real against predicted. The staleness mechanism cannot catch a
contradicted prediction, only a changed input.

**Fixed or routed: ROUTED (ROUTES.md TO:A, 2026-08-15).** Which branch owns
the headline, the branch-note wording ("confirmed by designation" vs intel),
and whether Achane-gone moves the DP seat plan are pick-33
headline-ownership judgment — exactly the missing input A's open pick-33
route asked for. Not a mechanical fix this lane may decide.

**The test.** `test_data_assumptions.py::test_keeper_arithmetic_is_one_story`
pins the part that IS mechanical: keepers.json ↔ board `kept_player_ids` ↔
pick_order keeper slots ↔ the board's own `arithmetic_check` (first live pick
33) must tell one story. (Checked-and-clean today: 3 keeper slots at overall
8/13/28, first pick 33, `holds: true`.) A real-vs-predicted contradiction
tripwire belongs in the generator A owns — proposed in the route.

---

## §2 · THE 42% UNIFORMITY — real data, the conservation tilt's saturation signature. DIAGNOSED, ROUTED

**The question (Cory's PDF):** BEST AVAILABLE chips show ~everything "42% gone
by next pick" while the threat panel says 73% for the same player. Clamp, real
probability, or bug?

**The diagnosis: a real number the engine emits.** The conservation tilt
(`public/js/draft/survival.js:solveTilt/conservedSurvival`) enforces
sum(1−s) = intervening picks via the exponential tilt s′ = exp(−λ·w),
w = 1−s_raw. Every player the raw model calls certainly-gone (s_raw
underflows to 0 ⇒ w = 1) maps to the SAME s′ = exp(−λ). Reproduced offline on
the committed board:

```
node <probe>   # scratchpad probe, committed inline below
== window 33 -> 48  intervening=14
tilt applied: true lambda: 0.5411 massBefore: 33.19 massAfter: 14.00
exp(-lambda) = 0.5821 -> gone% 42
gone% histogram (top-20 by ADP): { '15': 1, '42': 19 }
```

19 of the top-20 by ADP read **exactly 42% gone** — Gibbs (adp 1) and
Amon-Ra (adp 7.67) identically. At window 1→33 the same shape lands on 91%
(λ=2.4065). The probe: build `LC.liveContext({currentPick, nextPick, board})`
from `draft/tools/live_context.js`, call `DraftSurvival.conservedSurvival`,
histogram `1−byId[p]` over the top-20 by ADP.

**Why the panel disagrees at 73%:** `threatBoard` (engine.js:3176) is a
DIFFERENT model — a seat-by-seat alive-chain that conserves by construction
and preserves per-player ordering. Two models, one screen.

**The tie is inherited, not created.** The raw layer-1 survival underflows to
exactly 0 for everyone priced well inside the window; the tilt is
order-preserving on distinct w but maps the w=1 plateau to one point. Ordering
at the top is destroyed upstream and the tilt lifts it to a visible,
falsely-precise 42.

**Fixed or routed: ROUTED (ROUTES.md TO:A).** Not a data defect — the tilt is
doing what its header says, and its header already warns "enforcing the
identity is NOT calibration". The fix is a modelling decision (preserve raw
ordering under the plateau — tilt the hazard, not the probability — or render
the saturated set as a bound, ">42% gone") and touching survival maths is
scoring surface, out of this pass's lane. The design agent gets the truth it
needs: **the uniform 42% is faithful rendering of degenerate data.**

---

## §3 · THE POSITION UNION COULD NEVER GROW — workflow commit-list omission. FIXED

**The fact.** `draft/data/player_positions.json` is a "UNION OVER BUILDS,
never pruned" that `build.py` grows on the CI runner every rebuild — but
`.github/workflows/draft-data.yml`'s commit list (`PATHS=`) never included it.
The committed union was frozen at its 2026-08-14 hand-commit (1,841 ids) while
the board rebuilt daily. Tonight's answer to the roster audit's open question:
**the rebuild did NOT resolve it** — the three 2026 keepers (Henry, Chase,
Walker) and 5 current pool players (Manhertz + 4 rookies: Montgomery, Dixon,
Manjack, Clark) were absent. Live readers were shielded
(`position_map.js` overlays board + `kept_players` at read time), but the
union's whole premise — a player who later drops off the board keeps his
position for the 2023-25 wire measurement — was broken: growth happened only
in a discarded working tree.

**The commands.**
```
git log -1 --format='%h %ad' -- draft/data/player_positions.json   # 20a6c256 2026-08-14
python3 -c "import json; pos=json.load(open('draft/data/player_positions.json'))['positions']; d=json.load(open('public/draft_data.json')); print([p['name'] for p in d['players']+d['kept_players'] if str(p['player_id']) not in pos])"
grep -n 'PATHS=' .github/workflows/draft-data.yml   # no player_positions.json (pre-fix)
```

**Fixed.** (a) `draft-data.yml` PATHS += `draft/data/player_positions.json`
(workflows are blanket-shared per TERRITORY.md — "still unenforced …
blanket-shared"); (b) one-off repair via the writer's own merge semantics:
union grown 1,841 → **1,849** (the 3 keepers + 5 pool players; adds only,
never overwrites — the design's "may only grow" preserved).

**The tests.** `test_workflow_commits_the_position_union` (parses PATHS) and
`test_position_union_covers_board_and_keepers` (superset property on the
committed artifacts). Both fail on the pre-fix tree.

**Downstream proof the gap was distorting live measurements.** Four
artifact-matches-regeneration gates went red on the repaired union and were
regenerated through their own modules: `model_accuracy_2025.json` (**Henry and
Walker had been absent from the RB graded population — n 100→102 — and Chase
from WR — n 155→156**), `model_accuracy_v2.json`, `source_weight_prior.json`,
`model_update_recommendations.json`. Every metric moved in the 2nd-3rd
decimal; **zero verdict flips** (checked field-by-field: walk_forward still
loses to the recency blend at all 4 positions so REC-3 stands, own-model-v2's
promotion bar still FAILS G3, all REC statuses identical). The union gap had
been silently excluding three 2025-active stars from the accuracy backtests.

---

## §4 · THE UNION WAS WRITTEN FROM THE POST-PRUNE BOARD — contract/code order defect in build.py. FIXED

**The fact.** The position-record writer's own comment says "Written from the
board BEFORE any filter", but as coded it iterated `board` AFTER the dormant
prune reassigned it (`build.py` load_players: prune block ~725, union write
~758). Consequence: a player seen for the FIRST time on a board that also
prunes him would never enter the union — exactly the row the wire measurement
exists to keep. Latent (the 08-14 seed predates the prune era and rookies are
never dormant), but the code contradicted its own stated contract.

**The command.** `sed -n '722,760p' draft/build.py` (pre-fix): the
`board_activity.dormant` block executes before `for _p in board` in the
position-record block.

**Fixed.** `_pre_prune_board = list(board)` snapshotted above the prune; the
union writer iterates the snapshot. Build-path only — no scoring surface.

**The test.** The §3 superset test covers the observable consequence on every
committed board; the order itself is documented at the fix site.

---

## §5 · A KEYLESS CENSUS ROW THAT NO FUTURE RUN COULD EVER REPLACE. FIXED

**The fact.** `draft/data/format_census_series.json` carried its single row
with `observed_at: null, season: null, examined: null` — in a series whose own
note says "no row here is reconstructable later" and whose dedup key is
(season, observed_at). The producer (`census_archive.py`) gained a
raise-on-keyless guard after the 2026-08-12 incident its docstring documents,
but the existing row was never repaired — and with key ("None","None") no
future append could ever dedupe or replace it.

**The commands.**
```
python3 -c "import json; print(json.load(open('draft/data/format_census_series.json'))['series'][0]['observed_at'])"  # None (pre-fix)
sed -n '60,130p' draft/backtest/census_archive.py   # the guard + the 2026-08-12 account
```

**Fixed.** Key backfilled with explicit provenance, not fabricated:
`observed_at: "2026-08-12"` (the producer docstring's own dated account of the
null-producing run), `season: 2026`, plus a `_key_provenance` field citing
both sources; `examined` stays null — unknown is unknown. The `population`
block was recomputed through the producer's own
`field_population.of_records(..., CENSUS_FIELDS)` so the file remains
generator-consistent.

**The test.** `test_census_rows_are_keyed` — non-null keys, no duplicate keys.

---

## §6 · STALE SUPERSEDED NUMBERS ASSERTED AS CURRENT IN LIVE DOCS. FIXED (4 files) / LEFT (dated logs, per standing judgment)

**The fact.** The L0 correction ($470/$595/$445 → $520/$637.50/$520; $2,100 →
$2,400; eff 86.6-89.0% → 87-88%) was propagated on 08-14 (ROUTES.md entry
lists the files), but four LIVE documents still asserted old numbers as
current — exactly the wrong fact A might re-quote:

| file | stale claim | action |
|---|---|---|
| `SESSION-B.md:17` (read-first-every-time brief) | "≈$445–595/team/season … measured" | corrected, dated |
| `SESSION-A.md:24` (read-first brief) | "~$2,100 of Cory's left on benches" | corrected, dated |
| `draft/tests/test_money_grade_certification.py` docstring | "~$445–595/team" | corrected, dated |
| `draft/backtest/external_adp_capture.py` ×2 | "the board today … 1,759 players, 94.6% on two adp_sd values" | ROUTED TO:C — fix written, then reverted at the territory gate (C's file; growing Override #5's pinned 13-file refusal set for two docstrings was the wrong trade). Exact edit + command in the route. |

The adp_sd claim had materially moved: today's 677-player board carries **149
distinct values, 68.1% on two** (was 71 / 94.6%). Command:
`python3 -c "...Counter(p['adp_sd'] for p in players)..."` (in the audit's §6
working notes; top-2 = 348×30.0 + 113×15.0 of 677).

**Deliberately left, following the 08-14 pass's own recorded judgment** (dated
append-only logs are not retro-edited): `STATUS.md`, `LAB-RUN-STATE.md`,
`PARKED.md` entries (¶191's Command-Center filing is dated 2026-08-08), ROUTES
history lines. Also NOT stale: `exp_strategy_tournament.json`'s "$2100 real"
is tournament-sim money, a different quantity that happens to share a number.
`public/js/draft/app.js:339` and `engine.js:1459` carry dated "1759" 
measurement comments — design agent's active surface, not touched, noted here.

**The test.** None — prose. The audit trail is the guard.

---

## §7 · `drafts[0]` RESTS ON SLEEPER'S RESPONSE ORDER — latent assumption, now pinned. TEST ADDED

**The fact.** `league_history.json` stores TWO 2023 drafts: the 150-pick main
draft and a 30-pick auxiliary whose picks are ALL `is_keeper: true` (an
aborted/keeper-placement draft). Total picks 480, not the "450 real picks" the
profiling docs cite — that 450 is correct because `sleeper_import.all_drafts`
takes one draft per season (newest complete). But a second consumer family
reads the FILE and takes `s.drafts[0]`
(`exp_analyzer_prior_means.py:150`, `roster_shape.js:61`,
`draft_plan.js:125,239`, tests), and `history_export.py` preserves whatever
order Sleeper returns — nothing guaranteed the main draft is first. Today it
is; nothing pinned it.

**The commands.**
```
python3 -c "import json; lh=json.load(open('draft/data/league_history.json')); print([(s['season'],[len(d['picks']) for d in s.get('drafts') or []]) for s in lh['seasons']])"
# 2023: [150, 30]; the 30 all is_keeper
grep -rn "drafts\[0\]" draft/ --include='*.py' --include='*.js'
```

**Fixed or routed.** Data is correct today; the ASSUMPTION is now enforced:
`test_league_history_main_draft_is_first` asserts on the committed artifact
that every season's `drafts[0]` is the max-pick draft AND that every auxiliary
draft is all-keeper (so a future non-keeper auxiliary is a loud new fact, not
an ignored one).

---

## §8 · SERIES FREEZE INTEGRITY — one unfixable gap, otherwise clean

- `proj_series.json`: 13 entries over 7 days is NOT duplication — the dedup
  key is (date, source) per its own note; sleeper 7/7 days, fantasypros 6/7.
  **fantasypros is MISSING 2026-08-10** — a real one-day source gap in the
  Jan-2027 grading substrate. **Unfixable by the freeze's own design**
  (retroactive fetches leak — exp33); documented here so January reads the gap
  as known, not silent. Command: `python3 -c "...Counter((e['date'],e['source']))..."`.
- `adp_series.json`: 7/7 daily, no gaps, no dups, sorted.
- Both series **agree with today's board exactly**: 300/300 adp values and
  677/677 proj_baseline values match `public/draft_data.json` to 0.01.
- `external_adp_series.json`: additive schema drift only (source_note from
  08-13, dispersion from 08-14 — new fields appearing, none vanishing);
  row_counts 672-708 stable; drafts monotone 115→131. Acceptable for an
  append-only capture; noted.
- Key-integrity + ordering now pinned: `test_series_freeze_keys`.

---

## §9 · FLAGGED, NOT TOUCHED (constants vs config — agree today, drift-shaped)

| where | constant | config truth | verdict |
|---|---|---|---|
| `src/routes/lineup.js:133` `DEFAULT_SLOTS` | QB1 RB2 WR2 TE1 FLEX1 K1 DEF1 | == Sleeper `roster_positions` | agrees; fallback only — flag |
| `src/routes/playoffs.js:184` fallback 4 | `playoff_teams` | 4 | agrees; reads config first — fine |
| `draft/backtest/board_activity.py:75` `DEPTH=150` | teams×rounds | 10×15=150 | agrees — flag (derive if league resizes) |
| `src/routes/history-data.js:88` `!== '2026'` | current season | '2026' | agrees TODAY; **rots in 2027** — flag to B |
| board `league` block | teams 10, rounds 15, season '2026', starters map | Sleeper settings | all agree (measured) |

---

## §10 · CHECKED AND CLEAN (honest negatives — each was measured, not assumed)

1. **Byes 32/32**: `src/nfl_byes.json` == board bye column for every team; no
   board-internal conflicts; range 5–14, 2-6 teams/week, sums 32 (week-5 byes
   are real: CAR, KC — within the NFL's actual range). Now pinned by
   `test_nfl_byes_agrees_with_board`. Generator idempotent (`gen_byes.py`
   re-run: byte-identical).
2. **Keeper arithmetic one story**: keepers.json (Cory 3) = board
   kept_player_ids = 3 keeper_slots at 8/13/28 = first live pick 33,
   `arithmetic_check.holds: true`. The board's withholding of the other 8
   designated keepers is DELIBERATE and internally coherent (keeper_slate:
   `withheld_from_board.keepers: 8`, lock not passed, partial slate refused).
3. **Board impossible-fields sweep**: 0 real violations in 677 rows — no
   negative proj, no adp < 1, no floor>ceiling, no mean<floor, ages sane; the
   57 team-but-no-bye rows are all `team: "FA"` (unsigned free agents —
   legitimate).
4. **wire_level.json**: per-position n sums 83+143+113+83 = 422 = `scored`,
   seasons 2023-25 as stated, regenerated today — the union path preserved the
   full 422 sample (the 417-shrink failure mode did not recur).
5. **player_positions ↔ board positions**: 0 mismatches on 672 shared ids
   (union disagreement would be corrected by the board-wins overlay anyway).
6. **Fixture-masquerade sibling hunt**: after the composed-tree review's
   waiver-test fix, `grep` over all tests for writes to real artifact paths
   finds only `test_freeze_staleness_alarm.py` — which roots itself in
   `tmp_path` (verified). No siblings.
7. **Opening-script generator idempotent**: re-run byte-identical against the
   committed board (fingerprint `317dc3ee3052` unchanged).
8. **Override-count trail (8→11→13)**: not a defect — ROUTES.md is an
   append-only log whose newer entries correct older in place;
   `verify-relay-session.sh` itself pins the current 13 and refuses a 14th.
9. **All 30 data/config JSONs parse**; `_note`/`_territory` absence on 12 of
   them is pre-existing convention variance, not a violation (the convention
   is per-file, not universal).

---

## Fix inventory (for the composed-tree diff)

- `.github/workflows/draft-data.yml` — PATHS += player_positions.json (blanket-shared file)
- `draft/build.py` — union written from pre-prune snapshot (own build path)
- `draft/data/player_positions.json` — grown 1841→1849 via the writer's own merge semantics
- `draft/backtest/model_accuracy_2025.json`, `model_accuracy_v2.json`, `source_weight_prior.json`, `draft/data/model_update_recommendations.json` — regenerated by their own modules on the repaired union (decimals only, zero verdict flips — detailed in §3)
- `draft/data/format_census_series.json` — key backfilled w/ provenance, population recomputed by the producer
- `SESSION-A.md`, `SESSION-B.md` — live-brief number corrections, dated (Override note: A/B-lane briefs, one-line factual corrections with the correction trail cited)
- `draft/tests/test_money_grade_certification.py` — docstring correction only (C-lane test, no assertion touched)
- `draft/backtest/external_adp_capture.py` — NOT touched in the end: fix reverted at the territory gate, routed TO:C with the exact edit
- `draft/tests/test_data_assumptions.py` — NEW, `# TERRITORY: A`, 7 tests
- `ROUTES.md` — two TO:A entries (keeper contradiction; 42% diagnosis)
- NOT touched: views/**, public/js/draft/**, warroom_design_pass*, scoring/weights/CFG, PARKED/STATUS/LAB-RUN-STATE (dated logs), public/draft_data.json
