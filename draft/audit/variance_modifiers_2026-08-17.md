<!-- TERRITORY: A -->
# ARE THE VARIANCE MODIFIERS REAL? — UNDERPOWERED, NOT REFUTED — 2026-08-17

**Cory:** *"Do test"* — fit `player_variance`'s modifiers against realized data
instead of guessing them.

**Prereg:** `draft/backtest/VARIANCE-MODIFIER-PREREG.md`, committed at `d2aa24b1`
**before** the runner existed. **Runner:** `variance_modifiers.py` ·
**Artifact:** `variance_modifiers.json`.

---

## THE ANSWER, FIRST

**The modifiers cannot be measured from committed data. Not "they are zero" —
we cannot tell.** The distinction is the whole verdict, and this repo's standing
rule (absent ≠ zero) is why it gets stated rather than rounded off.

| flag | raw | permutation null 95% | corrected | hand-set | p | verdict |
|---|---|---|---|---|---|---|
| `VAR_WORKLOAD_COMMITTEE` | — | — | — | 1.390 | — | **NO DATA** (2 cells) |
| `VAR_SECOND_YEAR` | 1.218 | **[0.33, 5.65]** | 1.170 | 1.100 | 0.78 | **NOT SUPPORTED** |
| `VAR_BACKUP` | — | — | — | 1.160 | — | **REFUSED** (§1) |
| `VAR_INJURED` | — | — | — | 1.120 | — | **REFUSED** (§1) |

The null interval is **[0.33, 5.65]**. A meaningless flag on this data routinely
produces multipliers between a third and five-fold, so any hand-set constant in
that range is neither confirmed nor refuted. **1.10 and 1.39 sit comfortably
inside the noise.** Only **2 cells** cleared honest minimums out of 1,162 graded
player-seasons.

---

## 1. THE FIRST RUN WAS VOID, AND ITS OWN CONTROL CAUGHT IT

Worth recording because the control was preregistered specifically to do this.

Run 1 used `MIN_CELL=12 / MIN_SIDE=5` and compared `sd(on)/sd(off)` against 1.0.
It produced a **`VAR_SECOND_YEAR` = 3.10, "SUPPORTED"** — a publishable-looking
number that would have justified turning the composition on.

The preregistered no-mechanism control — a flag assigned by **player-id
parity**, which cannot possibly matter — came back at **1.649**. Under prereg §4
that voids the entire run, so it did.

**The cause was the statistic, not a coding slip.** A ratio of two small-sample
standard deviations is biased *away* from 1: `sd` is noisy, the ratio of two
noisy estimates has a heavy right tail, and `E[sd_a/sd_b] > 1` even when the
true dispersions are identical. With five players a side that bias swamps
everything. The committee flag read **11.5** with its own shuffled control at
**4.9** — the artifact was enormous and pointed the right way, which is exactly
what makes it dangerous.

Fixed by judging every value against a **permutation null** built by reshuffling
the flag inside each cell, never against the constant 1.0. Whatever bias the
statistic carries is then present in the null by construction and cancels. The
parity control now reads 1.726 against a null median of 1.699 — **corrected
1.016**, inside its own interval, pipeline calibrated. Note that the raw 1.726
for a meaningless flag is itself the proof of how badly the naive statistic
misleads.

## 2. WHY IT IS UNDERPOWERED — structural, not fixable by trying harder

The design needs cells of (season × position × prior-rank band) holding 40+
players with 15+ on each side of a flag. Across three graded seasons those
essentially do not exist. The binding constraint is the **cell**, not the
sample: 1,162 player-seasons is a reasonable total that shatters into fragments
once you condition on season, position, band, *and* flag.

Two of the seven were declared unmeasurable **before** looking (prereg §1), and
that call stands: `VAR_BACKUP` needs pre-season depth charts and `VAR_INJURED`
needs draft-time injury designations. Both are live Sleeper state, 2026 only.
An end-of-season proxy would be circular — a player who finished on IR obviously
had a wild season.

## 3. WHERE I DEPART FROM MY OWN PREREGISTERED RULE, AND WHY

Prereg §3 said: **NOT SUPPORTED → the modifier goes to 0.0**, and if every
fittable modifier fails, delete `player_spread_in_sd` rather than leave a dark
flag.

**I am not setting the modifiers to 0.0, and this is a deliberate departure that
belongs in the open.** That rule was written assuming a measurement would
happen. It did not. Setting a modifier to zero on the strength of a test that
could not resolve anything between 0.33 and 5.65 would be treating **absence of
evidence as evidence of absence** — the exact move this repo refuses everywhere
else, and the reason `proj_sd_for` returns `None` rather than a fallback
constant.

What the prereg's spirit does bind: **the magnitudes are unjustified, so they do
not ship.** `player_spread_in_sd` stays **OFF**. That is the same outcome the
rule was protecting, reached without asserting a measurement nobody made.

## 4. WHAT SHIPPED ANYWAY, AND WHY IT NEEDED NO MEASUREMENT

The clobbering Cory objected to had **two separable halves**, and only one of
them is a statistical claim:

- **The magnitudes** — how much wider a rookie's distribution is. A claim.
  Unmeasured. **Stays gated off.**
- **The reasons** (`variance_why`) — that this player *is* a rookie buried on
  the depth chart. Not a claim; a fact about the player that the build already
  computes. Clobbering it was **pure information loss**, and restoring it needs
  no measurement. **Shipped, ungated.**

The wording distinguishes the two states so the panel cannot mislead:

    sd level from measured 2023-25 projection error, band WR|1-3
    not in the sd (modifier unmeasured): rookie, no usage history
    not in the sd (modifier unmeasured): behind on the depth chart

You now see *why* the tool thinks a player is volatile, and simultaneously that
the volatility is **not** in the number. Before this run the panel showed
neither.

## 5. WHAT WOULD ACTUALLY ANSWER IT

1. **Pool across seasons instead of conditioning on them.** The season split is
   what shatters the cells and it buys little — the modifiers are not claimed to
   be season-specific. This alone might triple usable cell counts.
2. **A regression, not a cell split.** Model `log|ratio − 1|` on the flags
   jointly with position and rank as covariates. Uses every row instead of only
   rows inside a qualifying cell, at the cost of a functional-form assumption.
3. **Capture what is missing, starting now.** A weekly snapshot of
   `depth_chart_order` and `injury_status` costs nothing and makes `VAR_BACKUP`
   and `VAR_INJURED` measurable **for 2027** — the same "be glad in 2027 we
   captured it" logic that put the Kalshi capture in place.

## 6. LIMITATIONS

1. **Prior-season total is a cruder anchor than a projection**, so dispersion
   here is an upper bound on dispersion around a real projection.
2. **Survivorship, reported not corrected**: players with no weekly row in Y are
   excluded, biasing every dispersion **downward** — the wildest outcome, a
   season that never happened, is the one systematically missing.
3. **2021/2022 weekly stores are rebuilt offline**, licensed by an exact
   reproduction of the committed 2023 store.
4. **The rookie arm was not run.** With `VAR_SECOND_YEAR` unable to resolve on
   far more rows, a pre-declared-underpowered rookie arm would only have added a
   number nobody should read.
