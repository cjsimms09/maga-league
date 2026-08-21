# PROPOSED DIFF — register 223, for C to accept or reject

**Session D, 2026-08-21.** Filed ahead of my stated 09-01 default, because the
capture it protects is **unbackfillable**: week 1 is ~09-10, providers overwrite
weekly projections in place, and a week missed is a week gone.

**This is a proposal, not an edit.** `draft/tools/weekly_projection_archive.py`
is TERRITORY: C and is **unchanged on this branch** — the patch lives here as a
file. Apply with:

```
git apply draft/audit/proposed/register223_weekly_archive_to_proj_series.patch
```

---

## What it fixes

`weekly_own_grade.provider_weeklies()` reads `draft/data/proj_series.json` and
keeps rows where `source == "<provider>_weekly"` **and** `week == week`.

* `sleeper_weekly` is written there by `weekly_proj_snapshot.py:161`. **Works.**
* `fantasypros_weekly` is written **only** into
  `weekly_projection_archive_{season}_w{week}.json`, a file that reader never
  opens. **Never satisfied.**

`cory_bar_startsit()` refuses unless BOTH are present, so the 2027 programme's
headline question returns **NOT RUN every week of 2026** — and its docstring's
*"the FP half starts the day C's weekly archive carries it"* makes that read as
an expected dependency rather than a defect.

## What the diff does

Adds two functions and four lines at the call site. The archive file is still
written exactly as before — **this is purely additive**:

* `scored_by_id(payload)` — `{pid: {raw, scored}}` → `{pid: points}`, the shape
  `proj_series.append_snapshot` takes.
* `mirror_to_proj_series(doc, week, date, series_path)` — appends **both**
  provider sources with `week=week`, mirroring `weekly_proj_snapshot.py`
  exactly: same helper, same dedupe key. One format, one reader.

It **never raises**: a corrupt or missing series file returns `{"_error": …}`
and prints a loud stderr line naming the consequence, because the archive write
must not fail because the mirror could not.

## Verified against the real reader, not asserted

| check | result |
|---|---|
| known-NEGATIVE — before the mirror, `provider_weeklies` sees | `{}` |
| known-POSITIVE — after, arms present | `sleeper`, `fantasypros`, **`sleeper_fp_average`** |
| the `week` key really gates | week 4 sees nothing |
| a same-week re-run | **replaces**, 2 snapshots → 2, no doubling |

`sleeper_fp_average` appearing is the load-bearing one: it is computed only
when *both* providers price a player, so its presence proves the FP half
arrived.

**STATED BOUNDARY:** this proves the fix satisfies `provider_weeklies()`, which
is the gate that was failing. It does not re-prove `cory_bar_startsit()` or
`meets_cory_bar()` downstream — those are existing, tested code that this
change does not touch.

## Why (a) and not (b)

Register 223 offered two shapes. This is (a) — the archive also writes
`proj_series`. The alternative, teaching the grader a second input format, is a
smaller diff that leaves the next reader with the same problem: two files
holding the same thing, and no rule about which is authoritative.

`SEND BACK` is a complete answer if the archive deliberately must not write
`proj_series` — in which case (b) is the fix and the reason belongs in both
modules' docstrings, since it is exactly what the next person will get wrong.
