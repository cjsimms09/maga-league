# THE 2026 DRAFT, AUTOPSIED

**A, 2026-08-23.** Draft completed 2026-08-22 23:00 UTC. Cory's order: *"We need
a complete autopsy of everything from the draft from our recommendations, our
roster builder, to what we kept and graded, everything! And we need to be better
next year!"*

Everything below is derived from two committed artifacts —
`draft/data/draft_pick_log_2026.jsonl` (150 rows) and
`draft/data/draft_shadow_2026.jsonl` (150 rows) — plus the board those rows are
joined to (`board_sha256 7c1c1d0d…`, built 2026-08-22T03:43:05Z). Three tools
produce the numbers and all three are in the repo:
`draft/tools/draft_autopsy.js`, `draft/tools/score_distribution_audit.js`, and
`draft/log_draft_picks.py --status`.

---

## 0. A CORRECTION I OWE FIRST

Earlier in this session I reported that the pick log had **never been committed**
and that the draft capture was unrecoverable. **That was wrong.** Both files are
on `main` in commit `b715f0dc`, written by the sync bot at 05:01:21Z on 08-23,
150 rows each. I reached the false conclusion by running `git log --all` in a
container whose clone predated the draft by two days: the query returned nothing,
and nothing is exactly what a missing file looks like.

That is Rule 3e in its purest form — a null from a probe that had never
demonstrated it could return a positive. The probe was never tested against a
file I knew *was* committed. The whole autopsy below exists because the data was
there all along.

---

## 1. WHAT IS RECOVERABLE, AND WHAT IS NOT

Cory: *"my_actual_pick / my_deviation_reason are empty everywhere — the why
behind your twelve decisions is unrecoverable."*

Correct, and the hole is **one field wider than he said**. Census of all 150 rows:

| field | value on all 150 rows |
|---|---|
| `is_mine` | **`false`** — including his own twelve picks |
| `my_actual_pick` | `null` |
| `my_deviation_reason` | `null` |
| `new_path_recommendation` | `null` |

But the loss is much smaller than those four nulls suggest:

- **WHAT he did is fully recoverable.** `team_slot` was captured correctly on
  every row and the freeze names his seat (8), so ownership derives for all 150
  past rows without editing one of them. `--status` now reads **12 of 12 live
  picks (+3 keepers)** off the untouched 2026 log.
- **WHAT THE TOOL SAID is fully recoverable.** The shadow log carries the
  engine's recommendation and top-3 at every one of his twelve picks. I
  re-ran `computeShadow` against today's code and it reproduced **150 of 150**
  rows identically, so the record is not merely present, it is verified.
- **WHY he deviated is genuinely gone.** That is the one field that needed a
  human in the moment and it is the only one still blank.

### The cause, and the fix

`_from_sleeper()` builds each pick entry with `pick, team_slot, player_id,
player_name, position, is_keeper` and **has never set `is_mine`**. `record()`
then wrote `bool(entry.get("is_mine"))` — `bool(None)` — so on the live Sleeper
path the flag was *structurally incapable* of being true. Not wrong sometimes:
incapable, because nothing on that path knew which seat was ours.

No test caught it because every existing test records entries by hand, and a
hand-written entry can set `is_mine` itself — the suite exercised the copy and
never the derivation. And `--status` **printed `mine: 0 of 12` in plain English
while the draft was running**; its exit code gates nothing, so the one instrument
that noticed was the one nobody was required to read.

Fixed in `9f9c3e0c`: `my_slot()` derives the seat from the freeze,
`is_mine` derives from `team_slot`, `my_actual_pick` derives from the row
itself (the row *is* the pick — leaving it blank was only ever a missing
assignment), and `--status` now **fails** when a non-empty log flags none of its
picks as ours. 16 new tests, and the load-bearing ones are the *positive* cases,
per Rule 3e: a flag that only ever reads False has not been tested, only run.

### A fourth defect, found while fixing the third, and it is the same shape

Register 264 records that keeper `player_name` is truncated to a first name.
**Measured, it is 3 of 23 keepers, not all of them** — `"Ja'Marr"`,
`"Derrick"`, `"Kenneth"` — which are **Cory's own three, all at seat 8**, while
the other twenty keepers in the draft carry full names.

Same root cause as `is_mine`: our keepers are removed from the board pool by
design, so `players.get(pid)` misses for them *and only for them*, and the
`metadata.first_name` fallback fired on exactly the three rows the autopsy
needs most. That is why it never read as "keepers are broken" — it read as
nothing at all. A first name joins to nothing. Fallback is now
`first_name + last_name`; the 2026 rows stay as written and are recoverable by
`player_id`.

---

## 2. WHAT THE TOOL TOLD HIM, AT ALL TWELVE PICKS

| pick | he took | tool's #1 | his pick's rank | gap |
|---|---|---|---|---|
| 33 | WR Rashee Rice | **same** | 1 | 0 |
| 48 | WR Davante Adams | RB Travis Etienne | 4 | 9.01 |
| 53 | RB Quinshon Judkins | **same** | 1 | 0 |
| 68 | WR Rome Odunze | **same** | 1 | 0 |
| 73 | WR Parker Washington | RB Jaylen Warren | 12 | 7.94 |
| 88 | WR Courtland Sutton | QB Matthew Stafford | 2 | 0.90 |
| 93 | QB Caleb Williams | QB Matthew Stafford | 7 | 4.71 |
| 108 | DEF Houston Texans | RB Kenny Gainwell | **439** | **0.15** |
| 113 | RB Emmett Johnson | RB Kenny Gainwell | 143 | **98.9** |
| 128 | RB Zach Charbonnet | RB Rachaad White | 22 | 30.5 |
| 133 | TE Oronde Gadsden | K Harrison Mevis | 41 | 48.7 |
| 148 | RB Rachaad White | K Harrison Mevis | — | — |

**He took the tool's #1 at 3 of 11 gradeable picks (27%).**

⚠️ **Do not read that as "he ignored the tool."** Rule 3i — here is the
distribution it came from, all ten seats:

| seat | agreed | seat | agreed |
|---|---|---|---|
| 1 | 15% | 6 | 8% |
| 2 | 8% | 7 | 17% |
| 3 | 0% | **8 — Cory** | **27%** |
| 4 | 7% | 9 | 21% |
| 5 | 23% | 10 | 8% |

**Cory's agreement rate is the highest in the league.** Every other seat
deviated more. Before looking at this distribution I had written "he overrode
the tool 9 of 12 times" as though it were a finding about him; it is a finding
about the whole room, and he is the least of it.

---

## 3. THE ONE NUMBER PAIR THAT CANNOT BOTH BE TRUE — AND WHY IT MATTERS

Pick 108: Houston DEF, **rank 439**, **gap 0.146**. Those describe the same pick
and disagree by 437 places.

Measured (`score_distribution_audit.js`): at pick 108 only **7 players of 596**
sit within a point of the top score, so the board is *not* flat. Houston's actual
composite score was **0.696** against a top of 0.842 — the **second-best score on
the board** — while it was displayed at rank 439, beneath players scoring −345.

**Cause: the two figures are computed in two different orderings.**
`composite_gap` comes from `score`, which is *pre*-demotion.
`actual_rank_in_tool` is the index in the list *after* `demoteFlaggedOnesies()`
sinks rail-flagged kickers and defences beneath everyone. Both are correct in
their own space. Side by side they are a trap.

The rail that fired is a hardcoded heuristic: **`"DEF this early is almost never
right"`**, triggered by `CFG.RAIL_LATE_ROUNDS: 2` — a K or DEF is flagged unless
two or fewer rounds remain. At pick 108, 75 of 596 entries were demoted.

Rank-vs-score disagreement across his twelve picks: **5 agree exactly**, 73 and
93 differ by 2, 113 by −69, 128 by −43, **108 by 437**.

**Consequence for grading, which is the reason this is in the register:** every
grade computed from `composite_gap` measures against a ranking the war room never
displayed, and every grade from `actual_rank_in_tool` measures a deliberately
demoted order. For his DEF pick the two disagree by 437 places. A grade has to
say which one it means.

---

## 4. THE ROSTER-SHAPE STORY, WHICH IS THE SAME STORY

Final drafted shape against the ruled top-3-finisher target:

| | QB | RB | WR | TE | K | DEF |
|---|---|---|---|---|---|---|
| drafted | 1 | 4 | 5 | 1 | **0** | 1 |
| target | 1.56 | 4.78 | 5.00 | 1.67 | 1.00 | 1.00 |

**Short of a starter at K** — he acquired a kicker after the draft.

The mechanism is the rail above, and it is a complete causal chain:

1. `RAIL_LATE_ROUNDS: 2` suppresses every K and DEF until his **last two
   picks** (133, 148). Both onesies were required to come from those two slots.
2. At **both** 133 and 148 the tool's #1 was accordingly **Harrison Mevis, a
   kicker** — at 148 the entire top 3 was kickers.
3. He overrode both, taking TE Gadsden and RB White.
4. Result: no kicker, and a TE count of 1 against a 1.67 target.
5. Meanwhile at 108, where he *did* take a defence, the model's own score
   **agreed with him** (2nd best available) and the display buried it at 439.

So the tool and Cory were closer to agreeing than either the ranks or the roster
suggest. What separated them was a heuristic rail overriding the model's own
score, in both directions, at exactly the picks where the roster needed shaping.

---

## 5. WHAT WAITING ACTUALLY COST (exact, from the real pick order)

`cost_of_waiting_by_position` is the only clean wait metric in the artifact: it
compares a position **to itself** one pick later, so no cross-position
subtraction happens. Points lost by waiting, at the position he actually took:

| pick | took | cost of waiting at that position | most expensive position to wait on |
|---|---|---|---|
| 33 | WR Rice | 15.4 | TE (20.3) |
| 48 | WR Adams | 0 | RB (22.8) |
| 53 | RB Judkins | 24.2 | RB (24.2) ✅ |
| 68 | WR Odunze | 1.7 | QB (2.7) |
| 73 | WR Washington | 25.7 | WR (25.7) ✅ |
| 88 | WR Sutton | 2.6 | RB (14.5) |
| 93 | QB Williams | 0 | DEF (14.0) |
| 108 | DEF Houston | 6.0 | DEF (6.0) ✅ |
| 113 | RB E. Johnson | 5.6 | WR (8.8) |
| 128 | RB Charbonnet | 0 | K (3.0) |
| 133 | TE Gadsden | 14.3 | TE (14.3) ✅ |

**He hit the most-expensive-to-wait position at 4 of 11 picks**, and at
**0 of 11 picks** would the man he took still have been on the board at his next
pick — there is no pick in this draft where he could have had his guy for free.

### ⚠️ A metric I withdrew rather than publish

This artifact previously carried `points_vs_best_wait_position`, which subtracted
`proj_mean` **across positions**. It read **+213.3** at pick 93 (a QB against the
best DEF) and **−158.9** at pick 68, and summed to a headline **"−147.4 points"**
that measured nothing but the fact that quarterbacks out-score defences. I nearly
wrote that total into this document.

Replaced with `vorp_vs_best_wait_position`, which is measured from each
position's own replacement level. **And that is still not clean when a onesie is
on one side:** this repo has already measured DEF VORP sitting flat near 29 for a
hundred picks while skill VORP collapses through zero, so pick 128 scored
**−126.8 against a kicker** — an artifact of that flatness. Those rows now carry
`comparison_crosses_onesie: true` and **there is deliberately no total in the
artifact.** Over the 9 skill-vs-skill picks the sum is −163, dominated by pick
113 (−115).

---

## 6. THE KEEPERS

| player | pos | proj | VORP | cost |
|---|---|---|---|---|
| Ja'Marr Chase | WR | 271.8 | 128.9 | round 2 |
| Derrick Henry | RB | 259.15 | 111.35 | round 1 |
| Kenneth Walker | RB | 233.82 | 86.02 | round 3 |

All three are top-of-board VORP and none is gradeable as a draft *decision* — a
keeper leaves the pool but nobody made a choice at that pick, which is why the
shadow log correctly refuses to gap them (23 of 150 rows, with a reason on each).
Their real effect on the draft is that they pre-loaded **RB2 + WR1**, which is
why the roster-aware terms wanted RBs early and the shape landed WR-heavy.

---

## 7. WHAT TO CHANGE FOR 2027

Ranked by measured impact, not by how interesting they are.

1. **🔴 Split the two orderings, everywhere.** Any artifact reporting a rank
   beside a gap must label which ordering each is in, or report both
   (`actual_rank_in_tool` *and* `actual_rank_by_score`). 437 places of
   disagreement on a real pick is not an edge case. → register 266.
2. **🔴 Revisit `RAIL_LATE_ROUNDS: 2`.** It is a hardcoded constant that
   forced both onesies into his last two picks and produced a kicker as the
   tool's #1 at both, which he overrode, which is why he finished without a
   kicker. Nothing about the value 2 has ever been measured. → register 267.
3. **🟡 A demoted player needs to say so on the board.** At pick 108 the model
   ranked Houston 2nd on score and showed it 439th with no visible
   "demoted: DEF this early is almost never right". Cory was right and the
   screen disagreed with the model silently. → routed to B.
4. **🟡 `my_deviation_reason` is the only field still needing a human.**
   `pick_reasons.js` (7-code vocabulary, one tap) plus
   `merge_pick_reasons.js` are built and tested. They need to be exercised in
   a rehearsal before next August, not first used live. → register 264.
5. **🟢 The wait-cost metric is the one that worked.** Within-position,
   exact, from the real order, no cross-position subtraction. Build the 2027
   grading on it and not on raw projection differences.

---

## RULE 3g — THE THREE FOLLOW-UP QUESTIONS

**Does this imply another failure we have not looked for?**
Yes, and it is the general case of §1: **which other captured fields have never
been observed non-null?** `is_mine` was false 150/150, `new_path_recommendation`
null 150/150. Neither had a test asserting a positive. A sweep of every field
this repo writes, checking each has *ever* held a non-default value on real
data, is now the obvious next probe — filed as register 268.

**Does it invalidate something we already trust?**
Yes — two things. (a) Any grade already computed from `composite_gap` or
`actual_rank_in_tool` without naming its ordering; the numbers are not
interchangeable and disagree by up to 437. (b) Any statement of the form
"the tool recommended a defence" — the shipped board **demotes** defences by
design, so a DEF appearing as a recommendation and a DEF appearing at rank 439
are the same model in two presentations. Register 196/207's DEF attribution
should be re-read against this.

**Is it routed to the lane that can actually act?**
The engine and capture items are mine (A) and are done or registered above.
Item 3 (showing the demotion on the board) is B's territory — `views/**` — and
is routed, with the default that if B does not pick it up before the 2027
board work starts, I add the flag to the data layer and B renders whatever is
there.
