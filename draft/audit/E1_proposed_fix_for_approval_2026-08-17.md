# E1 — the fix, prepared and NOT applied. A's approval required.

**Session E (red team), 2026-08-17.** Cory: *"Fix and send to a for approval."*
This is the half I deliberately did **not** ship, and the reason is in §3.

Everything else Cory raised today is fixed, tested and pushed (E6, E15 both
halves). E1 is different: the correct fix moves a **network call earlier in the
build pipeline**, five days before the draft, and that is a gatekeeper decision.

---

## 1. THE DEFECT, RESTATED IN ONE LINE

`projections.blend()` assigns each player's dispersion cell from a
within-position rank computed over **`players` INCLUDING the keepers**.
`vorp.assign_tiers()` later publishes `pos_rank` computed over **`available`,
which EXCLUDES them**. The module states the invariant itself:

> *"The rank MUST be the same ordering `vorp.assign_tiers` later writes as
> `pos_rank` … the calibration was fitted on that band definition and a
> different rank here would read the wrong cell."*

**The two disagree, so nine players read another band's floor and ceiling.**
Because `proj_ceiling` is `proj_mean × a per-cell constant` (sweep 7), reading
the wrong cell **is** getting the wrong number — there is nothing else in the
field.

## 2. WHY IT IS NOT A ONE-LINER

```
build.py:721    board = proj_mod.blend(players, baseline, opportunity, cfg)   <-- ranks here
build.py:1646   kept_ids = {...}                                              <-- known here
build.py:1686   available = keepers_mod.adjusted_adp(players, order, cfg, kept_ids)
build.py:1688   available = vorp_mod.assign_tiers(available)                  <-- publishes pos_rank
```

`blend()` cannot exclude the keepers because **`kept_ids` does not exist yet at
line 721**, and it cannot be cheaply hoisted: it derives from
`_keeper_map_for_board(full_keeper_map, slate_status, cfg)`, and `slate_status`
comes from `_assess_keeper_slate(cfg, offline)` — which **reads Sleeper when the
build is not offline**.

**Using `cfg`'s raw keepers instead does NOT work, and this is the trap worth
naming.** The board withholds only the keepers the slate gate accepts, and the
slate is partial right now — `keeper_slate` reports **4 of 10 teams designated,
8 keepers withheld, `safe_to_treat_as_truth: false`**. So the raw config set and
the published-withheld set are different populations today, and ranking on the
raw set would swap one mismatch for another while looking fixed.

## 3. WHY I STOPPED HERE

Every other fix today was contained: a label (`app.js:642`), a guard on a
comparison (`engine.js`), a roster lookup in a renderer. Each changed one
function, none moved the build's order of operations, and each was verified end
to end.

**This one reorders the projection pipeline and moves a network call earlier in
it, on the branch that builds the board Cory drafts from on 08-22.** That is
squarely A's, and shipping it unilaterally as the red team — the lane whose
charter says it has **no write territory in the pipeline** — is the failure mode
my own file warns about, five days from a draft.

## 4. THE CHANGE I RECOMMEND, PRECISELY

**Two edits. Neither invents a new construction.**

**(a) `draft/projections.py` — let the caller name the rank population.**

```python
def blend(players, baseline, metrics, cfg, *, rank_pool_ids=None):
    ...
    # The cell must be read against the SAME ordering the board publishes as
    # pos_rank. Keepers are withheld from the published pool, so ranking them
    # in here pushes everyone below them a slot deep and lands boundary players
    # in the wrong cell (register E1). rank_pool_ids=None keeps the old
    # behaviour so nothing changes for callers that do not pass it.
    ranked = [p for p in players
              if rank_pool_ids is None or str(p["player_id"]) in rank_pool_ids]
    for pos, group in _by_position(ranked).items():
        ordered = sorted(group, key=lambda x: -means[id(x)])
        for i, p in enumerate(ordered):
            rank_of[id(p)] = i + 1
    # A player outside the pool still needs a cell; give him the rank he would
    # hold in it rather than dropping him, so keepers keep a dispersion figure.
    for p in players:
        if id(p) not in rank_of:
            rank_of[id(p)] = _interpolated_rank(p, means, rank_of)
```

**(b) `draft/build.py` — hoist the keeper map above the blend, and pass it.**

The minimum hoist is `load_keepers` + `_keeper_map_for_board` +
`_assess_keeper_slate`. **`_assess_keeper_slate` is the one that touches the
network**, so A should decide whether to hoist it or to thread a
cheaper `withheld_ids` through.

## 5. WHAT I VERIFIED WITHOUT APPLYING IT

- **The defect reproduces exactly**: 9 players today, and re-deriving every band
  from a rank over `players + kept_players` matches **530 of 530** banded rows
  while the published `pos_rank` misses exactly those 9.
- **The fix must be to the MECHANISM, not the rows** — computed, not argued:
  after keeper lock the misread set becomes **11 players and only Chase Brown is
  on both lists**. Patching today's nine by name would fix eight players who
  stop being affected and miss ten who start.
  (`keeper_lock_shifts_the_cells_2026-08-17.md`)
- **The blast radius is the dispersion fields only** — `proj_floor`,
  `proj_ceiling`, `proj_sd`, `weekly_sd`. `proj_mean`, `vorp` and
  `overall_rank` are untouched, so **the board's ORDER does not move**; what
  moves is the floor/ceiling shown beside nine names.

## 6. ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      Approve the two-edit fix in §4 — specifically, may the keeper map
          be hoisted above the blend, and is hoisting _assess_keeper_slate
          (a network read) acceptable in that position five days out?
EVIDENCE: The invariant is stated in projections.py's own comment and is
          violated for 9 players today, 11 after lock, with 1 name in common.
          proj_ceiling is proj_mean x a per-cell constant, so the wrong cell
          IS the wrong number. Order does not move; only the dispersion
          fields beside those names do.
REC:      Approve (a) unconditionally -- it is inert until a caller passes
          rank_pool_ids. Rule on (b), which is the only part with risk. If
          the network hoist is unacceptable before 08-22, an equally correct
          alternative is to leave the build order alone and re-derive the
          dispersion AFTER assign_tiers, which I have NOT written because it
          duplicates the construction and that is a design call, not mine.
DEFAULT:  NO DEFAULT -- I do not apply this without your word. It is the one
          item today where the safe action and the fast action differ, and
          the branch stays as it is until you rule.
```
