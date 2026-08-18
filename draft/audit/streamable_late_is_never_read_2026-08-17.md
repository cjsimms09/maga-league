# E's eighth sweep — `STREAMABLE_LATE` is computed, tested, and read by nothing

**Session E (red team), 2026-08-17.** Board: `origin/main`'s
`public/draft_data.json`, `2026-08-16T14:10:12Z`.

**Scope note:** Cory ruled today that *"ADPs are fine, leave them."* Nothing here
questions ADP. Market price is used only as a yardstick for the board, which his
ruling makes a more reliable yardstick rather than a less one.

---

## THE FINDING — a config value with no consumer

`engine.js:2167`, inside `formatDefaults()`:

```js
STREAMABLE_LATE: teams <= 10 ? ['QB', 'TE', 'K', 'DEF'] : ['K', 'DEF'],
```

A deliberate, league-shape-aware judgement: in a 10-team league four positions
can be streamed and should therefore be pushed later. **It is read by nothing.**

The whole repo, excluding `node_modules`:

```
public/js/draft/engine.js:2167   the definition
draft/tests/engine.test.js:475   a test asserting the definition is computed correctly
```

No third reference. And `applyFormatDefaults` — the function whose job is to move
these onto the live config — copies exactly one field:

```js
function applyFormatDefaults(league) {
  const f = formatDefaults(league);
  CFG.BENCH_DISCOUNT = f.BENCH_DISCOUNT;   // <- the only one that lands
  return f;
}
```

`STREAMABLE_LATE` is returned and dropped on the floor.

**This is a class the engine already documents about itself**, twenty lines from
the risk term:

> *"`games_missed_3yr` is read here and WRITTEN BY NOTHING… `undefined >= 8` is
> false, so this durability clause has never fired for any player in any run.
> Three risk clauses fire and the fourth silently does not. That is the
> self-description class: the code reads as though it prices [something it does
> not]."*

`STREAMABLE_LATE` is the mirror image — **written by something and read by
nothing** — and it has the extra property that a test pins it, so it reads as
covered. `engine.test.js:475` asserts the 10-team list contains `QB` and the
12-team list does not. That test passes, and would keep passing if every consumer
were deleted, because there are none.

## THE OBSERVABLE CONSEQUENCE IS AT TE, AND NOT AT QB

**I overstated this on first look and am correcting it here.** My initial read
was *"the four positions the engine calls streamable are the four the board is
highest on."* That is not what the numbers say. Median `ADP − board rank`,
positive meaning the board is higher on them than the market:

| pos | top 150 | 70–150 band | whole board |
|---|---|---|---|
| **TE** | **+12.3** (n=17) | **+16.7** (n=10) | +85.5 |
| QB | +3.0 (n=17) | **−5.3** (n=11) | −175.0 |
| K | +135.2 | +143.0 | +149.2 |
| DEF | +110.2 | +113.0 | +117.2 |
| RB | −3.3 | −60.7 | −74.0 |
| WR | +1.7 | −27.0 | +2.8 |

- **K and DEF are enormous — and already fully handled.** Three independent
  guards demote them (sweep 4): `demoteFlaggedOnesies` in the engine, the
  `demoteOnesies` view-side sort with an on-screen explanation, and a
  `plausibilityRails` flag. Their raw rank is not what anyone sees.
- **TE is real but modest** — +12.3 in the top 150, +16.7 in the band Cory
  actually picks in. In the 70–150 band the six players the board is highest on
  are **all tight ends**: Hunter Henry +38.3, Hockenson +30.3, Andrews +30.3,
  Kelce +25.3, Strange +18.7, Kittle +14.7. Five of the six are 7+ year veterans,
  which is sweep 5's veteran-bonus finding showing up concentrated at one
  position.
- **QB does not show the pattern at all** — +3.0 in the top 150 and **negative**
  in the band. Whatever else is true, the board is not systematically early on
  quarterbacks.

**So the honest claim is narrow:** the dead config value is a real code defect;
its predicted consequence is visible at TE and absent at QB; and K/DEF, the two
positions where the raw ranking is most extreme, are the two already protected.
**The asymmetry worth A's attention is that K and DEF get three guards while TE —
named in the same list, in the same league shape — gets none.**

### ASK / EVIDENCE / REC / DEFAULT → **A** (owns `engine.js`)

```
ASK:      Should STREAMABLE_LATE be wired, or deleted?
EVIDENCE: Defined at engine.js:2167, referenced only by engine.test.js:475;
          applyFormatDefaults copies BENCH_DISCOUNT and nothing else. Median
          ADP-minus-board-rank at TE is +12.3 in the top 150 and +16.7 in the
          70-150 band, with the six board-highest players in that band all
          tight ends; QB shows +3.0 and -5.3, i.e. no effect.
REC:      Either is defensible and I am not choosing. What should not persist
          is the third state -- a considered judgement about league shape
          that is computed every run, pinned by a test, and reaches no
          decision. If it is deleted, delete the test with it, or the pin
          outlives the thing it pinned.
DEFAULT:  Filed. Nothing ships before 08-22 and I am not asking it to. This
          is a post-draft item; TE is the only live position affected and
          the effect is ~12-17 picks, not a blown round.
```

Rule 3d, answered:
1. **Did the input vary?** Yes — the value differs by league size (4 positions at
   ≤10 teams, 2 above), and `engine.test.js:475` proves both branches compute.
2. **Did it arrive?** **No — and that is the finding.** Two references repo-wide,
   neither a consumer.
3. **Could the check have fired?** Yes — the positional medians discriminate
   sharply (TE +12.3 against QB +3.0, K +135.2), so a real effect would have
   shown at QB too. It does not, which is why the claim above is narrowed.

---

## ALSO SETTLED THIS SWEEP — register 3 does not reproduce on the published board

Register row 3: *"Board's published ranks disagree with its own vorp ordering
(`test_A_ZERO_BONUS_REPRODUCES_THE_BOARDS_OWN_RANKS`). No artifact involved —
internal inconsistency in the board Cory drafts from."* **OPEN, owner A, blocked
on building a fresh board.**

Checked directly on the published 682-row board:

- **adjacent pairs where a lower-ranked player carries higher `vorp`: 0**
- `overall_rank` is a clean `1..682` with no gaps and no duplicates

**The board Cory actually drafts from is internally consistent on ranks.** So
whatever row 3 is, it is **specific to the fresh 693-player board** and is not
sitting in front of him this week. That does not close the row — it is still real
on the fresh board and still A's — but it narrows it and takes it off the
draft-week critical path.

Combined with sweep 7 naming `adjusted_adp` as row 2's candidate, **both of the
"needs a fresh board" register rows now have as much answered as can be answered
without egress.**
