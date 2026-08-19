# You are right about the ceiling term. It is 70% a second copy of value.

**A, 2026-08-19.** Cory: *"Why are we adding ceiling to everyone? That defeats
the point."*

**Measured, on the live board. You are right, and here is the number.**

---

## 1. THE MEASUREMENT

The term is not raw ceiling — it is the **spread**, `proj_ceiling − proj_mean`.
That is the correct design, so the honest test is whether the SPREAD carries
information the mean does not.

| | Spearman(spread, proj_mean) |
|---|---|
| all 610 priced players | **+0.70** |
| QB | +0.79 |
| RB | +0.72 |
| WR | +0.57 |
| **TE** | **+0.91** |

**At 0.70 the ceiling term is mostly re-ranking players by how good they already
are. At TE it is 0.91 — very nearly value with a different name.**

For contrast, raw `proj_ceiling` vs `proj_mean` is **+0.9951**, which is why the
weight was zero in the first place. The dispersion fix moved the *input* from
1.0000 to 0.995 and the *term* to 0.70. **That is better. It is not
independent.**

## 2. WHY THAT DEFEATS THE POINT, EXACTLY AS YOU SAID

`score = VONA + 0.45 × spread`. If spread rises with the mean, then the ceiling
term hands **bigger upside bonuses to bigger projections** — it rewards players
for being good, which VONA already does.

**A ceiling term should identify the opposite thing: players with more upside
than their level normally carries.** At +0.70 it barely does.

**And it corroborates a result already in the register:** P112 / register 61
found the per-player ceiling refinement does **not** beat a flat per-band
constant out of sample — **0 of 4 folds**. A signal that ties a constant is a
signal that is mostly level.

## 3. WHAT IT SHOULD BE — demonstrated, not asserted

**Residual upside: the spread MINUS what a player of that level and position
typically carries.** Computed on the live board with a 15-player local window
by position:

| | Spearman with mean |
|---|---|
| shipped ceiling term | +0.70 |
| **residual upside** | **+0.04** |

**Essentially orthogonal to value — which is what an upside term is for.**

And it surfaces the right kind of player:

| residual | player | mean | spread | typical at his level |
|---|---|---|---|---|
| **+66.5** | QB Michael Penix | 123.4 | 78.7 | 12.1 |
| +45.6 | QB Tua Tagovailoa | 181.7 | 62.6 | 17.0 |
| +41.8 | TE Mason Taylor | 76.4 | 56.3 | 14.6 |
| +41.0 | RB Ray Davis | 60.6 | 63.0 | 22.0 |
| +31.4 | QB Jacoby Brissett | 245.6 | 55.9 | 24.6 |

…and at the bottom, **Geno Smith −19.2** and **Darnell Mooney −17.9** — proven,
low-variance, no hidden ceiling. **That is a real upside ranking. The shipped
one is a value ranking wearing an upside label.**

⚠️ **AND THE OBVIOUS TRAP, STATED BEFORE YOU ASK: residual upside alone would
draft terribly.** It ranks a backup quarterback above a starting running back,
because uncertainty is highest where a player is unproven. **It is a TERM, not a
ranking** — it belongs beside value, which is exactly where the current one
sits. The fix is what goes into the term, not whether the term exists.

## 4. WHAT I AM NOT DOING

**Not changing the ceiling weight or its construction before Saturday.** It
touches every player's score on a board you have been studying, and swapping a
term's definition two days out on one board's correlation is the kind of thing
this project has a rule against. **This is a measurement and a proposal.**

## 5. THE HONEST STATE OF THE CEILING RULING

You ruled `ceiling: 0.45` on three preregistered runs that beat zero. **Those
runs were real and I am not retracting them** — a 0.70-correlated term can still
beat a zero-weighted one, because it is not a *pure* copy.

**But "it beats zero" is a much weaker claim than "it measures upside", and I
have been letting the first stand in for the second.** On the evidence: the term
helps, and it helps mostly by adding more value-weighting, not by finding
upside.

**What would settle it:** grade residual-upside-as-the-term against
spread-as-the-term on the seat replay, same harness as everything else, one
preregistered comparison. That is a post-draft job and it is the right next
question about ceiling.
