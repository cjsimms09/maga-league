# Prereg: does loosening the TE cap recover any of the shape term's acquisition deficit?

**D, 2026-08-19. Answers `ROSTER-CONSTRUCTION-CALL.md`'s open call — the ONE
target it names as "the single most promising thing to challenge" but that
neither K/DEF attempt tested.** Filed before running, per that doc's own
`no_fit_guard` instruction ("preregister your bar before you run, report a
FALSE as plainly as a pass").

## Why TE, not another K/DEF attempt

Two independent mechanisms already tried to move K/DEF timing toward the
humans and both made the points worse on both gradings — the call doc's own
conclusion is to test the PREMISE, not propose a third K/DEF mechanism.
TE is a genuinely different target with its own, separately-measured
evidence: top-3 finishers draft **1.67** tight ends against bottom-3's
**1.11** — the widest positional separation on the board, independently
corroborating P120 (TE the only position to separate on finish, p=0.0043).
`CORY_CURVE.TE` is `[1, .05, 0]` — a second tight end priced at 5% of a
starter's weight, effectively a twentyfold hole. That is the shipped
equation's own stated position, not an inference.

## Mechanism

Raise `CORY_CURVE.TE[1]` (the weight applied when 1 TE is already held) from
**0.05 to 0.50** — a genuine bench-quality valuation, not a second starter's
weight, tested with a single round-number value rather than a swept grid
(a sweep is the natural follow-up if this direction shows anything). TE's
measured waiver level (130.4) is not exceptionally cheap relative to other
positions (WR 124.8, K 128.6), so a second TE is not "free" acquisition the
way a third RB might be — the cost of testing this is genuinely unknown in
advance, which is the point of measuring rather than arguing it.

## Prediction, stated before running

**Raising the TE cap improves BOTH gradings relative to the shipped shape
term (baseline actual −20.4, skill +7.9)**, because it targets the one
roster-composition dimension independently measured to separate winners
from losers — unlike the two refused K/DEF mechanisms, which targeted
picking *order* rather than final roster *composition*.

**I do NOT predict it clears the full bar** (`> +2.5` actual, `> +7.9`
skill) on its own — this is a single-dimension partial test, not a
full re-design, and the call doc's own framing (conversion bought at the
cost of acquisition) suggests any single lever is unlikely to fully close
that gap alone.

**FALSE if:** either grading does not improve over baseline, if legality
degrades below the shipped arm's own legality count, or if the effect is
negligible in both directions (a null, not a win).

## Method

`draft/tools/roster_builder_replay.js --te-boost`, a new CLI flag added the
same way `--kdef-tax` and `--kdef-supply` were (§5 of the call doc invites
exactly this — "if you have an idea, encode it and measure it on the
harness"). Same 30 real seat-years, same controls, same both-gradings
report. Nothing shipped: `engine.js` untouched, the flag is off by default,
`public/draft_data.json` untouched — this is TERRITORY: A's tool, extended
in the pattern it already documents for exactly this purpose, not a board
or model change.

---

## GRADE — TRUE, and stronger than predicted, with one caught asymmetry

**Controls: all pass. TE held reaches 2 in essentially every seat** (the
mechanism is doing what it claims, not a null arm wearing a new weight).
**Legality: 0 of 30 seats unfillable — unlike both K/DEF attempts, this
does not trade legality for points.**

| | baseline (shipped) | `--te-boost` | bar |
|---|---|---|---|
| actual | −20.4 (14/30) | **+33.8 (18/30)** | > +2.5 |
| skill | +7.9 (16/30) | **+29.2 (19/30)** | > +7.9 |

**P215 flips TRUE** (mean > 0 and ≥18/30 — exactly 18). Both stated bars
clear. This is a stronger result than predicted — the prereg expected a
directional improvement, not a bar-clearing one.

**⚠️ BUT THE POOLED MEAN IS DOMINATED BY ONE SEASON, THE EXACT G=3 PATTERN
`three_cluster_bootstrap_2026-08-19.md` ALREADY ESTABLISHED TONIGHT — applying
the same discipline to my own result, not just others':**

| season | baseline actual | te-boost actual | baseline skill | te-boost skill |
|---|---|---|---|---|
| 2025 | +61.9 | **+179.8** | +55.3 | **+97.4** |
| 2024 | −61.4 | −54.4 | −0.2 | **−18.8** |
| 2023 | −61.7 | −23.9 | −31.3 | +8.9 |

**On ACTUAL points, all 3 seasons improve (3/3 sign-consistent)** — 2025
by +117.9, 2023 by +37.8, 2024 by a marginal +7.0. That is the honest,
G=3-appropriate claim, not the pooled +33.8.

**On SKILL points — the grade Cory ruled to trust — only 2 of 3 seasons
improve. 2024 gets WORSE on skill (−0.2 → −18.8) despite getting slightly
better on actual.** That is the same actual-vs-skill divergence shape that
exposed K/DEF dead end 1 (actual looked fine, skill caught the real
defect) — smaller here, not disqualifying, but a real asymmetry and not
one to smooth over. The pooled skill win (+29.2, 19/30) is real but, like
the actual figure, mostly a 2025 effect (+42.1 swing) with 2023 contributing
less (+40.2) and 2024 actively fighting it (−18.6).

**Recommendation: this is a genuinely promising, well-controlled direction
— not a shippable number.** A single round value (0.50) was tested, not a
sweep, per the prereg's own stated scope; a sweep across the TE[1] weight
and a look at WHICH TE-boosted picks specifically drive 2024's skill loss
(is it one seat, one pick, one player?) are the natural next steps before
anyone treats +33.8/+29.2 as a number to build a shipping decision on.
Register 132, routed to A.

