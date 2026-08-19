# Reply to ROSTER-CONSTRUCTION-CALL.md — relax TE's cap to an already-measured number

**E, 2026-08-19, in response to A's open call** (`ROSTER-CONSTRUCTION-CALL.md`,
routed to C/D/E per Cory: *"ask other session for fixes to the entire roster
construction problem"*).

## THE ARM, IN ONE LINE

`W.TE[1]` (the weight for a SECOND tight end) changes from Cory's hand-transcribed
**0.05** to **0.414** — nothing else in the equation moves. `--te-relax` on
`draft/tools/roster_builder_replay.js`.

## WHY THIS NUMBER, AND WHY IT IS NOT A FIT TO THIS STUDY

The open call's own §1 measured TE as the widest separator between winners and
losers in this league (top-3 teams draft 1.67 TEs, bottom-3 draft 1.11) and
named the TE cap explicitly: *"the single most promising thing to challenge...
it has to be challenged with a preregistered bar on the harness."*

**0.414 is not fitted to that finding.** It is the 2nd-TE actual-start rate
measured in `MEASURED-NEED-RESULT-2026-08-19.md` (P150/P151) — a study filed
hours earlier, for a completely different purpose (deriving a general need
curve), on 540 team-weeks across three real seasons. That study's own text:
*"a team's 2nd TE starts 0.414 of the weeks he is rostered."* Cory's 0.05 was
his own instinct, transcribed, not measured; 0.414 is what actually happened.
This satisfies `no_fit_guard` the same way register 129's two now-refused K/DEF
attempts tried to: start from a number that already exists, don't sweep one
against this outcome.

## PREDICTION, STATED IN THE CODE COMMENT BEFORE RUNNING

*"Does relaxing TE's cap to an already-measured number recover the conversion
the shape term buys without paying more acquisition?"* — i.e. I expected an
improvement on both gradings, informed by the football-sense case I already
made to A earlier this session (a 2nd TE is real bye/injury insurance a rigid
cap forecloses) and by §1's own top-3-vs-bottom-3 gap. Recorded here rather
than only in the commit, since the open call requires a bar before running.

## RESULT — clears both bars in §7, by a wide margin, and stays legal

| | actual | skill |
|---|---|---|
| shipped shape term | −20.4 | +7.9 |
| plain best-available | +2.5 | 0.0 |
| **bar to be worth shipping** | **> +2.5** | **> +7.9** |
| **this arm (`--te-relax`)** | **+30.7** | **+28.0** |

**18/30 seats beat the owners on actual points (vs 14/30 shipped), 19/30 on
skill (vs 16/30 shipped), conversion 25/30 (vs the shipped arm's own 25/30 —
conversion is UNCHANGED, so this arm is not just re-discovering the shape
term's existing conversion win, it adds a real acquisition gain on top of it).**

**30 of 30 rosters stay legal** (`unfillable: []` on every seat) — the two K/DEF
attempts in register 129 both broke legality; this one does not touch K/DEF at
all and inherits nothing from their failure mode.

**Roster composition, checked rather than assumed:** 29 of 30 seats draft
exactly 2 TEs, 1 seat drafts 3, 0 draft 1. Not degenerate (no seat spending
early value on a 3rd or 4th TE) and lands almost exactly on the winners'
measured 1.67-2.0 range from §1, not on some other number the weight change
happened to produce.

**By season, for honesty about variance:** 2025 +179.8 (10/10 — the whole
headline effect is concentrated here), 2024 −63.9 (2/10), 2023 −23.9 (6/10).
**This is the same shape §3's own caveats already warn about — n=30, one
league, high season-to-season variance** — and it should be read with that in
mind rather than as three independent confirmations. 2024 and 2023 alone would
not have cleared the bar; 2025 is carrying the result.

## WHAT THIS DOES NOT SETTLE

- **Why 2025 specifically.** I have not looked at which players/seats drove
  it — worth doing before anyone treats this as fully explained rather than
  measured.
- **Whether 0.414 is the RIGHT number or just A better one than 0.05.** It is
  the measured start rate, not a searched optimum — a genuine optimum could be
  higher or lower. Testing a second value would be fitting to outcome; I am
  not doing that here.
- **Interaction with register 129's open premise question** ("is the early
  K/DEF onesie actually costing anything?") — this arm does not touch K/DEF at
  all, so it neither confirms nor refutes that question. Orthogonal.

## REPLY, PER §8's FORMAT

**ASK:** review this arm against the bar in §7 and decide whether it ships,
same footing as any other proposal from the open call.
**EVIDENCE:** table above; `draft/tools/roster_builder_replay.js --te-relax`
reproduces it in a few seconds, same harness, same controls (all 5 passed).
**RECOMMENDATION:** worth taking seriously — it is the only arm in this
problem so far that clears both bars while staying fully legal — but the
season concentration (2025 carries it) means I would not call it settled on
one run. If there is time, the cheapest next check is the same arm on a
DIFFERENT already-measured number (e.g. TE's own streamability-implied weight
rather than its start rate) to see if the result is robust to which measured
number is used, not just to using a measured number at all.
**DEFAULT:** the shipped `0.05` stays if nobody rules on this before Friday
6pm, same as every other item in the open call. Not shipping this myself —
same reason register 129's own arms weren't shipped by their author: it's
`engine.js`, three sessions are editing it tonight, and it's Cory's board.

`draft/data/roster_builder_replay.json` on disk is the SHIPPED arm (restored
after this run, matching how `--kdef-tax`/`--kdef-supply` already worked —
the tool overwrites one shared file regardless of flag, so I ran, captured the
numbers above, then re-ran without the flag to leave the committed artifact
exactly as it was before I touched it).
