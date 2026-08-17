<!-- TERRITORY: A -->
# PREREGISTRATION — RE-RUN THE PHASE TUNING AGAINST FIELDS THAT MEAN SOMETHING

**Committed BEFORE the re-run. No numbers in this commit.**

**Cory, 2026-08-17:** *"We need to redo the whole study. To find optimal tuning
for different rounds and circumstances. I feel like there are lots of little
tuning we need to rethink, re check with this new info!!"*

---

## 1. WHY THE ORIGINAL IS VOID — BOTH AXES, NOT ONE

`policy_tournament.py` scores every candidate with:

```python
p["vorp"] + ceil_w * (p["proj_ceiling"] - p["proj_mean"]) - risk_w * p["weekly_sd"]
```

On the board that grid ran against:

- **`proj_ceiling - proj_mean`** was `1.036 × proj_sd`, and `proj_sd` was
  `proj_mean × (a per-band constant)`. So the ceiling axis was **the projection,
  rescaled.** `projections.py` records the consequence measured at the time:
  *"Spearman 1.0000 against proj_mean at every position on the real board."*
- **`weekly_sd`** is `season_sd / √games`, and `season_sd` is the same
  `proj_mean × band constant`. So the risk axis was **also the projection,
  rescaled, with a minus sign.**

The grid therefore explored `vorp + a×(mean) − b×(mean)`. It could only ever
discover that adding and subtracting scaled copies of the projection to a
VORP ranking makes it worse — which is exactly what it found, and exactly what
was written up as *"aggressive endgame upside burns money; the swing-at-upside
hypothesis is REFUTED."*

**That sentence is about double-counting, not about upside.** Cory's hypothesis
has never been tested.

## 2. WHAT IS DIFFERENT NOW, AND WHAT IS NOT — STATED BEFORE THE RUN

**Fixed:** `proj_ceiling` is the measured p90 of realized/projected outcomes and
`proj_floor` the measured p10, over 1,304 graded player-seasons. The ratios now
differ by band in a way the Gaussian transform flattened — p90 spans 1.09–1.89
where the old ceiling ratio spanned 1.24–1.69, and p10 spans −0.001–0.77 where
the old floor spanned 0.55–0.84.

**NOT fixed, and this bounds the whole study:** every one of these is still
`proj_mean × (a per-band constant)`. There is no per-player dispersion signal on
this board, because the hand-set modifiers that would supply one could not be
measured (permutation null [0.33, 5.65], 2 usable cells) and remain gated off.

**So the honest question this re-run can answer is narrow:**

> Does leaning on CROSS-BAND dispersion differences pay, and does the right lean
> change by phase?

**It cannot answer** "should THIS player be taken for his upside". Anyone reading
the output as an answer to that will be reading it wrong, and this paragraph
exists so that cannot happen quietly.

## 3. ARMS — the original four, unchanged, so the comparison is like-for-like

The point is to re-run the SAME design against corrected inputs, not to invent a
better one. Changing the design and the data together would make the difference
unattributable.

1. H1 phase-shape (modest core, aggressive floor-free endgame)
2. Uniform boom (no phase shape)
3. Defaults (the hand-designed control)
4. Floor-heavy (the opposite tilt)

Plus the per-phase optimum grid over the same `ceiling_w` values, reported with
intervals. **A phase whose interval straddles the current default is reported
"no evidence of a shift" and is NOT nudged** — the original's rule, kept.

`--rooms 150`, `--null-draws 60`, the harness defaults, so sample size is not a
free parameter chosen after seeing anything.

## 4. THE PRE-DECLARED COMPARISON THAT MATTERS MOST

The original grid's endgame result was **ceiling 0.5 better (+$19, CI [7.5,33]);
1.0 / 2.0 / 3.0 all worse with CIs excluding zero.**

**Declared now:** if the re-run reproduces that ordering, the "refuted" verdict
survives its own re-test and Cory's hypothesis is dead on better evidence. If the
ordering INVERTS — aggressive endgame ceiling now positive — then the original
finding was an artifact of the collinearity and the auto function's endgame value
should be revisited.

Either outcome is publishable. **A null is the expected result**, because the
inputs remain band-level and the effect being sought is small.

## 5. WHAT MAY NOT HAPPEN

- **No weight ships from this run.** It informs `autoWeights`, which is
  opt-in and OFF by default; the shipped manual regime holds `ceiling` at 0.0
  and this study does not change that.
- **Nothing lands before the draft.** Five days out, a re-tuned auto function
  that has been run once is a worse instrument than a known one.
- **The `risk` axis result is not interpretable** and will be reported as such,
  because `weekly_sd` is still collinear with the mean. Reporting a risk optimum
  from this run would repeat the exact error being corrected.

## 6. LIMITATIONS

1. Both dispersion inputs remain `mean × band constant`; only the constants
   improved.
2. `risk_w` is uninterpretable this run (§5).
3. The money proxy is the harness's v1 proxy, unchanged.
4. Paired rooms share luck by construction, which is the design's strength for
   deltas and its limit for absolute levels.
5. One board — 2026, one keeper slate, one seat.

**Refusal and "no evidence of a shift" are valid outcomes and need no further
permission.**
