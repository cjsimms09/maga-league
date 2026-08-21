# R* IS SOUND. POINTED AT OUR STANDINGS IT WILL NEVER CERTIFY ANYTHING — HERE IS THE POWER CURVE

**A, 2026-08-21.** Verification of `draft/tools/skill_luck_r.py` (relay's
implementation of Getty et al., *SIAM Review* 60(4) 2018, from Cory's upload)
and a power calculation the original write-up does not carry.

**I had not read the paper.** It is not in the repo — only the implementation
and `SKILL-LUCK-R-2026-08-20.md`. Everything below is measured against the
committed tool, and the claims are about the TOOL and OUR DATA, not about the
paper's text, which I have not seen.

## 1 · The instrument is sound, verified not assumed

`--controls` discriminates in both directions: fair coins land inside their own
null band (R\*=−0.039 in [−0.096, +0.157]); persistent 0.75-skill players clear
it decisively (R\*=0.948 vs null 97.5 = 0.268). The league figure reproduces
exactly: **R\* = 0.682, m = 10, null 97.5 = 0.7309** — it does not clear, and
the 08-20 write-up says so plainly. No complaint anywhere here.

## 2 · My first concern was WRONG, and the measurement is why

I expected m=10 to be underpowered by construction. It is not. With a strong
ability spread and n=200, detection is **20/20 at m=10**, 19/20 at m=5, and
still 10/20 even at m=3. Fair-coin controls detect 0/20 at every m. So small m
is not the problem — I would have filed that and been wrong.

## 3 · THE FINDING: at OUR spread, more seasons will not save it

The band is wide because our EFFECT is small, not because m is 10. Power at
m=10, by how far the best/worst owner's TRUE win rate sits from .500 (25 seeds
per cell, MC null per draw):

| true spread | win-rate range | n=50 (today) | n=100 (~6 seasons) | n=150 (~9 seasons) |
|---|---|---|---|---|
| **0.10 ← ours** | .400–.600 | **12%** | **16%** | **20%** |
| 0.15 | .350–.650 | 32% | 52% | 68% |
| 0.20 | .300–.700 | 60% | 88% | 96% |
| 0.25 | .250–.750 | 68% | 96% | 100% |

Our observed all-play range is **.366–.578**, a spread of about **0.106**. That
is the top row. **Nine seasons of data would still leave us at 20% power.**

**So the honest conclusion is stronger than "not significant at 95%": this
particular measurement will not converge in the lifetime of the league.**
"Collect more seasons and re-run" is not a plan, and the 08-20 write-up's
implicit hope that n grows into significance should be retired.

## 4 · What follows, and one correction to §3 of the 08-20 doc

**The 08-20 doc prescribes on the wrong quantity.** It says *"any arm/tool/edge
with ≥20 graded outcomes gets R\*+band beside its mean."* n≥20 is far too low:
at n=50 and a realistic spread we get 12%. A threshold that admits n=20 will
mostly produce non-significant numbers that then get quoted as "not skill",
which is a false negative dressed as a finding — exactly rule 3e's shape.

**Where R\* WOULD have power is where the observation count is large and the
effect is real: per-player-week projection accuracy.** That is
`PROJECTION-PROGRAM-2027`'s target — beat Sleeper and FantasyPros on this
league's scoring at start/sit — and its n is players×weeks, in the thousands,
not 50. Two cautions before anyone wires it: the competitors there are m=3
models (power 10/20 even with a huge spread, so expect it to need a big real
gap), and split-half over a SEASON confounds skill with in-season drift.

**Recommend:** keep R\* as the instrument, retire the standings application as
a certification (keep it as a descriptive prior with the non-significance label,
which is what §2 already does), and re-point it at the weekly scoreboard with a
power calculation done FIRST rather than after a null comes back.

## 5 · What this does NOT establish

It does not say our league is luck. Low power means we cannot tell — the
observed R\*=0.682 is entirely consistent with real skill we cannot certify.
That asymmetry is the whole point of printing the band.
