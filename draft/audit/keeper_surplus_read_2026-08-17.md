# E's sixth sweep — the keeper slate, three days from lock

**Session E (red team), 2026-08-17.** Board: `origin/main`'s
`public/draft_data.json`, `2026-08-16T14:10:12Z`. **Keeper lock is 2026-08-20 —
the nearest irreversible deadline in the project, ahead of the draft itself.**

Five sweeps had read the pool Cory drafts *from*. None had read the three players
he is keeping, which is the largest single decision still open.

---

## FINDING 9 — ~~two of the three keeps are clear wins; Derrick Henry's is not~~

> ### 🔴 CORRECTED 2026-08-17, SAME DAY, BEFORE ANY DECISION WAS TAKEN
>
> **The finding below was framed wrongly and its headline was wrong.** Cory asked
> whether to keep Malik Nabers instead of Henry, and working that question
> exposed the error in my own arithmetic. The corrected reading is here; the
> original is kept underneath, struck through, because a red-team lane that
> quietly edits its own misses is worth less than one that shows them.
>
> **What I got wrong.** I read each keeper's `cost_round` label — Henry 1,
> Chase 2, Walker 3 — as meaning Henry costs pick 8, and reported his surplus as
> **−1 pick**. But the board's own `arithmetic_check` says the picks forfeited
> depend on **how many** you keep, not which:
> `first_pick_by_my_keeper_count: {0: 8, 1: 13, 2: 28, 3: 33}`. The label is a
> Sleeper designation slot, not an economic price. **Keeping any three players
> forfeits rounds 1-3 and starts you at 33**, so attributing pick 8 to Henry
> specifically is an artifact of which slot he happens to occupy.
>
> **The corrected reading.** The three keeps are a **set**: picks 8, 13 and 28
> buy players worth roughly **ovr 4, 9 and 14**. That is a large net win, and the
> marginal cost of the *third* keeper is **pick 28** — so Henry at ~ovr 9 is a
> clear win at that price, **not break-even**.
>
> | keeper | vorp | worth ~ovr | |
> |---|---|---|---|
> | Ja'Marr Chase | 121.82 | 4 | |
> | Derrick Henry | 85.06 | 9 | |
> | Kenneth Walker | 67.60 | 14 | |
> | | | | **for picks 8, 13, 28** |
>
> **What survives from the original.** Henry is still the keep with the most
> against it on the margins — age 32, the largest `own_v6` gap of the three
> (+0.478, 64th percentile), and an age-risk clause sitting behind a weight of
> 0.0. Those observations stand. **What does not stand is calling the keep
> break-even.** It is not.
>
> **The lesson, recorded because it is the same class this project keeps
> hitting:** I took a labelled field (`cost_round`) as an economic quantity
> without checking it against the arithmetic sitting three keys away in the same
> file. That is the stale-citation shape from brief §5, committed by the lane
> whose job is to catch it.

### The Nabers question, answered with the corrected arithmetic

Nabers **is** keeper-eligible — he is on the 2026 roster (`league_history.json`,
roster_id 1), drafted round 5 in 2024 and already kept once at round 2 in 2025.
So the swap was a real option, not a hypothetical.

**It is also cost-neutral**, by the same count-based rule above: keep any three
and you start at 33.

| | Henry | Nabers | |
|---|---|---|---|
| board vorp | **85.06** | 27.09 | +57.97 Henry |
| FantasyPros vorp | **74.79** | 24.88 | +49.91 Henry |
| market ADP | **19.33** | 31.67 | 12.3 picks earlier |

**And it survives this lane's own case against it.** Sweep 5 argued the
opportunity term is a veteran bonus inflating exactly Henry's profile — he sits
at the **0.15 cap** (`opportunity_z 3.03`) while Nabers gets **0.0755**. Applying
that correction at its maximum in Nabers' favour — strip Henry's bonus entirely,
give Nabers the full cap he is denied — gives **Henry 49.30 against Nabers
40.97, still Henry by +8.33.** The strongest argument I have found against
Henry's number does not flip the decision.

**The one argument the board cannot price:** Nabers is 23 and Henry is 32, and
Nabers already carries keeper history. Multi-year option value is real in a
league with `max_years`, and **the board values a single season and models none
of it.** That is Cory's weighting, not a measurement, and it is the only live
argument for the swap.

**Against Nabers on top of that:** `injury_status: Questionable`, and he is one
of the players who missed 2025 (brief §3 names him among the 26 draftable
players with no 2025 volatility data), so his usage figures are stale and his
`own_v6` of 82.92 is degraded enough not to lean on in either direction.

---

<details>
<summary><b>ORIGINAL TEXT, SUPERSEDED — kept for the record</b></summary>

~~Cory's slot is 8 in a 10-team snake, so the picks a keep costs are R1 = 8,
R2 = 13, R3 = 28. Valuing each keeper on the board's own `proj_mean`:~~

| ~~keeper~~ | ~~proj_mean~~ | ~~vorp~~ | ~~would rank~~ | ~~costs~~ | ~~surplus~~ |
|---|---|---|---|---|---|
| ~~Ja'Marr Chase~~ | ~~295.1~~ | ~~121.82~~ | ~~~ovr 4~~ | ~~R2 = pick 13~~ | ~~+9 picks~~ |
| ~~Kenneth Walker~~ | ~~256.7~~ | ~~67.60~~ | ~~~ovr 14~~ | ~~R3 = pick 28~~ | ~~+14 picks~~ |
| ~~Derrick Henry~~ | ~~274.2~~ | ~~85.06~~ | ~~~ovr 9~~ | ~~R1 = pick 8~~ | ~~−1 pick~~ |

~~**Chase and Walker are strongly positive. Henry is the one keep that returns
roughly what it costs.**~~ **← this is the wrong framing; see the correction
above.**

The supporting observations about Henry — age 32, `own_v6` 143.2 against the
board's 274.2 at the 64th percentile of disagreement, and the age-risk clause
behind `MEASURED_WEIGHTS.risk = 0.0` — were correct and are carried into the
corrected section.

</details>

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
