<!-- TERRITORY: A -->
# THE DATA HOLES — A REAL INVENTORY — 2026-08-17

**Cory:** *"What other massive hole like that do we have in our data?? That's
ridiculous.. wtf"*

Prompted by the variance-modifier fit, where `VAR_BACKUP` and `VAR_INJURED`
could not be measured at all because depth charts and injury designations exist
only for today. He is right that this deserves a sweep rather than a shrug.

**This is an inventory, not a study.** Every claim below is checked against
committed data or code, and the check is named.

---

## THE ONE THAT MATTERS MOST: WE ARE STILL DIGGING

`proj_series.json` was created on **2026-08-09** for the express purpose of
giving 2027 a clean, leak-free grade of Sleeper — the thing four committed
records say is unmeasurable until January 2027. Its per-player payload is:

```json
{"11563": 415.88}
```

**A bare float.** No injury designation, no depth-chart slot, no team, no ADP,
no snap-count expectation. `adp_series.json` is the same shape (`{pid: 1.33}`).

So in January 2027 we will be able to say *"we projected 415.88 and he scored
380"* and we will **still** be unable to say *"he was QB2 on the depth chart
carrying a Questionable tag when that projection was written."* The exact hole
that voided two of today's four modifiers is **being freshly dug right now, by a
capture built to prevent this class of problem.**

Cost to fix: adding fields to a workflow that already runs daily. That is the
whole fix, and every day it is not done is a day of thinner history.

**And the series already has holes.** 787 players appear in at least one Sleeper
snapshot; **400 appear in every one.** So **387 players — 49% — have a gap in
their own series**, because the captured population changes snapshot to
snapshot. A per-player trend line across those is not reliable.

---

## THE FULL LIST

### 1. Roster state has NO history — permanently unrecoverable

| field | engine refs | history |
|---|---|---|
| `depth_chart_order` | 4 | **none — 2026 only** |
| `injury_status` | 5 | **none — 2026 only** |
| `sleeper_rank` | — | **none — 2026 only** |

Checked: `season_stamp.BOARD_FIELD_SOURCES`, which classifies exactly nine board
fields as `current` (live state, no season in the payload).

This is not cosmetic. `freeze_pre_draft.py` records a measurement: **removing
`depth_chart_order` alone from a live board costs 4 of the top 25.** So the
board uses a field that no backtest can ever include. Anything keyed on it —
today's `VAR_BACKUP`, any future "he's buried, discount him" rule — is
permanently ungradeable on 2021-2025.

**Nothing recovers this for past seasons.** The only move is to start capturing.

### 2. FantasyPros per-player rows: computed in CI, then thrown away

`exp_fp_hist_proj` graded 2023/2024/2025, passed every authenticity gate, and
committed **10.7 KB** — per-position aggregates (`n`, `spearman`, `mae`,
`bias`). The per-player rows were deliberately not retained.

**Consequence, already paid twice.** The blend study Cory ordered
(`proj_mean_blend_2026-08-16.md`) was REFUSED for want of a control arm. The
position-weight study could only test own-model arms against each other. Both
were blocked by a *retention decision*, not by anything the world withheld.

Re-fetching is CI-only egress; fantasypros.com answers **403** from the sandbox.

### 3. FantasyPros rank dispersion: in the payload, never parsed

The `consensus-rankings` endpoint we already call returns `rank_min` /
`rank_max` / `rank_std` alongside `rank_ave` — expert disagreement per player.
`fantasypros_adp.py` reads `rank_ave` as a fallback and drops the rest.

That is a genuine **per-player uncertainty signal**, free, in a response we
already pay for — and per-player uncertainty is precisely what today's fit
established we do not have.

### 4. Structural exclusions that silently narrow every study

- **The shared population rule requires a prior-season stat row.** No rookie has
  one, so the pick-61+ graded cell contains **zero rookies** while the league
  actually drafted **37** there across three seasons
  (`opportunity_inheritance_2026-08-17.md` §2.3). Every "late-round" verdict
  ever graded in that cell is about **veterans**.
- **`nflverse_weekly_points_2025.json` drops zero-point rows.** For that one
  season "absent" and "scored zero" are conflated, so row presence means
  "scored something", not "played".

### 5. Not a data hole but the same family: measured work left unwired

`projection_error.proj_ceiling_for` — measured over 1,304 player-seasons,
tested, shipped — was **never called**. The board computed
`proj_ceiling = mean + 1.036·sd` regardless. Found 2026-08-17, now wired behind
a gate. Its sibling `proj_sd_for` was wired the day it landed, so half of REC-1
was live and half was dormant for as long as it has existed.

---

## WHAT IS FIXABLE NOW vs PERMANENTLY LOST

**Fixable now, cheap, and the cost of delay is real:**

1. **Widen `proj_series` / `adp_series` to carry situation**, not just a float:
   `injury_status`, `depth_chart_order`, `team`, `years_exp`, and the player's
   ADP at capture time. One edit to a workflow that already runs daily.
2. **Fix the population gap** — capture a stable player set each snapshot, or
   record explicitly that a player was *absent* rather than leaving a hole
   indistinguishable from "not fetched".
3. **Start a weekly roster-state snapshot** (depth chart + injury) so
   `VAR_BACKUP` and `VAR_INJURED` become measurable **for 2027**.
4. **Retain FantasyPros per-player rows** on the next `exp-fp-hist-proj` run,
   and parse `rank_min`/`rank_max`/`rank_std` while we are in there.

**Permanently lost:** 2021-2025 depth charts, injury designations, and any
pre-2026 Sleeper/FP per-player projection not already committed. No fetch
recovers these; retroactive sources leak (exp33 — they already know the
injuries).

---

## THE PATTERN, SINCE IT IS THE ACTUAL LESSON

Every hole above is one of three shapes:

1. **We stored the conclusion and discarded the evidence** (FP aggregates, the
   bare-float series).
2. **We never captured live state because it was live** — true today, and
   therefore never true again.
3. **A population rule excluded a group silently**, so a study answered a
   narrower question than its title.

None of these is a bug. Each was a reasonable local decision that quietly
removed a future option. The standing correction is the one the Kalshi capture
was built on and Cory stated himself: *"Make sure we are happy about it 2027 and
not upset we didn't capture something."* **Capture the row, not the summary.**
