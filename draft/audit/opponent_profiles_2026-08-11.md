# The opponent dossier: wired, gated, and inert at the layer that matters

**Date:** 2026-08-11 · **Question asked:** the war room shows per-manager tendencies
built from 468 picks across three drafts, and the survival panel three inches below
shows the same position mix at every seat. Is it unwired, or wired and inert?

## 1. Which problem it is

**Wired, gated, and inert at the position layer.** Not unwired. Established by reading
the seam, before running anything.

- `positionProbabilities()` — the function that produces the RB 45 / WR 36 / TE 11 mix —
  reads **`team.profile` and nothing else**. Its two dials are that seat's softmax
  `alpha_need` / `beta_value`.
- `app.js profileForSlot()` returns `null` for every seat until
  `state.profilesMappedFromDraft` is true, which `importDraftOrder` sets only once the
  **live draft object** maps uids to seats. That gate is deliberate and correct: the
  artifact's profiles carry no `draft_slot` (0 of 10), so the alternative is an
  order-fallback that puts a real manager's tendencies on an arbitrary seat.
- Therefore every seat's alpha/beta are the CFG defaults, and **the identical mix across
  seats is a construction, not a coincidence.**

The panel's "no draft history on Sleeper — modelled as league average" is the same gate
seen from the display side: `sample_size` is read off `profile`, which is null. The
wording is misleading — there *is* draft history, three drafts of it — but the state it
describes is real.

**On draft day this lights up on its own.** The moment Sleeper's draft order is assigned
and imported, `profileForSlot` starts returning managers and every seat differentiates.
Nothing has to be built for that to happen. What is worth knowing is whether it matters.

## 2. What wiring it changes — the flip diagnostic

`draft/tools/profile_flip.js`. Three arms evaluated at **identical board states**, because
if each arm drafted its own team the boards would diverge after the first disagreement and
every later difference would measure the divergence rather than the profiles:

| arm | intervening seats carry |
|---|---|
| `generic` | no profile, no room — true league-average |
| `room` | no profile, room mixture — **what ships today** |
| `mapped` | a real manager per seat — the draft-day state |

The seating is unknown until the order is assigned (it moved twice on 2026-08-11 alone),
so `mapped` runs over many random permutations and the result is a distribution. A headline
quoting one permutation would be quoting a coin flip.

**The probe was proved satisfiable before the null was believed.** At a fixed decision the
three arms produce different `survival_to_next` (`mapped` 0.6286 against 0.6317 for the
others), so the harness reaches the model. A null from a probe that cannot move is the
failure that looks exactly like a true null — that is the `claim_stopping` mistake from
this morning, where both arms correctly said don't-spend and the probe proved nothing.

### Result — THE FULL RUN, 12 × 8

The pilot (4 × 3) read 1.4% and was labelled as not-the-answer, because 144 decisions with
2 moves cannot separate 1.4% from 0.5% or 3%. The headline run landed at **0.7%**, so the
pilot was high — which is the reason it was not quoted as the result.

```
12 drafts x 8 seatings · seat 8 · 10x15
3 keepers, rounds 1-3 forfeited · 1152 decisions · 9 opponents profiled

  shipping (room)  vs mapped profiles : 8/1152  0.7%
  league-average   vs shipping (room) : 0/1152  0.0%
  league-average   vs mapped profiles : 8/1152  0.7%

  picks moved per draft (room -> mapped): mean 0.08, range 0-1  over 96 runs

  round  5 : 3/96  3.1%
  round 14 : 5/96  5.2%
  score gap to runner-up when it moves: median 0.01, max 1.00
  ...against ALL decisions             : median 0.66

  r14 p133  Philadelphia Eagles (DEF)  ->  Cam Little (K)   x5
  r 5 p 48  D'Andre Swift (RB)  ->  Drake Maye (QB)
  r 5 p 48  Drake Maye (QB)  ->  D'Andre Swift (RB)
  r 5 p 48  D'Andre Swift (RB)  ->  Drake Maye (QB)
```

Five of the eight are round 14, K against DEF, on a 0.01 gap against a median of 0.66. The
other three are round 5 and they are the interesting ones — **and they go in BOTH
DIRECTIONS across seatings**: Swift→Maye twice and Maye→Swift once, at the same pick, on
the same board. What changed was which manager sat in which seat. That is seating noise,
not an edge, and it is the clearest evidence in the run that mapping the profiles does not
buy a systematic advantage.

The `league-average vs shipping` row reading exactly 0.0% is not a rounding artifact. It is
section 3: the room mixture never reaches the scorer, so those two arms are the same
computation.

## 3. The thing found on the way, which is larger

**The room mixture reaches the panel and not the score.**

"P(this player | his position is taken)" is answered in **two places**:

| function | called by | room-aware |
|---|---|---|
| `withinPositionProbability` | the THREATS panel | **yes** |
| `withinFromPool` → `poolSoftmax` | `precomputeLayer2` → `survival_to_next`, VONA, the score | **no** |

Measured on the live board, top-6 RBs, with and without the room:

```
withinPositionProbability   Gibbs 0.4500 -> 0.4382   (-0.0117)
withinFromPool              Gibbs 0.4397 -> 0.4397   ( exactly 0)
```

So D6's stated purpose — *"elite RB/WR/QB survival over an 11-pick window was OVERSTATED
by 2.6–3.4 points"* — was never applied to the number that says how long a player lasts.
The panel and the score disagreed about the same room and neither was wrong on its own
terms. This is the same shape as the failure this project keeps finding: one question,
two implementations, only one of which learned the new thing.

It also means the `room` arm above is **byte-identical to `generic`** in the scorer, which
is why the flip's `generic`-vs-`room` row reads 0.0%. Today's shipping behaviour *is*
league-average in the score, exactly as the panel says — just not for the reason the panel
gives.

**GRADUATED 2026-08-11**, after the direction was settled by equation rather than by
inspection — Cory made that the binding precondition. `poolSoftmax` now consumes the
mixture with availability weighting, so a player 20% likely to still be on the board
contributes 20% of its mass; conservation holds (both arms sum to 0.9900 = 1 − tail
budget). Baseline re-frozen as **v6**, against artifact_v5's board on purpose so the diff
is the code change and not a board rebuild. v5 went red on exactly 4 checks, all composite
score and per-player survival.

**AND THE DIRECTION DISAGREEMENT WAS MINE, NOT D6'S.** This section previously recorded
that the fix makes elite RBs *less* likely to be taken, against D6's overstated-survival
claim, and left it unresolved. That set a CONDITIONAL against a MARGINAL. Gibbs
0.4397 → 0.4278 is P(this player | HIS POSITION IS TAKEN) — a share that sums to a constant
across the position, so mass moving from the elite to the rest of the position necessarily
lowers it. Survival compounds over ten picks and also depends on how often the position is
taken at all.

Measured at the survival level (`draft/tools/rb_direction.js`), the direction **agrees**
with D6: the top AVAILABLE RB at pick 30 goes 0.9917 → 0.9857, 0.60 points DOWN. The
invariant holds numerically — take UP ⟺ survival DOWN over 1760 players × 3 windows, zero
violations, 5182 player-windows moved.

**The magnitude does not reproduce.** D6 claims 2.6–3.4 points; the largest move among
players in play is 0.60, four to five times smaller. D6's number must still not be quoted
as describing this engine. And 13 RBs sit at survival ≤ 0.02 at pick 30 and cannot move at
all — the elite-RB worry is structurally out of reach of this change.

A second hypothesis was tested and failed, and is kept as a failed lead: D6 names a
"mean-manager" baseline, but `reach_delta.mean` is centred on the LEAGUE, the room's mean is
0.53, and the mean-manager temp (0.3394) is within a hair of generic (0.3500).

## 4. The profiles are thin, and must not be dressed up

Three drafts per manager. Every one of the ten has `sample_size: 3` and
`shrinkage_weight: 0.6`, so the fitted parameters are already pulled 40% toward the league
mean before anything reads them.

The spread that carries all of the signal:

| manager | alpha_need | beta_value | reading |
|---|---|---|---|
| Richard2121 | 1.205 | 0.795 | drafts for need |
| Jreis | 1.073 | 0.927 | |
| Sadbru | 1.048 | 0.952 | |
| ds7mmet | 1.022 | 0.978 | |
| coryjsimms | 1.006 | 0.994 | (excluded — never picks against me) |
| MarianSaar | 0.990 | 1.010 | |
| cashworth / B8T3S | 0.974 | 1.026 | |
| mhagen | 0.890 | 1.110 | |
| Schmelley | 0.809 | 1.191 | takes best available |

Mean alpha/beta across the room: **0.999 / 1.001** — the generic defaults to three
decimals. That is not a coincidence to be explained away; it is what a shrunk fit over
three drafts looks like. Averaging these parameters is a provable no-op, which the D6 work
already established and which this table confirms independently.

So: **if this lands, it lands with n=3 on the face of it**, the same way the survival tilt
carries its honesty note. A per-seat number that looks more precise while resting on
thinner evidence is worse than the league average it replaced. The panel currently says
"no draft history", which is false; it must not be replaced with a confident tendency that
implies more than three drafts of evidence.

## What I am not claiming

- Not that the profiles are worthless. They differentiate `survival_to_next` measurably;
  they just rarely change which player is top of the board.
- Not that the flip generalises past this board. It is one artifact, one seat (8), one
  keeper set, and opponents drafting by ADP with seeded noise.
- Not that the room-mixture fix is safe to ship. It is measured, not adopted.
