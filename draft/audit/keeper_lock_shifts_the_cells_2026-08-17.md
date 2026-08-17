# E's thirteenth sweep — keeper lock moves 46 players into a different calibration cell

**Session E (red team), 2026-08-17.** Keeper lock is **2026-08-20**; the draft is
08-22.

Register row **E1** carries a re-check trigger I wrote myself: *"re-check after
keeper lock 08-20 — the cells shift when keepers leave the pool."* I could not
wait for the date, so I computed what the shift will be.

---

## THE RESULT

Every player's dispersion cell is `(position, within-position projection rank)`.
Removing the other nine teams' keepers from the pool compresses every remaining
player's rank — and **14 of those keepers currently sit in the top 30**, so the
compression is severe rather than marginal.

**46 players change calibration cell at lock. 37 of them are inside the top 150.**

| | today | at lock | band |
|---|---|---|---|
| James Cook | RB5 | **RB1** | 4-8 → **1-3** |
| CeeDee Lamb | WR5 | **WR2** | 4-8 → **1-3** |
| Ashton Jeanty | RB8 | **RB3** | 4-8 → **1-3** |
| A.J. Brown | WR6 | **WR3** | 4-8 → **1-3** |
| Chase Brown | RB9 | RB4 | 9-16 → 4-8 |
| De'Von Achane | RB11 | RB6 | 9-16 → 4-8 |
| Chris Olave | WR11 | WR5 | 9-16 → 4-8 |
| DeVonta Smith | WR12 | WR6 | 9-16 → 4-8 |
| Zay Flowers | WR13 | WR7 | 9-16 → 4-8 |
| Ladd McConkey | WR14 | WR8 | 9-16 → 4-8 |
| Breece Hall | RB12 | RB7 | 9-16 → 4-8 |
| Omarion Hampton | RB13 | RB8 | 9-16 → 4-8 |
| Tetairoa McMillan | WR17 | WR11 | 17-32 → 9-16 |
| Emeka Egbuka | WR18 | WR12 | 17-32 → 9-16 |

Each cell carries its own measured p90/p10 ratio, so **every one of these 46
players gets a materially different `proj_floor` and `proj_ceiling` on 08-20** —
three days before Cory drafts, on the players he is most likely to take.

**Sweep 7 is what makes this bite.** `proj_ceiling` is `proj_mean × a per-cell
constant` (Spearman exactly 1.000000 within cell, 16/16). So a player's entire
dispersion identity **is** his cell membership. Change the cell, change the only
thing the field says about him. James Cook moving `4-8 → 1-3` is not a tweak; it
is the whole number.

## WHAT THIS MEANS FOR E1

**E1 does not fix itself at lock, and it does not get worse — it changes
identity.** The defect is a mismatch between the rank basis `blend()` uses
(`players + kept_players`) and the pool the board publishes (`players` only), so
its size is governed by **Cory's three keepers**, not by the other teams'. Those
three stay in `kept_players` through lock, so the mismatch stays about three
slots wide.

**But the nine players it lands on will be a different nine**, because every
boundary moves. The E1 table in `band_edge_misread_2026-08-17.md` — Chase Brown,
Javonte Williams, Swift, Mason, Monangai, St. Brown, Jefferson, McMillan,
Pierce — **should be treated as correct for today's board and re-derived, not
re-read, after 08-20.** A fix applied to those nine by name would fix the wrong
nine.

**That is an argument for fixing the mechanism rather than the rows**, which is
what E1 already asks for.

## HONEST LIMITS — this is directional, not exact

**I used `predicted_keepers`, and that file says in its own header:**

> *"PREDICTED slates for MOCK/REHEARSAL ONLY — never applied to the live board
> (Cory, 2026-08-11: a prediction rendered indistinguishably from a fact IS a
> fact as far as behaviour is concerned)."*

So the 46 is **the magnitude to expect, not the roster to act on**. Two specific
gaps:

- **The prediction is not the designation.** `keeper_slate` reports **4 of 10
  teams designated and 8 keepers withheld**; my simulation removes **14**
  predicted keepers across the nine other teams. Those are different populations
  and I have not reconciled them — the real slate is not confirmed
  (`safe_to_treat_as_truth: false`, 6 teams undesignated).
- **I did not re-run `blend()`.** I recomputed the ranks and the band each rank
  falls in. The actual `proj_floor`/`proj_ceiling` deltas would come from the
  calibration's p90/p10 ratios per cell, which is A's code to run.

**What survives both limits:** the direction is certain (removing top-30 players
can only compress ranks downward) and the order of magnitude is robust — even
halving 46 leaves ~23 players changing cell in the range Cory drafts from.

## ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      none new -- this is evidence for E1, which is already open and
          already blocked on you.
EVIDENCE: 46 players change calibration cell when the other teams' keepers
          leave the pool, 37 inside the top 150, with four moving into the
          1-3 band. Sweep 7 established proj_ceiling is mean x a per-cell
          constant, so cell membership IS the dispersion figure.
REC:      Fix E1's mechanism, not its nine named rows -- the rows will be a
          different nine on 08-20. And treat the 08-20 re-check as required
          rather than tidy: any floor/ceiling figure noted from today's
          board is stale the moment the slate confirms.
DEFAULT:  Filed against E1's existing row. I have not touched anything and
          cannot re-run blend().
```
