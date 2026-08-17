<!-- TERRITORY: A -->
# THE ADP-SD RATCHET FIRED — a real finding, one player wide, and Cory's call

**2026-08-17. Five days to the draft. Nothing was changed in response to this;
this file records what was measured and what the decision is.**

---

## WHAT WENT RED

`test_adp_sd_measured.py::test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error[50-100]`

```
adp  50-100  n=48:  fitted/measured = 1.39     (bound: 1.35)
```

The shipped fitted rule (`keepers.ADP_SD_RATE = 0.15`) produces an ADP standard
deviation **39% wider** than FantasyFootballCalculator's published dispersion in
that band. An over-wide sd flattens survival — it makes every player look more
likely to still be there at your next pick than the market says he is. The
direction of harm is **waiting too long and losing players.**

## WHY IT FIRED NOW, WHICH IS NOT WHAT I FIRST ASSUMED

My first guess was that the constant had drifted or the board had broken. Both
are wrong, and the measurement says so:

| quantity | 2026-08-14 | 2026-08-17 |
|---|---|---|
| least-squares slope through origin, adp 20-200 | 0.1083 | — |
| median per-player sd/adp, adp 20-200 | 0.1099 | **0.1082** |

**The rate measurement reproduces to 0.1% across three days and two
estimators.** Our side did not move. What moved is FFC's published dispersion in
the 50-100 band specifically, which tightened. The ratchet is doing exactly the
job it was built for: it noticed the market getting more confident while our
constant stayed put.

Band-by-band on today's board:

```
adp   1-25   n=22:  1.32
adp  25-50   n=23:  1.31
adp  50-100  n=48:  1.39   <-- over
adp 100-150  n=48:  1.17
adp 150-400  n=73:  0.95
```

## THE BLAST RADIUS IS ONE PLAYER, AND THAT IS THE WHOLE REASON THIS IS NOT URGENT

`adp_sd_for(adp_mean, provided)` uses a **published** dispersion wherever one
exists and only falls back to the fitted rule where none does. On today's board:

- 214 rows carry a published FFC dispersion
- 468 rows fall back to the fitted rule
- **inside pick 160 — the entire 10-team, 16-round draft — exactly ONE row falls
  back:** Oronde Gadsden, TE, ADP 148.33

So 159 of the 160 draftable players compute survival from the market's own
number, untouched by the constant that is 39% wide. This matches the blast
radius measured on 2026-08-14 ("exactly ONE is inside pick 150") — it has not
grown.

## WHAT I DID NOT DO, AND WHY

**I did not widen the bound to 1.40.** `keepers.py`'s own block names that move
as the recurring failure: *"Tightening them is the fix; widening them to make a
red go away is the thing this repo keeps catching itself doing."* A ratchet that
gets loosened whenever it fires is not a ratchet.

**I did not ship the measured 0.11 rate.** The standing reason for holding 0.15
is recorded in `keepers.py` and is still in force: 0.11 is derived from FFC's
published dispersion, and source selection is under review. Replacing a shipped
constant with a number sourced from the feed being reviewed turns an unfinished
analysis into a production change. Beyond that, the block establishes that
**the rate cannot move alone** — at 0.11 the floor of 3.0 (which binds below ADP
27) is what makes the 1-25 band read high, so moving the rate without the floor
leaves that band mispriced, and a first candidate that moved all three made the
aggregate *worse* (1.121 vs 1.103).

Changing survival probability five days before the draft, on my own initiative,
to fix a defect that touches one player Cory is unlikely to draft, is not a
trade I should make for him.

## THE DECISION, STATED PLAINLY FOR CORY

Three options, and my recommendation is the first:

1. **Leave it.** One player inside the draft, and the market number wins
   everywhere else. Revisit after the season with the source-selection question
   settled. *Recommended.*
2. **Re-fit rate + floor + cap together** against today's published dispersion.
   This is the real fix and it is a genuine piece of work — the block is
   explicit that a partial move makes things worse, and the cap is still
   undetermined (n=30 above ADP 200, max 42.3).
3. Widen the bound. **Do not.** Listed only to name it as rejected.

## CI STATUS

The test is marked `repo_parity`, and `draft-data.yml`'s publication gate runs
`-m "not repo_parity"`, so **this does not block a board publish.** It is red in
an unfiltered local full-suite run, which is where it should be visible: it is
evidence awaiting a decision, not a broken build.
