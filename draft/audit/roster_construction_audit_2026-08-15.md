<!-- TERRITORY: A -->
# ROSTER-CONSTRUCTION AUDIT + TIE-BREAK EDGE PROGRAM — 2026-08-15

Mandate (Cory, verbatim): *"Roster selection, bench selection, flex selection
all sound? Looking to extract max value out of draft while also fielding full
roster. Look for advantages in tie break scenarios, upside, pace of play, age,
keeper potential, etc!!"*

Base: worktree cut from `82b62016` (board built 2026-08-15). League facts
verified from `draft/config/league_config.json`, not assumed: 10 teams,
half-PPR (`rec 0.5`), `pass_td 6.0`, keepers `top_picks_flat count=3`
(keeping N forfeits rounds 1..N flat), `my_draft_slot 8`, 15 rounds, 9
starters (QB1 RB2 WR2 TE1 FLEX1 K1 DEF1) + 6 bench. Cory's 12 live picks:
33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148.

Every number below is from a command run today in this worktree, or a
citation to a named committed artifact. Cross-referenced evidence that lives
on the research branch `claude/fantasy-football-research-926y6z` (not yet on
this worktree's base) is cited by file + commit; none of it was re-run.

New evidence committed with this audit:

| artifact | producer | what it measures |
|---|---|---|
| `draft/backtest/roster_room_audit.json` | `roster_room_audit.js` (100 paired rooms, seeds 1-100) | legality, K/DEF timing cost, flex fills, bench mix, tie rates — shipped engine, production weights |
| `draft/backtest/exp_keeper_option.json` | `exp_keeper_option.py` (preregistered) | the league's real 2023-25 keeper returns and draft-time keeper signals |
| `draft/backtest/exp_bench_mix.json` | `exp_bench_mix.py` (preregistered) | realized starting-lineup yield of real bench picks by position |
| `draft/backtest/exp_tiebreak_signals.json` | `exp_tiebreak_signals.py` (preregistered) | ceiling's structural information content; age/experience effects |

---

## MISSION A — IS THE ROSTER-CONSTRUCTION MACHINERY SOUND?

| mechanism | verdict | the number |
|---|---|---|
| full-roster guarantee (`mandatoryGaps` / `applyRosterLegality` / `rosterPlan`) | **SOUND-WITH-EVIDENCE** | 200/200 simulated rooms end with a complete legal lineup; 0 crashes |
| K/DEF timing under the rails | **SOUND-WITH-EVIDENCE** | vs latest-legal K/DEF policy, paired: **+2.04 pts mean** (p10 −13.5 / p50 +5 / p90 +9) — not a cost |
| FLEX fill (`bestFlexAlt` / `starterSlotMarginal`) | **SOUND-BUT** | 98/100 agreement with the exact optimal fill; but the D3 flex marginal is **inert in the ranked list** (`need` weight = 0) |
| flex-aware replacement (`vorp.py`) | **SOUND-BUT** (cross-ref) | step function pinned by property test; early picks insensitive (top-70 identical at pick 33) |
| bench branch (`vona()` bench arm, flags OFF) | **SOUND-BUT** (cross-ref + new) | shipped QB2 rate 53.3% vs real 56.7%; bench mix RB-heavier than the league's realized-yield ordering |
| `demoteFlaggedOnesies` | **SOUND-WITH-EVIDENCE** | 0 K/DEF bench picks in 200 rooms; forced endgame onesies never demoted (by construction, exercised in every room) |

### A.1 The full-roster guarantee holds, and the rails' timing is free

`node draft/backtest/roster_room_audit.js --rooms 100 --seed 1` — 100 paired
rooms per arm, real board, real keepers (Chase/Henry/Walker), real
`E.recommend()` through `live_context.js` under production `MEASURED_WEIGHTS`,
noisy-ADP opponents scaled to each player's own `adp_sd`, seeded PRNG.
Mechanics are `bench_wire_room_sim.js`'s (research branch, `ab80a657`), with
one declared fix: opponent pick counts come from the pick board filtered to
non-my slots, so Cory's three keeper-consumed slots no longer draft a phantom
opponent each.

- **Legality: 100/100 shipped rooms and 100/100 counterfactual rooms field a
  complete legal starting lineup** (all dedicated slots + FLEX by an eligible
  player), every roster exactly 15. Zero crashes, zero "nobody on the board
  plays there" states. The engine does not paint into corners on this board.
- **How the guarantee actually executes:** the composite never volunteers
  K/DEF (their VORP ≈ 0), so the rails do it — `legality_warning` fires in
  96% of rooms at pick 128, and picks 133/148 are `forced` in 100% of rooms.
  K lands round 15 in 95% of rooms (13-14 in the rest), DEF round 14 in 96%.
  That is the design in `applyRosterLegality`'s header working as written.
- **Is that timing wrong?** Paired against an `onesie_last` arm (K/DEF
  withheld until exactly 2 picks remain — the latest-legal schedule), the
  shipped policy is **+2.04 starting-lineup points better on average**
  (p10 −13.5, p50 +5, p90 +9, n=100). The rails force onesies at the last
  possible useful moment and it costs nothing measurable; if anything the
  engine's freedom to take a K/DEF a round early when the board says so is
  slightly positive. **No value is being burned on early kickers, and there
  is no corner risk on the other side.** The tail (p10 −13.5) is seed noise
  in which skill player the last picks catch, not a legality failure — every
  room in both arms is legal.

### A.2 FLEX: the fill is right; the pricing is only live on the card

Three layers, separated because they have three different answers:

1. **Who fills FLEX (the fill decision).** In every final roster the optimal
   legal lineup (greedy per-position + best-leftover flex — exact for this
   slot structure, the same fill `slot_schedule.js`'s brute-force-verified DP
   produces for a fixed roster) was computed and compared with what the
   engine said at pick time. **98/100 agreement**; optimal FLEX is RB3 in
   99/100 rooms (Cory's keepers pre-fill RB1/RB2, so the third RB flexes).
   The 2 disagreements are not mispricings: in both (seeds 4, 69) the engine
   labelled a TE2 "starts in your flex" at pick time, and a later-drafted RB
   ended up the better flex at season scale — a pick-time vs final-state
   difference, with the TE2 still rostered and the lineup still legal.
2. **What FLEX depth is worth (the pricing).** The D3 flex discount
   (`CFG.FLEX_DISCOUNT`, `bestFlexAlt`) prices a flex-only player at his
   marginal over the best flex-eligible alternative. **It is inert in the
   production ranked list**: it modifies `need.value`, and
   `MEASURED_WEIGHTS.need = 0`. It is live on the needrule card, which is
   exactly where EXP-KEEPER-B0's ruling put roster-fill logic (*"follow the
   market WITHIN NEED"* — the mask lives on the card, the ranked list stays
   roster-blind). Sound as shipped, but anyone reasoning about the ranked
   list should know the flex marginal never touches it.
3. **The replacement line under VORP (`vorp.py`).** Cross-referenced, not
   re-run: `test_replacement_sensitivity.py` pins the greedy flex allocation
   (this board: 10 flex slots split RB+1/WR+9/TE+0), proves the output is a
   step function whose flip coordinate is board-specific (the test asserts
   the property, not the coordinate), and measures that the composite absorbs
   it where it matters — **top-70 identical 70/70 at pick 33**; sensitivity
   only grows late, through the bench branch. The knife edge is real,
   characterized, and pinned; no change is evidenced.

### A.3 Bench: the rule buys history-shaped behavior; the mix leans RB

**Cross-referenced, not re-run** (research branch, commits `ab80a657`,
`88b4d733`): the wire-comparison prototype (`VONA_WIRE_BENCH`) and slot-aware
isolation. The isolation's verdict stands and this audit adds nothing against
it: shipped defaults produce a **53.3% QB2 rate vs the real league's 56.7%**
(statistically indistinguishable, exact binomial CI ~40-66%), while
`VONA_SLOT_AWARE=true` takes QB2 in **60/60 rooms** with either bench
formula. **Both flags are OFF and must stay OFF** — nothing here re-opens
that gate; this audit ran shipped-defaults only.

**The new question — is the bench MIX right?** Two measurements, one
simulated and one realized:

- Simulated (this audit, 100 rooms, production weights): the engine's ~6
  bench picks split **RB 3.4 / WR 1.9 / QB 0.5 / TE 0.2 / K+DEF 0.0**.
- Realized (`exp_bench_mix.py`, all 30 real team-drafts 2023-25, starts and
  points from the league's own weekly lineups): real benches were drafted
  **RB 2.43 / WR 2.53 / QB 0.60 / TE 0.40 / K 0.03 / DEF 0.00** per team,
  and per bench pick they returned (points actually scored while started,
  weeks 1-17): **QB 64.0 > WR 40.9 ≈ RB 39.6 ≈ TE 38.2 > K 0.0**.
  36-45% of bench picks never started a single week, at every position.

Verdicts inside that:

- **Zero bench K/DEF is validated by history**: exactly one backup K was
  ever drafted in three seasons and he started zero weeks. The engine's
  refusal to spend bench picks there matches realized value exactly.
- **QB2 at ~0.5/room is defensible**: highest per-pick realized yield
  (byes + streaming starts), and the sim's rate matches the league's real
  0.6. The bench branch's insurance term is buying the right thing here.
- **SOUND-BUT: the engine tilts RB over WR (3.4/1.9) harder than either the
  league's own behavior (2.4/2.5) or realized per-pick yield (39.6 vs 40.9,
  a wash).** The realized data says RB and WR bench picks pay the same per
  slot; the engine buys ~1.5 extra RB at WR's expense. INJURY_RATE (RB 0.28
  vs WR 0.18 in the bench insurance term) is the visible driver. Not a
  defect — the margin is small and the sample is 30 team-seasons — but it is
  the one place the bench rule measurably diverges from this league's
  realized bench economics. Filed as a finding, no change proposed;
  a weight change is gated on Cory regardless.

### A.4 Known open items, cross-referenced (not re-found)

- **RB-flex knife edge** — `test_replacement_sensitivity.py`, covered in A.2.3.
- **Pick-33 headline reconciliation** (ROUTES.md, 2026-08-14, routed to A):
  the measured-weights correction stands — under the weights Cory actually
  sees, the ceiling-tiebreak promotion at pick 33 is at **row 2** (Etienne
  over Swift, 0.5 apart), and any measurement taken off a hand-built context
  must pass `MEASURED_WEIGHTS`. Everything in this audit that touches the
  live surface does (via `live_context.js`, which defaults to the engine's
  measured core).
- **model_learning_audit** (research branch, `9326d04d`): projected scoring
  verified CORRECT end-to-end; the own model loses to a naive recency blend
  at every position (honest negative, standing); `proj_sd` understated
  (median 1.38×, C's measurement). The `proj_sd` point matters here: the
  ceiling column this audit's B.2 examines inherits that understatement, so
  ceiling's absolute magnitude is conservative even where its ordering is
  fine.

---

## MISSION B — TIE-BREAK EDGES, RANKED, WITH EVIDENCE

### B.1 first: how often is there actually a tie to break?

From the 100 shipped rooms (production weights), `contested` =
`gap_to_second < TIE_THRESHOLD (2.0)` on the top recommendation, per live
pick:

| pick | 33 | 48 | 53 | 68 | 73 | 88 | 93 | 108 | 113 | 128 | 133 | 148 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| contested % | **55** | 21 | 8 | 22 | 13 | 44 | 46 | **52** | **59** | 16 | 42 | 4 |
| median gap (pts) | 1.6 | 4.6 | 12.6 | 4.0 | 7.9 | 2.9 | 2.3 | 1.9 | 1.5 | 8.8 | 3.2 | 4.0 |
| same-pos+tier near-tie % (top pair) | 0 | 0 | 0 | 3 | 13 | 1 | 32 | 0 | 0 | 0 | 35 | 4 |
| ceiling promotion in top-5 % | 3 | 3 | 2 | 35 | 31 | 20 | 42 | 1 | 0 | 5 | 27 | 55 |

**A third of Cory's picks are coin flips by the engine's own definition
(12-pick mean ≈ 32%), and his FIRST pick is contested in 55% of rooms.** The
tie-break program is material, not decorative — this is the effect-size
denominator for everything below.

### B.2 the ranked table

| rank | signal | measured edge | verdict | ship-shape |
|---|---|---|---|---|
| 1 | **keeper option** | KOV term is LIVE (weight 1.0) but its round ramp is **inverted vs this league's measured history**: realized option value ≈ **7.1 pts (rounds 4-6) / 1.4 (7-9) / ≈0 or negative (10-15)**; the shipped ramp weights 10-15 max and 4-6 zero | **REAL EDGE, WRONG SHAPE SHIPPED** | `CFG.KOV_MEASURED_RAMP` built, **default false**, 11-check test; Cory's gate below |
| 2 | **upside / ceiling** (the shipped tiebreak) | within-position Spearman(ceiling, mean) **0.9965-0.9994**; only **3.9-6.2%** of same-tier pairs can invert; fires on the top pair 0-35% of picks | **MOSTLY REDUNDANT, HARMLESS** | keep as-is; predictive half UNMEASURABLE offline (no archived ceilings) — measurable Jan 2027 from the daily freeze |
| 3 | **age / years_exp** | same-season: rookie-2yr **−5.8 ± 6.3** (≤1 SE); next-season: 3-5yr **+13.1 ± 7.7**, 6+yr **−14.4 ± 8.7** (<2 SE, survivor-biased) | **NULL, directional at best** | nothing ships; re-run with 2025→2026 in January |
| 4 | **pace of play** | ΔMAE ≤ 0 in all four preregistered arms, both seasons, vs parity null | **NULL — CITED, not re-run** | `EXP-WEEKLY-ENV-PREREG.md` (prereg `5e89a131`), results `97d34e70`, program `b9d31945`. No season-long re-litigation proposed: that is agenda R5, ranked 5th for 2027, and the weekly null does not cover it — but 7 days out there is no responsible install window either way |
| 5 | **bye / stacking** | already measured terms: bye null (weight 0), stack 1.0 (D10 ruling) | **SETTLED** | nothing new; bench bye exposure priced in the bench branch, small |

### B.4 keeper potential — the biggest finding, and it points the OTHER way

`exp_keeper_option.py` (preregistered header, run on the league's own 450
picks + keeper designations, realized points from the fingerprint-stamped
weekly stores under our scoring):

**Q1 — did keeping pay?** 73 keeper-seasons, all measurable. Mean return
over the forfeited round **+23.5 pts**, median +13.7, 53.4% positive. By
flat-cost round: **round-1 keeper slots RETURNED NEGATIVE (−11.7 mean,
39.3% positive, n=28)**; round-2 (+50.2, 68%) and round-3 (+39.4, 55%)
carried the whole program. Keeping three is net-positive in this league, and
the value is in slots 2-3, not the marquee slot. (20 of 73 benchmarks are
round-4 stand-ins because 2023 had no live round-1-3 picks — those returns
are upper bounds, flagged per row in the artifact.)

**Q2 — what predicted "kept next year"?** Population 261 pick-seasons across
the 2023→24 and 2024→25 transitions: P(kept) by draft round bucket =
**47.5% (already-kept players re-kept) / 11.9% (rounds 4-6) / 3.4% (7-9) /
3.9% (10-12) / 0.0% (13-15, 0 of 31)**. Position: RB 17.9%, WR 16.0%,
TE 11.1%, QB 9.1%. years_exp: flat (17.4% / 16.9% / 12.3%) — experience did
NOT predict keeps.

**Q3 — the option value a draft-time tiebreak would lean on** (P(kept) ×
mean return when kept): **rounds 4-6 ≈ +7.1 pts; 7-9 ≈ +1.4; 10-12 ≈ −1.1;
13-15 ≈ 0.** The romantic case for this mission — "a late-round breakout is
a nearly-free top-3-round option" — is **refuted by this league's own
history**: nothing drafted after round 12 was ever kept, and the two
round-10-12 keeps returned −26.9. The keeper pipeline here is re-keeps and
round-4-6 hits. The option is real and it lives exactly where Cory's first
three picks (33/48/53 = rounds 4-6) already are.

**Why this is a live problem, not trivia:** the KOV term ships at weight 1.0
in `MEASURED_WEIGHTS`, and its ramp (`composite.js`: zero through round 6,
full by round 12) gives maximum keeper credit to exactly the rounds whose
measured option value is zero-to-negative, and zero credit to the rounds
where all the measured value sits. On today's history the term is leaning
late-round ties toward players whose keeper option was never exercised by
anyone in three seasons.

**What was built (gated, default false, per the standing rule):**
`CFG.KOV_MEASURED_RAMP` in `composite.js` — when true, the measured shape
(1.0 / 0.2 / 0.0 / 0.0 by bucket) replaces the reasoned ramp; when false,
today, bit-identical shipped behavior, proven by
`draft/tests/kov_measured_ramp.test.js` (11 checks incl. flag hygiene).

**DECISION FOR CORY** (also appended to DECISIONS-NEEDED.md): flip
`KOV_MEASURED_RAMP` on, or leave the reasoned ramp? The measured edge is the
table above; the caveats are honest: two transitions, ~40 keep events,
behavior reflects what managers CHOSE to keep (a late breakout nobody kept
might still have been worth keeping — this data cannot see that
counterfactual), and `max_years 3` structurally feeds the re-keep bucket.
Cells under n=10 (the 7-9 and 10-12 returns) are reported, not trusted.

### B.2 detail — the shipped ceiling tiebreak, validated structurally

The board builds `ceiling = mean + 1.036·sd` with `sd = mean × variance`, so
ceiling only says something mean does not where `variance` varies within a
group. Measured on the live board (`exp_tiebreak_signals.py` part 1):
12-24 distinct variance values per position (not a constant — not fully
decorative), but Spearman(ceiling, mean) ≥ 0.9965 within every position and
only **3.9-6.2% of same-tier pairs** can ever order differently by ceiling
than by mean. Combined with B.1's firing rates (the top-pair same-pos+tier
near-tie exists at all in 0-35% of rooms depending on pick), the shipped
tiebreak is a small, mostly-projection-order-confirming nudge. That is
consistent with both existing dollar measurements — EXP-CEILING-REPLICATE
(w=1.0 leans +$10.3/season, separable in 0/3 seeds) and `exp_tier_ceiling`
(negative at season scale) — and justifies exactly what ships: a bounded
tiebreak, not a scoring weight. **Whether proj_ceiling predicts realized
boom weeks is unmeasurable offline** (no pre-2026 ceiling was ever archived);
the daily `proj_series.json` freeze (began 2026-08-09) makes it measurable
January 2027. Until then the tiebreak's honest description is "prefers the
board's higher-variance label among near-equals," which is Cory's stated
model and costs nothing measured.

### B.3 detail — age/experience: an honest null

Preregistered design and verdict rule in `exp_tiebreak_signals.py` part 2.
Within (position × round-bucket) cells, 2023-24 drafts, n=234 (87% years_exp
coverage, survivor-biased toward players still rostered in 2026 — stated):
no experience bucket clears 2 SE in either the same-season or next-season
metric. The directional next-season pattern (3-5yr +13.1 ± 7.7, 6+yr
−14.4 ± 8.7) is the keeper-relevant one and worth one January re-run with
the 2025→2026 transition added, but on today's evidence **no age tiebreak
ships**. Note it agrees with Q2's flat years_exp keep rates: neither
outcome- nor behavior-side data supports age as a tie-break signal in this
league at this sample.

---

## DATA DEFECT FOUND ALONG THE WAY (fixed in the evidence, routed as a fact)

`draft/data/player_positions.json` is missing the three CURRENT keepers
(7564 Chase, 3198 Henry, 8151 Walker). Consequence measured before the
workaround: all three classified as unknown-position BENCH picks with 11-17
real starts each, poisoning the first bench-mix run (a phantom "?" position
at 191.7 started pts/pick). Both experiments now overlay positions from the
board's `players` + `kept_players`, so the evidence is clean.

**The mechanism is NOT what it first looks like, and the wrong explanation
is retracted here before it spreads:** the union writer (`build.py:757`,
landed `20a6c256` 2026-08-14) runs inside `load_players`, BEFORE keeper
separation (`build():1370` builds `kept_players` from the same pool, so the
pool provably contains the keepers with positions). A full build should
therefore add all three ids. Yet the 2026-08-15 rebuild (`86e42bc2`)
committed a new board and did NOT touch `player_positions.json`. So either
the writer errored in that pipeline (it prints `! position history NOT
updated` and swallows), or that pipeline does not commit the file. Which of
those it is cannot be determined from this offline worktree — the next
build's stdout answers it in one line (look for `position history: ... (+3
new)` vs the `!` warning). Routed as that specific check rather than
patched blind; the file itself was not edited (build output).

## HONEST LIMITS

- The room sim's opponents are noisy-ADP, one keeper configuration, one
  seat. 100 rooms narrows sampling noise; it does not vary the room model.
  Legality conclusions are strong (they hold in every room of every arm ever
  run, including the research branch's 180); bench-mix and tie-rate numbers
  are conditional on the opponent model.
- Keeper history: two transitions, ~40 keep events, choice-revealed (not
  counterfactual-optimal). The gated ramp encodes measured behavior of THIS
  league, which is the right prior for a tiebreak and a weak one for a
  weight — which is one more reason it ships OFF.
- K/DEF realized points are absent from the weekly stores (nflverse offense
  file); everywhere they matter here, the league's own `players_points` was
  used instead, which covers them.
- `starters`-based bench credit stops when a player leaves the drafting
  roster; waiver-sourced value is the wire's ledger (`wire_level.js`,
  research branch), deliberately not double-counted here.

## WHAT SHIPPED / WHAT DID NOT

- **No default changed.** `VONA_SLOT_AWARE` false, `VONA_WIRE_BENCH` absent
  from this base and not introduced, `CEILING_TIEBREAK` true, weights
  untouched. `KOV_MEASURED_RAMP` is FALSE and gated on Cory.
- New: `draft/backtest/roster_room_audit.js` (+ artifact),
  `exp_keeper_option.py`, `exp_bench_mix.py`, `exp_tiebreak_signals.py`
  (+ artifacts, all `_territory`-stamped), `draft/tests/kov_measured_ramp.test.js`,
  `draft/tests/roster_room_audit.test.js`,
  `draft/tests/test_roster_construction_evidence.py`, the `composite.js`
  gated ramp, this audit.
- Routed, not done: the `player_positions.json` writer fix (build.py, one
  line, nightly-rebuild owner's call).
