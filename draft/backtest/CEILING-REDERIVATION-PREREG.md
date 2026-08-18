<!-- TERRITORY: A -->
# PREREGISTRATION — RE-DERIVE THE CEILING WEIGHT ON A REAL-CEILING BOARD

**Committed BEFORE the re-run. No results in this commit.**

**Cory, 2026-08-17:** *"Find whatever other study would be void based off this
this info and redo it!!"* — and *"find all test we've ran that would've been
tainted by that data and rerun."*

---

## 1. THIS IS THE MOST TAINTED SURVIVING RESULT

`ceiling` is one of eight terms in the composite the war room ranks on, and it
ships at **zero**. `WAR-ROOM-SURFACE-CONTRACT.md` records why:

> `risk`, `ceiling` — **UNMEASURED.** `ceiling` came out at **−4.8 with a
> [−26, +17] interval**: unsignable.

That measurement was taken against a board where `proj_ceiling` was
`proj_mean × a constant`. `lab_ceiling_degeneracy.js` measured the consequence
as Spearman **1.0000** and stated the verdict this prereg acts on:

> *THE MEASUREMENT COULD NOT HAVE COME OUT ANY OTHER WAY.*

The engine's ceiling term is `rawSpread = proj_ceiling − proj_mean`. On a
constant-multiple board that is `0.35 × proj_mean` — a fixed multiple of the
value term. Raising the ceiling weight was arithmetically indistinguishable from
raising the value weight, so the experiment was not measuring a weak effect. It
was measuring nothing. **The zero is an un-derived setting, not a measured one.**

## 2. WHAT CHANGED, MEASURED BEFORE THE RE-RUN

The money proxy reads the live board (`cory_conditional.load_world()` →
`public/draft_data.json`). Measured on that board today, quoted here so the
input is on the record before the output exists:

| | pre-08-17 | today |
|---|---|---|
| distinct `proj_ceiling/proj_mean` ratios over the pool | **1** | **505** |
| ratio range (min / median / max) | 1.35 flat | 1.0893 / 1.3174 / 1.8903 |
| distinct `weekly_sd` values | 1 | **494** |
| keeper `weekly_sd` | flat literal `8.0` | the board's own number |

Two things worth saying out loud. The old flat 1.35 sits **near the new median
(1.3174)**, so the constant was roughly right about the *level* and entirely
fictional about the *spread* — which is precisely the part a ceiling weight is
supposed to price. And the keeper `weekly_sd` fix moves the proxy in the
direction that FAVOURS upside (understating starter variance understates the
value of variance in a league where weekly high pays), so this re-run is not
being handed a thumb on the scale against the effect it is looking for.

## 3. THE INSTRUMENT, UNCHANGED ON PURPOSE

`draft/backtest/exp_ceiling_replicate.py`, exactly as it stands:

```
python3 draft/backtest/exp_ceiling_replicate.py
```

- arms: `core` (mask + value anchor, ceiling weight 0) vs `core + ceiling` at
  **w ∈ {0.65, 1.0, 1.5}**
- **400 paired rooms**, per-seed paired differences, bootstrap CI
- seeds **20268727 / 20365537 / 21560517** — the same three the pre-fix run
  used, fixed in the file, quoted here so seed-shopping after the fact is
  visible

Not one line of the instrument is edited before the run. The board is the only
variable, which is the whole point of the comparison. The pre-fix outputs are
archived in the same commit as this prereg
(`ARCHIVE-EXP-CEILING-REPLICATE-PRE-DISPERSION-FIX.md`,
`archive_exp_ceiling_replicate_pre_dispersion_fix.json`) because the script
overwrites its own result files.

**One stale string in the instrument is knowingly left alone:** its verdict text
says "raise the live ceiling weight 0.65 → 1.0", but the shipped
`MEASURED_WEIGHTS.ceiling` is **0.0**, not 0.65. Editing prose mid-experiment
would break the like-for-like comparison; it gets corrected in the write-up
instead, and is flagged here so the corrected number cannot look like a quiet
retcon.

## 4. DECLARED IN ADVANCE ABOUT THE OUTCOME

**The collinearity is REDUCED, NOT REMOVED, and I am saying so before I look.**
`lab_ceiling_degeneracy.js` measures the production board at Spearman **0.9607**
against `proj_mean`, with **17 of the top 100 reordered**. The ceiling term still
carries mostly value information. So:

- **The expected result is a null or a thin directional lean.** A null is
  publishable and needs no further permission.
- The measured ceiling is still `proj_mean × a per-CELL constant` — it varies
  BETWEEN (position, band) cells, not WITHIN them. So a weight fitted here
  prices **cross-band** dispersion. It still cannot answer *"should THIS player
  be taken for his upside"*; that needs `weekly_volatility.py` wired in
  (`VOLATILITY-WIRING-PREREG.md`), and this run must not be reported as if it
  had.

## 5. PASS/FAIL, DECLARED NOW

1. **Input gate.** The board must carry more than one distinct
   `proj_ceiling/proj_mean` ratio. Measured at 505 above; if a rebuild ever
   drops it to 1, the run is abandoned and reported as abandoned.
2. **Report every seed, all three weights.** The full 3×3 grid goes in the
   write-up whatever it says.
3. **Separability** = bootstrap CI excludes 0. "Replicates" requires the sign to
   hold in **all three** seeds AND separability in **at least two**.
4. **If the sign flips across seeds, the outcome is UNSIGNABLE** and is reported
   as unsignable. Picking the favourable seed is the failure mode this section
   exists to make visible.
5. The comparison against the archived pre-fix grid is reported **as a
   comparison of instruments, not as a discovery**: the pre-fix numbers measured
   a degenerate board and are not evidence of anything about ceilings.

## 6. WHAT MAY NOT HAPPEN

- **No shipped weight change before 2026-08-22, whatever this returns.** Same
  rule as `HARNESS-DISPERSION-PREREG.md` §6 and the phase-tuning prereg: five
  days out, a weight measured once is a worse instrument than a known one. If
  this comes back strongly positive, that is a post-draft change with a second
  replication behind it, not a draft-week edit.
- **`risk` stays UNMEASURED regardless.** It is degenerate on a *different*
  axis and fixing the ceiling does not fix it. Reading a risk optimum off this
  run would repeat the exact error being corrected.
- No re-fit of `ADP_SD_RATE` rides along — that is Cory's open decision
  (`adp_sd_ratchet_fired_2026-08-17.md`).

**Refusal, "no evidence of a shift", "unsignable", and "abandoned at gate 1" are
all valid outcomes and need no further permission.**
