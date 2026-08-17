# E's ninth sweep — what the ceiling fix would actually do, measured before it ships

**Session E (red team), 2026-08-17.** Cory, today, on the finding that
`proj_ceiling` is still rank-identical to `proj_mean` inside every cell:
**"FIX!!!"**

I have no write territory in the pipeline and cannot merge, so I cannot ship it.
What I can do is make sure A executes it with the blast radius measured rather
than assumed — which is the same Rule 3d discipline the fix itself exists to
serve. **Nothing here proposes a functional form**; the prereg fixes `f` by
reference to the existing `player_spread_in_sd` path, and choosing it after
seeing data is exactly what §6 forbids.

Sources: `draft/backtest/VOLATILITY-WIRING-PREREG.md`,
`draft/backtest/weekly_volatility.json`, and the published board.

---

## 1. THE GOOD NEWS — nothing needs designing, and it is all on `main`

| | |
|---|---|
| construction | `VOLATILITY-WIRING-PREREG.md` §2 — `ceiling = proj_mean × p90_ratio[cell] × f(player_ratio)`, `player_ratio = cv_player / cv_cell_median` |
| the gate | `f` **must preserve the cell mean** — declared as a gate, not a diagnostic |
| absent-population rule | a player with no volatility **keeps his CELL constant** — never the positional mean |
| provenance | needs its own `proj_ceiling_source` value, or one field name holds two constructions |
| the data | `weekly_volatility.json`, 2023–25, `per_player` cv, **already committed and on `main`** |

## 2. HOW BIG IS THE CHANGE? ~1.7× within-cell spread, where today there is exactly 1.0×

`player_ratio` distribution inside each cell, on the players who carry a 2025 cv:

| cell | n | cv median | ratio p10 | ratio p90 | **p90/p10** |
|---|---|---|---|---|---|
| TE\|9-16 | 8 | 0.6332 | 0.766 | 1.526 | **1.99×** |
| RB\|17-32 | 11 | 0.5659 | 0.727 | 1.334 | **1.83×** |
| TE\|4-8 | 5 | 0.5804 | 0.831 | 1.507 | 1.81× |
| WR\|4-8 | 5 | 0.5275 | 0.772 | 1.387 | 1.80× |
| RB\|9-16 | 7 | 0.5004 | 0.728 | 1.275 | 1.75× |
| WR\|33+ | 8 | 0.6228 | 0.773 | 1.297 | 1.68× |
| QB\|9-16 | 7 | 0.4420 | 0.784 | 1.305 | 1.66× |
| WR\|17-32 | 13 | 0.5580 | 0.827 | 1.363 | 1.65× |
| WR\|9-16 | 8 | 0.5818 | 0.852 | 1.210 | 1.42× |
| QB\|4-8 | 5 | 0.4852 | 0.851 | 1.149 | 1.35× |

**This is the answer to "what would the fix do".** It replaces a within-cell
constant with something spanning roughly **1.4×–2.0× p10-to-p90**, consistent
with the prereg's own headline (`cv` spreads 1.57×–1.88× within a fixed mean
band). The field stops being a rescaled projection and starts carrying
player-specific information — which is precisely the property §1 said was
missing.

## 3. 🔴 THE ONE THING A MUST RE-DERIVE BEFORE WIRING — the prereg's coverage counts do not reproduce

**Prereg §3:** *"17% of the draftable board has no volatility… **131 of 157**
have one; of the **26 without, only 8 are rookies** — the rest are veterans who
missed 2025."*

Measured on today's published board, four ways, because "draftable" and "has one"
are both ambiguous:

| population | has a cv | without | of which rookies |
|---|---|---|---|
| top 157 incl. K/DEF, 2025 only | 94 of 157 | 63 | 30 |
| top 157 incl. K/DEF, any season | 99 of 157 | 58 | 30 |
| top 157 **skill only**, 2025 only | **94 of 101** | 7 | 2 |
| top 157 skill only, any season | 99 of 101 | 2 | 2 |

**None of the four is 131 / 157 / 26 / 8.** The closest in spirit — skill-only,
2025-only — is 94 of 101 with 7 missing.

**What DOES reproduce, exactly, is the part the §3 decision rests on.** All four
players the prereg names by name are missing from **2025 specifically**, and they
are early picks:

```
Mike Evans        ovr 36   adp 61.67   yrs 12
Garrett Wilson    ovr 38   adp 44.67   yrs  4
Malik Nabers      ovr 39   adp 31.67   yrs  2
Jayden Daniels    ovr 84   adp 59.33   yrs  2
Jayden Reed       ovr 119  adp 113.33  yrs  3      <- a fifth, not named in the prereg
```

**All four also have volatility in some OTHER season**, which is the fork that
must be decided before wiring rather than during it: *2025-only* and *any-season*
are different populations (7 missing vs 2), and the prereg's absent-population
rule — the one protecting the injury-return group — behaves differently under
each. Under *any-season*, Nabers and Evans stop being absent and get a reading
from the last year they played, which is **precisely the "steadiest available
reading handed to the injury-return group" that §3 was written to prevent.**

**So the finding is narrow and specific: the prereg's stated counts do not
reproduce on the board, its named examples do, and the discrepancy sits exactly
on the decision §3 makes.** That is not a reason to delay the fix Cory asked
for — it is a five-minute re-derivation to do first, and it is cheaper before
wiring than after.

## 4. WHAT THE FIX DOES *NOT* TOUCH — stated so the change is not oversold

`MEASURED_WEIGHTS.ceiling = 0.0`. **A corrected `proj_ceiling` moves nothing on
the composite board ranking.** What it moves:

1. **The bench branch** — `engine.js:1166` ranks on `proj_ceiling − proj_mean`.
   Today that spread is `proj_mean × (c − 1)`, so **within a cell the bench
   branch is currently ranking on the projection a second time.** This is where
   the fix produces an immediate behaviour change, and it is real: after the
   starters fill, that is every pick.
2. **`playerDollars`** — the `boom = ceiling − mean` term, already flagged for
   re-derivation in register row 8a.

**And it does not by itself make `ceiling` weightable.** Prereg §4 arm 3 is
explicit that if arm 2 works the weight *"becomes measurable for the first time
and must be re-fitted rather than assumed"*. **This fix and C1 are separate
decisions** — shipping the field does not settle the weight, and my sweep-7 note
stands: whatever the current +$35 measures, it is a position-and-band tilt, not
upside.

## 5. ROUTING

**To A**, appended to register row E2 rather than as a new row — same defect, more
evidence:

```
ASK:      none new -- Cory has already called for the fix.
EVIDENCE: the construction and data are on main; the change introduces
          ~1.4x-2.0x within-cell spread where there is now exactly 1.0x; and
          the prereg's coverage counts (131/157, 26 without, 8 rookies) do
          NOT reproduce on the published board (94/101 skill-only 2025-only),
          though its four named players do.
REC:      re-derive the coverage counts and DECIDE 2025-only vs any-season
          before wiring, because the absent-population rule protecting the
          injury-return group behaves differently under each. Then ship.
DEFAULT:  filed; I cannot merge and I have not chosen f.
```
