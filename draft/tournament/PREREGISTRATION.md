# Pre-registration — MCTS self-play tournament

**Written and committed before any outcome was examined.** The only thing run
beforehand was a timing pilot (`--pilot`), which prints wall-clock and exits
without computing a single finish percentile. That was necessary to choose the
compute budget and is disclosed here rather than hidden.

The reason this document exists: the alternative is running the tournament,
seeing p = 0.08, and discovering a reason the analysis should have been
slightly different. This codebase's history is five silent-absence bugs that
every test passed; the statistical version of that failure is choosing the
analysis after seeing the data, and it is just as invisible afterwards.

---

## The question

Does the MCTS search produce better rosters than **greedy application of the
same value function**? Not "does it work" — the 51 unit checks answer that.
This decides whether the card ships **enabled** or **present-but-off**.

## Design

**Paired.** Each replication is one draft played twice: identical seed,
identical board, identical seat, identical opponent random draws. In arm A that
seat runs MCTS; in arm B it runs greedy-on-V. Every other seat is unchanged.
The pairing removes board and seat variance, which is most of the variance —
it is the difference between needing 1,000 drafts and needing 10,000.

**Seat rotated.** The seat under test moves across all ten slots, 100 drafts
each. Fixing it at slot 4 would measure "MCTS from slot 4", and slot effects in
a snake are real, so the result would confound search quality with position.

**Opponents are stochastic.** Nine seats sampling from a softmax over their
ranked candidate set (temperature 2.0 — usually the best available, sometimes
not). A deterministic room would yield one outcome per (board, slot) pair, so a
thousand drafts would be a hundred copies of ten results and every p-value
would be a fiction.

**Two rooms**, per the ship condition: opponents ranked by the composite board,
then opponents ranked by ADP.

## Metric

**Mean finish percentile** of the seat under test, where the ten final rosters
are valued on the common yardstick `V` (optimal legal lineup, replacement fill,
projected points) and percentile is the share of the other nine beaten. 1.0 is
the best roster in the league.

## Test

- **Paired one-sided t-test** on the per-draft difference (MCTS − greedy).
- **Sidedness: one-sided, MCTS > greedy.** The ship question is directional.
- **Threshold: p < 0.05.**
- **Companion: a sign test**, reported always, as a distribution-free check
  that the t is not being carried by a few tail drafts. It is a robustness
  report, not a second bite: the t-test is the pre-registered decision rule.

## Compute budget, fixed in advance

| | drafts | iterations/pick | rooms |
|---|---|---|---|
| **Primary** | 1,000 | 400 | composite, ADP |
| **Secondary A — compute scaling** | 200 | 1,000 | composite |
| **Secondary B — perturbation (ship cond. 2)** | 400 | 400, ±20% jitter | composite |

400 iterations was chosen from the timing pilot alone (1,535 ms per paired
draft; ~51 minutes for the primary). It is well below the ≥3,000-iteration
target for a real draft on a phone, so **the primary understates the search** —
a conservative direction for a ship decision, but it creates a confound: a null
result cannot by itself distinguish "search adds nothing" from "search
undertrained". Secondary A exists precisely to separate those, and is
pre-registered rather than reached for afterwards. **If the primary is null and
Secondary A shows the gap growing with compute, the honest verdict is
"undertrained, not useless."**

Secondary B runs only if the primary shows an effect, per the spec: there is
nothing to check the robustness of otherwise.

## Outcomes, decided now

- **MCTS beats greedy-on-V (p < 0.05)** → ship **enabled**; proceed to the
  perturbation arm.
- **Ties vs greedy but beats the ADP room** → the value function is doing the
  work and the search adds nothing *yet*. This is not failure; it is the
  expected result of a variance-blind V, which literally cannot see what a
  non-greedy line buys. Ship **present-but-off**, with that reason written on
  the toggle, and it converts directly into a priority signal: **the quantile V
  is what unlocks the search, so build it next.**
- **MCTS loses to greedy-on-V** → this is a **bug report, not a verdict**. A
  correctly implemented search over the same V should never be worse than
  greedy on average. Most likely locations, in order: the chance-node sampling,
  the backup at chance nodes, or the rollout policy's divergence from the tree
  policy. Investigate before drawing any conclusion about MCTS.

## Where the edge should live, if it exists

The thesis is that the search's advantage is concentrated in **timing** —
scarcity, run anticipation, the turn — because that is where greedy VONA is
structurally blind. So the run logs the per-round contribution to the gap, and
the gap split by two contexts: picks at a turn, and picks made while a
positional run is active.

- Gap concentrated at turns and run boundaries → **thesis confirmed**, and that
  sentence becomes the card's honest self-description.
- Gap uniform across all rounds → **suspicious**. A search whose advantage is
  evenly spread is more likely reading a V artifact or noise than exploiting
  timing, and should be treated as unconfirmed regardless of p.

## Known limitations, stated before the result

1. **The board is fixture data.** The local artifact is an offline build whose
   own provenance says "not real ADP or real projections". Structure (positional
   scarcity, value curve, tier shape) is plausible; the numbers are synthetic.
   The paired design controls for this within the comparison, but external
   validity to the real board is **not** established by this run. A CI re-run
   against the deployed artifact is the fix and is a separate job.
2. **The simulator's opponents are not the model MCTS assumes.** The search
   models opponents through the production survival machinery; the simulator
   uses a ranked softmax. This is a deliberate and conservative mismatch — the
   search must beat a room it does not perfectly understand, which is the real
   situation — but it means this is not a pure "inside its own simulator" test.
3. **V is the interim points-based value function.** Tournament results **do
   not transfer** across value functions. When V becomes P(top-2), every number
   in this document is void and the tournament must be re-run.
4. **Rollout uses a faster opponent policy than the tree** (position sampled
   from the model, then best available at that position, rather than a
   within-position softmax). Standard for MCTS rollouts and disclosed here
   because it was introduced to make this run affordable.
