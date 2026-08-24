# PROPOSED DIFF — register 281, for A to accept or reject

**Session D, 2026-08-24.** Found while closing register 27b: its consequence
landed, and the prose describing the old world did not follow.

**This is a proposal, not an edit.** `draft/backtest/weekly_volatility.py` is
`TERRITORY: A` and is **unchanged on this branch**.

```
git apply draft/audit/proposed/register281_weekly_volatility_stale_docstring.patch
```

---

## What is stale

The module's header still describes the pre-27b world in four places, and the
committed artifact on `main` contradicts every one of them:

| the docstring says | `weekly_volatility.json` on main says |
|---|---|
| "2021-2022 were scored under a **DIFFERENT table**" | one fingerprint, **all five seasons** (`220bf4c671786351`) |
| "That **costs two seasons** and is the correct price" | `seasons_refused_different_scoring_table: []` |
| "WHAT WAS MEASURED (**2023-2025**…)" | `seasons_used: [2021, 2022, 2023, 2024, 2025]` |
| LIMIT 1 — "**Only two transitions** survive the fingerprint guard" | `persistence_cv` carries **four** |

**LIMIT 1 is the one that matters**, because it is written to be quoted: *"Two
is enough to refuse a null twice and not enough to call the coefficient
precise."* The reason it said two has been removed. The four transitions are
2021→22 ρ=0.5219, 2022→23 ρ=0.3931, 2023→24 ρ=0.4688, 2024→25 ρ=0.6348 — every
one `status: signal`, against null bands of roughly ±0.13.

**The code is not wrong and this diff does not touch it.** The guard is
unchanged and still correct; what changed is the DATA. Register 27b measured the
2021-22/2023-25 split as a **float32-vs-float64 serialisation artifact** — 44
identical keys, three values differing only in rendering, max distortion
<5×10⁻⁶ points on a season total — and once the store was normalised the guard
simply stopped having anything to refuse. That is the guard working, not
failing.

## Verified, not asserted

| check | result |
|---|---|
| the change is **docstring-only** | **AST identical** after stripping docstrings |
| …and that check can report otherwise | **CONTROL:** mutating `SEASONS` to a 3-tuple reports `False` |
| the four transitions are real | read from `origin/main:draft/backtest/weekly_volatility.json` |
| patch applies to main | `git apply --check` clean |

The AST control is the load-bearing one: "it's only comments" is exactly the
claim that is never checked, and this one is.

## STATED BOUNDARY

I am correcting **prose against the committed artifact**. I did **not** re-run
the module (it writes a committed artifact as a side effect — register 58's
class), so I am not re-deriving the ρ values, only transcribing them.

Limit 1 is **kept and weakened**, not deleted: four transitions still is not
many, and the honest version says so.

`SEND BACK` is a complete answer if the guard is meant to keep refusing 2021-22
on some ground the fingerprint does not capture — in which case the artifact on
main is wrong rather than the docstring, and that is a much bigger row than this
one.
