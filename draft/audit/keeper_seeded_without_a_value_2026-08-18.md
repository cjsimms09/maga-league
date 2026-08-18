# E's sixteenth sweep — a keeper seeded without `vorp` is scored as worth zero, and the war room then tells Cory he beats him

**Session E (red team), 2026-08-18.** Board: `public/draft_data.json`, 682 rows
+ 3 `kept_players`. **Keeper lock is 08-20 — two days out — which is why this
population got swept.**

---

## THE CLAIM ON SCREEN, AT CORY'S FIRST PICK

At pick 33 the war room said:

> **Zay Flowers — KEEPER TARGET … he beats Ja'Marr Chase for the last slot by
> 17 pts**

Ja'Marr Chase is Cory's best keeper: projected **295.09**, the WR2 on the board.
Zay Flowers does not beat Ja'Marr Chase for a keeper slot, and the tool had no
evidence that he does.

**Four KEEPER TARGET badges fire across his twelve picks. With the keepers
correctly valued, ZERO do.**

| pick | round | badges now | badges fixed | example claim |
|---|---|---|---|---|
| 33 | 4 | **3** | 0 | Zay Flowers "beats Ja'Marr Chase by 17 pts" |
| 48 | 5 | **1** | 0 | Drake Maye "beats Ja'Marr Chase by 11 pts" |
| 53–148 | 6–15 | 0 | 0 | — |

## THE CAUSE — an absent input reading as a successful zero

`kept_players` is a **different population** from `players` and carries a
different field set. It **has** `cost_round`, `original_round`, `team_slot`,
`is_keeper`; it **lacks** `vorp`, `replacement`, `pos_rank`, `overall_rank`,
`tier`, `tier_drop`, `tier_rank`, `tier_size`, `adjusted_adp`, `pool_rank`.

`app.js:populateKeepers` pushed the row through verbatim:

```js
state.myRoster.push(Object.assign({}, k, { is_keeper: true }));
```

so `ctx.currentKeepers` held three players with `vorp === undefined`. And
`composite.js:nextYearVorp` reads:

```js
return (player.vorp || 0) * factor;
```

**Absent became a confident ZERO.** This is the shape the repo has already
removed twice — the `|| echo "gen_keepers skipped"` in the keeper workflow, and
the `|| undefined` weights in two suites. A missing input reads as a successful
one.

**Then the sign flips.** The keeper term is marginal:
`KOV_marginal = max(0, raw − bar)`, where the bar is the weakest incumbent who
would still hold a slot. With all three incumbents scored at zero the bar goes
**negative**, so it **ADDS** to every candidate instead of subtracting:

| round | ramp | bar now | bar with keeper vorp | players whose KOV changes | max inflation |
|---|---|---|---|---|---|
| 1 | 1.0 | **−31.86** | −6.53 | 8 | +25.33 (Gibbs) |
| 3 | 1.0 | **−17.45** | +0.99 | 22 | +18.44 (Nacua) |
| 5–6 | 1.0 | **−11.42** | +2.54 | 36 | +13.95 (St. Brown) |
| 7–9 | 0.2 | **−2.28** | +0.51 | 36 | +2.79 (Bijan) |
| 10+ | 0.0 | 0 | 0 | 0 | — |

The ramp is **1.0 through round 6**, so this is live exactly where Cory picks.

## WHAT IT DOES **NOT** DO — measured, not assumed

**The ranking does not move. 0 of 120 name slots change across all twelve of his
picks**, on a market-follow board (at pick N the N−1 best adjusted ADPs are
gone).

The reason is structural and worth stating: **the bar is constant across
candidates at a given pick** — it depends only on the incumbents — so it shifts
every candidate's keeper term equally and can only reorder through the
`max(0, …)` clamp.

**So this corrects a FALSE ON-SCREEN CLAIM, not a recommendation.** I want that
distinction on the record rather than letting a +25.33 inflation imply the board
was mis-ranked. My first measurement used an empty `taken` set, which made every
pick score the same pre-draft board; that run said "1 of 12" and was not a real
draft state. Corrected before filing.

## THE FIX — the artifact's own formula, applied to a row that was missing it

`withKeeperValuation()` derives the keeper's `vorp` at seeding time.

**NOT an invented number:** `vorp === round(proj_mean − replacement_points[pos], 2)`
holds for **682 of 682** board rows, so this applies the artifact's own published
formula with its own published constants — pinned as check 2 of the guard.

```
Ja'Marr Chase   WR  295.09 − 173.27 = 121.82
Derrick Henry   RB  274.16 − 189.10 =  85.06
Kenneth Walker  RB  256.70 − 189.10 =  67.60
```

**Absent stays absent.** An unknown position, or a row with no projection, leaves
`vorp` undefined rather than reaching for a fallback constant — a fallback is
precisely what caused this. An already-valued row is not overwritten.

## FLAGS THAT DIED ON INSPECTION THIS SWEEP

1. **Keeper dispersion cells** — the three keepers have `pos_rank: null`, so I
   expected their floors and ceilings to be priced off a wrong or missing cell.
   **They are correct.** Recovered from the ratios they carry: Chase → `WR|1-3`,
   Henry → `RB|4-8`, Walker → `RB|9-16` (|d| < 2e-05 in every case), which match
   where their projections would rank them among the published pool (WR2, RB6,
   RB9).
2. **`pool_rank` missing on kept_players** — looked like a read against an absent
   field. It is not: `keepers.js:adjustedAdp` **writes** `pool_rank` and
   deliberately excludes kept players from the pool. Correct by construction.

## THE GUARD — `draft/tests/keeper_seeded_with_a_value.test.js`, 17 checks

Including: the artifact really omits `vorp` (the premise); the derivation matches
all 682 board rows; **two known-positives** requiring the unfixed state to
actually produce a negative bar and to actually fire badges at Cory's picks; the
**named** claim reproducing at pick 33 and not surviving the fix; the 0-of-120
ordering measurement; and a fail arm.

**The fail arm was wrong on first run and the test caught it** — the pattern
`/withKeeperValuation\(k, data\)/` also matched the function *declaration*, so
the arm passed while asserting nothing. Now anchored to the call site.

**39 of 39** suites touching `populateKeepers`, `currentKeepers`, `myRoster`,
`kept_players` or `keeperOptionValue` pass, including `keeper_option_floor`,
`kov_measured_ramp`, `rec_rows` and `engine_ablation`.

### ASK / EVIDENCE / REC / DEFAULT → **A** (owns `app.js` and the artifact)

```
ASK:      Approve the seeding fix, and rule on whether build.py should emit
          `vorp` on kept_players directly.
EVIDENCE: 4 KEEPER TARGET badges at Cory's picks, all naming a keeper the
          candidate does not beat; round-1 bar -31.86 against -6.53 correct;
          0 of 120 name slots move, so ordering is unaffected.
REC:      The UI fix has SHIPPED because it corrects a false claim about a
          named player two days before keeper lock, and it cannot move a
          ranking. The ARTIFACT question is yours: kept_players omitting
          `vorp` is defensible (they are not draftable) but it is what let a
          consumer silently read zero, and app.js is not the only consumer.
DEFAULT:  The seeding fix stands. If you would rather fix it in build.py,
          the UI derivation becomes redundant rather than wrong -- it
          no-ops when `vorp` is already present.
```

Rule 3d, answered:
1. **Did the input vary?** No — and that is the finding. `vorp` was `undefined`
   for 3 of 3 keepers, every run.
2. **Did it arrive?** No. `populateKeepers` copied the row verbatim; the field
   was never on it.
3. **Could the check have fired?** Yes, and two known-positives prove it: the
   unfixed state produces a bar of −31.86 and four badge firings. Note that
   `rec_rows.test.js` passes `roster: []` and `currentKeepers: []` at all twelve
   picks and **says so in its own header** — so the keeper path had never been
   exercised with real keepers by any suite.

## WHAT THIS SWEEP DOES **NOT** COVER

1. **One roster.** Measured on Cory's three keepers at his twelve picks. Another
   manager's slate could bind differently, though the mechanism is not roster-
   specific.
2. **It does not revisit whether KOV's model is right** — only that it was fed a
   zero. The ramp, the discount and `keepProbability` are unexamined here.
3. **`cost_round` is still not an economic price.** Corrected in an earlier sweep
   and unchanged by this one.
