<!-- TERRITORY: C -->
# THE LIVE BOARD'S UNCERTAINTY, AUDITED AGAINST MEASURED ERROR

Run 2026-08-13 against `public/draft_data.json` (built `2026-08-13T09:20:18Z`, 1,759
players) using the calibration in `projection_error_calibration.json`.

**THE CAVEAT FIRST, because every number below inherits it.** The calibration is
fitted on `walk_forward`'s error — the backtest projection — and the live board
projects from provider baselines, which may simply be more accurate. So this is *what
the board's uncertainty would be if production's projections are about as wrong as
walk-forward's*. That is a real assumption and it cannot be settled until January,
when the first archived preseason projection (2026-08-09, four days old) meets a
graded season. Read the direction and the ordering, not the third digit.

## Two corrections to numbers in circulation

**`adp_sd` is worse than reported.** The figure in play was "243 at 15.00, 239 at
30.00 — 83% of the board". On today's board:

```
   30.00   x1418   81%
   15.00   x246    14%
    3.00   x17      1%
   -------------------
   top two values  95% of 1,759
```

**1,418 at exactly 30.00, not 239, and 95% on two values rather than 83%.** That
matches the structural finding exactly: the `search_rank` fallback assigns
`adp = ffc_max + rank`, always above 120, so `max(8.0, min(0.25*adp, 30.0))` returns
30.00 for **every** fallback player by construction. There is no input under which one
of them gets a different number.

**`proj_sd` varies, and the correction to me was right — with one qualifier.** 238
distinct ratios (reported: 237), so production genuinely computes per player. But
across **578 players, not 1,759**: the other 1,181 have `proj_mean` 0 and no ratio at
all. And the observed range is **0.220 – 0.522**, where 0.522 is exactly TE's
`base 0.36 × VAR_MULT_MAX 1.45`. **The cap is binding at the top of the range**, which
is the structural claim I made from the code, now confirmed from the artifact.

## What the calibration changes

505 of 578 projected players fall in a measured cell.

```
   calibrated sd / shipped sd     median 1.38x     min 0.82x     max 2.80x
```

**Biggest understatements inside ADP 150** — shipped sd → measured:

| player | pos | pos rank | adp | shipped | measured |
|---|---|---|---|---|---|
| Jordan Love | QB | 17 | 137.7 | 71.0 | **184.6** |
| Baker Mayfield | QB | 18 | 141.0 | 73.2 | 179.7 |
| Kyler Murray | QB | 21 | 136.7 | 65.2 | 169.6 |
| Tyler Shough | QB | 19 | 148.7 | 73.3 | 173.4 |
| Trevor Lawrence | QB | 9 | 84.7 | 75.5 | 148.3 |
| Jayden Daniels | QB | 10 | 59.3 | 75.2 | 147.6 |
| Bijan Robinson | RB | 2 | 1.7 | 93.9 | 165.7 |

**Biggest overstatements** — the board is *more* uncertain than reality:

| player | pos | pos rank | adp | shipped | measured |
|---|---|---|---|---|---|
| Puka Nacua | WR | 1 | 4.0 | 84.0 | **68.9** |
| Tyler Warren | TE | 4 | 52.0 | 69.3 | 59.2 |
| Colston Loveland | TE | 3 | 41.3 | 74.7 | 69.0 |
| Ashton Jeanty | RB | 7 | 11.3 | 97.7 | 92.7 |

## The shape of the error, which is the finding

**The board is compressed in both directions at once: too confident about the risky,
too uncertain about the safe.** Nine of the ten largest understatements are
quarterbacks ranked 9–22 — the streaming range — carrying a shipped sd near 70
against a measured 145–185. Meanwhile the safest players on the board (Nacua at WR1,
the top tight ends) are given *more* spread than they have earned.

That is not a scaling error, which would be harmless to ordering. It is a **rank
error in the risk term**, and for an objective that is a weekly max over startable
players, the risk term is exactly what decides between two players at equal mean.

**And it compounds with the waiver measurement.** The empirical shelf says a streamed
waiver QB returns a **median 23.4 points a week**, three times the RB shelf. So the
late-QB region is simultaneously (a) far less predictable than the board says and
(b) the position where a replacement is cheapest to obtain. Both errors push the same
way: **toward drafting a quarterback earlier than the evidence supports.**

## What is not claimed

That the calibration should be pasted onto the board. `draft/projections.py` is A's,
`player_variance` is bounded by `base × [0.70, 1.45]` and several measured cells sit
above what it can emit at any input, so adopting these numbers is a change to the
model's range and not a parameter tweak. That is A's call, and the January test is
what would settle whether production's own error looks like this at all.

What *is* claimed: the two `adp_sd` values covering 95% of the board carry no
player-specific information, and that field drives survival, which drives VONA.

---

# ADDENDUM — `adp_sd` IS A FUNCTION OF `adp`, AND THIS SUPERSEDES THE COUNT ABOVE

The two-value count is true and it is the wrong cut. Measured properly, the finding
is both narrower and far stronger.

## DECLARE THE SAMPLE FIRST

"95% of the board on two values" counts all 1,759 players, and **1,418 of those are
the `search_rank` fallback — players outside the draftable range entirely.** The
question that matters is what the board carries where somebody might actually pick.
So: **ADP ≤ 150, which is 145 players.**

## WHAT IS THERE

```
   145 draftable players
    50  at exactly 15.00        the clamp saturated (all adp 101.0-148.7)
    92  match max(3.0, min(0.15*adp, 15.0)) EXACTLY   the formula, unsaturated
     3  carry something else    Wease 13.80, Metchie 6.20, Pearsall 4.40
```

**142 of 145 — 98% — carry a computed number, not a measured one.** FFC's published
standard deviation reaches exactly three players on the entire draftable board, all
three `adp_source: ffc`, all three with an sd *below* what the formula would give.

## WHY THIS IS THE STRONGER STATEMENT

The two-value framing says the field is coarse. This says the field is **empty**:
`adp_sd` is a deterministic function of `adp` for 98% of the players anyone will
draft. It carries no independent information at all — not "little", none. Survival
probability, which drives VONA, is therefore computed from a dispersion that is
itself just `0.15 × adp`, so survival is a pure function of `(adp, pick)` and the
uncertainty term adds nothing beyond what `adp` already said.

And the clamp truncates exactly where dispersion is largest: real published values
run 3.00–14.95 across ADP 1.3–131.2 and are still rising when the formula caps at
15.00, which is every draftable player past pick 100.

## WHAT IT COSTS, MEASURED THROUGH THE REAL FUNCTION

`keepers.survival_probability` at a 20-pick gap:

```
   sd =  8.0    0.6% survival
   sd = 15.0    9.1%
   sd = 30.0   25.2%
```

**A factor of two in `adp_sd` moves survival about threefold**, and 40× across the
range. Note also that at fixed sd the survival at a given gap is identical at every
ADP — which is the clamp's harm stated exactly: it makes survival depend only on the
gap, never on who the player is.

## AND WHY NOBODY COULD SEE THIS FROM THE BOARD

`adp_sd_source` is computed at `adp.py:362` and **not copied** by
`apply_with_fallback` at `:609`, which takes only `(adp, adp_sd, adp_source)`.
`draft/evidence/items.js:77` reads it and defaults to the string `'heuristic'`. So
the one display that distinguishes a measured sd from a computed one says
"heuristic" for every player, always — not because it measured that, but because the
field never arrives. **The provenance that would have made this visible was computed
and then dropped one function later.**

## CORRECTION TO THE SECTION ABOVE

I reported "worse than reported — 95% on two values" earlier today, amplifying a
board-wide count. That number is correct and it overstates the severity where it
counts, because four fifths of it is the undraftable tail. The draftable-range cut
is the one to act on, and it happens to be a graver finding: not a coarse field, an
uninformative one.
