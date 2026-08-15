CLAIM: A prototyped fix to `vona()`'s bench-pricing branch in
`public/js/draft/engine.js` — comparing a bench duplicate's worth against the
REAL WAIVER WIRE for his position instead of against VORP (which compares to
the last real starter leaguewide) — is well-evidenced enough to ship, subject
to one open, unexplained anomaly that should be resolved or explicitly
accepted before it does.

BACKGROUND (not my finding — reproducing and re-verifying prior work from
this same repository, PARKED.md, dated 2026-08-14/15, not yet shipped):
Cory's stated design: "once you're drafting for bench (not a starter slot), a
duplicate shouldn't be compared to the best available in the DRAFT — it
should be compared to what you can get FREE off waivers. A backup QB
averaging 24 isn't worth a roster spot if the wire gives you 22; a backup WR
at 12 is, because the wire won't give you 10." The live code does not do
this: `vona()`'s bench branch is `INJURY_RATE[pos] * vorp - forgone`, where
`vorp` compares to the last real starter, never to the wire.

WHAT RAN (this session, re-verifying rather than trusting the prior
write-up):
1. Re-ran `node draft/tools/wire_level.js` fresh against the real 2023-2025
   acquisition-week data to confirm the wire-level numbers the prototype
   depends on are still reproducible, not stale: QB 23.38, RB 7.80, WR 11.10,
   TE 11.60 (weekly medians, n=422 scored acquisitions). These are IDENTICAL
   to the numbers the original prototype used.
2. Confirmed the prototype file itself still exists
   (scratchpad/engine_copy3/engine.js, this session's own scratchpad,
   survived a container restart) and its diff against the committed
   `engine.js` matches exactly what PARKED.md describes: `edgePerWeek =
   max(0, weeklyMine - wireWeekly[pos])`, `seasonEdge = edgePerWeek *
   games_expected`, `INJURY_RATE[pos] * seasonEdge - forgone`, with K/DEF
   (no wire sample — nflverse is offense-only) falling back to the old
   vorp-based rule.
3. Did NOT re-run the 60-room simulation described in the prior write-up —
   no committed tool reproduces it (it was an ad-hoc script, not saved), and
   reconstructing a 60-seed multi-room JS simulation harness from a prose
   description, within this session, risked introducing a NEW, unverified
   variable into evidence I was supposed to be confirming rather than
   generating. This claim therefore rests on the PRIOR session's reported
   simulation result, re-stated below, not re-executed by me.

WHAT CAME BACK (from the prior session's report, re-stated, NOT independently
reproduced by me this turn):
- Direct VONA check on a real bench-QB candidate (Geno Smith behind Herbert)
  vs a real bench-RB candidate (RJ Harvey): QB2 candidate scores -166.6, RB
  bench candidate scores -36.5.
- 60-room simulation (VONA_SLOT_AWARE=true, only the bench branch
  wire-compared): RB wipeout gone — modal shape QB2/RB3/WR4/TE1 (45%), zero
  rooms with RB=0, versus the untouched VONA_SLOT_AWARE=true baseline that
  wiped RB to 0 in 66.7% of rooms.
- QB2 timing: every QB2 pick in the sim landed at round 10-13 of 15 (2-5
  picks remaining), matching the window `ONESIE_ENDGAME_PICKS` already
  relaxes the cap for and matching real historical QB2 timing (100% of real
  historical QB2 picks fall in that band). But the RATE was 100% of sim rooms
  vs. 57% in real history — higher than history, left unexplained.

WHAT IT PROVES: the DIRECTION of the fix is sound and well-motivated — it
closes a real, named gap (bench pricing uses a "preseason projection of the
leftovers" instead of the actual wire), the wire data behind it is real,
current, and reproducible, and the fix's own docstring-equivalent reasoning
(the asymmetry between backup-QB replaceability and backup-RB scarcity)
matches basic fantasy-football intuition and Cory's own stated framing.

WHAT IT DOES NOT PROVE: whether the fix is ready to ship AS-IS. Two specific
gaps: (a) the 100%-vs-57% QB2-rate anomaly is real and unexplained — it could
mean the fix over-corrects, or it could be an artifact of one fixed
keeper/board configuration in a single day's simulation, and nothing here
distinguishes those; (b) the prototype hardcodes WIRE_WEEKLY as a JS
constant frozen to today's `wire_level.js` output rather than reading it from
`draft_data.json` the way `starter_counts` already does — shipping the
hardcoded version would silently go stale as more wire data accumulates
in-season, with nothing to catch that.

UNCERTAINTY: I have NOT independently reproduced the 60-room simulation this
turn — that evidence is carried forward from a prior write-up, not verified
fresh by me. The wire-level numbers and the prototype code ARE independently
re-verified by me, fresh, this turn.

NEXT STEP: this is draft-scoring/weight logic, held under this project's
standing policy for Cory's explicit ruling regardless of how well-evidenced
it looks. Two decisions are actually needed, not one: (1) is the evidence
sufficient to ship despite the unexplained QB2-rate gap, or does that need
resolving first; (2) if shipping, ship the fast hardcoded-constant version
now or invest in the proper draft_data.json-sourced version first. Recommend
NOT unilaterally choosing between these without Cory's input, given this
prices live draft recommendations one week before the actual draft.
