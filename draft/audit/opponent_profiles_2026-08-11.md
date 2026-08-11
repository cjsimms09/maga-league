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

### Result — PILOT ONLY, the full run is still going

This is 4 drafts × 3 seatings, quoted as a pilot and labelled as one. The headline run
(12 × 8) was still executing when this was committed; it is appended below when it lands,
and **the pilot is not the answer** — 144 decisions with 2 moves cannot separate 1.4% from
0.5% or 3%.

```
4 drafts x 3 seatings · seat 8 · 10x15
3 keepers, rounds 1-3 forfeited · 144 decisions · 9 opponents profiled

  shipping (room)  vs mapped profiles : 2/144  1.4%
  league-average   vs shipping (room) : 0/144  0.0%
  league-average   vs mapped profiles : 2/144  1.4%

  picks moved per draft (room -> mapped): mean 0.17, range 0-1  over 12 runs

  round 14 : 2/12  16.7%
  score gap to runner-up when it moves: median 0.01, max 0.01
  ...against ALL decisions             : median 0.59

  r14 p133  Philadelphia Eagles (DEF)  ->  Cam Little (K)
```

Both moves are round 14, K against DEF, on a score gap of **0.01** against a median gap of
0.59 across all decisions. On this evidence that is a tie being broken differently, not a
different draft — but 2 events is not a rate, and the sentence stands only if the full run
agrees.

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

A fix is written and measured (`scratchpad/roomfix.patch`, 32 lines): route the mixture
through `poolSoftmax`, keeping availability weighting so a player 20% likely to still be
on the board contributes 20% of the mixture's mass. Conservation holds (both arms sum to
0.9900 = 1 − tail budget). **It is not committed**, because it changes live survival
numbers eleven days before the draft and that is Cory's call, not mine.

**One thing not to restate as verified.** After the fix, the mixture makes the elite RBs
*less* likely to be taken (Gibbs −0.0118, Bijan −0.0128) and the RB4–RB6 *more* likely.
D6's comment claims the opposite direction — that the room makes the top player more
likely to go and survival overstated without it. On today's board the measured direction
is the other way. Either the board moved since 2026-08-10 or the comment describes a
different quantity. Recorded as a disagreement, not resolved.

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
