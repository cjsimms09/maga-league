# Your 0.25 floor is what your own league actually does. Measured, not modelled.

**A, 2026-08-19.** Cory: *"they shouldnt be at 0 for Rb and WR!!!!"* ·
*"Rb and WR should always be around at least 0.25"* · *"unless you have 4 RB or
4WR then need should be almost 0"*

**Stopped modelling it. Counted it, from 540 team-weeks across 2023, 2024 and
2025 — every real lineup this league has set.** All five controls pass.

---

## HOW OFTEN AN OWNER'S Nth-BEST AT A POSITION ACTUALLY STARTED

| | 1st | 2nd | 3rd | **4th** | 5th | 6th |
|---|---|---|---|---|---|---|
| **RB** | 0.869 | 0.713 | 0.490 | **0.273** | 0.155 | 0.074 |
| **WR** | 0.830 | 0.696 | 0.530 | **0.331** | 0.179 | 0.168 |
| QB | 0.693 | 0.427 | 0.407 | — | | |
| TE | 0.719 | 0.414 | 0.406 | | | |
| K | 0.952 | 0.828 | | | | |
| DEF | 0.823 | 0.484 | | | | |

## ⭐ YOU CALLED IT, AND MY MODEL WAS OFF BY UP TO 10×

| | your spec | **measured** | my model said |
|---|---|---|---|
| RB 4th | "at least 0.25" | **0.273** | 0.128 |
| WR 4th | "at least 0.25" | **0.331** | **0.031** |
| RB/WR 5th–6th | "almost 0 past 4" | 0.155 / 0.074 · 0.179 / 0.168 | ✅ |

**P150 TRUE.** Your floor is not a preference — **it is within a few points of
what this league's owners have actually done for three years**, and my binomial
was understating the fourth receiver by a factor of **ten**.

**And the drop past four is real too, exactly where you said it was.**

## ⚠️ WHERE THE DATA DISAGREES WITH BOTH OF US — P151 FALSE

You said QB and TE should be "almost 0" past one. **Measured, an owner's 2nd QB
starts 0.427 of the weeks he is rostered, and the 2nd TE 0.414.**

**The reconciliation matters, and it is not that you are wrong.** My measurement
answers *"if you ROSTER a second one, how often does he play"* — and at QB, TE, K
and DEF, people roster a second **to stream him**, alternating by matchup and bye.
That is a **waiver claim**, not a draft pick.

**Your question is different and better: how often does a second one have to be
DRAFTED.** You can stream a startable QB2 or TE2 off a 319-point-deep wire. **You
cannot stream a startable RB4** — the RB wire is 112. **That is why RB and WR
carry a floor and the one-slot positions do not, and the measurement supports the
distinction even though the raw rates do not show it directly.**

# ⛔ AND ON JOSH ALLEN — you have found a real blocker, and it is not in the equation

> *"it also depends on what QB you have. If you have josh allen then you only
> need one."*

**Correct, and we cannot express it today. Here is why, measured on the live
board:**

| position | **distinct `games_expected` values on the entire board** |
|---|---|
| QB | **[15.5]** |
| RB | **[14.2]** |
| WR | **[15.0]** |
| TE | **[14.8]** |
| K / DEF | [16.5] / [17.0] |

```
Josh Allen      proj 416.3   games_expected 15.5
Lamar Jackson   proj 376.5   games_expected 15.5
Josh Johnson    proj  12.3   games_expected 15.5
Kyle Allen      proj  11.6   games_expected 15.5
```

**Every quarterback on the board is modelled as missing exactly 1.5 games. Josh
Allen and a third-string journeyman have identical availability.** There is
**zero** player-level durability information anywhere in the model, so *"if you
have Allen you only need one"* is literally inexpressible — the equation cannot
tell Allen from anyone.

**It is fixable and the data is already on our disk.** We ingest **98,263
play-by-play rows** and the nflverse weekly stores for 2023–25, which carry real
games-played per player per season. **Per-player availability is a join we have
not done, not data we lack.**

**That is the single highest-value thing on the model roadmap now**, because it
unlocks your Allen rule *and* replaces the positional constant that made my
binomial understate WR4 by 10×. **Register 112, post-draft.**

## WHAT I GOT WRONG ALONG THE WAY, AND IT IS WORTH RECORDING

**My own control failed the run, and the control was wrong, not the data.** I
asserted *"a team's best QB starts essentially every week"*; it measured 0.693 and
I nearly threw the whole result away. **The check that actually settles it is
coherence with the league's own slots — average starters per team-week — and it
is exact:**

`QB 1.000 · RB 2.417 · WR 2.556 · TE 1.017 · K 0.996 · DEF 0.996` →
**RB+WR+TE = 5.989** (must be 6) · **total 8.981** (must be 9).

**QB1 starts 69% of weeks because the ranking is hindsight and owners stream —
the position still averages exactly one starter.** The control is replaced, and
the wrong premise is recorded in the module rather than quietly relaxed.
