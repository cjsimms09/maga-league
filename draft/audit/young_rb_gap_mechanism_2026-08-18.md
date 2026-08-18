# E's twenty-seventh sweep — the mechanism behind the "no stated model reason" gap

**Session E (red team), 2026-08-18.** A's flagged priority ask on rows 2c/2d:
*"Find the MECHANISM behind the young-RB gap... The prior is that we are wrong,
not the market — find why before anyone calls it edge."* Five named players,
one shape: Tuten −94, DJ Moore −86, Price −84, Tate −74, Sutton −53, all below
market with no stated model reason.

**Do NOT run row 2c's prescribed test — already correctly ruled out** (`vorp`
carries no weight, so it cannot see a ceiling change). This sweep is a
different measurement.

---

## THE MECHANISM: `proj_mean` runs on Sleeper alone, and this is where Sleeper disagrees most with FantasyPros

Row 21 already established `proj_mean == proj_sleeper` for every player carrying
both, and separately measured that FantasyPros runs ahead of Sleeper at RB by a
wide margin in Cory's pick window. **This sweep asks the sharper question: does
that specific gap explain WHICH players end up ranked well below market — not
just that the two facts co-occur, but that one causes the other.**

**It does, and cleanly.** In Cory's pick window (ADP 27-160, n=123):

| population | n | mean (FP − Sleeper)/Sleeper | FP > Sleeper |
|---|---|---|---|
| ranked **>20 slots WORSE** than market | 33 | **+37.6%** | **32 of 33** |
| the rest of the window | 90 | +2.4% | 62 of 90 (69%) |
| ranked **>20 slots BETTER** than market | 34 | **−1.5%** | 19 of 34 (56%) |

**The effect only exists on the "worse than market" side, and it is huge there
and near-zero everywhere else.** Pearson correlation across the whole window,
board-vs-market gap against the FantasyPros-vs-Sleeper percentage gap:
**r = 0.733, n = 123.**

## THE FIVE NAMED PLAYERS ARE INSTANCES, NOT A SEPARATE PHENOMENON

| player | pos | board | ADP | gap | Sleeper | FantasyPros | FP gap |
|---|---|---|---|---|---|---|---|
| Bhayshul Tuten | RB | 93 | 56.3 | +37 | 158.8 | 192.67 | **+21%** |
| DJ Moore | WR | 88 | 52.7 | +35 | 147.5 | 173.73 | **+18%** |
| Jadarian Price | RB | 91 | 60.0 | +31 | 160.5 | 176.62 | **+10%** |
| Carnell Tate | WR | 89 | 72.3 | +17 | 144.8 | 145.83 | +1% |
| Courtland Sutton | WR | 90 | 90.7 | −1 | 144.8 | 164.93 | **+14%** |

Four of the five have Sleeper meaningfully below FantasyPros (10-21%); Tate's
gap is small and his board-vs-market gap has since narrowed too. **These are not
a special class — they are five instances of the same population-wide pattern**,
and A's framing as *"the young-RB gap"* is narrower than the effect actually is:
it is not RB-specific (three of the five original names are WR), it is a
**source-disagreement effect that happens to concentrate at RB** because that is
where Sleeper and FantasyPros disagree most (row 21's own measurement).

## THE LARGEST INSTANCES, FOR CONCRETENESS

| player | pos | board | ADP | gap | Sleeper | FantasyPros | FP gap |
|---|---|---|---|---|---|---|---|
| Isiah Pacheco | RB | 308 | 153.3 | +155 | 48.6 | 105.5 | +117% |
| Alvin Kamara | RB | 292 | 139.3 | +153 | 53.0 | 114.2 | +115% |
| Zach Charbonnet | RB | 275 | 137.7 | +137 | 61.7 | 113.2 | +83% |
| Brian Robinson | RB | 271 | 147.7 | +123 | 63.4 | 89.6 | +41% |
| RJ Harvey | RB | 143 | 83.0 | +60 | 125.6 | 144.5 | +15% |

**One clean exception, worth naming rather than hiding:** Jonah Coleman (RB,
board 280 vs ADP 157.7, gap +122) has FantasyPros **below** Sleeper (−25%), so
his ranking is not explained by this mechanism — a genuinely different cause
(depth-chart uncertainty, a real Sleeper/FP split in the other direction) is
worth a separate look if he is drafted near his current price.

## WHAT THIS DOES AND DOES NOT SETTLE

**Does:** answers *why* almost every large under-market disagreement exists —
it is not scattered idiosyncratic noise, and it is not evidence the board is
"broken" on these specific players. It is the direct, measurable, position-
correlated consequence of a decision already sitting with A (row 21, source
policy) applied at scale.

**Does not:** say which source is RIGHT. Row 21 already states the limit
plainly — *"Sleeper/FantasyPros past accuracy is unmeasurable — 2026 is the
first gradeable season"* — and nothing in this sweep changes that. This is a
mechanism finding, not a correctness finding. **The prior A asked me to check —
"we are wrong, not the market" — cannot be confirmed OR refuted by this
measurement; what it establishes is that there is exactly ONE lever behind
nearly all of it, not five unrelated ones.**

## WHY THIS MATTERS FOR THE RE-SCOPE OF 2c/2d

Both rows can now point at the SAME root cause instead of independently
investigating five separate players. A single source-policy ruling — full,
partial, or position-scoped — moves nearly all of this population at once,
rather than requiring five separate explanations. **That does not make the
ruling any less A's to make**, and row 21 already carries the caution that a
per-position ruling on accuracy grounds could not be supported (P39's traceable
claims turned out to rest on a promotion bar that never compared to Sleeper at
all). This sweep adds the population-wide correlation as evidence for *how much
is riding on that one decision*, not a recommendation on which way to rule it.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      None new -- this answers the mechanism question directly rather
          than asking anything further.
EVIDENCE: r = 0.733 (n=123) between board-vs-market disagreement and the
          FantasyPros-vs-Sleeper gap; 32 of 33 large under-market
          disagreements have FP > Sleeper (mean +37.6%) against 62 of 90 for
          the rest of the window (mean +2.4%). Effect vanishes for players
          ranked BETTER than market.
REC:      Treat 2c/2d as ONE question with one lever (the row 21 source
          ruling), not five separate player-level investigations. No new
          urgency created -- row 21 already has this queued and already
          states why it cannot yet be resolved on accuracy grounds.
DEFAULT:  Nothing before 08-22 -- row 21's own no-change-through-08-22
          holding applies here too, this sweep just explains why so much of
          the board's market disagreement traces to it.
```

Rule 3d, answered:
1. **Did the input vary?** Yes — the FP-Sleeper gap ranges from −25% to +467% in
   this window and correlates with the board-market gap at r=0.733.
2. **Did it arrive?** Yes — `proj_fantasypros` and `proj_mean` are both read here
   directly off the board, the same fields row 21 already traced end to end.
3. **Could the check have fired?** Yes — the reversed-direction control (players
   ranked BETTER than market) shows the effect is directional and specific, not
   an artifact of measuring the same thing twice.
