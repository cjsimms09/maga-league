# ROW 17 — re-test triggers completed, and a false claim found in its third home

_TERRITORY: D — data stewardship. Written 2026-08-17, session D's sixth item._

Row 17: *"Every recorded null lacks a re-test trigger."* Four were attached over
the day's earlier commits (Vegas, snap_counts, advanced_stats, routes). This
closes the remainder — **and finding pace's trigger turned up the same false
claim for the third time, in the place where it cost the most.**

---

## 1. THE TRIGGER LEDGER — every null now dated

| null | trigger | where |
|---|---|---|
| `vegas_lines_*` | run a **team-level** implied-total arm (`total/2 + spread/2`) with a join counter | register 18 |
| `snap_counts_*` | prereg a snap-share feature, post-08-22 | register 13 |
| `advanced_stats_*` | a different construction (per-position weight, or higher `MIN_VOL`), or a 4th leak-free fold | register 15a |
| `routes_*` | weekly grain / per-position; a true routes feed; **and test `routes` as a volume measure** | register 14 |
| **`team_pace_*`** | **§3 below** | this file |
| `weekly_volatility` | already dated — `VOLATILITY-WIRING-PREREG.md`, post-draft | brief §7 |
| `historical_props_*` | **none needed — it was never graded**; re-run it | register 15b |

**Row 17 is complete.** One store remains UNEXAMINED for a different reason —
`component_stats_*`, §4.

## 2. THE PACE NULL IS SOUND, AND BETTER BUILT THAN ROW 18's

Checked before writing a trigger for it, because a trigger on an unsound null
just schedules the same mistake.

The pace null does **not** come from `exp_weekly_env.py` — that harness has pace
arms too, but the *published* null is a dedicated study (`pace_study.py`,
`pace_arm.py`, preregistered `pace_of_play_prereg_2026-08-16.md`). It carries
what row 18's oracle lacked:

- **an instrument control** — `implied_team_total_wk1`, explicitly *"NOT a pace
  metric… the same estimator, the same 32 franchises, the same four
  transitions"*, on a quantity known to carry;
- **a negative control** at `k = -0.5`, and a positive Vegas control, per
  position;
- **a persistence GATE** that ends the study if the pooled CI includes 0;
- **multiplicity disclosed** — *"eight pace metrics were screened for
  persistence; two cleared; one is graded here"*, stated in the artifact rather
  than buried.

Verdict: `clears: false` — 1 of 3 positions improved both metrics, WR MAE and TE
Spearman degraded. **A real null, honestly bounded.** Not reopened.

## 3. THE TRIGGER — and why it is not a date

> **Re-test `team_pace_*` when a SECOND graded fold exists.** The null rests on
> **one** — 2025 — and the study says so. Two of three positions moved by less
> than 0.25 MAE, which one fold cannot separate from noise. **A second fold is
> the trigger, and §3b says it may already be available.**

## 3b. THE REASON THE SECOND FOLD WAS ABANDONED IS FALSE

`pace_arm.json`'s `leak_protocol` records:

```json
"registered_selection_fold": {"graded": 2024, "priors": [2022, 2023],
  "status": "UNAVAILABLE",
  "why": "a 2024 grade needs season_totals(2022), which reads
          nflverse_weekly_points_2022.json. Only 2023, 2024 and 2025 exist…"}
```

**`nflverse_weekly_points_2022.json` exists** — 5,351 player-weeks, 18 weeks,
`complete: true`, no missing weeks. And it loads: `own_model_v2.season_totals(2022)`
returns cleanly today, verified read-only.

**This is the same false claim as register row 10, in its third home** — row 10
itself, this `leak_protocol`, and (as a *"pending"* framing) the props artifact.
Here it had the highest cost: **the pace study ran on one graded fold because it
believed a second was impossible.** The registered selection fold was
preregistered and then abandoned, not to a measurement, but to a file listing.

### But the fold is not automatically recoverable, and this is the real question

The fold is **mechanically** available. Whether it is **valid** is a different
matter, and nobody has asked it:

`nflverse_weekly_points_2022` carries `scoring_fingerprint`
**`220bf4c671786351`**; 2023-25 carry **`bd8f3e50bd67a9ce`**. The registered fold
uses **2022 and 2023 season totals together as priors**. Those two totals were
produced under **different scoring tables**, so averaging or trending across them
treats two different quantities as one — precisely what `weekly_volatility`
refused those seasons for, and what `routes_tprr_study.py` refuses at runtime.

**So the honest position is:** the recorded reason is wrong, the conclusion may
still survive on the correct reason, and **the correct reason has never been
evaluated.** That is a materially better place to be than "the file doesn't
exist", because it is answerable:

1. re-score 2021-22 under the current table (makes the fold clean), **or**
2. redesign the fold to stay inside one fingerprint — `routes_tprr_study.py`
   demonstrates this works and got **three** folds from it, **or**
3. measure whether a differently-scored prior actually distorts the feature
   enough to matter, and record the answer either way.

**`pace_arm.py` and `pace_study.py` are `TERRITORY: A`.** I have not edited them
or re-run anything. Routed to A with the three options above.

## 4. THE ONE STORE STILL UNEXAMINED — `component_stats_*`

`DATA-LIFECYCLE` marks it *"6-7 UNEXAMINED — graded only indirectly"*, and that
is now the **only** store stopping without a recorded reason.

It is genuinely different from the four I closed today: **it does predict.** It
feeds `own_model_v6`, the live model, and is graded — but only *through* weekly
points, so its own contribution is never isolated. That is the same shape as
register row 13's original (wrong) premise, except here it is true.

**Deliberately not started, and the reason is scope rather than difficulty.**
Isolating it means an ablation of the live model — building own_v6 with and
without the component arms and grading both. That is `own_model_v6.py`'s
territory (**A**), it needs a prereg, and it reads 2025 for what would be the
**fifth** time (`pace_arm.json`'s own multiplicity note already flags four).
Starting it late on 08-17 and leaving it half-done would be worse than naming it
precisely.

**Filed as register row 19, owner A, with the prereg requirement stated.**

## 5. WHAT I CHANGED

- `DEFECT-REGISTER.md` — row 17 **CLOSED**; row 10 gains the pace instance; new
  row 19 (`component_stats_*` ablation, A).
- `DATA-LIFECYCLE.md` — pace row gains its trigger and the §3b caveat.
- `draft/tests/test_weekly_points_stores_exist.py` — **new**. Three separate
  places recorded that 2021/2022 weekly points do not exist. They do. This pins
  the fact and the fingerprint split that is the *real* constraint, so the next
  study to reach for a second fold reads the truth from a test rather than from
  a stale sentence.

## 6. THE TEST, AND WHY IT CAN FAIL

- **`test_all_five_weekly_points_stores_exist_and_are_complete`** — every season
  2021-25 present, `complete: true`, no missing weeks, and a real player-week
  count. Fails if a store is deleted or truncated.
- **`test_the_fingerprint_split_is_where_it_is_believed_to_be`** — 2021/2022 on
  one fingerprint, 2023/24/25 on another. **This is the constraint that replaced
  the false one**, so it is pinned rather than remembered. If 2021-22 are ever
  re-scored, this test fails and sends the reader to the three studies whose fold
  counts change.
- **KNOWN-POSITIVE CONTROL** — the loader must actually read fingerprints, proven
  by requiring the two groups to *differ*. A checker returning a constant would
  pass a same-fingerprint assertion and fail this one.
