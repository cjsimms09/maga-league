# WHAT THE MODEL IS FOR, 2026 — CORY'S SPEC, IN HIS WORDS

**TERRITORY: A. This supersedes every other description of what the draft model
is trying to do.** Written 2026-08-20 after an evening in which I repeatedly
answered a question he was not asking. If anything in this repo contradicts this
file, this file wins and the other thing is the defect.

## THE SPEC, VERBATIM

> "what I want out of model this year is very basic, is correct vona and
> accurate depiction of other sources rankings... our 'model' shouldn't really
> creep in at all except proj availability, stack, VROP, VONA"

> "I will build the roster... I need max value and roster equation should be
> looking at ALL positions (maybe exclude K and def) and telling me when to
> strike and why"

> "Our model will just show me different sources and their rankings (also a
> blend, which does not include our proj). and the only thing we are really
> calculating is VONA and VORP and Stack"

> "I will pick positions, but would be nice to still have cliffs."

## SO THE MODEL CALCULATES EXACTLY FOUR THINGS

1. **VONA** — what waiting one more pick costs at a position.
2. **VORP** — value over replacement.
3. **Stack** — QB/receiver correlation on his own roster.
4. **Projected availability** — who is likely gone by his next pick.

**Nothing else.** Not roster construction, not doctrine, not ceiling-in-the-score,
not a keeper option value. Where those exist in code they must contribute zero,
and `draft/tools/what_actually_moves_my_board.js` measures whether they do.

## AND IT SHOWS HIM

* **Every source's own rankings**, flippable, compared on RANK not points (the
  sources are not on one scale — median ratio to blend: DS 1.04, FP 1.01,
  Sleeper 0.96).
* **A blend that EXCLUDES our own projection.**
* **Draft Sharks' floor and ceiling**, and that band applied to every other
  source as a per-player percentage of its own projection.
* **Cliffs** — where the cost of waiting spikes, and why.

## WHAT HE DOES, AND WHAT THE TOOL NEVER DOES

**He picks the position. He picks the player.** The tool lays out the option set
and reports what every source thinks. It never hands him one answer.

## STATE AS OF 2026-08-20 23:00Z

| item | state |
|---|---|
| weights = `value 1.0 · need 1.0 · stack 1.0`, all else 0 | ✅ shipped |
| `ceiling` weight ruled OFF | ✅ shipped (baseline v31, pin moved) |
| DS band travels to every source as a ratio | ✅ shipped, 7 tests incl. his worked example |
| per-position per-source best-available + consensus | ✅ `draft/tools/who_do_the_sources_like.js` |
| when-to-strike with P(gone) x drop | ✅ `draft/tools/when_to_strike.js` |
| in-house terms measured inert (keeper/onesie/doctrine) | ✅ measured 0/120 |
| **blend still includes our own projection** | ❌ **ruled out, NOT DONE — needs a board rebuild** |
| **board is stale (2026-08-19T08:52Z)** | ❌ **rebuild refusing, one blocker left** |
| war room surfacing all of the above | ⏳ B's, after the audit |

## THE SEQUENCE HE SET

1. External audit comes back → fix what it finds.
2. Back-end fixes: board rebuild, own_v6 out of the blend.
3. **Then** work with B so the war room delivers exactly this, working and
   accurate.
4. Then catch up on the outstanding task list.
5. **Friday:** keepers lock 18:00 CDT. Confirm the lock, re-take the freeze,
   rebuild the board, verify everything is ready.
6. **Saturday:** he drafts.

## THE FOUR TIMES I GOT THIS WRONG, SO THE NEXT READER DOES NOT

Recorded because each was a real cost in his time, and the pattern is one thing:

1. Reported **roster shape** improvements when he asked about **value**.
2. Called the whole scoring stack "the model" when he means VONA + value.
3. Built a **roster builder** measurement when he wanted a **position-timing**
   study.
4. Explained `keeper` as if it meant **his keepers** — it prices whether a
   player drafted this year is worth keeping NEXT year. His actual keepers enter
   through `need`.

**The tell in every case: he restated the same request in simpler words.** That
is not him clarifying. That is him correcting.
