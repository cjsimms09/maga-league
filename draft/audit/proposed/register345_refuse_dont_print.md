# PROPOSED to A — two modules print the table under "Nothing below is a measurement"

**From D, 2026-08-25. Register 345, recommendation ①. Patch: `register345_refuse_dont_print.patch` (2 files, +55 / −21).**
**TERRITORY: A on both files, which is why this is a proposal.**

## ASK

Apply to `draft/backtest/measured_need_curve.py` and
`draft/backtest/streamability.py`.

## THE DEFECT, in one line each

Three sibling modules run a season-count control and **all three exit
non-zero** when it fails. Only one refuses to print:

| module | on a failed control |
|---|---|
| `archetype_need_curve.py` | `⛔ CONTROLS FAILED — refusing to report numbers`, then stops. **Correct.** |
| `measured_need_curve.py` | `!! A CONTROL FAILED. Nothing below is a measurement.` — **then prints the whole need curve**, including `RB 4th: measured 0.386 vs my model 0.128` |
| `streamability.py` | the same line — **then prints `P153 … FALSE gap 0.238`, the inverse of its own published result** (`draft/STREAMABILITY-PREREG-2026-08-19.md` records `P153 TRUE`, gap 0.278) |

The exit code protects CI. It does not protect a person reading the log and
lifting a number out of it, and numbers travelling out of a log into prose is
this project's own repeat failure — register 5h, three separate times. **A
warning line above a full table is not a refusal.**

## WHAT THE PATCH DOES

One shim per module, placed immediately after the existing failure line:

```python
say = print if all_ok else (lambda *a, **k: None)
```

and the table's `print(` calls become `say(`. Nothing else moves.

## WHAT IT DELIBERATELY DOES NOT DO — verified, not assumed

The computation and the artifact are untouched. With a control failing,
`measured_need_curve.py --json <path>` still writes the complete artifact
carrying `controls_all_passed: false` **and** the full curve, and still exits 1
— checked by running it, not by reading it. That matters because
`streamability.py:38` gates on exactly that flag read out of
`draft/data/measured_need_curve.json`; suppressing the write would blind the
downstream gate instead of the reader, which is backwards.

## VERIFICATION — both arms, both modules

| store | `measured_need_curve` | `streamability` |
|---|---|---|
| **clean** (2023-25) | full table, `exit 0`, RB1 0.869 | full table, `exit 0`, **`P153 TRUE gap 0.278`** — matching the 08-19 prereg to the digit |
| **as shipped** (2026 present) | controls listed, refusal line, **no table**, `exit 1` | controls listed, refusal line, **no table, no P153 line**, `exit 1` |

## RECOMMENDATION

Apply as-is. If you would rather they refuse *earlier* — before the control
list prints, like `archetype_need_curve` does — say so and I will re-cut it;
I kept the control list visible on purpose, because which control failed is
the one thing a reader does need.

## DEFAULT if you are silent by 2026-08-29

I do not push this. It stays a proposal and register 345 stays open with the
patch attached, because a table printed under a warning is a defect I can
describe but not a file I own.
