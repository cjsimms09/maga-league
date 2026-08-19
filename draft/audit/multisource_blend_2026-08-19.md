# The multi-source mean: what shipped, what it changes, and the hypothesis I nearly filed

**A, 2026-08-19.** Cory: *"switch to mean projections, fix ceiling and floors"*
… *"Ship it"*. This is the measurement behind that ship, including the part
where my first explanation was wrong and a control caught it.

Commits: `53814c46` (wiring) · `f297e7f3` (coherence gate + 8 tests) ·
`6d585e95` (the fixture-clobber guard I needed on the way).

---

## 1. What is on the board now

Where a player carries Sleeper **plus at least two of CBS / ESPN / FFToday**,
and those sources are mutually coherent (§3):

| field | before | after |
|---|---|---|
| `proj_mean` | Sleeper only | mean of all opinions |
| `proj_sd` | `proj_mean × a per-(position, band) constant` | **cross-source disagreement** |
| `proj_ceiling` / `proj_floor` | the same constant, ±1.28σ | mean ± 1.28 × that disagreement |

Everyone else is left exactly as built. **Absent stays absent**; a one-source
player keeps his one number rather than being dropped or handed a fabricated
peer.

**The dispersion is the bigger half.** Measured on the 08-19 board: **all 32
defences shared ONE `proj_sd/proj_mean` ratio (0.380)** and 73% of kickers
shared one, because `fetch_component_stats.py` excludes K and DST at the source
(register 2e, reopened 08-19) and always will. Cross-source spread gives **29
distinct ratios for 31 defences**. That is per-player information our own
pipeline structurally cannot produce — and it is now the *only* such information
we have, because P112 killed outcome-derived dispersion (the right tail varies
but does not persist, 4/4 null) and the 08-19 age/opportunity study killed the
structural predictors (`983cdca9`).

---

## 2. It is not a scale error — the pairwise control

Sleeper reads low against the scrapers almost everywhere, which is exactly the
shape of the kicker units bug caught earlier the same day (a 3.5× scale gap from
a mis-mapped field goal bucket). So the first thing to rule out was another one.

**Median |log ratio|, pairwise, same player population:**

| pair | n | median &#124;log ratio&#124; |
|---|---|---|
| CBS ↔ ESPN | 319 | 0.103 |
| ESPN ↔ FFToday | 322 | 0.103 |
| CBS ↔ FFToday | 289 | 0.128 |
| FFToday ↔ Sleeper | 338 | **0.112** |
| ESPN ↔ Sleeper | 368 | 0.145 |
| CBS ↔ Sleeper | 335 | 0.192 |

**Sleeper is not the odd one out.** FFToday↔Sleeper (0.112) is *tighter* than
CBS↔FFToday (0.128). A global scale offset would show as every Sleeper pair
being uniformly worse than every scraper pair, and it does not. Ruled out.

---

## 3. THE HYPOTHESIS I NEARLY FILED, AND THE CONTROL THAT KILLED IT

The disagreement is not uniform — it concentrates in low-projection players and
runs one way. An obvious mechanism fits: **Sleeper projects ROLE** (it is the
platform carrying the depth chart, so a backup gets a backup's number) while the
scrapers project the player generically. I cut the data by each player's depth
rank on his own team to confirm it:

| ranked by **Sleeper** | rank 1 | rank 2 | rank 3 | rank 4+ |
|---|---|---|---|---|
| RB | 0.88 | 0.85 | 0.82 | 0.26 |
| WR | 0.97 | 0.97 | 0.96 | **0.74** |
| TE | 0.95 | 0.96 | 0.67 | 0.45 |

A clean monotone story, ready to write down. **Then the control: rank the same
players by the SCRAPER mean instead — the other side of the same ratio.**

| ranked by **scrapers** | rank 1 | rank 2 | rank 3 | rank 4+ |
|---|---|---|---|---|
| RB | 0.87 | 0.84 | **1.16** | **1.50** |
| WR | 0.96 | 0.97 | 0.89 | **1.00** |
| TE | 0.95 | 0.96 | 0.55 | 2.96 |

**The pattern reverses.** It was selection on the ranking variable — regression
to the mean, not role. The depth-chart story was an artifact of ranking by the
numerator.

**What survives BOTH cuts** is a flat positional level offset: **K 0.64 · RB
0.85 · DEF 0.88 · QB/WR/TE 0.95–0.97.** And that one is absorbed by VORP's
replacement level — if every RB is 15% low, replacement moves with them and VORP
barely changes. Which is exactly what §5 measures.

> This is rule 3f working. The hypothesis was plausible, the first table
> supported it, and the only reason it is not in this document as a finding is
> that I ranked the same cut by the other variable before writing it down.

---

## 4. The real defect: averaging numbers that measure different things

With the ranking artifact removed, the biggest movers still needed explaining.
They are not close calls:

| | Sleeper | CBS | ESPN | FFToday |
|---|---|---|---|---|
| WR Ashton Dulin | **2.5** | 86 | 26 | 65 |
| K Drew Stevens | **20.0** | 126 | 134 | — |
| WR Luke McCaffrey | **7.3** | 71 | 18 | — |
| QB Justin Fields | 36.7 | **12** | 13 | 15 |

**A 34× spread is not an opinion about performance.** It is a disagreement about
whether the man plays at all, and the mean of those is a number no source
believes. Averaging promotes a backup kicker to a starter's projection.

And the damage lands precisely where the blend has its effect. Within-position
rank movement, blend vs shipped, **before** the gate:

| position | top-12 median &#124;move&#124; | whole-position max |
|---|---|---|
| RB | 0.5 | 27 |
| WR | 1.5 | **80** |
| TE | 1.0 | 25 |

**The blend was doing almost nothing where its inputs were comparable and almost
everything where they were not.**

### The gate

Blend only where every source agrees the player has a role:

```
max(opinions) / min(opinions) <= 2.0     and     min(opinions) >= 10.0
```

**2× is the widest spread that can still be a dispute about performance.** Past
it the sources are answering different questions, and on the playing-time
question Sleeper is the better authority — so the player is **left alone**,
neither averaged nor overridden. The floor exists because below ~10 points a
ratio stops meaning anything (2.5 → 86 and 0.4 → 14 are the same ratio, and
neither is a projection).

**`no_fit_guard`: both constants are argued from that mechanism and were never
chosen by grading arms against an outcome.** That argument is exactly the kind
this project has been burned by, so it is preregistered as **P116** — and P116
states in advance that if the gate fails its grade, the honest fix is to blend
everything or nothing, **not to tune the bound**. A bound adjusted to survive its
own grade was fitted, whatever the commit message said.

---

## 5. What actually changed, after the gate

**305 blended · 61 declined as incoherent · 18 below the role floor · 50.1%
coverage of the priced board.**

| position | blended | median &#124;move&#124; | max | **top-12 median** |
|---|---|---|---|---|
| QB | 39 / 76 | 1.0 | 20 | 1.5 |
| RB | 60 / 137 | 1.0 | 17 | **0.5** |
| WR | 103 / 206 | 1.0 | 24 | 1.5 |
| TE | 45 / 116 | 1.0 | 29 | 1.0 |
| K | 27 / 42 | 2.0 | 14 | 3.0 |
| DEF | **31 / 32** | 3.5 | 14 | 2.5 |

WR's worst case falls **80 → 24**. The top of the board is untouched, as it was
before — the gate removed the damage without removing the signal. **DEF still
blends 31 of 32, so the dispersion win survives intact.**

The declined list is exactly the population the mechanism predicts: **Calvin
Austin 8.2× · Tank Dell 7.1× · Drew Stevens 6.7× · Carson Beck 5.4× · Elic
Ayomanor 5.2×** — injury-uncertain, backup, and rookie. The ten widest are
stamped into `provenance.multisource_mean` so the gate is auditable from the
artifact rather than from a log nobody keeps.

---

## 6. Two things this does NOT claim

**It does not claim the mean is more ACCURATE than Sleeper.** That needs
per-player projection history the repo does not hold; `proj_mean_blend.py`'s
constructibility gate returns `no_control` and P113 grades it in January. This
is Cory's ruling on a validated capture, not a graded accuracy claim.

**The rookie-bloc veto passes, and the pass is weaker than it looks.** This is
the test that refused the 2026-08-16 blend attempt, and it now re-runs on every
build. But:

| | before the gate | after |
|---|---|---|
| rookies n | 36 | **19** |
| permutation p | 0.134 | **0.591** |

**The gate strips rookies preferentially, because rookies are the role-uncertain
population — so the test got weaker exactly as the thing it guards got safer,
and the p-value reports only one of those two movements.** Register 63, routed
to D: what n does this test need before it is worth quoting?

A fixture written for that veto also failed first, and the reason is worth
keeping: **two perfectly constant blocs give a permutation test no power at all**
(nearly every 30/30 reshuffle of 30 highs and 30 lows reproduces the observed
median gap, so p → 1). Had I asserted the other way, that test would have passed
a module whose veto was wired to nothing.

---

## 7. What is open

| | |
|---|---|
| **C** | the store has **no capture job** — on draft morning the blend applies 08-19 opinions to an 08-22 board |
| **C** | can we get a role-adjusted source, so the 61 declines become comparisons? They are the late-round upside players Cory says the draft is won on |
| **D** | grade the incumbent band constants against realized variance (the control already exists: `realized_variance_store.py`, 827 players, 2023–2025) |
| **D** | register 63 — the veto's power |
| **B** | the war room cannot tell Cory which of the three provenances a number carries |
| **A** | P116 (the gate), P117 (does the seat replay have the resolution to see any of this — predicted **null**, and a null here means the instrument is blind, not that the blend is useless) |
