CLAIM: Correcting the ADP feed's 4-point-passing-TD / -1-INT market assumption
to this league's real 6 / -2 scoring — the correction `lab_scoring_gap.py`
measures but deliberately does not apply — is now BACKTESTED on the three real
seasons. The correction, built properly (on value above replacement, through
the board's own price curve), is the right SIZE as a model of this room's QB
timing: it removes about a third of the room's measured early-QB bias and
matches the accuracy ceiling of a correction fitted to the room itself on
held-out seasons, while the naive version (raw gap, no replacement
subtraction) provably over-corrects to the other side. But it would have
changed almost no real draft decision in replayed history (2 of ~20
seat-seasons), and the certified money grader prices both changed decisions at
exactly $0.00. Recommendation: do NOT wire a correction into the live engine
before the 2026-08-22 draft; keep the measurement, and treat the corrected
ladder as a diagnostic, off-by-default input if it is wired at all.

WHAT RAN, all of it fresh, all of it committed:

1. `draft/backtest/exp_scoring_gap_correction.py` (experiment SG-1) — a new,
   self-contained backtest under `draft/backtest/`, pre-registered
   expectations in its docstring, touching no live pipeline. Result committed
   as `draft/backtest/exp_scoring_gap_correction.json`. Guarded by
   `draft/tests/test_scoring_gap_correction.py` (11 tests, all passing; full
   suite 2146 passed / 6 skipped after the change).

2. THE CORRECTION, constructed rather than fitted:
   - Per-QB gap = points our scoring adds to the SAME projected stat line vs
     the market's table. Verified arithmetic identity 2*pass_td - 1*pass_int
     on the two committed raw 2026 stat rows (`rule12_statlines.json`):
     Josh Allen +44.0 on 405.5 proj (share .1085), Trevor Lawrence +40.0 on
     343.42 (share .1165). Per-QB gaps estimated as share x proj_mean with
     that measured band carried end-to-end (band turned out not to move any
     downstream number: corrected-ladder error is 8.48 at all three shares).
   - Value above replacement, not raw gap: dvorp = gap(q) - gap(replacement
     QB) — the `test_nflverse_qb_scoring.py` lesson applied. Raw gaps of
     +37..+46 collapse to dvorp of 0..7.2 points, because the replacement QB
     throws touchdowns too.
   - Slots via the board's own price curve: an isotonic (PAVA) fit of vorp
     against adp over the full priced 2026 board, inverted. Resulting shifts:
     Allen 7.0 slots earlier (20.7 -> 13.7), Lamar 9.0, Hurts 5.7, Caleb
     Williams 6.0, Lawrence 4.7; QBs at or below replacement move 0.
   - A deliberately-naive arm (raw gap, no replacement subtraction) ran
     beside it to show what the shortcut does.

3. ARM B — magnitude vs the real room. Slot-level (identity-free): where the
   room really took its Nth QB in each of the three real 150-pick drafts
   (`league_history.json`) vs where the raw and corrected ladders price the
   Nth QB. Pool-depletion frame (keeper picks count — a kept QB leaves the
   board like any other); the live-picks-only slice is reported to show the
   artifact excluding keepers introduces. A leave-one-season-out ROOM-FITTED
   per-slot shift ran beside it as the ceiling any correction could reach.

4. ARM C — window survival, the quantity VONA actually consumes. For every
   seat's consecutive live picks in all three drafts (377 windows), predicted
   QB departures in the window (raw vs corrected ladder, truncated to the
   priced dozen on both sides) against real departures.

5. ARM D — dollars, on the certified machinery. A correction can only earn
   where it FLIPS a decision: a seat still without its QB whose next-QB
   market price reads "safe past your next pick" raw and "gone" corrected.
   At each seat-season's first flip (2024 + 2025; 2023 excluded — no
   strictly-prior season on disk for a walk-forward projection, same rule as
   exp_inverse_adjuster), the counterfactual takes the best
   walk-forward-projected available QB at that pick instead of the real
   pick, room held fixed (exp34_dollars' single-swap convention), graded
   through `roster_sim` + `money_grade.grade_substituted` against the seat's
   real drafted roster graded identically.

WHAT CAME BACK, exactly as measured:

    ARM B, 18 slot observations (3 seasons x QB1-QB6), keepers included:
      raw ladder:        mean |err| 11.46, signed +11.46, 18/18 positive
                         (the room is earlier at every slot, every season —
                         reproduces the VONA-ROOM-VS-MARKET finding from
                         data, not memory; pinned as a test)
      corrected:         mean |err|  8.48, signed  +7.79
      naive raw-gap:     mean |err| 15.38, signed -14.86  (overshoots to the
                         other side of the room, worse than no correction)
      room-fitted LOSO:  mean |err|  8.56  (the fitted ceiling; the
                         arithmetic correction matches it without fitting)

    ARM C, 377 real pick-windows:
      MAE 0.870 -> 0.854; bias +0.032 -> 0.000
      corrected better in 67 windows, raw better in 62, tied in 248
      (real, tiny, and the sign is right; non-QB positions untouched by
      construction — the correction only moves QB prices)

    ARM D, decision flips and dollars:
      2024: 2 flips (of 10 seats). Both were waits that WOULD have failed —
            the next QB really did leave the board inside the window (taken
            at pick 29 vs a window closing at 35; taken at 17 vs 20) — so
            the corrected advice was right about the board both times.
            Dollar delta of following it: $0.00 and $0.00. Not rounded —
            the substituted rosters cleared no additional weekly high, moved
            no standings place, changed no playoff outcome.
      2025: 0 flips. (The room's first QBs went so early — picks 15/23 —
            that both ladders agreed "gone" at every live decision.)
      Sum across every graded flip in replayed history: $0.00.

WHAT IT PROVES:

- The causal story is real but PARTIAL, and now it has a number: the scoring
  gap explains about a third of the room's early-QB bias (signed error 11.46
  -> 7.79 under the arithmetic correction). The remaining ~two-thirds is
  room behavior the scoring rule does not explain — and the LOSO arm shows
  chasing that remainder with a fitted correction gains nothing on held-out
  seasons (8.56 vs 8.48): season-to-season QB-timing variance eats it. This
  quantifies exactly why VONA-ROOM-VS-MARKET's "direction, not a magnitude"
  refusal was correct.
- If a correction is ever wired, it must be the VORP-based one. The naive
  raw-gap version — the obvious first implementation — lands 15.38 MAE with
  the sign inverted: measurably worse than doing nothing.
- As a survival input the corrected ladder is strictly-non-worse: slot error
  down 26%, window bias to 0.000, placebo clean, robust across the measured
  gap-share band.
- But better measurement did not convert to better outcomes on this history:
  the room already prices the 6-point rule (that is what 18/18 means), our
  own proj_mean already values QBs correctly, so the correction mostly
  confirms "he'll be gone" in spots where the wait was already doomed. Two
  decisions flip in ~20 replayed seat-seasons; the certified grader prices
  both flips at $0.00.

WHAT IT DOES NOT PROVE:

- That the correction can never earn money. Arm D is a deterministic
  point-estimate advice rule and a single-swap, room-held-fixed
  counterfactual on the hindsight-ceiling denominator — it does not re-run
  the full probabilistic VONA/composite engine, whose 62%-weight survival
  input could shift marginal non-QB picks in ways a swap test cannot see.
  That full test is the JS-engine replay behind the CI bridge, and it is the
  natural next increment if anyone wants one.
- That the ladder comparison is confound-free. No historical ADP exists
  locally (FFC is CI-egress only), so the market baseline is the 2026
  board's ADP applied to 2023-25 drafts at slot level — the same confound
  VONA-ROOM-VS-MARKET documents. The PAIRED raw-vs-corrected comparison
  shares and largely cancels it; the absolute error levels do not.
- That the per-QB gap estimates are exact. They ride a share x proj_mean
  approximation from a 2-row measured band (the raw payload only exists
  inside a CI build). The next board build will carry the real per-player
  measurement in `provenance.scoring_gap_vs_adp_market`; re-checking the
  ladder against it is cheap and should happen.
- Anything about 2023 dollars (no prior-season data on disk to build an
  honest projection), or about any season with n large enough for a CI —
  2 flips is a count, not a distribution.

RECOMMENDATION (the call, with the numbers behind it):

1. DO NOT correct the live board's ADP/survival input for the 2026-08-22
   draft. The measured dollar value of the correction on real history is
   $0.00 across every decision it would have changed, and the standing
   policy requires Cory's sign-off for exactly this class of change — there
   is no evidence here that would justify asking for it this week.
2. KEEP the measurement (`lab_scoring_gap`) exactly as designed, and keep
   the corrected ladder as a DIAGNOSTIC: `exp_scoring_gap_correction.py`
   regenerates it from the live board in one command. If it is ever wired
   into the engine, wire it off-by-default behind a flag (the
   `CFG.VONA_WIRE_BENCH` convention), use the VORP-based construction only
   — the naive raw-gap version is proven harmful (15.38 MAE, sign
   inverted) — and let the flip precision found here (2/2 correct "he'll be
   gone" calls) be re-tested at full-engine granularity in the CI bridge
   before any default changes.
3. The one place this evidence should change behavior NOW is
   interpretation, not code: the room's early-QB habit is only ~1/3
   scoring-rational. The rest is behavior — which means the survival model's
   real gap is a ROOM model gap (experiment 31 / opponent-model territory),
   not a scoring-arithmetic gap, and future work should aim there.
