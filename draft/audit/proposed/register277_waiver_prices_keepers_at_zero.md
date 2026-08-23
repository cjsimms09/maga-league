# PROPOSED DIFF — register 277, for B to accept or reject

**Session D, 2026-08-23.** Filed the hour it was found, with no default date,
because it is **live on Cory's phone right now** and it tells him to drop his
best player.

**This is a proposal, not an edit.** `src/routes/waivers.js` is the site's code
and is **unchanged on this branch**. Apply with:

```
git apply draft/audit/proposed/register277_waiver_prices_keepers_at_zero.patch
```

---

## What Cory saw

> **BEST CLAIM — Claim Brenton Strange (TE) — drop Ja'Marr Chase**
> +19.3 pts to your starting lineup this week · $38 at 1.97/pt

## Why

`waiverInputsFromBundle` builds its price index from **`artifact.players` alone**:

```js
((artifact && artifact.players) || []).forEach(p => { byId[String(p.player_id)] = p; });
```

Since the 08-22 board rebuild (`4750fbce`), **`kept_players` is a disjoint list**
— 0 of its 23 ids appear in the 680-row `players` pool. So every keeper misses
the index, and `enrich` returns `proj_mean: null, vorp: 0` for them.

Measured on the live artifact:

| keeper | real row in `kept_players` | what the wire priced him at |
|---|---|---|
| Ja'Marr Chase | proj 271.8, vorp 128.9 | **null / 0** |
| Derrick Henry | proj 259.15, vorp 111.35 | **null / 0** |
| Kenneth Walker | proj 233.82, vorp 86.02 | **null / 0** |

`dropCandidate` returns the roster's **minimum** `startableValue`. A man priced
at zero on a roster of real projections is always that minimum — so the wire
nominated the best player Cory owns, and every claim card inherited it, because
`drop` is computed **once** and reused for every candidate.

**It is not "unhelpful", it is inverted:** the worse a player is mispriced, the
more eagerly the tool offers him up.

## Verified end-to-end, not asserted

Driven through the real entry point (`waiverInputsFromBundle` → `dropCandidate`)
on Cory's actual 15-man roster — his 3 keepers plus his 12 drafted picks:

| arm | unpriced on roster | drop candidate |
|---|---|---|
| **shipped (control)** | **3** — Chase, Henry, Walker | **Ja'Marr Chase** (proj `null`, value −64.72) |
| **with the patch** | **0** | Emmett Johnson, RB (proj 39, value −68.19) |

The control is load-bearing: it reproduces the exact card in the screenshot.
Emmett Johnson is a sane answer — the cheapest real bench body.

## What the diff does

Two lines: the index is built from `players` **concatenated with**
`kept_players`, the way every other reader in the repo does it. `replByPos` is
deliberately left reading `players` only — keepers are appended after, so
first-row-wins per position is unchanged, and the replacement baseline does not
move.

## STATED BOUNDARY

This proves the **drop** is fixed. The claim's **+points** figure did not move
in my run (the gain from adding a TE is the same either way) — so what this
patch corrects is *what you give up*, not *what you get*. I did **not** re-derive
the dollar model or the priority-waivers framing.

Magnitudes here are season-scale (`draft_data.json`), while the card shows
weekly numbers, so the +19.3 on screen and my figures are not the same units.
The drop identity, which is the defect, is unit-free.

## Follow-ups (Rule 3g)

① **Does it imply another failure?** Yes — `lineupPoints` reads `p.proj_mean || 0`,
so an unpriced keeper contributes **0 to the computed starting lineup**. Any
"points added to your lineup" figure on this surface has been computed against a
lineup missing Cory's three best players. Not traced further; B should.

② **Does it invalidate something we trust?** Any wire recommendation shown since
08-22 should be assumed wrong, not merely noisy.

③ **Routed to the lane that can act:** B — this is the site.

`SEND BACK` is a complete answer if the wire is meant to read a different
artifact entirely — in which case the fix is upstream of this function and the
disjointness note still belongs at the builder (register 276's recommendation).
