# E's fourteenth sweep — "make sure other issues like this don't exist"

**Session E (red team), 2026-08-17.** Cory's instruction after the Nix/Purdy fix.
This is the systematic answer, and it is a **negative result with the method
stated** rather than an assurance.

The two defects he hit define two classes:

- **CLASS A — the rendered ORDER disagrees with the rendered NUMBER.**
  (Nix printed above Purdy while scoring lower.)
- **CLASS B — a decision rests on a field that carries no information.**
  (`proj_ceiling` is `proj_mean × a per-cell constant`.)

---

## CLASS B — swept mechanically, and the ceiling was the only one

Rather than reading the engine and hoping, I enumerated **every player field the
engine actually reads** (parsed from `engine.js` with comments stripped,
intersected with the board's real keys — 18 fields), then measured each one on
the top 200.

**Boardwide variation** — nothing is a single constant except by design:

| field | distinct (top 200) | reading |
|---|---|---|
| `adjusted_adp` | 200 | varies |
| `proj_ceiling` | 186 | varies *(boardwide only — see below)* |
| `proj_mean` | 173 | varies |
| `vorp` | 168 | varies |
| `opportunity_z` | 92 | varies |
| `pos_rank` | 55 | varies |
| `tier_drop` | 44 | varies |
| `team` | 33 | varies |
| `age` | 18 | varies |
| `tier` | 18 | varies |
| `bye` | 9 | varies |
| `games_expected` | **6** | one per position — register **E8**, already filed |
| `replacement` | **6** | one per position — correct by definition |
| `position` | 6 | varies |
| `injury_status` | 3 | Questionable / PUP / IR |
| `depth_chart_order` | 3 | an ordinal with three real levels |

**Then the check that actually matters**, because a field can vary boardwide and
still carry nothing where a decision is made — the within-cell coefficient of
variation of `field / proj_mean`:

```
proj_ceiling     worst within-cell cv = 6.32e-04   <-- DEGENERATE
tier_drop        worst within-cell cv = 1.39e+00
replacement      worst within-cell cv = 2.39e+00
games_expected   worst within-cell cv = 2.39e+00
vorp             worst within-cell cv = 2.50e+00
adjusted_adp     worst within-cell cv = 2.64e+00
opportunity_z    worst within-cell cv = 3.91e+00
```

**`proj_ceiling` is the only one, by three orders of magnitude, and it is now
guarded** (`moreUpsideThanTheCellExplains()`). Everything else the engine decides
on carries genuine per-player variation inside the cell where the decision
happens.

**So Class B is clean apart from what is already on the register.** `E8`
(`games_expected` is a per-position constant) is the one remaining instance and
it was filed before Cory asked — it reaches no composite recommendation, because
`risk` and `bye` are both weighted 0.0.

## CLASS A — three reorderers, and only one was silent

`recommend()` reorders in exactly four places. Each was checked for whether it
can move a row above a higher-scoring one without saying so:

| reorderer | reorders? | explains itself? |
|---|---|---|
| `applyCeilingTiebreak` | yes | **was the defect** — now guarded, and any surviving swap still writes `ceiling_tiebreak` naming the man it passed |
| `applyStage2Cap` | yes | **`STAGE2_CAP: false`** — off by default, and writes `stage2_earned` / `stage2_capped` when on |
| `applyRosterLegality` | filters | prepends `FORCED — N picks left and you still need …` |
| `demoteFlaggedOnesies` | yes | prints the reason **on screen**: *"K & DEF below — demoted in this view: streamable all season"* |

**And the general guard now exists rather than the specific one.**
`ceiling_tiebreak_needs_a_real_ceiling.test.js` asserts **zero score inversions
across the entire rendered list** at a live pick — so any future reorder that
moves a row above a higher score without a mark trips it, whatever introduces it.
That is the durable answer to Class A: not "I checked the four", but "an
unexplained inversion now fails the suite".

## WHAT THIS SWEEP DOES **NOT** COVER — stated, not implied

1. **It reads the ENGINE's inputs, not every surface's.** A panel that computes
   its own quantity from the board and displays it is outside this net.
   `manager_profiles` is the proof that matters: `rookie_affinity` is pinned at
   0.0 for all ten managers (**E13**) and this sweep would not have found it,
   because the engine never reads it.
2. **It is one board.** Every cv above is measured on the published 682-row
   board. Registers 2 and 3 concern the *fresh* 693-row board, which needs
   egress this session does not have.
3. **Class B's test is degeneracy, not correctness.** A field can vary richly
   and still be wrong. This sweep says "the engine is not deciding on a
   constant"; it does not say every number is right.

## THE RESULT, IN ONE LINE

**Of the 18 fields the engine decides on, exactly one was degenerate where the
decision happens, and it is fixed. Of the four places the list reorders, exactly
one was silent, and it is fixed — with a general guard that catches the next one
rather than a note asking someone to remember.**
