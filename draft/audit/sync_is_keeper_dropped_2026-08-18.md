# E's board sweep — the live sync path silently dropped `is_keeper`, defeating the keeper reconciler unconditionally

**Session E (red team), 2026-08-18.** Immediately after shipping E35 (the
`reconcile()` false-halt fix for `top_picks_flat` round labels), traced how
picks actually reach `reconcile()` in production to confirm E35's fix would
be exercised correctly. It would not have been — a second, more severe bug
sits directly upstream.

## The finding

`public/js/draft/sync.js`'s `DraftSync.prototype.allPicks()` builds a NEW
normalized object per pick from the raw Sleeper payload — and never copies
`is_keeper`:

```js
out.push({
  player_id: id, pick_no: ..., round: p.round, picked_by: ..., roster_id: ...,
  draft_slot: ...,
  source: p.__manual ? 'manual' : 'sleeper',
  metadata: p.metadata || {},
});
```

Sleeper serves `is_keeper` on every real pick — confirmed against
`draft/log_draft_picks.py`'s own `_from_sleeper` (`bool(entry.get("is_keeper"))`,
`bool(p.get("is_keeper"))`), which reads the identical top-level field from
the same API. `allPicks()`'s output is the ONLY picks array any live-sync
consumer ever sees (`app.js`'s `onPicks: function(picks) { ...
onSyncPicks(picks); }` receives exactly `self.allPicks()`'s return value,
verbatim, per `sync.js`'s own `self.onPicks(self.allPicks())`). Two
consumers key directly off `p.is_keeper`:

- `reconcile.js`'s `reconcile()`: `if (!p || !p.is_keeper) return;` — the
  entry gate for treating any pick as a keeper at all.
- `app.js`'s `selectionIndexOf()`: `if (p.is_keeper) { keepers += 1; ... }`
  — its own doc comment says *"Sleeper serves `is_keeper` on every pick...
  so keeper-ness is OBSERVED, not inferred"* — an assumption this exact
  function violates once fed `allPicks()`'s output.

## Verified empirically (Rule 3d — never trust a reading, run it)

```
node -e "... s.picks = [{...is_keeper:true...}]; s.allPicks()[0].is_keeper === undefined"
```
Confirmed: `is_keeper: true` on the raw input is entirely absent from the
normalized output. Then, feeding that output through `reconcile()` with
Cory's real, CORRECTLY-PLACED slate (Chase/Henry/Walker, exactly matching
`kept_players`):

```json
{"halt": true, "missing": [Chase, Henry, Walker],
 "message": "3 assumed keepers were not kept ... still on the board, and
             currently invisible to every recommendation."}
```

**All three of Cory's real keepers, correctly placed, reported missing.**
This is unconditional — it does not depend on E35's round-label scenario at
all. `seenKeepers[id]` in `reconcile()` is only ever set from
`picks.forEach(p => { if (!p || !p.is_keeper) return; seenKeepers[id] = p;
...})` — with `is_keeper` always falsy from live sync, `seenKeepers` never
gains an entry, so every assumed keeper falls into `missing` the moment
`currentRound` passes its `cost_round`. **This would have fired on Cory's
draft, guaranteed, right around round 4 — not an edge case, the default
outcome of every live draft this pipeline has ever run.**

## Why this survived to today

The exact same normalizer already dropped a different field once before —
the surrounding code comment (`sync.js`, directly above where this fix
landed) documents it: *"this normaliser dropped `draft_slot`, and
reconcile.js reads `p.draft_slot || p.roster_id || null`. In a LEAGUE draft
roster_id exists, so the fallback covered the omission and everything
worked... A MOCK DRAFT HAS NO ROSTERS... so every mock pick... vanished."*
`is_keeper` has no such fallback anywhere, and — critically —
`reconcileKeepers()` (`app.js`) is **explicitly skipped in mock mode**
(`if (!window.DraftReconcile || state.mockMode) return;`), and mock rooms
carry no real keepers regardless. So this exact code path — live sync,
`is_keeper` present in the raw feed, `reconcile()` consuming it — has never
once executed, in a mock or otherwise, because no rehearsal exercises real
keepers through live reconciliation. **Cory's actual draft would have been
the first time this code ever ran against real keeper data.**

## The fix (shipped, tested)

One field added to `allPicks()`'s pushed object: `is_keeper: !!p.is_keeper`.
Verified with the same empirical script: `reconcile()` on the identical
correctly-placed slate now returns `{ok: true, halt: false}`.

Three new tests in `sync.test.js`: a keeper pick carries `is_keeper: true`
through normalization, an ordinary pick carries `false` (not `undefined`),
and a pick with the field absent entirely also normalizes to `false`. All
29/29 `sync.test.js`, 27/27 `sync_reconcile.test.js`, 23/23
`reconcile.test.js`, 15/15 `sync_ingest_health.test.js` pass unaffected.

## Relationship to E35

E35 fixed a narrower bug in `reconcile()` itself (round-label false
positives under `top_picks_flat`) that only matters once `is_keeper`
correctly reaches it. **This fix is a prerequisite for E35's fix to be
exercised at all** — without it, `reconcile()` fails via the `missing` path
unconditionally, before the `misplaced`/`wrongRound` logic E35 touched ever
gets a chance to run. Both are required together; neither alone would have
kept the reconciler working on draft night.
