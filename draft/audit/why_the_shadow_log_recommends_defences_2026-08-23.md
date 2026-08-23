# The shadow log's recommender is a STATIC ranking used as a PICK-TIME one

Settles the open cause in registers 260 (D) and 261 (A). Neither earlier
attribution was the mechanism; both were pointing at the right family.

## The measurement

Best-available VORP by position, as the real draft drains the frozen pool
(`gone` built from ALL 150 rows, keepers included, exactly as the logger does):

| after N picks | RB | WR | TE | QB | K | DEF | leader |
|---|---|---|---|---|---|---|---|
| 0 | **156** | 125 | 81 | 64 | 10 | 29 | RB |
| 20 | **105** | 63 | 63 | 30 | 10 | 29 | RB |
| 40 | 28 | **38** | 24 | 26 | 10 | 29 | WR |
| 60 | −19 | 29 | 18 | 11 | 10 | **29** | **DEF** |
| 80 | −21 | −4 | 5 | 8 | 10 | **29** | **DEF** |
| 100 | −53 | −9 | 0 | 8 | 10 | **29** | **DEF** |
| 127 | −59 | −24 | 0 | 8 | 5 | 9 | DEF |

**DEF VORP is FLAT at 29 for the first hundred picks.** K is flat at 10. Skill
VORP collapses — RB 156 → −53, WR 125 → −9 — and goes NEGATIVE.

The crossover is at **pick ~60**, and DEF leads from there to the end. That is
the whole of the "a defence is #1 at 101 of 150 picks" finding.

## Why

There are 32 defences and ~10 get taken, all late, so the best available
defence barely moves for a hundred picks. Meanwhile ~127 of the picks are
skill players out of a 680-man pool, so skill VORP falls off a cliff.

**VORP is a STATIC, FULL-BOARD quantity.** It measures a player against a
replacement level computed once, over everyone. Used as a PICK-TIME
recommender it silently becomes invalid as the pool drains: a defence at +29
against the *full board's* replacement is not +29 against *what is actually
left*. Nothing in the ranking notices, because the baseline never moves.

## What this settles

* **Not D's register 129** (`ROSTER_SHAPE` pushing K/DEF ~30 picks early).
  `old_path_recommendation()` is a plain `-vorp` sort inside the LOGGER
  (`log_draft_picks.py:148`) and never touches the engine or `ROSTER_SHAPE`.
* **Not "raw VORP is cross-position incomparable"** (A's first attribution,
  register 196/207 class) — that is true in general but is not what fires
  here. At the TOP of the board raw VORP and the board's own `overall_rank`
  agree **8 of 8** with zero K/DEF in either. The full-board ranking is fine.
  It is the DRAINING that breaks it.
* The docstring's justification — *"it is `vorp` because that is what the
  shipped board ranks on"* — is TRUE and verified. The capture records the
  right metric. The metric is simply not a pick-time one.

## The fix already exists

**VONA** — what you lose by waiting until your NEXT pick — is a pick-time
quantity that re-baselines against what is actually available. It is what the
war room shows and what Cory drafted from. The log should record it beside
VORP, not instead of it: keeping both is what makes the comparison the
`old_path` / `new_path` fields were built for.

## ⚠️ My own probe was wrong first, for the fourth time today

I built `gone` from `is_selection` rows only, excluding the 23 keepers. Gibbs,
Bijan and McCaffrey are keepers — in the freeze, never *drafted* — so they
stayed "available" and RB VORP read a flat **156 after 120 picks**, which is
impossible in a real draft and is what made me look again. The logger has this
right (`log_draft_picks.py:209` builds `gone` from ALL rows, with a comment
saying keepers and selections "both belong").

Fourth instance today of one shape: filtering to the wrong population
(`is_mine`, `conservedSurvival`'s `.byId`, the keeper cross-population
comparison, this). Each time the number that came back was implausible enough
to catch. That is luck, not method — the method is a control that asserts the
population is what you think before the number is read.
