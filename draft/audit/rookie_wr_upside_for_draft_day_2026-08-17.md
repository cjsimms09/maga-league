<!-- TERRITORY: A -->
# YOUR TWO ROOKIE WRs, MEASURED — one is a good instinct, the other is not

**For draft day, 2026-08-22. Reading of an EXPLORATORY artifact
(`rookie_wr_capital.json`), not a shipped rule. See the caveats — they are real.**

---

## THE QUESTION YOU ASKED

> *"Still think we should target rookie WR with opportunities later in the draft.
> KC Concepcion, Cyrus Allen.. their cost is cheap and upside is there.. can you
> find a way to quantify why I think they have upside"*

The instrument that could answer this per-player — realized weekly volatility —
**is silent on rookies by construction**: a rookie has no prior weekly record, so
his volatility is not small, it is undefined. So the only measurable handle on
rookie upside is NFL DRAFT CAPITAL, and that has been measured.

## WHAT THE TAIL LOOKS LIKE BY DRAFT CAPITAL

Rookie WRs, 2023-25. "Tail" = a season of 150+ fantasy points. Wire bar = 124.1.

| capital | n | mean | vs wire (95% CI) | **tail rate** |
|---|---|---|---|---|
| **rd 1** | 15 | 131.5 | +7.4 [−19.7, +34.3] | **8/15 = 53.3%** |
| rd 2 | 12 | 91.0 | −33.1 [−62.3, 0.0] | 3/12 = 25.0% |
| rd 3 | 17 | 50.2 | −73.9 [−91.0, −53.8] | **0/17 = 0.0%** |
| rd 4-7 | 55 | 24.7 | −99.4 [−108.6, −88.6] | **1/55 = 1.8%** |

**The cliff is between round 2 and round 3, and it is not subtle.** Rookie-WR
upside is a first/second-round-capital phenomenon. Below that the tail
essentially disappears: 1 hit in 72 players across rounds 3-7 in three seasons.

## YOUR TWO PLAYERS SPLIT ON EXACTLY THAT LINE

| | KC Concepcion | Cyrus Allen |
|---|---|---|
| NFL capital | **round 1, pick 24** | **round 5, pick 176** |
| tier | rd1 | rd4-7 |
| historical tail rate of that tier | **53.3%** | **1.8%** |
| tier mean vs wire | +7.4 (CI spans zero) | −99.4 (CI excludes zero) |
| our ADP | 147.0 | 228.5 |
| our projection | 127.4 | 30.2 |

**Concepcion is a defensible late-round upside swing.** Round-1 capital, and our
own board projects him at 127.4 — just above the 124.1 wire bar — at ADP 147.
The tier he belongs to hits a 150+ season more than half the time. Your instinct
on this player is supported by the measurement.

**Cyrus Allen is not the same bet, and the difference is not close.** Round-5
capital puts him in the tier that produced ONE tail season in 55 players, whose
mean sits 99 points BELOW the waiver wire with an interval excluding zero. Our
board projects him 30.2. Taking him is not buying upside; on this evidence it is
buying a roster spot that historically returns less than the wire.

**The lesson is not "rookie WRs" — it is "rookie WR CAPITAL".** Grouping
Concepcion and Allen together as "cheap rookie WRs with upside" merges the best
tier with the worst one. They are 152 picks apart in the NFL draft and it shows.

## CAVEATS, AND THEY ARE NOT DECORATION

1. **`rookie_wr_capital.json` is marked EXPLORATORY and `cannot_ship`** — it was
   computed before any preregistration existed. It is hypothesis-generating.
   Nothing on the board changes because of it, and this note changes nothing
   either; it is input to a human decision, which is a different standard.
2. **n = 15 for rd1 over three seasons.** The mean interval SPANS ZERO. The
   honest rd1 claim is *"not measurably worse than the wire"*, **not** *"beats
   it"*. The 53% tail rate is the interesting number, and it rests on 15 players.
3. **Absent is counted as zero** (a roster spot that returned nothing).
   `played_only_mean` is reported beside it and for rd1 they are equal.
4. **The 2026 join is BY NAME** — the capital store carries no sleeper_id for
   this class. Three rookies failed to match (Kendrick Law, CJ Williams,
   Anthony Smith) and are absent from the table above rather than assumed.
5. **Capital is not unpriced.** The market already knows Concepcion went in round
   1; that is part of why he costs pick 147 and Allen costs 228.

## HOW THIS SITS WITH THE OTHER FINDING

The "turn upside up in the late rounds" hypothesis lost again today, on a money
proxy corrected in its favour (endgame ceiling 0.0 best, +64.33 CI [+35.67,
+94.17]). **That is not in tension with this note.** That study asks whether a
BLANKET late-round upside tilt pays across the whole board — it does not. This
note says one specific player has round-1 capital and a tier that hits. A
targeted swing on an identified player and a global weight change are different
decisions, and only the second one was refuted.
