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
