# E's board sweep — the live keeper reconciler could have falsely halted the war room on draft night

**Session E (red team), 2026-08-18.** Chasing a small oddity — the `cost_round`
label for Cory's keepers differs between `kept_players` (Chase 2, Henry 1,
Walker 3) and `predicted_keepers` (Chase 1, Henry 2, Walker 3, sorted by
VORP) — surfaced a real, live, draft-critical bug in
`public/js/draft/reconcile.js`. **Fixed and tested; details below.**

## The label difference itself is harmless

`keeperui.js`'s management screen independently re-sorts keepers by board
value before rendering (`list.sort((a,b) => boardValue(b...) - ...)`,
comment: *"Best board value first → round 1, 2, 3 … (in place; order is
safe)"*) — it never trusts the stored `cost_round` for `top_picks_flat`
display at all. And the board's own `pick_order.picks` entries carry only a
boolean `keeper_slot`, never a specific player name per pick. So which
specific player the backend's collision-roll happened to pre-label "round 2"
has **no display consequence anywhere** by itself. Verified, not a defect.

## But `reconcile()`'s live cross-check trusted that label as ground truth

`public/js/draft/keepers.py`'s own comment is explicit about why the label
is arbitrary: under `top_picks_flat`, keeping N players forfeits rounds
1..N, and *"per-player this cannot be resolved (the cost depends on rank
within the team's kept set) — every keeper 'wants' round 1."* The
**documented and already-correct law** lives in
`reconcile.js`'s `placementErrors()`: a keeper is legally placed iff its
observed round is anywhere in `[1, N]` for its own team, rounds must be
distinct, and that's it — no player is bound to one specific round. This
function is already used correctly by `app.js`'s `pickState()` (INVARIANT 3).

`reconcile()` — a **separate function in the same file**, run on every live
Sleeper sync tick (`app.js:reconcileKeepers`, called every poll) — does
**not** call `placementErrors()`. It does its own inline comparison:

```js
const wrongRound = obsRound != null && designated.cost_round != null
  && Number(obsRound) !== Number(designated.cost_round);
```

This checks Cory's real Sleeper placement against **one specific
pre-assigned round per player**, not membership in his team's legal set.
The code comment directly above `placementErrors()` claims *"both read
`forfeited[].cost_round`, so they cannot diverge in MEANING even though the
languages differ"* — that claim is false; they diverge exactly here.

## The trigger is Cory's actual slate, today

His three keepers (Ja'Marr Chase, Derrick Henry, Kenneth Walker) are **all
`original_round: 1`** — a tied case where the model has no principled way
to prefer one specific round-to-player assignment over another. The
`forfeited` record (used by the live sync) happens to say Henry=r1,
Chase=r2, Walker=r3. Cory — per `reconcile.js`'s own top comment, *"placing
keepers by hand the day before the draft"* — is free to place them in
**any** legal order (e.g. Chase at his round 1, Henry at his round 2, which
costs the exact same total). If he does, `reconcile()` would have reported
2 of 3 keepers "misplaced," and:

```js
halt: !ok   // ok = !unknown.length && !missing.length && !misplaced.length
```

`app.js` reads `state.reconcile.halt` in at least two places (line ~5535,
gating recommendations, and line ~7872, turning the health strip red) — a
**false positive halting live recommendations at keeper lock / draft time**,
the one moment the tool most needs to keep working.

## Why the existing test suite never caught it

Every fixture in `reconcile.test.js` uses **one keeper per team** (`assumed`
= players a/b/c on team_slot 1/2/3 respectively). With N=1, "matches the
one pre-assigned round" and "is within `[1,1]`" are mathematically
identical — the two checks cannot diverge under any single-keeper fixture,
which is exactly why nobody saw this. Cory's real slate (3 keepers, one
team) is the first N>1 case this pipeline has had to reconcile against a
live Sleeper sync.

## The fix (shipped, tested)

`reconcile()` now takes an opts flag, `topPicksFlat`. When set, the round
check uses the same law as `placementErrors()` — legal iff the observed
round is within `[1, N]` for that player's team (N derived from `assumed`,
grouped by `team_slot`) — instead of exact equality to one pre-assigned
round. Off (the default, used by every existing test and every other cost
model), behavior is byte-for-byte unchanged. `app.js`'s live call site
(`reconcileKeepers`) now passes `topPicksFlat: true` exactly when
`state.data.league.keeper_rules.cost_model === 'top_picks_flat'` — which is
this league's actual configured model today.

Four new tests added to `reconcile.test.js`: (1) documents the bug reproducing
without the fix — a legal same-team round swap incorrectly halts; (2) proves
the fix — the identical swap reconciles clean with `topPicksFlat: true`; (3) a
genuine error (a keeper placed in round 4 for a 3-keeper team) is still
caught; (4) a single-keeper team is unaffected either way. All 23/23
`reconcile.test.js` checks pass, plus the pre-existing `sync_reconcile.test.js`
(27/27) and `pickreconcile.test.js` (10/10) unaffected.

## What this does not fix

`reconcile()`'s stored `cost_round`/`kept_players`/`predicted_keepers` labels
still disagree with each other cosmetically (Chase 2 vs 1) — harmless per
the analysis above, and not touched, since the collision-roll's specific
per-player label genuinely has no principled "correct" answer to converge
on. Only the FALSE-POSITIVE HALT this label mismatch could cause is fixed.
