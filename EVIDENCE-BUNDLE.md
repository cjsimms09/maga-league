# EVIDENCE-BUNDLE.md

Generated 2026-08-07T15:39:38.584398+00:00

Sandbox facts that determine what can and cannot be produced below:

```
outbound network : BLOCKED (api.sleeper.app, fantasyfootballcalculator.com,
                   makefbgreatagain.netlify.app all unreachable — org egress policy)
local artifact   : public/draft_data.json, an OFFLINE FIXTURE BUILD whose own
                   provenance reads 'not real ADP or real projections'
deployed artifact: only reachable from CI, not from here
golden boards    : no golden-board fixtures exist in the repo; board state B2
                   below is constructed deterministically from the artifact
```
---

## A. Freshness and provenance

### 1. Provenance block of the current `draft_data.json`
```
{
 "version": 2,
 "built_at": "2026-08-06T22:34:04Z",
 "provenance": {
  "adp": {
   "adp_source": "fixture",
   "warning": "DISABLED \u2014 offline build. This board is fixture data, not real ADP or real projections. Do not draft off it."
  },
  "opportunity_adjustment": "DISABLED \u2014 offline build",
  "opportunity_detail": {}
 },
 "notes": {
  "adp_blend_weight": 0.7,
  "opportunity_cap": 0.15,
  "opportunity_applied": true,
  "config_confirmed": false,
  "profiles_from_drafts": 3
 }
}
config_hash present: False
ruleset_hash present: False
per-source fetched_at present: False
```
`CANNOT PRODUCE:` per-source `fetched_at`, config hash and ruleset hash — none exist in the artifact schema. The three booleans above are the evidence.

### 2. Last 30 lines of the most recent pipeline run log

`CANNOT PRODUCE:` no pipeline log exists locally. The pipeline runs in GitHub Actions on `cjsimms09/maga-league`; its logs are retrievable only from CI, which this sandbox cannot reach.

### 3. Cron schedule blocks
```
--- .github/workflows/analyse-drafts.yml
--- .github/workflows/draft-data.yml
      - cron: '0 8 * * *'      # 08:00 UTC = 03:00 CDT / 02:00 CST — nightly rebuild
      - cron: '0 11 * * 2'     # 11:00 UTC Tue = 06:00 CDT — before Wednesday waivers
      - cron: '0 13 * * 0'     # 13:00 UTC Sun = 08:00 CDT — inactives and lineups
--- .github/workflows/site-check.yml
      - cron: '0 7 * * *'
--- .github/workflows/sleeper-check.yml
```
`CANNOT PRODUCE:` timestamps of last successful / last failed scheduled run — requires the GitHub Actions API.

### 4. Per-source fallback counts, top 200
```
adp_source (artifact-wide): fixture
adp warning              : DISABLED — offline build. This board is fixture data, not real ADP or real projections. Do not draft off it.
opportunity_adjustment   : DISABLED — offline build
top-200 with non-zero opportunity_z: 197 (98.5%)
per-player adp source field present: False
```
CONTRADICTION IN THE ARTIFACT, stated without resolving it: `opportunity_adjustment`
reads `DISABLED — offline build`, yet 197 of the top 200 players (98.5%) carry a
non-zero `opportunity_z`. Either the provenance flag is wrong or the z-values are
fixture-synthesised while the flag describes the real pipeline. Not determined here.

Note: these are the FIXTURE artifact's numbers. The deployed artifact was separately observed on 2026-08-07T14:11Z reporting `adp ffc · 0 guessed in play`, `value_coverage 1.0`, `opportunity ok (1.0)`.

## B. Identity joins

### 5. Name-match report, Sleeper↔FFC and Sleeper↔GSIS, all top-150 failures

`CANNOT PRODUCE:` requires a live pipeline build (FFC fetch + nflfastR pull + Sleeper player DB). No network. The join code is `draft/build.py::_rekey_opportunity` and `draft/adp.py`; the fail-loud threshold is asserted in `draft/build.py::_assert_opportunity_coverage`.

### 6. Raw joined record for 5 named players

`CANNOT PRODUCE:` requires a live pipeline build (FFC fetch + nflfastR pull + Sleeper player DB). No network. The join code is `draft/build.py::_rekey_opportunity` and `draft/adp.py`; the fail-loud threshold is asserted in `draft/build.py::_assert_opportunity_coverage`.

### 7. Match-rate percentages on top-200 and the fail-loud threshold

`CANNOT PRODUCE:` requires a live pipeline build (FFC fetch + nflfastR pull + Sleeper player DB). No network. The join code is `draft/build.py::_rekey_opportunity` and `draft/adp.py`; the fail-loud threshold is asserted in `draft/build.py::_assert_opportunity_coverage`.

```
46:VALUE_MIN_COVERAGE = 0.90
460:    artifact["provenance"]["value_coverage"] = round(cov, 3)
462:    if cov < VALUE_MIN_COVERAGE:
467:            f"(expected >= {VALUE_MIN_COVERAGE:.0%}). Every VORP, ceiling and VONA on "
478:OPPORTUNITY_MIN_COVERAGE = 0.60
495:    if cov < OPPORTUNITY_MIN_COVERAGE:
498:            f"(expected >= {OPPORTUNITY_MIN_COVERAGE:.0%}). The metrics ran but matched "
```

## C. Scoring ground truth

### 8. Five stat lines, arithmetic term by term

Run against the **deployed** 44-key scoring table (`maga-league:draft/config/league_config.json`).
The copy of `league_config.json` in THIS repo is a 14-key offline stub with no kicker
and no DST scoring; a kicker scores 0.00 against it. Both are shown.
```
local stub keys : 14
deployed keys   : 44
keys only in deployed: ['blk_kick', 'def_kr_td', 'def_pr_td', 'def_st_ff', 'def_st_fum_rec', 'def_st_td', 'ff', 'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50p', 'fgmiss', 'fum', 'fum_rec', 'fum_rec_td', 'int', 'pts_allow_0', 'pts_allow_14_20', 'pts_allow_1_6', 'pts_allow_21_27', 'pts_allow_28_34', 'pts_allow_35p', 'pts_allow_7_13', 'sack', 'safe', 'st_ff', 'st_fum_rec', 'xpm', 'xpmiss']
```
```

--- QB with a 2pt conversion ---
stat line: {"pass_yd": 284, "pass_td": 3, "pass_int": 1, "pass_2pt": 1, "rush_yd": 41, "rush_td": 1, "fum_lost": 0}
arithmetic (only keys present in BOTH the stat line and the scoring table):
      fum_lost       0 x   -2.0 =     -0.00
      pass_2pt       1 x    2.0 =      2.00
      pass_int       1 x   -2.0 =     -2.00
       pass_td       3 x    4.0 =     12.00
       pass_yd     284 x   0.04 =     11.36
       rush_td       1 x    6.0 =      6.00
       rush_yd      41 x    0.1 =      4.10
    hand total                       33.46
        engine                       33.46
  match: True

--- RB with a fumble lost ---
stat line: {"rush_yd": 96, "rush_td": 1, "rec": 4, "rec_yd": 33, "fum_lost": 1}
arithmetic (only keys present in BOTH the stat line and the scoring table):
      fum_lost       1 x   -2.0 =     -2.00
           rec       4 x    0.5 =      2.00
        rec_yd      33 x    0.1 =      3.30
       rush_td       1 x    6.0 =      6.00
       rush_yd      96 x    0.1 =      9.60
    hand total                       18.90
        engine                       18.90
  match: True

--- WR ---
stat line: {"rec": 9, "rec_yd": 131, "rec_td": 1, "rush_yd": 8}
arithmetic (only keys present in BOTH the stat line and the scoring table):
           rec       9 x    0.5 =      4.50
        rec_td       1 x    6.0 =      6.00
        rec_yd     131 x    0.1 =     13.10
```
Against the deployed table:
```
--- K with distance tiers ---
stat line: {"fgm_20_29": 1, "fgm_30_39": 1, "fgm_50p": 1, "xpm": 2, "fgmiss": 1}
         fgm_20_29    1 x    3.0 =     3.00
         fgm_30_39    1 x    3.0 =     3.00
           fgm_50p    1 x    5.0 =     5.00
            fgmiss    1 x    0.0 =     0.00
               xpm    2 x    1.0 =     2.00
        hand total                    13.00
            engine                    13.00
  match: True

--- DST ---
stat line: {"def_td": 1, "pts_allow_7_13": 1, "sack": 4, "int": 2, "fum_rec": 1}
            def_td    1 x    6.0 =     6.00
           fum_rec    1 x    2.0 =     2.00
               int    2 x    2.0 =     4.00
    pts_allow_7_13    1 x    4.0 =     4.00
              sack    4 x    1.0 =     4.00
        hand total                    20.00
            engine                    20.00
  match: True
```

### 9. Fresh live `scoring_settings` vs stored config

`CANNOT PRODUCE:` no network. The equivalent check runs in CI as `Check the live site`; its 2026-08-07T14:11Z run reported `every scoring key, roster slot and team count matches Sleeper`.
## D. Keepers and pick order

### 10. Keeper slate as configured

This is the LOCAL FIXTURE slate (players named 'RB Player 1'). The real slate lives in the deployed config.
```
cost model: {"cost_model": "original_round", "count": 3, "max_years": 3, "undrafted_round": 10, "undrafted_rule": "assigned_round"}
 slot 1
    RB Player 1 | original_round 1 | years_kept 1 | cost = original_round under cost_model=original_round = 1
    RB Player 2 | original_round 2 | years_kept 1 | cost = original_round under cost_model=original_round = 2
    WR Player 1 | original_round 3 | years_kept 1 | cost = original_round under cost_model=original_round = 3
 slot 2
    RB Player 3 | original_round 1 | years_kept 1 | cost = original_round under cost_model=original_round = 1
    RB Player 4 | original_round 2 | years_kept 1 | cost = original_round under cost_model=original_round = 2
    WR Player 2 | original_round 3 | years_kept 1 | cost = original_round under cost_model=original_round = 3
 slot 3
    WR Player 3 | original_round 1 | years_kept 1 | cost = original_round under cost_model=original_round = 1
    RB Player 5 | original_round 2 | years_kept 1 | cost = original_round under cost_model=original_round = 2
    RB Player 7 | original_round 3 | years_kept 1 | cost = original_round under cost_model=original_round = 3
 [CUT: 7 further slots]
```

### 11. My computed pick numbers, and the live draft object
```
my_draft_slot: 4
my_picks: [7, 14, 27, 34, 47, 54, 67, 74, 87, 94]
my_picks_built_for: None
forfeited count: 30
```
`CANNOT PRODUCE:` the live `/draft/{id}` slot assignments — no network. Real draft id for 2026-08-22 is `1374848328474324992`; its `slot_to_roster_id` was separately confirmed readable from CI on 2026-08-07.

### 12. Python vs JS keeper adjustment on the shared vectors
```
PASS  round2(0.125) ties to even like Python

38/38 keeper parity checks passed
.....                                                                    [100%]
77 passed in 0.34s

# running the keeper-vector test FILE ALONE:

==================================== ERRORS ====================================
_____________ ERROR collecting draft/tests/test_keeper_vectors.py ______________
ImportError while importing test module '/home/user/TruthRxWebsite/league/draft/tests/test_keeper_vectors.py'.
Hint: make sure your test modules/packages have valid Python names.
Traceback:
/usr/lib/python3.11/importlib/__init__.py:126: in import_module
    return _bootstrap._gcd_import(name[level:], package, level)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
draft/tests/test_keeper_vectors.py:18: in <module>
    import keepers as K
E   ModuleNotFoundError: No module named 'keepers'
```
The file imports `keepers` via a bare name; it resolves only because a sibling test module inserts `draft/` on `sys.path` first. Order-dependent collection.

`CANNOT PRODUCE:` both implementations' adjusted ADP on the REAL slate — the real slate is not in this repo.

## E. The board

Board state B2, constructed deterministically from the fixture artifact. Pick 37 is genuinely slot 4's pick in a 10-team snake; an earlier attempt used pick 35, which belongs to seat 6, and the MCTS root guard rejected it rather than producing a recommendation for another seat's turn.

### 13. Top 15 with every composite component, full precision
```
my roster: TE Player 3(TE), WR Player 23(WR), QB Player 4(QB)
my next picks: 44, 57, 64, 77, 84
rk	player	pos	score	vona	tier_urg	need	risk	ceiling	keeper	bye	stack	surv
1	QB Player 8	QB	77.334	26.853	23.700	-2.450	0.000	46.463	0.000	0.000	6.000	0.0000
2	QB Player 7	QB	67.145	24.053	23.700	-3.626	0.000	46.038	0.000	0.000	0.000	0.0000
3	RB Player 28	RB	66.348	11.524	10.400	32.300	0.000	24.248	0.000	0.000	0.000	0.5273
4	QB Player 6	QB	63.701	25.753	23.700	-2.912	-6.000	46.321	0.000	0.000	0.000	0.0000
5	TE Player 12	TE	53.405	7.596	7.500	22.000	6.000	24.579	0.000	-1.980	0.000	0.9571
6	DEF Player 1	DEF	52.077	11.729	0.000	29.500	0.000	21.695	0.000	0.000	0.000	0.9301
7	WR Player 29	WR	51.879	7.435	0.488	25.100	0.000	25.713	0.000	0.000	6.000	0.6132
8	WR Player 28	WR	45.302	8.344	5.300	30.400	-12.000	26.517	0.000	0.000	0.000	0.0000
9	K Player 1	K	41.509	8.458	0.280	27.900	-6.000	21.743	0.000	0.000	0.000	0.9398
10	TE Player 9	TE	25.167	-7.055	0.000	14.500	6.000	23.444	0.000	0.000	0.000	0.9668
11	RB Player 27	RB	25.158	-4.069	2.006	21.900	-6.000	22.641	0.000	0.000	0.000	0.6245
12	WR Player 30	WR	24.885	-1.506	0.559	19.400	-6.000	24.862	0.000	0.000	0.000	0.6627
13	K Player 4	K	23.281	-7.143	0.367	19.800	0.000	20.514	0.000	0.000	0.000	0.9541
14	DEF Player 2	DEF	23.274	-10.599	0.000	17.900	6.000	19.947	0.000	0.000	0.000	0.9525
15	RB Player 29	RB	18.488	-4.430	2.021	21.600	-12.000	22.593	0.000	0.000	0.000	0.6272
```

### 14. Default weights vs every slider at 2x
```
=== ITEM 14 — top 10 at default weights vs every slider at 2x ===
rank	default				2x-all
1	QB Player 8 (77.334)		QB Player 8 (127.816)
2	QB Player 7 (67.145)		RB Player 28 (121.172)
3	RB Player 28 (66.348)		QB Player 7 (110.238)
4	QB Player 6 (63.701)		QB Player 6 (101.650)
5	TE Player 12 (53.405)		TE Player 12 (99.214)
6	DEF Player 1 (52.077)		WR Player 29 (96.323)
7	WR Player 29 (51.879)		DEF Player 1 (92.425)
8	WR Player 28 (45.302)		WR Player 28 (82.261)
9	K Player 1 (41.509)		K Player 1 (74.561)
10	TE Player 9 (25.167)		TE Player 9 (57.390)
identical ordering: false
```

### 15. Survival to my next pick, top 30
```
=== ITEM 15 — survival to my next pick (44), top 30 available ===
player	pos	adp_mean	adp_sd	survival
RB Player 28	RB	45	9.900	0.5273
QB Player 8	QB	15	3.300	0.0000
WR Player 28	WR	26	5.720	0.0000
QB Player 6	QB	16	3.520	0.0000
DEF Player 1	DEF	164	36.080	0.9301
QB Player 7	QB	17	3.740	0.0000
K Player 1	K	177	38.940	0.9398
WR Player 29	WR	34	7.480	0.6132
TE Player 12	TE	78	17.160	0.9571
RB Player 27	RB	52	11.440	0.6245
RB Player 30	RB	53	11.660	0.6263
RB Player 29	RB	54	11.880	0.6272
K Player 4	K	181	39.820	0.9541
WR Player 30	WR	38	8.360	0.6627
DEF Player 2	DEF	165	36.300	0.9525
DEF Player 6	DEF	166	36.520	0.9531
WR Player 27	WR	43	9.460	0.6857
DEF Player 4	DEF	167	36.740	0.9557
TE Player 9	TE	86	18.920	0.9668
K Player 8	K	182	40.040	0.9626
DEF Player 5	DEF	168	36.960	0.9592
TE Player 11	TE	89	19.580	0.9681
TE Player 15	TE	90	19.800	0.9681
DEF Player 3	DEF	169	37.180	0.9607
K Player 2	K	184	40.480	0.9645
WR Player 33	WR	48	10.560	0.7213
TE Player 14	TE	93	20.460	0.9705
DEF Player 8	DEF	170	37.400	0.9666
DEF Player 9	DEF	171	37.620	1.0000
K Player 10	K	185	40.700	0.9668
```

### 16. Endgame, 3 picks left, no K and no DST
```
=== ITEM 16 — endgame: 3 picks left, no K and no DST ===
picks left 3  mandatoryGaps=["DEF","K","RB"]  forced={"picksLeft":3,"gaps":["DEF","K","RB"],"message":"Forced: 3 picks left, still missing DEF, K, RB."}
  top 3: RB Player 27(RB), RB Player 29(RB), RB Player 30(RB)
picks left 2  mandatoryGaps=["DEF","K","RB"]  forced={"picksLeft":2,"gaps":["DEF","K","RB"],"message":"Forced: 2 picks left, still missing DEF, K, RB."}
  top 3: RB Player 27(RB), RB Player 29(RB), RB Player 30(RB)
picks left 1  mandatoryGaps=["DEF","K","RB"]  forced={"picksLeft":1,"gaps":["DEF","K","RB"],"message":"Forced: 1 pick left, still missing DEF, K, RB."}
  top 3: RB Player 27(RB), RB Player 29(RB), RB Player 30(RB)
```

### 17. Component participation — zero each term, count top-5 changes
```
=== ITEM 17 — component participation: zero each term, count top-5 changes ===
(20 boards sampled deterministically from the artifact by rotating the start offset)
term	boards_whose_top5_changed_when_zeroed / 20
tier	9
need	19
risk	17
ceiling	11
keeper	0
bye	0
stack	8
```
Caveat on the two zeros, stated so the reviewer can weigh it: the 20 boards are
constructed from the fixture artifact with 7-player rosters taken as consecutive
slices, and the contexts carry no `original_rounds` and no keeper config. Whether
`keeper` and `bye` are inert in general, or merely unexercised by this construction,
is not determined by this evidence. The item-13 dump shows `keeper` at 0.000 for all
15 players and `bye` non-zero for 1 of 15 on an independently constructed board.
## F. Live sync behaviour

### 18. Mock-draft sync log: pick arrival vs poll timestamps, my-turn detection, reconcile warnings

`CANNOT PRODUCE:` requires a live Sleeper mock draft over the network. No outbound network from this sandbox. The sync module has NO node-level test coverage either — all ten of its functions (`poll`, `fetchDraft`, `allPicks`, `addManual`, `currentPickNumber`, `stop`, `onPicks`, `onStatus`, `fetchJson`, `removeManual`) show zero coverage across all nine suites, so nothing here is substituted by test evidence.

### 19. Network failure test: 60s offline, backoff intervals, recovery timeline

`CANNOT PRODUCE:` requires a live Sleeper mock draft over the network. No outbound network from this sandbox. The sync module has NO node-level test coverage either — all ten of its functions (`poll`, `fetchDraft`, `allPicks`, `addManual`, `currentPickNumber`, `stop`, `onPicks`, `onStatus`, `fetchJson`, `removeManual`) show zero coverage across all nine suites, so nothing here is substituted by test evidence.

### 20. Which CORS path won (direct vs proxy)

`CANNOT PRODUCE:` requires a live Sleeper mock draft over the network. No outbound network from this sandbox. The sync module has NO node-level test coverage either — all ten of its functions (`poll`, `fetchDraft`, `allPicks`, `addManual`, `currentPickNumber`, `stop`, `onPicks`, `onStatus`, `fetchJson`, `removeManual`) show zero coverage across all nine suites, so nothing here is substituted by test evidence.

### 21. A keeper-reconciliation event

`CANNOT PRODUCE:` requires a live Sleeper mock draft over the network. No outbound network from this sandbox. The sync module has NO node-level test coverage either — all ten of its functions (`poll`, `fetchDraft`, `allPicks`, `addManual`, `currentPickNumber`, `stop`, `onPicks`, `onStatus`, `fetchJson`, `removeManual`) show zero coverage across all nine suites, so nothing here is substituted by test evidence.

## G. MCTS

### 22. Tournament status

Pre-registration committed as `551b9f5` BEFORE the run started; file at `draft/tournament/PREREGISTRATION.md`. Analysis block:
```
## Metric

**Mean finish percentile** of the seat under test, where the ten final rosters
are valued on the common yardstick `V` (optimal legal lineup, replacement fill,
projected points) and percentile is the share of the other nine beaten. 1.0 is
the best roster in the league.

## Test

- **Paired one-sided t-test** on the per-draft difference (MCTS − greedy).
- **Sidedness: one-sided, MCTS > greedy.** The ship question is directional.
- **Threshold: p < 0.05.**
- **Companion: a sign test**, reported always, as a distribution-free check
  that the t is not being carried by a few tail drafts. It is a robustness
  report, not a second bite: the t-test is the pre-registered decision rule.

## Compute budget, fixed in advance

| | drafts | iterations/pick | rooms |
|---|---|---|---|
| **Primary** | 1,000 | 400 | composite, ADP |
| **Secondary A — compute scaling** | 200 | 1,000 | composite |
| **Secondary B — perturbation (ship cond. 2)** | 400 | 400, ±20% jitter | composite |

400 iterations was chosen from the timing pilot alone (1,535 ms per paired
draft; ~51 minutes for the primary). It is well below the ≥3,000-iteration
target for a real draft on a phone, so **the primary understates the search** —
a conservative direction for a ship decision, but it creates a confound: a null
result cannot by itself distinguish "search adds nothing" from "search
undertrained". Secondary A exists precisely to separate those, and is
pre-registered rather than reached for afterwards. **If the primary is null and
Secondary A shows the gap growing with compute, the honest verdict is
"undertrained, not useless."**

Secondary B runs only if the primary shows an effect, per the spec: there is
nothing to check the robustness of otherwise.

## Outcomes, decided now

- **MCTS beats greedy-on-V (p < 0.05)** → ship **enabled**; proceed to the
  perturbation arm.
- **Ties vs greedy but beats the ADP room** → the value function is doing the
  work and the search adds nothing *yet*. This is not failure; it is the
  expected result of a variance-blind V, which literally cannot see what a
  non-greedy line buys. Ship **present-but-off**, with that reason written on
  the toggle, and it converts directly into a priority signal: **the quantile V
  is what unlocks the search, so build it next.**
- **MCTS loses to greedy-on-V** → this is a **bug report, not a verdict**. A
  correctly implemented search over the same V should never be worse than
  greedy on average. Most likely locations, in order: the chance-node sampling,
  the backup at chance nodes, or the rollout policy's divergence from the tree
  policy. Investigate before drawing any conclusion about MCTS.
```
**Result: NOT YET AVAILABLE.** The primary run (1,000 paired drafts x 2 rooms, 400 iterations/pick) was still executing when this bundle was generated. `draft/tournament/results-primary.json` does not exist yet.

Current card state:
```
MCTS card in the War Room UI: NOT BUILT. There is no card, no worker, and no toggle.
The search core, value function and tournament harness exist and are tested (58 checks);
nothing is wired to any user-visible surface. Enabled/disabled is therefore not
applicable — there is nothing a user can turn on.
```

### 23. 30-second search on board B2
```
=== ITEM 23 — MCTS on board B2, 30 seconds ===
  wall clock        : 30.0s
  iterations        : 38337
  iterations/sec    : 1278
  nodes             : 41247   cap hit: false
  root visit distribution (top 8):
    player	pos	visits	share	Q
    WR Player 28	WR	29970	78.2%	0.5462
    RB Player 28	RB	4603	12.0%	0.4941
    WR Player 29	WR	1617	4.2%	0.4562
    TE Player 12	TE	708	1.8%	0.4085
    K Player 1	K	534	1.4%	0.3872
    DEF Player 1	DEF	428	1.1%	0.3685
    QB Player 8	QB	173	0.5%	0.2637
    QB Player 6	QB	171	0.4%	0.2625
  extracted reasoning:
    prefers WR Player 28 (78% of playouts, P(top-2) 54.6%); over RB Player 28 by 5% of the value at stake; if you take RB Player 28 instead, the room most often goes WR then QB.
```
Measured in a Node process on this sandbox's CPU, NOT in a browser web worker on the draft-day phone. The >=3,000-iterations-per-interval target is stated for the phone; this number does not establish it.

NOTE: the `extracted reasoning` line above was captured BEFORE a fix applied later in the same session. It reads `P(top-2) 54.6%`. Q is the normalised interim value, not a probability. The label has since been removed and the test that was requiring it corrected; this paste is the pre-fix output.

### 24. Visit spread, near-equal children, 5,000 iterations
```
=== ITEM 24 — visit spread, near-equal children, 5000 iterations ===
  iterations: 5000   nodes: 5713
    player	visits	share	Q
    RB Player 28	1100	22.0%	0.2328
    WR Player 28	718	14.4%	0.2075
    K Player 1	694	13.9%	0.2055
    TE Player 12	678	13.6%	0.2038
    WR Player 29	577	11.5%	0.1926
    DEF Player 1	481	9.6%	0.1786
    QB Player 8	258	5.2%	0.1204
    QB Player 6	254	5.1%	0.1182
    QB Player 7	237	4.7%	0.1105
```

## H. The trace

### 25. End-to-end trace for one top-20 player

`CANNOT PRODUCE IN FULL:` the trace requires the FFC raw line, the name match, and the nflfastR rows behind the opportunity adjustment. This artifact is an offline fixture build: `adp_source: fixture`, `opportunity_adjustment: DISABLED`. There is no FFC line and no nflfastR row to trace back to. Producing this needs a networked pipeline build.

The portion that IS traceable from the fixture artifact — projection through composite to rank — is item 13 above, with every component at full precision.

### 26. The same for a degraded player

`CANNOT PRODUCE:` same reason. Every player in this artifact is degraded in the same way (fixture ADP, no opportunity adjustment), so there is no contrast to show between a healthy and a degraded path.

## I. Environment and learning

### 27. Settings-watchdog: stored hash, fresh hash, diff

`CANNOT PRODUCE:` no ruleset hash exists anywhere in the codebase.
```
(no matches in draft/, src/, public/js/)
```
The nearest built equivalent is the config-drift check in `.github/workflows/site-check.yml`, which diffs the committed config against a live `/league/{id}` call field by field rather than by hash.

### 28. Ledger spot check

`CANNOT PRODUCE:` the prediction ledger does not exist. `src/ledger.js` is the MONEY ledger (season prizes, payments, carryover) and writes no predictions.
```
24:async function allEntries() {
28:async function addEntry({ owner_id, year, type, amount, desc, week = null, category = null, settled = false }) {
41:async function updateEntry(id, patch, auditNote) {
53:async function removeEntry(id) {
58:async function setSettled(id, settled, note, by) {
67:async function settleAll(owner_id) {
83:function balances(ledger, owners) {
122:function seasonSummary(entries, year) {
158:function ledgerWinningsByOwnerYear(ledger) {
167:function weeklyForYear(ledger, year) {
172:function awardsForYear(ledger, year) {
178:module.exports = {
```

### 29. Stale-derived-constant grep
```
replacement          refs=48 ruleset-hash-linked=0
BENCH_DISCOUNT       refs=4 ruleset-hash-linked=0
opportunity_cap      refs=3 ruleset-hash-linked=0
adp_blend_weight     refs=13 ruleset-hash-linked=0
TARGET_NUDGE         refs=2 ruleset-hash-linked=0
TIE_THRESHOLD        refs=3 ruleset-hash-linked=0
SHEET_               refs=8 ruleset-hash-linked=0
AUTO_                refs=13 ruleset-hash-linked=0
THREAT_              refs=8 ruleset-hash-linked=0
TELL_                refs=12 ruleset-hash-linked=0
WITHIN_POS_TEMP      refs=4 ruleset-hash-linked=0
```
Every derived constant returns 0 for ruleset-hash linkage, because no ruleset hash exists (item 27).
## J. Honest inventory

### 30. Specced, touches draft day, not built or not passing
```
MCTS card, web worker, and kill-switch toggle — not built (search core exists, unwired)
MCTS self-play tournament (ship condition 1) — running, no result yet
MCTS rollout perturbation arm (ship condition 2) — not run; gated on condition 1
Composite-vs-ADP historical backtest (ship condition 4) — not built
Override logging with one-tap reasons (Part 6 §11) — not built
Sleeper queue export to Sleeper's own queue — not built (paper sheet + clipboard shipped instead)
Usage variance from week-to-week SD (Part 7 §1) — partial: variance derives from usage LEVEL and depth chart, not from measured weekly SD
Neutral-script filtering on usage metrics (Part 7 §5) — not built
Expected TDs from touch location (Part 7 §2) — not built
Next Gen Stats: RYOE, separation, cushion, box rate (Part 7 §3) — not built
Draft capital as a breakout signal (Part 7 §4) — not built
Snap share slope (Part 7 §6) — not built
Idempotency tokens on money-mutating POSTs (Part 2 P0.B) — not built
Stress fixture + hard row caps on Sleeper lists (Part 2 P0.A) — not built
/draft turn-state fold, 10s poll, server-side claim validation (Part 2 P0.C) — not built
Trust surface: as-of stamps, three-state empty/stale/failed (Part 2 P1.E) — not built
Manager lineup efficiency and engagement tracking (Part 3 §1) — not built
Vegas implied team totals (Part 3 §2) — not built
Empirical FAAB bid distributions (Part 3 §6) — not built
Fragility map and handcuff precompute (Part 3 §5) — not built
Keeper cascade forecast (Part 3 §4) — not built
Prediction ledger, grading, gated-change evidence bar (Part 11) — not built
Settings watchdog and ruleset hash (Part 12) — not built
Quantile value function / P(top-2) V — not built; MCTS runs on the interim points V
Dress rehearsal against a live Sleeper mock (Part 4 §6) — not completed
adp_sd from a source-provided or fitted value — still the max(3.0, 0.22 x adp) heuristic
Live sync module — zero node test coverage (10 functions)
```

### 31. Pre-draft checklist as it renders right now

`CANNOT PRODUCE VERBATIM FROM THE DEPLOYED SITE:` no network. Rendered against the local
fixture artifact in a headless browser, the checklist reads:
```
(captured earlier this session against the local dev server, fixture artifact)
  Board is fresh                  — depends on artifact age
  Real ADP, not fixtures          — FAILS on this artifact by design (adp_source: fixture)
  Projections cover the board
  Snap / target data joined       — FAILS on this artifact (opportunity DISABLED)
  Board built for your seat
  Keepers reconcile
  Keeper slate confirmed          — never confirmed / edited since confirmed / yes
  Targets or never-draft set
The deployed board's equivalent values were separately observed 2026-08-07T14:11Z:
  value_coverage 1.0, opportunity ok (1.0), adp ffc, 0 guessed in play, seat 4 == config 4
```
