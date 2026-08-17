# E's sixth sweep — the keeper slate, three days from lock

**Session E (red team), 2026-08-17.** Board: `origin/main`'s
`public/draft_data.json`, `2026-08-16T14:10:12Z`. **Keeper lock is 2026-08-20 —
the nearest irreversible deadline in the project, ahead of the draft itself.**

Five sweeps had read the pool Cory drafts *from*. None had read the three players
he is keeping, which is the largest single decision still open.

---

## FINDING 9 — two of the three keeps are clear wins; Derrick Henry's is not

Cory's slot is 8 in a 10-team snake, so the picks a keep costs are **R1 = 8,
R2 = 13, R3 = 28**. Valuing each keeper on the board's own `proj_mean` against
his position's replacement level, and inserting him into the board's own VORP
ordering:

| keeper | proj_mean | vorp | would rank | costs | surplus |
|---|---|---|---|---|---|
| **Ja'Marr Chase** | 295.1 | 121.82 | ~ovr **4** | R2 = pick 13 | **+9 picks** |
| **Kenneth Walker** | 256.7 | 67.60 | ~ovr **14** | R3 = pick 28 | **+14 picks** |
| **Derrick Henry** | 274.2 | 85.06 | ~ovr **9** | R1 = pick **8** | **−1 pick** |

**Chase and Walker are strongly positive. Henry is the one keep that returns
roughly what it costs** — the board says he is the ninth-best player available
and he is being bought with the eighth pick.

Three things sit on top of that, none of which is an argument on its own:

- **He is 32,** with 10 years of service — the oldest player anywhere near the
  top of this board.
- **`own_v6` disagrees with him hardest of the three keepers:** 143.2 against the
  board's 274.2, a **+0.478** relative gap, the 64th percentile of disagreement
  boardwide, against Chase's +0.133 (30th percentile).
- **The board's own risk term would dock him and cannot.** `engine.js:1083`
  subtracts for age past a positional cliff — but `MEASURED_WEIGHTS.risk = 0.0`,
  so the age clause reaches no recommendation. `WEIGHT_PROVENANCE` already calls
  that term *"UNMEASURED"* (register row 7).

**What I am NOT saying.** I am not saying drop Henry — that is Cory's call and
nobody else's, the way C1 and C2 are, and a −1 pick surplus is a *neutral* keep
rather than a bad one. Nor is the board's number necessarily right about him;
sweep 5 showed the opportunity term is a veteran bonus, and Henry carries
`opportunity_z 3.03` at the **0.15 cap**, which is precisely the population that
finding says the board flatters. **Those two point in opposite directions and I
cannot resolve them from the board.**

**What I am saying is that the three keeps are not equivalent decisions, and
nothing on the board says so.** Chase and Walker are not close calls. Henry is,
and it is the one that costs the first-round pick.

### Honest limits

- **The replacement levels were computed on a pool that excludes all keepers**, so
  inserting the three back would shift replacement slightly and my implied ranks
  are approximate — good to a few spots, not to one.
- **The real alternative to keeping Henry is not "the player ranked 9th"** — it is
  whoever is actually on the board at pick 8 after other teams' keepers resolve,
  and `keeper_slate.safe_to_treat_as_truth` is **false** with 6 of 10 teams
  undesignated. That uncertainty runs in both directions and I have not modelled
  it.
- `predicted_keepers` carries a **different cost_round for Chase (1, against the
  live slate's 2)**. That file is explicitly `"MOCK/REHEARSAL ONLY"` and says so,
  so it is not a defect — noted only so nobody reads a surplus off the wrong file.

### ASK / EVIDENCE / REC / DEFAULT → **A**, for routing to Cory before 08-20

```
ASK:      Does Cory know the three keeps are not equivalent -- that two are
          strongly positive and the third is roughly break-even on the
          board's own numbers?
EVIDENCE: Chase ~ovr 4 for pick 13 (+9); Walker ~ovr 14 for pick 28 (+14);
          Henry ~ovr 9 for pick 8 (-1). Henry is 32, own_v6 143.2 vs the
          board's 274.2, and the age-risk clause that would dock him sits
          behind a weight of 0.0.
REC:      Surface the per-keeper surplus, not a recommendation. This is
          Cory's decision in the same class as C1 and C2, and it locks
          08-20. My read is genuinely two-sided: sweep 5 says the board
          FLATTERS exactly Henry's profile, which would make the true
          surplus worse than -1; but the same board is the only measured
          thing available and it says neutral, not bad.
DEFAULT:  Filed today so it reaches him with three days left rather than
          one. I do not touch the keeper slate and I am not asking for a
          number to change.
```

---

## HALF-DIED — Kenneth Walker carries no projection SOURCE, but his number is sound

The alarming version of this is false and I checked before writing it up.

Walker's keeper row has **`proj_sleeper: null` and `proj_fantasypros: null`**,
where Chase (256.6 / 274.98) and Henry (238.4 / 263.89) both carry each. Inside
the top 250, **exactly one skill player on the whole board is that shape** —
Keenan Allen at ovr 243, whose `team` is `FA`, which explains itself. Walker's
team carries projections for everyone else on it: Rice, Kelce, Worthy, Noah Gray,
even Tyquan Thornton at ovr 306.

**But the number is not invented.** `_rank_fallback` — the synthetic that decays
off ADP when no projection exists anywhere — would give an RB at ADP 17.0
`270 × (1 − 0.0035 × 17) = 253.9`. **The board carries 225.5**, so the fallback
did not fire; a real projection reached him. And the arithmetic downstream is
exact: `225.5 × (1 + 0.1384) = 256.71` against a published `proj_mean` of 256.7.

**So this is a provenance gap, not a fabricated projection:** a real baseline
arrived, and the per-source fields that let anyone verify *which* source it came
from are absent on that row alone among the three keepers. It is worth one line
to whoever owns keeper-row enrichment, and no more than that — **it changes no
number, and Walker's +14-pick surplus does not depend on it.**

It does interact with sweep 4's finding: `projSourceMark` would stamp Walker
*"single-source projection (Sleeper only)"* on the strength of `proj_fantasypros`
being null — which, for him, is the one row where that caveat is accidentally
closer to true than it is anywhere else.

---

## RUNNING TALLY, SIX SWEEPS

**Filed (9):** band-edge dispersion misread (`NO DEFAULT — BLOCKED`) ·
opportunity-cap saturation · non-mean-preservation and QB exclusion · source
evidence (aggregate) · live PUP/IR status reaching no availability number · the
inverted single-source caveat · the opportunity term as a veteran bonus · the QB
source split · the keeper surplus spread.

**Died or half-died (12):** draft-slot arithmetic · bye completeness · tier
construction · `injury_status` unused · `games_expected` undocumented ·
`adp_stale` one-sidedness · `search_rank` reaching a draftable pick · K/DEF
ranking · depth-chart-vs-usage · `vorp == 0.00` · Walker's projection being
invented · the `predicted_keepers` cost mismatch.

**Still uncovered, and it has not moved in six sweeps:** registers 2 and 3
concern the *fresh* 693-player board. Every sweep has read the published 682-row
board because that is what Cory drafts from; a fresh build needs Sleeper/FFC
egress this session does not have. **That gap is now the largest single thing my
lane has not looked at**, and it should be handed to a session that has network
rather than left implicit.
