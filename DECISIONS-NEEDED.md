# Decisions needed

_Questions no spec already answers. Each carries my recommended answer; I take
the conservative option and mark the item PROVISIONAL until you rule._

## D1 — Backtest grading metric: raw points vs value-over-replacement

**Status: OPEN. Backtest is PROVISIONAL. All backtest-fed installs (items 4, 5,
6) stay FROZEN until this is answered.**

The board-coverage leak is fixed (pick→board join now 100%). But the round-1
alarm still fires, and the round-1 detail explains why with data:

```
2023  B0 Justin Jefferson=274  | B3 Josh Allen=502
2024  B0 Derrick Henry=372     | B3 Carson Wentz=5
```

B3 (the composite) drafts QBs in round 1; B0 (ADP) does not. In this scoring
(4pt pass-TD, 0.04/pass-yd) elite QBs genuinely score 450–560 raw points — the
six >450 "smells" are all real QBs, not a data bug. So grading each pick on RAW
actual points structurally rewards QB totals, and a policy that takes a QB early
"wins" round 1 on raw points while its roster is worse (B3 is −571/draft
overall). The spec asked for "mean actual points of the recommended player";
that exact metric trips the spec's own round-1 bug alarm.

**The question:** should the backtest grade on raw actual points (spec verbatim)
or on actual points OVER POSITIONAL REPLACEMENT (value-aware, matching how the
tournament graded final-roster V)?

**My recommendation:** value-over-replacement. Raw points is structurally broken
for QBs in this scoring; VORP-on-actuals neutralises it (QB replacement is high,
so an elite QB's value-add is small — which is why ADP sends QBs late). This is
the same value yardstick the MCTS tournament already used and validated.

**Conservative action taken meanwhile:** I am NOT changing the headline metric
unilaterally. I am adding value-over-replacement as a SECOND reported cut
alongside raw points, so both are visible, and evaluating whether the round-1
alarm is raw-points-specific. No strategy is installed off either until you
rule. If value-grading clears the alarm, that confirms it was a metric artifact
and value-grading should govern selection.

**Second, smaller finding surfaced by the same detail:** the walk-forward
projection also over-projects QBs as a class (it floated Carson Wentz to round
1 in 2024). Even under value grading this is worth a look, but it is downstream
of D1 — value grading may make it moot for selection.
