<!-- TERRITORY: A -->
# weekly_own — OUR weekly projection, its grades, and the loop contract

**The mandate, Cory verbatim (2026-08-16):** *"We need to be making our own
projections for every player, capturing, grading, and closing loop to learn!!"*
And the adaptation addendum, same day: *"since we aren't making decisions using
that data for this year, it needs to be quick to adapt and try new things if
it's losing… we can adjust more often, no harm if we're wrong. I'd also like an
alert or someway to know if model adapted and how."*

## What lives here

| file | written by | when |
|---|---|---|
| `own_weekly_<season>_w<week>.json` | `draft/weekly_own_projection.py` via `own-weekly-proj.yml` | Thursdays 14:00 UTC, **before kickoff** |
| `grades_<season>.json` | `draft/weekly_own_grade.py` via `own-weekly-grade.yml` | Tuesdays 06:00 UTC, after the week ends |
| `controls.json` | humans/sessions, by commit | whenever Cory rules |

The **commit timestamp of a snapshot is the forward guarantee** (same rule as
`src/forecast_grade.js`): a projection in git before kickoff carries no
researcher degree of freedom, and the writer refuses to overwrite a snapshot
once its week has kicked off.

## The loop contract

**v1 formula, frozen as stated** (champion arm `v1`, version `own_weekly_v1`):

    weekly_mean = proj_ownmodel / 17
                  * (1 + vg[pos] * (implied_team - mean_implied) / mean_implied)

with `vg` imported from the graded `V5_CONFIG` in
`draft/backtest/own_model_v5.py` (QB .5 / RB .5 / WR .5 / TE 0.0), lines from
the captured odds snapshot (fallback: the committed vegas store), bye week =
**absent, not zero**, and no-line teams priced at tilt 1.0 **and named in
diagnostics**.

**Changes to the weekly formula require a new version string**
(`own_weekly_v2`, `v3`, …) **and a ledger note naming the week it applies
from** (`promotions[].effective_from_week`), so grades are never silently
mixed across formulas. This holds for mechanical promotions, manual overrides
(version gains a visible `+override:<arm>` suffix), and hand-written formula
changes alike. Every grade entry records the formula version that priced it.

## The arms

Every Thursday snapshot carries the champion plus NAMED challenger columns —
same inputs, zero extra fetch cost:

| arm | formula |
|---|---|
| `v1` | `proj_ownmodel/17 * (1 + vg[pos]*(implied_team-mean_implied)/mean_implied)` |
| `v1_tilt150` | tilt term ×1.5 — is the vegas tilt too weak? |
| `v1_tilt050` | tilt term ×0.5 — is it too strong? |
| `v1_notilt` | `proj_ownmodel/17` flat — is the tilt earning anything at all? |
| `v1_pg16` | `proj_ownmodel/16` with the v1 tilt — is /17 too low a per-game bar? |

The Tuesday grader also grades **provider study arms**: `sleeper` and
`fantasypros` wherever the Thursday provider archive
(`draft/data/proj_series.json`, sources `sleeper_weekly` /
`fantasypros_weekly`) carries that week — as of 2026-08-16 the archiver
captures **Sleeper only**, so the FP arm starts grading the day the archive
carries FP weeklies — plus `sleeper_fp_average` (simple mean where both price
a player). Provider arms grade on their own archived population AND on the
shared population with our champion, labeled whenever the populations differ.

## The mechanical promotion rule (verbatim from `weekly_own_grade.py`)

> A challenger is promoted to champion when:
>   (a) it has at least 3 graded weeks in common with the current champion;
>   (b) it beat the champion on per-week overall MAE in >= 3 of the last 4
>       common graded weeks (all 3 when only 3 exist);
>   (c) it leads cumulative MAE (mean of per-week MAEs) over the full common
>       span, without losing cumulative rank correlation by more than 0.02.
> Best cumulative MAE among qualifiers wins. On promotion the version string
> bumps (own_weekly_v1 -> v2 -> ...), the OLD champion remains active as a
> challenger (a bad switch reverses itself under the same rule), and a new
> variant may be seeded along the winning tilt axis.

**Cadence:** evaluated every Tuesday after grading; the earliest possible
switch is after week 3 (~early October). Rationale, Cory verbatim: *"since
data isn't actionable this year we can adjust more often, no harm if we're
wrong."* There is **no human gate on mechanical promotions** — that is his
explicit ruling for 2026 — but every switch writes a promotion record and
opens a **GitHub issue** (which emails him): the alert he asked for.

**The boundary, explicit:** provider arms are STUDY arms — graded, **never
auto-promoted**. Which provider feeds the LIVE waiver/lineup tools is
actionable-this-year and stays a human ruling; the switch lives on
`/admin/model-scoreboard` and writes the site's `model_controls` doc, whose
one consumer is `src/proj_feed.js`.

**Who invents arms:** the mechanical loop only *selects among* the arms it is
given. New challenger AXES — a props arm when the market posts player props,
pace, recency, opponent-adjusted anything — are added by relay/A sessions
reading the miss patterns in the ledger (`top_misses` + `miss_pattern` exist
precisely so a human can read WHY a week missed). Each new arm lands with a
name, a formula string, and a test.

## controls.json (Cory's wheel)

```json
{"auto_adapt": true, "champion_override": null}
```

- `auto_adapt: false` — grading continues, promotions held.
- `champion_override: "<arm>"` — pins the champion column to a named active
  arm; the mechanical rule pauses while it stands; the switch is recorded in
  the ledger's promotion history and fires the same issue alert.

Both are read by the Thursday writer and the Tuesday grader from this
committed file — changing them is a commit (any session can do it on Cory's
word), which keeps his switches in history like everything else.
