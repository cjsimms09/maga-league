# E's second sweep — the model's only per-player contribution is pinned at its cap across the top of the board

**Session E (red team), 2026-08-17.** Board: `origin/main`'s
`public/draft_data.json`, built `2026-08-16T14:10:12Z`, 682 players — what Cory
drafts from today.

Sweep 1 (`band_edge_misread_2026-08-17.md`) was about the dispersion fields. This
one is about `proj_mean` itself, and it lands directly on the ruling Cory is
waiting for in `CORY-ASKS.md` A2 / register 21.

---

## FINDING 4 — `proj_mean` is `proj_sleeper × 1.1500` exactly, for 21 of the top 24

`proj_mean = proj_baseline × (1 + opportunity_adj)`, `proj_baseline == proj_sleeper`
for **427 of 427** rows carrying both (register 21, reconfirmed here). So
`opportunity_adj` is the **only** per-player thing this board adds to a raw
Sleeper number.

`projections.py:277` — `adj = max(-cap, min(cap, (z / 2.0) * cap))`, `cap = 0.15`.
The adjustment therefore saturates at `z ≥ 2.0`. **It is saturated across the top
of the board:**

| | |
|---|---|
| players at exactly `opportunity_adj = 0.15` | **30 boardwide — 22 of them in the top 50** |
| `opportunity_z` inside that capped group | **2.00 … 3.77 — a 1.89× spread, all mapped to one number** |
| top 24 overall where `proj_mean / proj_sleeper` is exactly 1.1500 | **21** |

```
Trey McBride        z 3.77  -> +15%      ovr 18
Jaxon Smith-Njigba  z 3.19  -> +15%      ovr  6
Jonathan Taylor     z 3.08  -> +15%      ovr  5
Justin Jefferson    z 2.91  -> +15%      ovr 19
...
Chase Brown         z 2.00  -> +15%      ovr 13
Breece Hall         z 2.03  -> +15%      ovr 27
```

**Trey McBride carries the highest opportunity signal on the board — z 3.77,
nearly double Chase Brown's 2.00 — and the two receive the identical
adjustment.** The model measured a difference and then discarded it.

**This is the §1 defect shape, on the primary field, in the picks that decide the
season.** Not "a per-band constant" this time but a single global one: across the
top 24, `proj_mean` carries no player-specific information that `proj_sleeper`
did not already carry. It is a rescale.

**Why no gate caught it.** `constant_multiple_sweep` reports
`proj_baseline = c × proj_mean in 4/10 cells, c in [1.0, 1.0]` — it sees the
*uncapped deep* cells, where `adj = 0` and the two fields are literally equal.
The *capped* relationship at `c = 1.15` lives in the `1-3`, `4-8` and `9-16`
cells, all of which have 2–8 rows against `MIN_CELL = 12`. Sweep 1 already noted
that blind spot; this is the first thing found sitting inside it. And
`proj_baseline` is in `KNOWN_PARTICIPANTS`, so the gate would not have fired
regardless.

**I am not asserting the cap is wrong.** A cap on an adjustment is a defensible
piece of risk control, and 0.15 is a config value (`opportunity_cap`) with the
reversibility pattern the repo uses deliberately. What I am reporting is that it
**binds for 22 of the top 50**, which makes it a constant rather than a control
there, and that nothing on the board or in the brief says so.

---

## FINDING 5 — the adjustment is not mean-preserving, and it skips QBs entirely

The project has already written down the rule this breaks. `VOLATILITY-WIRING-PREREG`,
quoted in brief §7 item 1, fixes three decisions for the *next* feature to be
wired:

> *"`f` must preserve the cell mean (or the change is a level shift in disguise)"*

**The shipped opportunity adjustment does not preserve the mean, and it is not
applied to every position:**

| pos | n | mean adj | Σ proj_sleeper | Σ proj_mean | pool level shift |
|---|---|---|---|---|---|
| RB | 102 | +0.0330 | 9,680 | 10,415 | **+7.60%** |
| WR | 157 | +0.0342 | 14,142 | 15,138 | **+7.04%** |
| TE | 95 | +0.0229 | 5,652 | 6,037 | **+6.81%** |
| **QB** | 68 | **+0.0000** | 10,506 | 10,506 | **+0.00%** |

`opportunity_adj` has **exactly one distinct value (0.0) for all 88 QBs, all 32
DEF and all 44 K.** `proj_mean == proj_sleeper` for **68 of 68** QBs.

And it is applied differentially by rank, so it steepens each skill position's
curve as well as raising it:

| pos | top 12 mean adj | rank 13–32 | rank 33+ |
|---|---|---|---|
| RB | **+0.1361** | +0.0861 | −0.0067 |
| WR | **+0.1470** | +0.0989 | +0.0029 |
| TE | **+0.1194** | +0.0677 | −0.0110 |
| QB | +0.0000 | +0.0000 | +0.0000 |

### Why that reaches the draft

The board ranks **across** positions on `vorp = proj_mean − replacement`. A top-12
RB gets +13.6% while the RB replacement level (around RB20–24 in a 10-team,
2RB+FLEX league) gets +8.6% — so his VORP is inflated by *more* than 13.6%. A QB
gets nothing, and his replacement gets nothing, so QB VORP is untouched.

```
RB #1 Jahmyr Gibbs   vorp 155.78   proj_mean = sleeper x 1.1500
WR #1 Puka Nacua     vorp 124.58   proj_mean = sleeper x 1.1500
TE #1 Brock Bowers   vorp  80.92   proj_mean = sleeper x 1.1500
QB #1 Josh Allen     vorp  63.78   proj_mean = sleeper x 1.0000
```

**Josh Allen sits at overall 16. Give QBs the same +15% the top skill players
carry and his VORP goes 63.78 → 73.35, which is overall ~10.** Six spots, at the
top of a draft, from a positional asymmetry rather than a football claim.

This supplies a **mechanism** for something the league benchmark already
measured from the other end: the drafter study found *later-first-QB* to be one
of the two separators between the top-3 drafters and the tool, and named a
"VORP-QB pathology" (ROUTES, 08-16). That study observed the symptom. This is a
candidate cause, sitting in one line of `projections.py`.

**The honest counter-argument, stated because it may well be the answer.** The
opportunity model is built on `wopr` / `target_share` / `opportunity_share` —
receiving and rushing usage. Quarterbacks genuinely have none, so excluding them
is natural, and it may be exactly what A intends. **But then the adjustment must
not also be a level shift**, because a level shift applied to three positions and
not the fourth is a positional thumb on the cross-position scale. That is
precisely the failure mode the volatility prereg was written to prevent, one
feature later.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      Should the opportunity adjustment be mean-preserving within
          position, given the board ranks across positions on vorp?
EVIDENCE: +7.60/+7.04/+6.81% pool level shift for RB/WR/TE against
          +0.00% for QB; 22 of the top 50 pinned at the 0.15 cap with an
          underlying z spread of 2.00-3.77; Josh Allen ovr 16 -> ~10 under
          symmetric treatment. VOLATILITY-WIRING-PREREG already fixes the
          mean-preservation rule for the next feature.
REC:      A rules. I am NOT claiming QBs should receive an opportunity
          adjustment -- they have no opportunity metrics and excluding them
          is defensible. The question is whether an adjustment that is
          ALSO a +7% level shift may be applied asymmetrically across
          positions that are then ranked against each other.
DEFAULT:  Filed; I move to the next player. Nothing here is urgent the way
          sweep 1's item is -- this has been the board's behaviour for
          weeks, not a fresh regression, and unpicking it days before a
          draft is very likely the wrong trade. Recording it so the
          decision is made rather than inherited.
```

Rule 3d, answered:
1. **Did the input vary?** Yes — `opportunity_z` has 104/145/89 distinct values at
   RB/WR/TE. It varies richly and is then clipped.
2. **Did it arrive?** Yes — `projections.py:277`, 376 of 682 rows carry a non-zero
   adjustment.
3. **Could the check have fired?** Yes — QB/DEF/K return exactly one distinct
   value against RB/WR/TE's 97/156/85, so the by-position comparison
   discriminates.

---

## EVIDENCE FOR THE RULING CORY IS WAITING ON (`CORY-ASKS` A2 / register 21)

A is ruling on Sleeper vs FantasyPros vs a blend. E's job is to say where the
board looks wrong; two measurements bear directly on it.

**1. The source choice is NOT a level shift — it changes the order.** Inside the
top 150, `proj_fantasypros / proj_sleeper` has median **1.046** and **cv 0.072**
(the boardwide cv of 1.22 is inflated by near-zero deep-player denominators and
should not be quoted). Within position, Spearman(Sleeper, FP) is **0.935 WR /
0.935 RB / 0.898 QB / 0.890 TE**. Players in the top 150 moving 3+ spots within
their own position when the source changes:

| pos | movers | of |
|---|---|---|
| WR | **25** | 39 |
| QB | **10** | 17 |
| RB | 5 | 23 |
| TE | 3 | 17 |

```
Rashee Rice        ovr  52   Sleeper WR#18 -> FP WR#6     adp 30.0
Mike Evans         ovr  36   Sleeper WR#14 -> FP WR#28    adp 61.67
Davante Adams      ovr  65   Sleeper WR#30 -> FP WR#18    adp 57.0
Josh Jacobs        ovr  42   Sleeper RB#18 -> FP RB#10    adp 29.0
Matthew Stafford   ovr 111   Sleeper QB#14 -> FP QB#8     adp 105.67
```

**Rashee Rice moves twelve WR spots on the choice of source alone.** This ruling
is not cosmetic, and the WR board is where it bites hardest.

**2. At the top, the source is nearly the whole question**, because Finding 4
says the model adds only a constant there. For 21 of the top 24, the board is
`Sleeper × 1.15`. Whatever A decides about blending, the top of the board
currently inherits one source's opinion with a flat rescale on top — and FP is,
per register 21, the only source with measured skill.

**I am not recommending a source.** That is A's ruling and it needs the
measurement register 20 says does not exist yet.

---

## CHECKED AND CLEAR — recorded so nobody re-runs these

- **Tier construction is coherent.** Across QB/RB/WR/TE: **0** cases of `tier`
  decreasing as `pos_rank` increases, and **0** cases of `tier_size` disagreeing
  with the actual population of that tier. The tier machinery is sound; sweep 1's
  and this pass's findings are all upstream of it.
- **"Is any TE worth a first?"** — the board says yes for one, and the arithmetic
  holds up. Brock Bowers is overall 9 on `vorp 80.92` against a TE replacement of
  151.95, ahead of CeeDee Lamb at 79.05. In a 10-team 1-TE league that is a real
  positional edge, not a construction error. **His ADP is 21.33**, so the board is
  making a genuine 12-pick claim against the market rather than following it.
- **QB replacement of 341.72 is correct, not a bug.** It is QB10's projection
  (Jayden Daniels, 341.7) in a 10-team, 1-QB league — textbook VORP. The
  compressed QB VORP that follows is arithmetic working as intended. **Finding 5
  is a separate issue and does not rest on this**; it is about the adjustment
  applied before replacement is taken, not about the replacement level.
- **`proj_baseline == proj_sleeper` for 427 of 427** rows carrying both —
  register 21's central claim, independently reconfirmed on today's board.

---

## ROUTING

| finding | to | urgency |
|---|---|---|
| 4 — cap saturated across the top 50 | **A** | filed with a default; not a fresh regression |
| 5 — not mean-preserving, QBs excluded | **A** | filed with a default; supplies a mechanism for the known VORP-QB pathology |
| register-21 evidence | **A** | feeds A2, which Cory is waiting on |

Nothing routed to B (surface work held pending the redesign) or to D (no store is
in question here — this is model construction, which is A's).
