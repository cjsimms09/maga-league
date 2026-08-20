# PRE-VERIFYING TOMORROW'S TEN ROWS, BEFORE FOUR LANES WORK THEM

**Relay, 2026-08-18. Territory: relay measures; each row's owner rules.**

---

## WHY

`CLAUDE.md`, on the D lane: *"five of the six premises handed to that lane were
wrong, and not one was a measurement error. They were sentences nobody had
checked against the code or the filesystem."* The rule that came out of it is
**verify a row's premise before working it.**

Ten rows come due on **08-19** — A: 2c, 4d, 4m, 28 · B: 4b, 4e, 4f, 4i · C: 4k ·
E: 27 — and that is the day before the last working day before the draft. If a
premise is stale, a lane spends its scarcest day on a sentence rather than a
problem. So I checked the mechanically checkable ones first.

**Two of five have moved. One of those is fully overtaken.**

---

## ✅ 4i — CONFIRMED, UNCHANGED. (B)

`'engine_policy' in pre_draft_freeze_2026.json` → **False**, against 24 top-level
keys. So `app.js:762` reads `state.frozenBaseline.engine_policy.MEASURED_WEIGHTS`,
`w` is `undefined`, the handler hits `if (!w) return;`, and the *"⏮ RESTORE THE
MEASURED CORE"* button renders and does nothing.

This is the row I got wrong on 08-18 — I told A its premise was false and offered
to close it. It is not false. **Re-checked again here against the current freeze
because the freeze is re-taken periodically and my error was in this exact row.**

---

## ✅ 4m — CONFIRMED. (A)

`opportunity_adj` is **0.0 for every skill player carrying the field: 619 of 619,
zero non-zero.** The row says 535; the difference is population definition (it
counted the priced skill pool), not disagreement — the claim *"exactly 0.0 for
all"* holds on the larger set too.

And this is **Cory's own ruling** (`opportunity_cap = 0.0`), which the row already
says. Nothing to fix; the premise is sound.

---

## ⚠️ 27 — HEADLINE CONFIRMED, NUMBERS STALE. (E)

The claim *"'we can only grade one season' is FALSE — all five realized stores are
populated"* is **true**. But every count in the row now disagrees with the file:

| season | row says | measured today |
|---|---|---|
| 2021 | 611 / 18 wk | **611 / 18** ✅ |
| 2022 | 589 / 18 wk | **589 / 18** ✅ |
| 2023 | 586 / 22 wk | **559 / 18** |
| 2024 | 603 / 22 wk | **570 / 18** |
| 2025 | 585 / 22 wk | **616 / 18** |

**The 22 → 18 shift is the tell, and it is not a regression.** 22 weeks includes
the playoffs; 18 is the regular season. The 2023-25 stores have been **rebuilt
playoff-free** since the row was written — which is exactly what `CLAUDE.md`
describes when it says the edge number was *"re-measured on the playoff-free
stores"*. 2021 and 2022 match to the player because they were always
regular-season-only.

**So E's conclusion stands and E's arithmetic does not.** Worth thirty seconds
before any fold count is quoted from this row.

---

## 🔴 4k — SUPERSEDED, BOTH HALVES. THE WHOLE ROW. (C)

The row states two things and **neither is true any more.**

**(1) *"built 2026-08-14 23:11 and never since"*.** It was regenerated **today**,
commit `f6acbe76` at **03:59:04Z** — *"projection_error: regenerate calibration on
real 2023-2025 outcomes — Cory ruled, moves every proj_ceiling/proj_floor/proj_sd
on the board"*. The artifact now reports `seasons: 3 · graded: 1343 ·
ungraded: 793 · cells_measured: 20 · **cells_unmeasurable: 0**`.

**(2) *"`projection_error.calibrate()` is called by nothing in the repo outside
its own tests"*.** It is called from **`draft/backtest/cli.py:83`** —
`PE.calibrate([o for o, _ in others], ...)` — and `projection_error.py:668`
carries `cal = regenerate()` on the production path.

**And the row's deeper worry — *"nothing CHECKS them"* — is also answered.**
`draft/tools/board_input_staleness.js:55` names
`projection_error_calibration.json` as a declared board input, and two dedicated
suites guard it. Run just now:

```
board_input_staleness.js  →  ✅ every declared input predates the board   (exit 0)
test_calibration_covers_every_board_position.py + test_calibration_population.py
                          →  10 passed
```

**RECOMMENDATION TO C: close it.** Its three findings were real when filed and all
three have been fixed by other work. It is C's row and C's call — but C should not
spend 08-19 on it.

---

## 🔄 2c — THE GAP DID NOT KEEP WIDENING. IT CAME BACK. (A)

The row's headline is that the RB under-ranking **doubled** between filing and
08-17, *"with no change shipped to explain it"*.

**Like-for-like — the row's own cross-position measure, the same two players:**

| | filed | 08-17 | **today** |
|---|---|---|---|
| RJ Harvey | −62 | −131 | **−65** |
| Bhayshul Tuten | −60 | −94 | **−40** |

**Both roughly halved back**, Harvey to within three slots of the number
originally filed. **And there is now a shipped change that explains it** — the
calibration regeneration above, whose own commit message says it *"moves every
proj_ceiling/proj_floor/proj_sd on the board"*. The row was right that the
reference point had moved silently; what it could not know is that it would move
back.

**WITHIN position — a stricter framing, and it nearly vanishes.** Every player the
row names:

```
Bhayshul Tuten   +1      Jadarian Price   +3      Courtland Sutton  +1
Carnell Tate     −5      RJ Harvey        −5      DJ Moore         −11
```

**Three of the six now rank ABOVE the market inside their own position.**

> ⚠️ **These two measures are NOT comparable and I am not treating them as one.**
> −131 is cross-position, −5 is within-position; quoting them as a reversal would
> be the level-vs-ordering error this project has already made twice. The
> like-for-like claim is the table above; the within-position figures are a
> separate, stricter statement.

### AND A CONTROLLED NULL WORTH HAVING

The biggest within-position disagreements today are **Jayden Reed (−162)**,
**Bucky Irving (−118)**, **Travis Kelce (−106)** — and Reed is named in
`DRAFT-WEEK-BRIEF.md` §4 as one of the fifteen cohort-constant ceilings. That is
a tempting story, so I tested it.

**It is not true.** Mean board-vs-market rank gap, band-constant ceiling
(`measured-2023-25-p90`, n=267) versus per-player (`-x-player-cv`, n=268):

```
difference = +1.67 board slots     permutation p = 0.2026   (20,000 shuffles)
```

**KNOWN-POSITIVE CONTROL (Rule 3e), because a null from an untested probe is a bug
report:** the same test, with a 12-slot effect planted into the band-constant
group, returns **+13.67, p < 0.0001 — DETECTED.** So the instrument can find an
effect of a size we would act on, and there is none here.

**I threw away a weaker version of this first.** A top-30 enrichment count gave
16 vs 14 against a 267/268 population — an apparent null, but its positive control
(position) reached only 1.38×, so it had not demonstrated it could detect
anything. That is the shape Rule 3e forbids, and the permutation test replaced it.

**What this buys A:** the ceiling-provenance defect (4v) and the board-vs-market
disagreement (2c) are **separate problems**. Fixing the fifteen cohort-constant
ceilings will not move 2c, and that is one fewer thing to attempt before Saturday.

---

## NOT CHECKED HERE, AND WHY

**4b, 4e, 4f (B)** are judgements about a rendered screen — *"too busy and
wordy"*, a shortlist not sorted by what it displays, *"left"* meaning two things
in one glance. The numbers behind 4e and 4f are checkable, but whether the screen
reads correctly at 8 seconds a pick is B's call and Cory's, not a measurement.

**4d (A)** is a routing question already relayed and already on the decision sheet
as A4. **28 (A)** was answered ahead of its recheck on 08-18.

---

## RULE 3g

**Does this imply another failure we have not looked for?** Yes: **rows whose
premise is quietly fixed by someone else's work and never revisited.** 4k is fully
overtaken and 27 is numerically stale, both because other lanes shipped. Nothing
tells a row that its premise moved. The recheck date is the only sweep, and it
fires on time rather than on change.

**Does it invalidate something we already trust?** It invalidates the *plan* for
tomorrow — C's row is finished, E's numbers need restating, and A has one fewer
candidate cause for 2c. No shipped number is affected.

**Is it routed to the lane that can act?** Each finding is annotated on its own
row, with the owner unchanged.

---

*Board measured: `built_at 2026-08-18T05:38:12Z`.*
