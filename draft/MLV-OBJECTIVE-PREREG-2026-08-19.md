
---

## 12. PREREG — EXACT DP (`--objective-dp`): the TRUE optimum, committed before the run

Cory: "why not do the montecarlo thing now?" In the harness the opponents are
the recorded picks — deterministic — so the stochastic DP collapses to EXACT
deterministic DP, and the true optimum of the construction problem is
computable. **This is a DIAGNOSTIC, not a shipping arm:** it bounds what ANY
construction rule of ANY complexity could achieve in this framework.

**Mechanism.** A position-sequence DP over (my pick slot, position counts),
exact by three reductions, each provable in the fixed-draft setting:
(1) within a position, always take the current best available — my k-th take
at slot r is exactly the (k+1)-th best of the position's opponent-surviving
list at r (exchange argument, proven in the fixed draft); (2) the single flex
slot is handled exactly by enumerating its source (RB/WR/TE/none — four
additive DPs, max taken); (3) keepers pre-occupy their position stacks at
their recorded values. K≤1/DEF≤1 cap and full legality enforced at the
terminal (illegal = −inf). Values in the harness's own rank units.

**Built-in control, non-negotiable:** the DP's internal objective must be
≥ MLV's achieved internal objective in EVERY seat — an "optimum" that any
greedy beats anywhere is a bug, and the run refuses.

**Declared predictions:**
- **Gap prediction: DP's internal-objective gain over MLV is < 5% in ≥ 25/30
  seats.** If true, construction is CLOSED — no equation, calculus or
  otherwise, has meaningful room above the greedy in this framework, and the
  answer to "can't you find a more complex equation" becomes a measurement.
- **Grading prediction: the DP-optimal rosters do NOT beat MLV's on the skill
  grading beyond noise** (internal-optimum ≠ graded-points optimum; chasing
  the last internal points buys noise). If DP DOES beat MLV on skill by > 10
  pts/season, MLV is leaving real value behind and the DP policy becomes a
  candidate arm — that outcome would be reported as eagerly as the other.

---

## 13. PREREG — WAIVER-AWARE GRADING (`--grade-waiver`), committed before the run

Cory: the frozen-roster grading "fully excludes waiver pickups. That's terrible
and not realistic." Correct, and it applies to every arm symmetrically. Fix:
grade BOTH rosters under a streamed game — every starting slot is floored at
its position's measured weekly waiver level (season levels from
ROSTER-CONSTRUCTION-CALL.md §2, this room's own three drafts: QB 322.9 ·
RB 78.4 · WR 124.8 · TE 130.4 · K 128.6 · DEF 100.0, divided by 17; flex floor
= the best flex-eligible level). Applied inside `bestLineup`, so actual and
skill arms both inherit it, both sides identically.

**Declared before running:** under waiver-aware grading, MLV-cap still beats
the owners on BOTH gradings (actual > 0, skill > 0), and its actual delta
stays inside the frozen arm's bootstrap CI [+10.0, +81.7]. If the edge
INVERTS under the realistic game, the frozen-grading result was an artifact of
ignoring waivers and every conclusion above is downgraded accordingly — filed
either way.

## 13b. P136 HONESTY NOTE — opponent reaction was measured WITHOUT a blind prereg

The `--react` arm ran before its bar was committed (implementation preceded
declaration). Labeled exploratory, not blind: actual **+32.7 (21/30)**, skill
**+14.9 (18/30)** — both call bars still cleared, the drop from the frozen
pool is −13.1/−14.4, and the actual WIN COUNT improved. Limit 5's answer:
opponent adaptivity costs ~13 points and does not change the verdict.

**§13 GRADED, SAME DAY: PARTIAL FALSE, AND CORY'S INSTINCT WAS RIGHT.**
Clause (a) holds: MLV-cap still beats the owners under waiver-aware grading —
**actual +2.6 (18/30), skill +2.1 (16/30)**, sign preserved on both. Clause
(b) FAILS: +2.6 is far outside [+10.0, +81.7]. **The downgrade applies: most
of the frozen-game +45.8 was an artifact of grading a streamed game as
frozen** — the floors raise exactly the weak slots that real waivers patch for
the humans. What survives, and it is the durable ordering: **MLV ≥ humans ≥
shipped curve under EVERY grading tried** (frozen, opponent-reaction,
waiver-aware, points-units). The shipped curve gets WORSE under the realistic
game: **−39.1 actual (12/30)** vs −20.4 frozen. The strongest robust claim in
this document is now: the shipped curve should not draft Saturday; MLV-cap is
the best measured rule; and its real-game margin over a good human is small.

## 14. PREREG — THE REALISTIC VONA EQUATION (`--real`, `--real-vona`), committed before the run

Cory: *"So find me a more realistic calc equation that drafts a normal roster
with most value (VONA)."* This section composes every graded lesson above into
ONE objective and commits its bar before any line of it runs.

**The equation.** At each of my picks, over every candidate `c` still on the
board:

```
score(c) = M(c)                                   (myopic arm, --real)
score(c) = M(c) − max over s∈Surv(pos(c)) M(s)    (VONA arm,   --real-vona)

M(c)  = L(roster + c) − L(roster)
L(R)  = Σ over starting slots  max(points(slot), WAIVER_season(slot))
        + max(points(flex), WAIVER_flex)
points(player) = LOO pick→points curve at his recorded pick_no
Surv(q) = same-position candidates whose recorded pick_no is AFTER my own
          next pick slot (they demonstrably survived until my next turn)
```

Piece by piece, each from a graded result: the value scale is the leave-one-
season-out pick→points curve (retires §9 limit 4, rank units — P135 proved the
transform is safe; 15-pick buckets, monotone-enforced, keeper picks excluded
from the fit because a kept star's slot is not a market price). The objective
is the waiver-FLOORED lineup (§13's floors, season units: QB 322.9 · RB 78.4 ·
WR 124.8 · TE 130.4 · K 128.6 · DEF 100.0; flex floor 130.4) — the drafter now
optimizes the streamed game the grading grades, answering Cory's "excludes
waiver pickups" objection at DRAFT time, not only at grading time. The normal
roster is the K≤1/DEF≤1 cap plus displacement (§6). The timing term is VONA
proper: marginal now minus the best same-position marginal still available at
my next pick, estimated from the recorded draft's own survivors — no
projections, no hindsight beyond the market order already used everywhere in
this harness. If `Surv(q)` is empty, score = M(c) (full urgency). Ties on
score break by M(c).

**Bars, declared before the run — graded on `--grade-waiver`, the realistic
game (frozen grading reported beside, no bar):**

1. The winning realistic arm beats MLV-cap's waiver-graded mean deltas:
   actual > **+2.6** AND skill > **+2.1**, on the same 30 seat-years.
2. Head-to-head: ≥ **16/30** seats where the arm's waiver-graded skill delta
   beats MLV-cap's for the same seat.
3. 30/30 legal rosters, K ≤ 1 and DEF ≤ 1 in every seat.

Decision rule: if `--real-vona` clears all three and ≥ `--real`, VONA is the
recommendation; if only `--real` clears, the myopic realistic arm is; if
neither clears, **MLV-cap stands and this is filed FALSE like §8 and §10.**

**Controls (Rule 3e), all mandatory:** (a) byte-guard — `--mlv` untouched by
the patch, must reprint +45.84/+29.33; (b) engagement — the realistic arm must
differ from `--mlv`'s rosters in ≥1 seat or the flag is presumed dead;
(c) curve known-positive — curve(pick 1) > curve(pick 101) strictly, printed;
(d) clobber-guard — the harness writes ONE output file, so every arm's JSON is
copied aside before the next run and the baseline re-asserted (the §7 bug).

**Predictions filed blind (ledger P138, P139):** P138 — `--real` clears bar 1.
P139 — `--real-vona` does NOT beat `--real` beyond noise (§8's lesson:
lookahead terms on this value signal hurt; VONA is a lighter lookahead, so the
honest prior is "no gain", filed so a reversal is a real surprise, not a
retrofit).

## 14b. §14 GRADED, SAME DAY — FALSE, and the failure mode is the finding

Baseline re-asserted first (clobber-guard): MLV-cap waiver-graded reprinted
**+2.57 (18/30) / +2.10 (16/30)**. Curve control live (LOO-2025: pick 1 →
211.3, pick 101 → 111.0, strictly decreasing). Engagement: the realistic arm
differs from MLV-cap in **30/30 seats**.

| arm (waiver-graded) | actual | skill | h2h vs MLV (skill) | legal |
|---|---|---|---|---|
| `--mlv` (champion) | **+2.57** (18/30) | **+2.10** (16/30) | — | 30/30 |
| `--real` | −5.29 (15/30) | **+5.69** (21/30) | 16/30 | **23/30** ❌ |
| `--real-vona` | −19.83 (13/30) | −9.70 (14/30) | 17/30 | 25/30 ❌ |

Frozen beside (no bar): `--real` −61.4/−51.2, `--real-vona` −61.0/−50.6.

**Bar 1 FAILS** (actual −5.29 vs required > +2.6; skill clause alone would
have passed at +5.69). **Bar 3 FAILS: 7 seats end the draft with an
unfillable starting slot** (5 for VONA). **P138 FALSE. P139 TRUE** — the VONA
timing term made everything worse, §8's lookahead lesson now measured a third
time on a third construction. **MLV-cap stands.**

**The mechanism, and it is exactly Cory's constraint biting back:** the floor
makes an empty slot FREE inside the objective — a late kicker whose curve
value (~111) sits under the K floor (128.6) has marginal **zero**, so the
drafter rationally never rosters one and "streams" a slot the real game makes
you fill on someone. The §13 floors were built to grade waivers realistically;
moved to DRAFT time unmodified, they optimize a game where you may field 8
starters. "Fielding a normal roster" is a CONSTRAINT, not an emergent
property of a realistic objective — which was Cory's original sentence all
along. Follow-ups (3g): does §13's grading under-punish illegal rosters the
same way (no — grading floors the slot, both sides symmetric, checked);
does this invalidate §13's verdict (no — MLV fills all slots, floors never
exempted it); routed to A with §14c below.

## 14c. PREREG — LEGALITY-FORCED REALISTIC ARM (`--real-fill`), committed before the run

One amendment, mechanical: when my remaining picks ≤ my unfilled dedicated
starting slots, candidates are restricted to positions with an unfilled
dedicated slot. Nothing else changes — same curve, same floors, same cap,
optionally the same VONA term (`--real-vona --real-fill`). This encodes the
constraint the way a human does: "I still need a kicker and I have two picks."

**Bars: identical to §14's three, unchanged numbers.** Decision rule
identical. **P140, filed blind:** `--real-fill` goes 30/30 legal AND beats
MLV-cap on waiver-graded skill (> +2.1); I do NOT expect it to also clear the
actual bar (+2.6) — the skill arm is where a construction rule shows, the
actual arm is where 2024's variance lives. FALSE on any clause missing, filed
either way.
